import { describe, expect, it } from "vitest";
import type { PautaAvaliada } from "../editorial/guarda";
import type { PacoteFactual } from "../editorial/pacote-factual";
import { carregarConfigEditorial } from "../editorial/config";
import { auditarArtigo, escreverArtigoDaPauta, montarSystemDoArtigo, renderizarArtigoHtml } from "./artigo";
import type { Artigo } from "./artigo";
import { criarLivroDeCustos } from "./custos";
import { rodarRamoDoPortal } from "./ramo-do-portal";
import { VOZ_PADRAO_DA_NEWSLETTER, VOZ_PADRAO_DO_ARTIGO, VOZ_PADRAO_DO_POST } from "./vozes";
import { LEITOR } from "../editorial/linha-editorial";
// Montado pelo código para o próprio teste não conter o caractere que procura.
const TRAVESSAO = String.fromCharCode(0x2014);

/**
 * A matéria do portal (RF-13): escrita do pacote, auditada sozinha, e sem
 * nada do e-mail.
 */

const PACOTE: PacoteFactual = {
  verified_facts: ["O Federal Reserve cortou a taxa de juros em 6 de outubro de 2026."],
  people: [],
  organizations: ["Federal Reserve"],
  places: ["Estados Unidos"],
  dates: ["6 de outubro de 2026"],
  numbers: [],
  gaps: ["o tamanho do corte"],
  source_urls: ["https://fonte.com/fed"],
  texto_de_origem: "O Federal Reserve cortou a taxa de juros em 6 de outubro de 2026.",
};

const LIMPO: Artigo = {
  titulo: "Federal Reserve corta os juros nos Estados Unidos",
  subtitulo: "",
  titulo_seo: "Federal Reserve corta os juros nos Estados Unidos",
  descricao_seo: "O Federal Reserve cortou a taxa de juros em 6 de outubro de 2026.",
  secoes: [{ intertitulo: "", paragrafos: ["O Federal Reserve cortou a taxa de juros em 6 de outubro de 2026."] }],
  perguntas: [],
};

const INVENTADO: Artigo = {
  ...LIMPO,
  secoes: [{ intertitulo: "", paragrafos: ["O Federal Reserve cortou a taxa de juros em 75 pontos, para 3,25%."] }],
};

/** Responde a redação com `artigos` em sequência e o auditor de claims com `claims`. */
function openaiFalso(artigos: Artigo[], claims: Array<Record<string, unknown>> = []) {
  const chamadas: string[] = [];
  let i = 0;
  const fetcher = (async (_url: string | URL, init?: RequestInit) => {
    const corpo = JSON.parse(String(init?.body ?? "{}"));
    const pedido = corpo.messages.map((m: { content: string }) => m.content).join("\n");
    let resposta: unknown;
    if (pedido.includes("Pacote factual:") && pedido.includes("Texto escrito:")) {
      chamadas.push("claims");
      resposta = { claims };
    } else {
      chamadas.push(pedido.includes("foi reprovada na conferência") ? "reparo" : "redacao");
      resposta = artigos[Math.min(i, artigos.length - 1)];
      i += 1;
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(resposta) } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  return { fetcher, chamadas };
}

const ENV = { OPENAI_API_KEY: "chave-de-teste", OPENAI_MODEL_TRIAGE: "gpt-4o-mini" };

const PAUTA = {
  grupo: {
    primary: { url: "https://fonte.com/fed", title: "Fed cuts rates", source_name: "Fonte" },
    secondary_sources: [],
    secondary_urls: [],
  },
  storyId: "s1",
  classificacao: { pais: "EUA", eixo: "economia", atores: [], lugares: [], acontecimento: [] },
  enriquecimento: { texto: "TEXTO CRU DA FONTE QUE NÃO PODE CHEGAR AO REDATOR" },
  pontuacao: { total: 90 },
  vetor: null,
} as unknown as PautaAvaliada;

const MARCA = { nome: "eua.journal", nicho: "EUA para brasileiros", briefing: "briefing", voz: VOZ_PADRAO_DO_ARTIGO };

describe("auditor do artigo", () => {
  it("número que não está no pacote BLOQUEIA a matéria", async () => {
    const { fetcher } = openaiFalso([]);
    const v = await auditarArtigo(INVENTADO, PACOTE, { env: ENV, fetcher });
    expect(v.aprovado).toBe(false);
    expect(v.bloqueios.join(" ")).toContain("REJECT_UNGROUNDED_CLAIM");
  });

  it("conclusão sem lastro BLOQUEIA a matéria", async () => {
    const { fetcher } = openaiFalso([], [
      { trecho: "o corte barateia o crédito", tipo: "consequencia", sustentada: false, motivo: "o pacote não diz", pauta: 0 },
    ]);
    const v = await auditarArtigo(LIMPO, PACOTE, { env: ENV, fetcher });
    expect(v.aprovado).toBe(false);
    expect(v.bloqueios.join(" ")).toContain("UNGROUNDED_EDITORIAL_CLAIM");
  });

  it("texto ancorado passa", async () => {
    const { fetcher } = openaiFalso([]);
    const v = await auditarArtigo(LIMPO, PACOTE, { env: ENV, fetcher });
    expect(v.bloqueios).toEqual([]);
    expect(v.aprovado).toBe(true);
  });
});

describe("redação do artigo", () => {
  it("o redator recebe o PACOTE, nunca o texto cru da fonte (RF-05)", async () => {
    const pedidos: string[] = [];
    const { fetcher: base } = openaiFalso([LIMPO]);
    const fetcher = (async (url: string | URL, init?: RequestInit) => {
      pedidos.push(String(init?.body ?? ""));
      return base(url, init);
    }) as typeof fetch;
    await escreverArtigoDaPauta(PAUTA, PACOTE, MARCA, { env: ENV, fetcher });
    expect(pedidos.join("\n")).not.toContain("TEXTO CRU DA FONTE");
    expect(pedidos[0]).toContain("Federal Reserve cortou a taxa");
  });

  it("um reparo que não resolve deixa a matéria BLOQUEADA, e o custo entra no livro", async () => {
    const { fetcher, chamadas } = openaiFalso([INVENTADO, INVENTADO]);
    const livro = criarLivroDeCustos();
    const r = await escreverArtigoDaPauta(PAUTA, PACOTE, MARCA, { env: ENV, fetcher, livro });
    expect(r.veredicto.aprovado).toBe(false);
    expect(r.tentativas).toBe(2);
    expect(chamadas.filter((c) => c === "reparo")).toHaveLength(1);
    expect(livro.lancamentos().map((l) => `${l.ramo}:${l.etapa}`)).toEqual([
      "artigo:redacao",
      "artigo:auditoria_claims",
      "artigo:reparo",
      "artigo:auditoria_claims",
    ]);
  });

  it("o reparo que resolve libera a matéria", async () => {
    const { fetcher } = openaiFalso([INVENTADO, LIMPO]);
    const r = await escreverArtigoDaPauta(PAUTA, PACOTE, MARCA, { env: ENV, fetcher });
    expect(r.veredicto.aprovado).toBe(true);
    expect(r.artigo?.secoes[0].paragrafos[0]).not.toContain("75");
  });
});

describe("vozes", () => {
  it("as três vozes são diferentes e as três carregam a mesma linha editorial", () => {
    const vozes = [VOZ_PADRAO_DA_NEWSLETTER, VOZ_PADRAO_DO_ARTIGO, VOZ_PADRAO_DO_POST];
    expect(new Set(vozes).size).toBe(3);
    for (const v of vozes) expect(v).toContain(LEITOR);
    expect(VOZ_PADRAO_DA_NEWSLETTER).toContain("The News");
    expect(VOZ_PADRAO_DO_ARTIGO).toContain("matéria de busca");
    expect(VOZ_PADRAO_DO_POST).toContain("Not Journal");
    expect(VOZ_PADRAO_DO_POST).toContain("Brazil Journal");
  });

  it("o prompt do artigo carrega o briefing e a voz, e não tem travessão", () => {
    const system = montarSystemDoArtigo(MARCA);
    expect(system).toContain("briefing");
    expect(system).toContain("matéria de busca");
    for (const v of [system, VOZ_PADRAO_DA_NEWSLETTER, VOZ_PADRAO_DO_ARTIGO, VOZ_PADRAO_DO_POST]) {
      expect(v).not.toContain(TRAVESSAO);
    }
  });
});

describe("HTML do artigo", () => {
  it("escapa o texto do modelo, converte negrito e não traz nada de e-mail", () => {
    const html = renderizarArtigoHtml(
      {
        ...LIMPO,
        secoes: [{ intertitulo: "O <corte>", paragrafos: ["Vale desde **6 de outubro**.<script>x</script>"] }],
      },
      { nome: "Fonte", url: "javascript:alert(1)" },
    );
    expect(html).toContain("<strong>6 de outubro</strong>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).not.toMatch(/descadastr|unsubscribe|Até amanhã/i);
  });
});

describe("ramo do portal", () => {
  it("pauta sem pacote não é escrita; matéria reprovada vira peça BLOQUEADA, nunca aprovada", async () => {
    const config = carregarConfigEditorial({});
    const comPacote = { ...PAUTA, storyId: "s1" } as PautaAvaliada;
    const semPacote = {
      ...PAUTA,
      storyId: "s2",
      grupo: { ...PAUTA.grupo, primary: { ...PAUTA.grupo.primary, url: "https://fonte.com/outra", title: "Outra" } },
      classificacao: { ...PAUTA.classificacao, atores: ["outro"] },
    } as PautaAvaliada;

    const escritas: string[] = [];
    const r = await rodarRamoDoPortal({
      pool: [comPacote, semPacote],
      pacotes: new Map([["https://fonte.com/fed", PACOTE]]),
      historico: [],
      config,
      marca: MARCA,
      data: "2026-10-06",
      timezone: "America/Sao_Paulo",
      horarios: ["06:07", "12:00", "18:00"],
      escrever: async (pauta) => {
        escritas.push(pauta.storyId);
        return {
          artigo: INVENTADO,
          tentativas: 2,
          erro: null,
          veredicto: {
            aprovado: false,
            bloqueios: ["REJECT_UNGROUNDED_CLAIM: numero \"75\""],
            avisos: [],
            ancoragem: { conferidos: 1, naoSustentadas: [] },
            conclusoesSemLastro: [],
          },
        };
      },
    });

    expect(escritas).toEqual(["s1"]);
    expect(r.pecas).toHaveLength(1);
    expect(r.pecas[0].ramo).toBe("artigo");
    expect(r.pecas[0].aprovadaPeloAuditor).toBe(false);
    expect(r.pecas[0].conteudo.publicarEm).toBe("2026-10-06T09:07:00.000Z");
  });
});
