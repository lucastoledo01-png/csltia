import { describe, expect, it } from "vitest";
import { extrairTitulosDeRss, triarTendencias, type TendenciaBruta } from "./trends";

const RSS = `<?xml version="1.0"?><rss><channel>
  <item><title><![CDATA[GTA VI adiado]]></title></item>
  <item><title>Eleição no Paraná</title></item>
  <item><title>   </title></item>
</channel></rss>`;

describe("extração do RSS", () => {
  it("pega títulos com e sem CDATA e descarta vazio", () => {
    expect(extrairTitulosDeRss(RSS)).toEqual(["GTA VI adiado", "Eleição no Paraná"]);
  });

  it("devolve vazio para XML sem item", () => {
    expect(extrairTitulosDeRss("<rss><channel></channel></rss>")).toEqual([]);
  });

  it("não explode com XML malformado", () => {
    expect(extrairTitulosDeRss("<<>>não é xml")).toEqual([]);
  });
});

describe("triagem", () => {
  const brutas: TendenciaBruta[] = [
    { titulo: "GTA VI adiado", fonte: "google_trends" },
    { titulo: "Eleição no Paraná", fonte: "google_trends" },
  ];

  function fetcherComResposta(payload: unknown): typeof fetch {
    return (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(payload) } }],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch;
  }

  const env = { OPENAI_API_KEY: "sk-teste", OPENAI_MODEL_TRIAGE: "gpt-4o-mini" };

  it("normaliza a resposta do modelo", async () => {
    const r = await triarTendencias(
      brutas,
      env,
      fetcherComResposta({
        tendencias: [
          { titulo: "GTA VI adiado", pontuacao: 88, visual_hook: "pôster de jogo", motivo: "estética forte" },
          { titulo: "Eleição no Paraná", pontuacao: 5, visual_hook: "", motivo: "só informação" },
        ],
      }),
    );

    expect(r).toHaveLength(2);
    expect(r[0].pontuacao).toBe(88);
    expect(r[1].visualHook).toBe("");
  });

  it("prende a pontuação entre 0 e 100", async () => {
    // Modelo devolvendo 500 ou -10 quebraria o CHECK do banco.
    const r = await triarTendencias(
      brutas.slice(0, 1),
      env,
      fetcherComResposta({ tendencias: [{ titulo: "x", pontuacao: 500 }] }),
    );
    expect(r[0].pontuacao).toBe(100);

    const r2 = await triarTendencias(
      brutas.slice(0, 1),
      env,
      fetcherComResposta({ tendencias: [{ titulo: "x", pontuacao: -10 }] }),
    );
    expect(r2[0].pontuacao).toBe(0);
  });

  it("aguenta pontuação não numérica", async () => {
    const r = await triarTendencias(
      brutas.slice(0, 1),
      env,
      fetcherComResposta({ tendencias: [{ titulo: "x", pontuacao: "muito alta" }] }),
    );
    expect(r[0].pontuacao).toBe(0);
  });

  it("descarta item sem título", async () => {
    const r = await triarTendencias(
      brutas,
      env,
      fetcherComResposta({ tendencias: [{ pontuacao: 90 }, { titulo: "ok", pontuacao: 70 }] }),
    );
    expect(r).toHaveLength(1);
  });

  it("aguenta resposta sem a chave esperada", async () => {
    expect(await triarTendencias(brutas, env, fetcherComResposta({ outra_coisa: [] }))).toEqual([]);
  });

  it("não chama o modelo sem tendência", async () => {
    let chamou = false;
    const espiao = (async () => {
      chamou = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    expect(await triarTendencias([], env, espiao)).toEqual([]);
    expect(chamou).toBe(false);
  });
});
