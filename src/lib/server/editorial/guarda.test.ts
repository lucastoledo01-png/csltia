import { describe, expect, it, vi } from "vitest";
import { carregarConfigEditorial, MOTIVOS } from "./config";
import { avaliarPautas, registroDaPauta } from "./guarda";
import type { DeduplicatedGroup } from "../newsroom/deduplicator";
import type { Classificacao } from "./classificador";
import type { RegistroHistorico } from "./history";

const config = carregarConfigEditorial({});
const env = { OPENAI_API_KEY: "chave", OPENAI_MODEL_TRIAGE: "gpt-4o-mini" };

function grupo(id: string, title: string, url: string): DeduplicatedGroup {
  return {
    primary: {
      id,
      url,
      title,
      source_name: "Fonte",
      priority: 1,
      published_at: new Date().toISOString(),
      description: "resumo da pauta",
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
