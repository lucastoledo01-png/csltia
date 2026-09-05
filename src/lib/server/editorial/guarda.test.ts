import { describe, expect, it, vi } from "vitest";
import { carregarConfigEditorial, MOTIVOS } from "./config";
import { avaliarPautas, registroDaPauta } from "./guarda";
import type { DeduplicatedGroup } from "../newsroom/deduplicator";
import type { Classificacao } from "./classificador";
import type { RegistroHistorico } from "./history";

const config = carregarConfigEditorial({});
const env = { OPENAI_API_KEY: "chave", OPENAI_MODEL_TRIAGE: "gpt-4o-mini" };

/**
 * Corpo de verdade nas fixtures.
 *
 * Depois que o enriquecimento entrou, pauta sem corpo é recusada antes de
 * chegar à repetição, então fixture com "resumo da pauta" testaria o caminho
 * errado.
 */
const CORPO =
  "O United States Citizenship and Immigration Services informou nesta quinta-feira que o prazo de " +
  "renovação automática da permissão de trabalho passa de 180 para 540 dias. A mudança vale para " +
  "pedidos protocolados a partir de outubro e alcança asilo, ajuste de status e renovação por " +
  "casamento. O órgão afirmou que a fila soma 1,2 milhão de pedidos e que a medida evita a " +
  "interrupção do vínculo de trabalho durante a análise. A publicação saiu no Federal Register.";

function grupo(id: string, title: string, url: string, corpo = CORPO): DeduplicatedGroup {
  return {
    primary: {
      id,
      url,
      title,
      source_name: "Fonte",
      priority: 1,
      published_at: new Date().toISOString(),
      description: corpo,
      content: "",
      category: "imigracao",
      score: 0,
      dedupe_key: id,
      window_hours: 24,
    },
    secondary_sources: [],
    secondary_urls: [],
  };
}

function classificacao(over: Partial<Classificacao> = {}): Classificacao {
  return {
    id: "1",
    pais: "EUA",
    imigracao: true,
    leitura: "oportunidade",
    eixo: "processo",
    relevancia: 8,
    atores: ["USCIS"],
    lugares: ["EUA"],
    acontecimento: ["prorrogação"],
    justificativa: "",
    ...over,
  };
}

function fetcherCom(pautas: Classificacao[]) {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        id: "x",
        choices: [{ message: { content: JSON.stringify({ pautas }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
      { status: 200 }
    )
  ) as unknown as typeof fetch;
}

describe("avaliarPautas", () => {
  it("recusa a pauta desfavorável sobre os EUA e mantém a boa", async () => {
    const grupos = [
      grupo("1", "USCIS amplia prazo do EAD", "https://a.com/1"),
      grupo("2", "Agente do ICE acusado de mentir é preso", "https://b.com/2"),
    ];
    const r = await avaliarPautas(grupos, {
      canal: "newsletter",
      historico: [],
      config,
      env,
      fetcher: fetcherCom([
        classificacao({ id: "1" }),
        classificacao({ id: "2", leitura: "desfavoravel", eixo: "decisao_judicial" }),
      ]),
    });

    expect(r.selecionadas.map((s) => s.grupo.primary.id)).toEqual(["1"]);
    expect(r.recusadas[0].motivo).toBe(MOTIVOS.REJEITADO_EUA_NEGATIVO);
  });

  it("recusa pauta que já saiu no mesmo canal", async () => {
    const historico: RegistroHistorico[] = [
      {
        projectId: "p",
        storyId: "s",
        canal: "newsletter",
        titulo: "USCIS amplia prazo do EAD",
        urlCanonica: "a.com/1",
        publicadoEm: new Date().toISOString(),
      },
    ];
    const r = await avaliarPautas([grupo("1", "Prazo do EAD é ampliado", "https://a.com/1")], {
      canal: "newsletter",
      historico,
      config,
      env,
      fetcher: fetcherCom([classificacao({ id: "1" })]),
    });

    expect(r.selecionadas).toHaveLength(0);
    expect(r.recusadas[0].motivo).toBe(MOTIVOS.REJEITADO_URL_DUPLICADA);
    expect(r.viavel).toBe(false);
  });

  it("não aprova pauta que o classificador deixou de devolver", async () => {
    const r = await avaliarPautas([grupo("1", "Pauta qualquer", "https://a.com/1")], {
      canal: "newsletter",
      historico: [],
      config,
      env,
      fetcher: fetcherCom([]),
    });
    expect(r.selecionadas).toHaveLength(0);
    expect(r.recusadas[0].motivo).toBe(MOTIVOS.REJEITADO_SEM_CLASSIFICACAO);
  });

  it("segue sem a camada semântica quando o vetor falha, em vez de derrubar a edição", async () => {
    const provedor = {
      modelo: "falho",
      gerar: async () => {
        throw new Error("sem crédito");
      },
    };
    const r = await avaliarPautas(
      [grupo("1", "USCIS amplia prazo", "https://a.com/1"), grupo("2", "Corte protege beneficiários", "https://b.com/2")],
      {
        canal: "newsletter",
        historico: [],
        config,
        env,
        provedorDeVetor: provedor,
        fetcher: fetcherCom([classificacao({ id: "1" }), classificacao({ id: "2", atores: ["Suprema Corte"] })]),
      }
    );

    expect(r.selecionadas).toHaveLength(2);
    expect(r.linhasDeLog.some((l) => l.includes("camada semântica desligada"))).toBe(true);
  });

  it("marca inviável quando sobra menos que o mínimo", async () => {
    const r = await avaliarPautas([grupo("1", "USCIS amplia prazo", "https://a.com/1")], {
      canal: "newsletter",
      historico: [],
      config,
      env,
      fetcher: fetcherCom([classificacao({ id: "1" })]),
    });
    expect(r.selecionadas).toHaveLength(1);
    expect(r.viavel).toBe(false);
    expect(r.motivoDaInviabilidade).toContain("mínimo 2");
  });
});

describe("conteúdo insuficiente", () => {
  it("recusa a pauta que chegou só com a manchete e não pôde ser buscada", async () => {
    const r = await avaliarPautas(
      [grupo("1", "USCIS amplia prazo", "https://news.google.com/rss/articles/ABC?oc=5", "")],
      {
        canal: "newsletter",
        historico: [],
        config,
        env,
        fetcher: fetcherCom([classificacao({ id: "1" })]),
      }
    );

    expect(r.selecionadas).toHaveLength(0);
    expect(r.recusadas[0].motivo).toBe(MOTIVOS.REJEITADO_SEM_FATOS);
    expect(r.recusadas[0].explicacao).toContain("agregador_sem_link_direto");
  });

  it("busca a página quando o feed veio curto e segue com a pauta", async () => {
    const pagina = `<html><body><article><p>${CORPO}</p></article></body></html>`;
    let chamadas = 0;

    const fetcher = (async (url: string) => {
      if (String(url).includes("api.openai.com")) {
        chamadas += 1;
        return new Response(
          JSON.stringify({
            id: "x",
            choices: [{ message: { content: JSON.stringify({ pautas: [classificacao({ id: "1" })] }) } }],
            usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
          }),
          { status: 200 }
        );
      }
      return new Response(pagina, { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const r = await avaliarPautas([grupo("1", "USCIS amplia prazo", "https://veiculo.com/materia", "")], {
      canal: "newsletter",
      historico: [],
      config,
      env,
      fetcher,
    });

    expect(r.selecionadas).toHaveLength(1);
    expect(r.selecionadas[0].enriquecimento.enrichmentStatus).toBe("enriquecida");
    expect(r.selecionadas[0].enriquecimento.contentSource).toBe("pagina_original");
    // Uma chamada para classificar, outra para reclassificar com a matéria.
    expect(chamadas).toBe(2);
  });
});

describe("registroDaPauta", () => {
  it("guarda o código da decisão e o país, e não o veredito nulo de aprovação", async () => {
    const r = await avaliarPautas([grupo("1", "USCIS amplia prazo", "https://a.com/1")], {
      canal: "newsletter",
      historico: [],
      config,
      env,
      fetcher: fetcherCom([classificacao({ id: "1" })]),
    });

    const registro = registroDaPauta(r.selecionadas[0], {
      projectId: "p",
      canal: "newsletter",
      newsletterId: "n1",
    });

    expect(registro.motivo).toBe(MOTIVOS.APROVADO_IMIGRACAO);
    expect(registro.pais).toBe("EUA");
    expect(registro.sentimento).toBe("positive");
    expect(registro.procedencia).toBe("pipeline");
  });
});
