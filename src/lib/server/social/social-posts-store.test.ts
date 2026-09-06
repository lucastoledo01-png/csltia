import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chaveDeIdempotencia,
  criarSocialPostsStore,
  resolverOrigem,
} from "./social-posts-store";
import type { PostParaGravar } from "./social-posts-store";
import type { RegistroHistorico } from "../editorial/history";

/**
 * Onde um post do social vira linha, e as duas coisas que ele não pode fazer:
 * duplicar acontecimento e mentir sobre a própria origem.
 */

const PROJ = "proj-1";
const DIA = "2026-09-06";

function historico(over: Partial<RegistroHistorico> = {}): RegistroHistorico {
  return {
    projectId: PROJ,
    storyId: "s1",
    canal: "newsletter",
    titulo: "USCIS amplia prazo",
    urlCanonica: "uscis.gov/a",
    publicadoEm: "2026-09-06T09:00:00Z",
    ...over,
  } as RegistroHistorico;
}

function paraGravar(over: Record<string, unknown> = {}): PostParaGravar {
  const storyId = (over.storyId as string) ?? "s1";
  return {
    projectId: PROJ,
    editionDate: DIA,
    candidateId: "cand-1",
    topicId: "org:uscis",
    eventFingerprint: (over.eventFingerprint as string) ?? "uscis+prazo",
    origem: (over.origem as PostParaGravar["origem"]) ?? {
      originChannel: "social",
      originStoryId: null,
      motivo: "",
    },
    vaga: { posicao: 1, slot: `${DIA}-01`, quandoIso: "2026-09-06T11:00:00Z", horaLocal: "08:00" },
    visual: null,
    post: {
      pauta: { storyId, pontuacao: { total: 70 } },
      copy: { headline: "USCIS amplia prazo do EAD", hashtags: [] },
      veredicto: {
        passed: true, issues: [], repairableIssues: [], fatalIssues: [],
        attempts: 0, finalDecision: "publicar",
        legendaFinal: "Legenda do post.", hashtagsFinais: ["#USCIS"],
      },
      reparosAplicados: [],
    },
    ...over,
  } as unknown as PostParaGravar;
}

/** Supabase de mentira que guarda as linhas em memória. */
function bancoFalso(existentes: Array<Record<string, unknown>> = []) {
  const gravadas: Record<string, unknown>[] = [];

  const client = {
    from() {
      const c: Record<string, unknown> = {
        select() { return c; },
        eq() { return c; },
        then(resolve: (v: unknown) => void) {
          return Promise.resolve({ data: existentes, error: null }).then(resolve);
        },
        upsert(linhas: Record<string, unknown>[]) {
          gravadas.push(...linhas);
          return {
            select: () => Promise.resolve({
              data: linhas.map((_, i) => ({ id: `novo-${i}` })),
              error: null,
            }),
          };
        },
      };
      return c;
    },
  } as unknown as SupabaseClient;

  return { client, gravadas };
}

describe("origem do post", () => {
  it("newsletter-origin: a pauta saiu no e-mail", () => {
    const r = resolverOrigem("s1", [historico({ storyId: "s1", canal: "newsletter" })]);
    expect(r.originChannel).toBe("newsletter");
    expect(r.originStoryId).toBe("s1");
  });

  it("social-only: aprovada, verificada, e não entrou no e-mail", () => {
    const r = resolverOrigem("s2", [historico({ storyId: "s1", canal: "newsletter" })]);
    expect(r.originChannel).toBe("social");
    expect(r.originStoryId).toBeNull();
  });

  it("classificação compartilhada NÃO vira newsletter-origin", () => {
    // Desde que o newsroom grava em news_candidates, toda pauta do dia foi
    // classificada pelo processo que serve o e-mail. Isso não é publicação.
    const semHistorico: RegistroHistorico[] = [];
    const r = resolverOrigem("s1", semHistorico);

    expect(r.originChannel).toBe("social");
    expect(r.motivo).toMatch(/não entrou na composição/);
  });

  it("post do próprio Instagram no histórico também não é newsletter-origin", () => {
    const r = resolverOrigem("s1", [historico({ storyId: "s1", canal: "instagram" })]);
    expect(r.originChannel).toBe("social");
  });
});

describe("persistência", () => {
  it("grava usando as colunas que já existem", async () => {
    const { client, gravadas } = bancoFalso();
    const store = criarSocialPostsStore(client);

    const r = await store.gravar([paraGravar()]);

    expect(r.gravados).toBe(1);
    const linha = gravadas[0];
    expect(linha.title).toBe("USCIS amplia prazo do EAD");
    expect(linha.caption).toBe("Legenda do post.");
    expect(linha.story_id).toBe("s1");
    expect(linha.candidate_id).toBe("cand-1");
    expect(linha.topic_id).toBe("org:uscis");
    expect(linha.event_fingerprint).toBe("uscis+prazo");
    expect(linha.editorial_score).toBe(70);
    expect(linha.social_guard_status).toBe("passed");
    expect(linha.generation_version).toBe("social-v2");
    expect(linha.scheduled_slot).toBe("2026-09-06-01");
  });

  it("o resultado inteiro da guarda cabe em social_guard_reasons", async () => {
    const { client, gravadas } = bancoFalso();
    const store = criarSocialPostsStore(client);
    await store.gravar([paraGravar()]);

    const razoes = gravadas[0].social_guard_reasons as Record<string, unknown>;
    expect(razoes.finalDecision).toBe("publicar");
    expect(razoes).toHaveProperty("issues");
    expect(razoes).toHaveProperty("attempts");
  });

  it("sem imagem válida, o motivo fica registrado", async () => {
    const { client, gravadas } = bancoFalso();
    const store = criarSocialPostsStore(client);
    await store.gravar([paraGravar({ visual: { motivo: "AMBIGUOUS_ENTITY", asset: null } })]);

    const visual = (gravadas[0].content_json as { visual: Record<string, unknown> }).visual;
    expect(visual.motivo).toBe("AMBIGUOUS_ENTITY");
  });
});

describe("idempotência", () => {
  it("a mesma pauta não vira duas linhas no mesmo dia", async () => {
    const { client, gravadas } = bancoFalso([
      { id: "velho", story_id: "s1", event_fingerprint: "uscis+prazo", idempotency_key: chaveDeIdempotencia(DIA, "s1") },
    ]);
    const store = criarSocialPostsStore(client);

    const r = await store.gravar([paraGravar()]);

    expect(r.gravados).toBe(0);
    expect(gravadas).toHaveLength(0);
    expect(r.bloqueadosPorIdempotencia[0].motivo).toMatch(/já tem post neste dia/);
  });

  it("o mesmo acontecimento por outro artigo é bloqueado", async () => {
    // story_id diferente, fingerprint igual: duas fontes cobrindo a mesma
    // decisão. Para quem rola o feed é o mesmo post duas vezes.
    const { client } = bancoFalso([
      { id: "velho", story_id: "s1", event_fingerprint: "uscis+prazo", idempotency_key: "outra" },
    ]);
    const store = criarSocialPostsStore(client);

    const r = await store.gravar([paraGravar({ storyId: "s2" })]);

    expect(r.gravados).toBe(0);
    expect(r.bloqueadosPorIdempotencia[0].motivo).toMatch(/DUPLICATE_EVENT/);
  });

  it("dois posts do mesmo evento no MESMO lote também são cortados", async () => {
    const { client, gravadas } = bancoFalso();
    const store = criarSocialPostsStore(client);

    const r = await store.gravar([
      paraGravar({ storyId: "s1" }),
      paraGravar({ storyId: "s2", eventFingerprint: "uscis+prazo" }),
    ]);

    expect(r.gravados).toBe(1);
    expect(gravadas).toHaveLength(1);
    expect(r.bloqueadosPorIdempotencia).toHaveLength(1);
  });

  it("pautas de acontecimentos diferentes passam as duas", async () => {
    const { client } = bancoFalso();
    const store = criarSocialPostsStore(client);

    const r = await store.gravar([
      paraGravar({ storyId: "s1", eventFingerprint: "uscis+prazo" }),
      paraGravar({ storyId: "s2", eventFingerprint: "dhs+regra" }),
    ]);

    expect(r.gravados).toBe(2);
  });

  it("newsletter para Instagram NÃO é bloqueado pela idempotência", async () => {
    // O histórico da newsletter não vive em social_posts, então a pauta
    // reaproveitada entra normalmente. Este é o fluxo desejado.
    const { client } = bancoFalso([]);
    const store = criarSocialPostsStore(client);

    const r = await store.gravar([
      paraGravar({
        origem: { originChannel: "newsletter", originStoryId: "s1", motivo: "reaproveitamento" },
      }),
    ]);

    expect(r.gravados).toBe(1);
  });
});
