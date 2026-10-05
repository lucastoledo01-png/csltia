import { describe, expect, it } from "vitest";
import {
  HORARIOS_PADRAO_DO_PORTAL,
  gravarArtigosAgendados,
  horariosDoPortal,
  horariosDosArtigos,
  publicarArtigosAprovados,
  slugDoArtigo,
} from "./portal";
import type { ConteudoDoArtigo } from "./portal";
import { montarPeca } from "./peca";

/**
 * A agenda do portal (RF-14): os três horários e a regra de só publicar o
 * aprovado.
 */

describe("horários do portal", () => {
  it("sem configuração, são os de hoje: 06:07, 12:00 e 18:00", () => {
    expect(horariosDoPortal({ settings: {} })).toEqual(["06:07", "12:00", "18:00"]);
    expect(horariosDoPortal(null)).toEqual([...HORARIOS_PADRAO_DO_PORTAL]);
  });

  it("aceita a cadência do projeto quando ela é válida, e NÃO aceita lixo", () => {
    // O formato é o de `cadencia.ts` desde a integração de 05/10/2026.
    expect(horariosDoPortal({ settings: { cadencia: { portal: { horarios: ["18:00", "07:30"] } } } })).toEqual(["07:30", "18:00"]);
    expect(horariosDoPortal({ settings: { cadencia: { portal: { horarios: ["25:00"] } } } })).toEqual([...HORARIOS_PADRAO_DO_PORTAL]);
    expect(horariosDoPortal({ settings: { cadencia: { portal: { horarios: [] } } } })).toEqual([...HORARIOS_PADRAO_DO_PORTAL]);
  });

  it("converte o horário de Brasília para UTC", () => {
    expect(horariosDosArtigos(3, "2026-10-06", "America/Sao_Paulo")).toEqual([
      "2026-10-06T09:07:00.000Z",
      "2026-10-06T15:00:00.000Z",
      "2026-10-06T21:00:00.000Z",
    ]);
  });

  it("mais artigos que horários: os excedentes ficam no último, e não somem", () => {
    expect(horariosDosArtigos(2, "2026-10-06", "America/Sao_Paulo", ["12:00"])).toEqual([
      "2026-10-06T15:00:00.000Z",
      "2026-10-06T15:00:00.000Z",
    ]);
  });
});

describe("slug", () => {
  it("é estável, sem acento e com a data", () => {
    expect(slugDoArtigo("Fed corta juros e o dólar cai, nos EUA", "2026-10-06")).toBe(
      "fed-corta-juros-e-o-dolar-cai-nos-eua-2026-10-06",
    );
    expect(slugDoArtigo("!!!", "2026-10-06")).toBe("materia-2026-10-06");
  });
});

/** Um cliente que registra o que foi pedido ao banco. */
function clienteQueAnota(resposta: { data?: unknown; error?: { message: string } | null } = {}) {
  const chamadas: Array<[string, ...unknown[]]> = [];
  const construtor: Record<string, unknown> = {};
  for (const m of ["update", "upsert", "eq", "lte", "select"]) {
    construtor[m] = (...args: unknown[]) => {
      chamadas.push([m, ...args]);
      return construtor;
    };
  }
  construtor.then = (ok: (v: unknown) => unknown) => ok({ data: resposta.data ?? [], error: resposta.error ?? null });
  const client = {
    from: (tabela: string) => {
      chamadas.push(["from", tabela]);
      return construtor;
    },
  };
  return { client: client as never, chamadas };
}

describe("publicação", () => {
  it("só publica o que está agendado, APROVADO e com o horário vencido", async () => {
    const { client, chamadas } = clienteQueAnota({ data: [{ slug: "a" }] });
    const agora = new Date("2026-10-06T15:00:00.000Z");
    const r = await publicarArtigosAprovados(client, "projeto", agora);

    expect(r.publicados).toEqual(["a"]);
    expect(chamadas).toContainEqual(["from", "articles"]);
    expect(chamadas).toContainEqual(["eq", "project_id", "projeto"]);
    expect(chamadas).toContainEqual(["eq", "status", "scheduled"]);
    expect(chamadas).toContainEqual(["eq", "manual_review_status", "approved"]);
    expect(chamadas).toContainEqual(["lte", "published_at", "2026-10-06T15:00:00.000Z"]);
  });

  it("erro do banco não vira publicação", async () => {
    const { client } = clienteQueAnota({ error: { message: "timeout" } });
    const r = await publicarArtigosAprovados(client, "projeto");
    expect(r).toEqual({ publicados: [], erro: "timeout" });
  });
});

function peca(aprovada: boolean) {
  const conteudo: ConteudoDoArtigo = {
    artigo: {
      titulo: "Fed corta juros nos EUA",
      subtitulo: "",
      titulo_seo: "Fed corta juros nos EUA",
      descricao_seo: "O banco central americano cortou os juros.",
      secoes: [{ intertitulo: "", paragrafos: ["O Fed cortou os juros."] }],
      perguntas: [],
    },
    html: "<p>O Fed cortou os juros.</p>",
    categoria: "Economia",
    fonte: { nome: "Fonte", url: "https://fonte.com/fed" },
    sourceUrls: ["https://fonte.com/fed"],
    capa: null,
    publicarEm: "2026-10-06T09:07:00.000Z",
    slug: aprovada ? "aprovada-2026-10-06" : "reprovada-2026-10-06",
  };
  return montarPeca({
    ramo: "artigo",
    referenciaId: conteudo.slug,
    storyIds: ["s"],
    titulo: conteudo.artigo.titulo,
    conteudo,
    avisos: [],
    aprovadaPeloAuditor: aprovada,
    bloqueios: aprovada ? [] : ["REJECT_UNGROUNDED_CLAIM: numero \"0,5\""],
  });
}

describe("agendamento", () => {
  it("matéria reprovada pelo auditor NÃO vira linha em articles", async () => {
    const { client, chamadas } = clienteQueAnota();
    const r = await gravarArtigosAgendados(client, "projeto", [peca(false), peca(true)]);
    expect(r.gravados).toEqual(["aprovada-2026-10-06"]);
    const upserts = chamadas.filter((c) => c[0] === "upsert");
    expect(upserts).toHaveLength(1);
    const linha = upserts[0][1] as Record<string, unknown>;
    // Nasce agendada e à espera de gente: nunca `published`.
    expect(linha.status).toBe("scheduled");
    expect(linha.manual_review_status).toBe("needs_review");
    expect(linha.published_at).toBe("2026-10-06T09:07:00.000Z");
    expect(linha.content_html).toBe("<p>O Fed cortou os juros.</p>");
  });
});
