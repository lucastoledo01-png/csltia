import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A vaga que ficou presa em `generated`, e como cada caso volta.
 *
 * O worker troca `scheduled` por `generated` antes de falar com a Meta, e é
 * isso que impede dois giros de publicarem o mesmo post. O preço é um estado do
 * qual não se sai sozinho: `findDuePosts` só devolve `scheduled`.
 *
 * O que estes testes protegem não é a recuperação acontecer — é ela não
 * autorizar uma segunda publicação. Um post que já foi ao ar e volta para a
 * fila sem ninguém perguntar à Meta vira post duplicado no perfil.
 */

const linhas: Array<Record<string, unknown>> = [];
const updates: Array<{ id: string; valores: Record<string, unknown> }> = [];
/** Quando ligado, a reivindicação não afeta linha nenhuma: alguém chegou antes. */
const perderDisputa = { ligado: false };

function construirQuery(tabela: string) {
  let idAlvo = "";
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (coluna: string, valor: unknown) => {
      if (coluna === "id") idAlvo = String(valor);
      return q;
    },
    lt: () => q,
    lte: () => q,
    order: () => q,
    limit: async () => ({ data: linhas, error: null }),
    maybeSingle: async () => ({ data: linhas[0] ?? null, error: null }),
    update: (valores: Record<string, unknown>) => {
      const alvo: Record<string, unknown> = {
        select: async () => ({
          data: perderDisputa.ligado ? [] : [{ id: idAlvo }],
          error: null,
        }),
        eq: (coluna: string, valor: unknown) => {
          if (coluna === "id") idAlvo = String(valor);
          return alvo;
        },
        then: (r: (v: unknown) => unknown) => {
          if (tabela === "social_posts") updates.push({ id: idAlvo, valores });
          return Promise.resolve({ data: null, error: null }).then(r);
        },
      };
      if (tabela === "social_posts") updates.push({ id: idAlvo, valores });
      return alvo;
    },
  };
  return q;
}

vi.mock("../../supabase-admin", () => ({
  getSupabaseAdminClient: () => ({ from: (t: string) => construirQuery(t) }),
}));

const TOKEN_EFETIVO = "token-renovado-pelo-cron";
vi.mock("./meta-token", () => ({ resolveInstagramToken: async () => TOKEN_EFETIVO }));
const alertas: Array<{ nivel: string; titulo: string }> = [];
vi.mock("../../alerts", () => ({
  sendAlert: async (nivel: string, titulo: string) => {
    alertas.push({ nivel, titulo });
    return true;
  },
  formatError: (e: unknown) => String(e),
}));

const { recuperarOrfaosV2 } = await import("./worker-service");

function orfa(over: Record<string, unknown> = {}) {
  return {
    id: "post-orfao",
    project_id: "projeto-1",
    provider_creation_id: null,
    provider_post_id: null,
    publish_attempted_at: null,
    /*
     * Legenda realista, e não um rótulo curto: `acharMidiaPelaLegenda` desiste
     * quando os primeiros 60 caracteres têm menos de 20, porque legenda curta
     * casa com qualquer coisa. Um dublê curto faria o teste medir a desistência
     * em vez da reconciliação.
     */
    caption: "A mudança vale a partir de outubro e afeta quem já protocolou.",
    ...over,
  };
}

/** A Meta de mentira, que confere o token como a de verdade. */
function meta(estadoDoContainer: string, midias: Array<{ id: string; caption: string }> = []) {
  const chamadas: string[] = [];
  const fetcher = (async (url: string | URL) => {
    const u = String(url);
    chamadas.push(u);

    const token = new URL(u).searchParams.get("access_token") ?? "";
    if (token && token !== TOKEN_EFETIVO) {
      return Response.json({ error: { message: "Session has expired.", code: 190 } }, { status: 400 });
    }

    if (u.includes("fields=status_code")) return Response.json({ status_code: estadoDoContainer });
    if (u.includes("/media?fields=id,caption")) return Response.json({ data: midias });
    if (u.includes("/media_publish")) return Response.json({ id: "media-republicada" });
    return Response.json({});
  }) as unknown as typeof fetch;

  return { fetcher, chamadas };
}

const ENV = { INSTAGRAM_ACCOUNT_ID: "conta-1", INSTAGRAM_ACCESS_TOKEN: "semente-vencida" };

beforeEach(() => {
  linhas.length = 0;
  updates.length = 0;
  alertas.length = 0;
  perderDisputa.ligado = false;
});

describe("órfã sem container na Meta", () => {
  it("volta para a fila: nada foi publicado nem podia ter sido", async () => {
    linhas.push(orfa());
    const { fetcher, chamadas } = meta("FINISHED");

    const r = await recuperarOrfaosV2({ env: ENV, fetcher });

    expect(r.devolvidasParaFila).toBe(1);
    expect(r.publicadasNaReconciliacao).toBe(0);
    // Sem container não há o que perguntar: a Meta não é chamada.
    expect(chamadas).toHaveLength(0);
    expect(updates.some((u) => u.valores.status === "scheduled")).toBe(true);
  });
});

describe("órfã COM container na Meta", () => {
  it("pergunta à Meta ANTES, e post já publicado não volta para a fila", async () => {
    /*
     * O caso que justifica a recuperação existir separada. Devolver esta linha
     * para `scheduled` sem perguntar autorizaria uma segunda publicação do
     * mesmo post — o container está lá, e ele pode já ter virado mídia.
     */
    linhas.push(
      orfa({
        provider_creation_id: "container-1",
        publish_attempted_at: "2026-09-06T11:00:00Z",
      }),
    );
    const { fetcher, chamadas } = meta("PUBLISHED", [{ id: "media-999", caption: "A mudança vale a partir de outubro e afeta quem já protocolou." }]);

    const r = await recuperarOrfaosV2({ env: ENV, fetcher });

    expect(r.publicadasNaReconciliacao).toBe(1);
    expect(r.devolvidasParaFila).toBe(0);
    expect(chamadas.some((c) => c.includes("fields=status_code"))).toBe(true);
    // Nenhum container novo foi criado.
    expect(chamadas.some((c) => c.endsWith("/media"))).toBe(false);
  });

  it("container expirado libera refazer, porque ele nunca publicou", async () => {
    linhas.push(
      orfa({ provider_creation_id: "container-1", publish_attempted_at: "2026-09-06T11:00:00Z" }),
    );
    const { fetcher } = meta("EXPIRED");

    const r = await recuperarOrfaosV2({ env: ENV, fetcher });

    expect(r.devolvidasParaFila).toBe(1);
    expect(r.publicadasNaReconciliacao).toBe(0);
  });

  it("não saber o desfecho vira revisão, e não volta para a fila", async () => {
    linhas.push(
      orfa({ provider_creation_id: "container-1", publish_attempted_at: "2026-09-06T11:00:00Z" }),
    );
    // Token vencido na env: se a pergunta fosse feita com ele, TODO container
    // saudável viraria revisão. Aqui o que falha é o container mesmo.
    const fetcher = (async (url: string | URL) => {
      const u = String(url);
      if (u.includes("fields=status_code")) return new Response("erro", { status: 500 });
      return Response.json({});
    }) as unknown as typeof fetch;

    const r = await recuperarOrfaosV2({ env: ENV, fetcher });

    expect(r.mandadasParaRevisao).toBe(1);
    expect(r.devolvidasParaFila).toBe(0);
    expect(updates.some((u) => u.valores.status === "failed")).toBe(true);
  });

  it("a pergunta vai com o token efetivo, nunca com a semente da env", async () => {
    linhas.push(
      orfa({ provider_creation_id: "container-1", publish_attempted_at: "2026-09-06T11:00:00Z" }),
    );
    const { fetcher, chamadas } = meta("PUBLISHED", [{ id: "media-999", caption: "A mudança vale a partir de outubro e afeta quem já protocolou." }]);

    await recuperarOrfaosV2({ env: ENV, fetcher });

    for (const c of chamadas) {
      expect(c).not.toContain("semente-vencida");
    }
    expect(chamadas.some((c) => c.includes(TOKEN_EFETIVO))).toBe(true);
  });
});

describe("post já publicado nunca é recuperado", () => {
  it("linha com provider_post_id resolve como publicada e não volta para a fila", async () => {
    linhas.push(orfa({ provider_post_id: "media-antiga", provider_creation_id: "container-1" }));
    const { fetcher, chamadas } = meta("PUBLISHED");

    const r = await recuperarOrfaosV2({ env: ENV, fetcher });

    expect(r.publicadasNaReconciliacao).toBe(1);
    expect(r.devolvidasParaFila).toBe(0);
    // Nem precisou perguntar: o media_id já estava na linha.
    expect(chamadas).toHaveLength(0);
  });
});

describe("dois workers não recuperam a mesma linha", () => {
  it("quem perde a reivindicação sai sem tocar em nada", async () => {
    linhas.push(orfa());
    perderDisputa.ligado = true;
    const { fetcher, chamadas } = meta("FINISHED");

    const r = await recuperarOrfaosV2({ env: ENV, fetcher });

    expect(r.examinadas).toBe(1);
    expect(r.devolvidasParaFila).toBe(0);
    expect(r.publicadasNaReconciliacao).toBe(0);
    expect(chamadas).toHaveLength(0);
  });

  it("o perdedor não marca a linha como falha", async () => {
    // Ela está sendo recuperada por outro giro neste instante.
    linhas.push(orfa());
    perderDisputa.ligado = true;
    const { fetcher } = meta("FINISHED");

    await recuperarOrfaosV2({ env: ENV, fetcher });

    expect(updates.some((u) => u.valores.status === "failed")).toBe(false);
    expect(alertas).toHaveLength(0);
  });
});

describe("o caminho legado não é tocado", () => {
  it("a busca filtra por generation_version social-v2", async () => {
    /*
     * O legado tem a mesma propriedade de ficar preso em `generated`, e mexer
     * nele aumentaria risco de republicação em troca de nada: o que vai entrar
     * em produção é o V2. A prova aqui é o filtro da consulta.
     */
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fonte = fs.readFileSync(path.join(__dirname, "worker-service.ts"), "utf-8");
    const trecho = fonte.slice(fonte.indexOf("export async function recuperarOrfaosV2"));
    expect(trecho).toContain('.eq("generation_version", GERACAO_V2)');
    expect(trecho).toContain('.eq("status", "generated")');
  });
});
