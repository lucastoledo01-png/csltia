import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicarComRegistro, reconciliarTentativaAnterior } from "./publicacao-segura";

/**
 * O que impede o mesmo post de ir ao ar duas vezes.
 *
 * O caso que estes testes travam aconteceu de verdade no desenho antigo: a
 * Meta publica, a gravação local falha em silêncio, e o giro seguinte do
 * worker republica. A regra que os testes verificam é sempre a mesma, vista de
 * ângulos diferentes: na dúvida, não publica.
 */

type Escrita = { campos: Record<string, unknown>; quando: number };

/** Supabase de mentira, que registra a ordem das escritas. */
function bancoFalso(opcoes: { falharEm?: (n: number) => boolean } = {}) {
  const escritas: Escrita[] = [];
  let n = 0;

  const client = {
    from() {
      return {
        update(campos: Record<string, unknown>) {
          n += 1;
          const falha = opcoes.falharEm?.(n) ?? false;
          if (!falha) escritas.push({ campos, quando: escritas.length });
          return {
            eq: async () => (falha ? { error: { message: "banco recusou" } } : { error: null }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { client, escritas };
}

const ENV = { INSTAGRAM_ACCOUNT_ID: "conta", INSTAGRAM_ACCESS_TOKEN: "token" };

/** Fetch que responde conforme a URL, e conta o que foi chamado. */
function metaFalsa(mapa: {
  status?: string;
  statusFalha?: boolean;
  publishOk?: boolean;
  midias?: Array<{ id: string; caption: string; timestamp: string }>;
}) {
  const chamadas: string[] = [];

  const fetcher = vi.fn(async (url: string | URL) => {
    const u = String(url);
    chamadas.push(u);

    if (u.includes("media_publish")) {
      return mapa.publishOk === false
        ? new Response(JSON.stringify({ error: { message: "recusado" } }), { status: 400 })
        : new Response(JSON.stringify({ id: "media_novo" }), { status: 200 });
    }

    if (u.includes("/media?fields=")) {
      return new Response(JSON.stringify({ data: mapa.midias ?? [] }), { status: 200 });
    }

    if (mapa.statusFalha) {
      return new Response(JSON.stringify({ error: { message: "indisponível" } }), { status: 500 });
    }

    return new Response(JSON.stringify({ status_code: mapa.status ?? "FINISHED" }), { status: 200 });
  }) as unknown as typeof fetch;

  return { fetcher, chamadas };
}

const LEGENDA = "O USCIS publicou nesta semana a orientação que detalha a análise do EB-2 NIW.";

describe("reconciliação de uma tentativa anterior", () => {
  it("post que já tem media_id não fala com a Meta", async () => {
    const { client } = bancoFalso();
    const { fetcher, chamadas } = metaFalsa({});

    const r = await reconciliarTentativaAnterior(
      client,
      "post1",
      { providerPostId: "media_antiga", providerCreationId: "c1", publishAttemptedAt: "2026-09-06", caption: LEGENDA },
      ENV,
      fetcher,
    );

    expect(r).toEqual({ desfecho: "publicado", mediaId: "media_antiga", reaproveitado: true });
    expect(chamadas).toEqual([]);
  });

  it("sem container registrado, devolve null e o caminho normal segue", async () => {
    const { client } = bancoFalso();
    const { fetcher } = metaFalsa({});

    const r = await reconciliarTentativaAnterior(
      client,
      "post1",
      { providerPostId: null, providerCreationId: null, publishAttemptedAt: null, caption: "" },
      ENV,
      fetcher,
    );

    expect(r).toBeNull();
  });

  it("container PUBLISHED recupera o media_id pela legenda e NÃO publica de novo", async () => {
    const { client, escritas } = bancoFalso();
    const { fetcher, chamadas } = metaFalsa({
      status: "PUBLISHED",
      midias: [{ id: "media_recuperada", caption: LEGENDA, timestamp: "2026-09-06T10:00:00Z" }],
    });

    const r = await reconciliarTentativaAnterior(
      client,
      "post1",
      { providerPostId: null, providerCreationId: "c1", publishAttemptedAt: "2026-09-06", caption: LEGENDA },
      ENV,
      fetcher,
    );

    expect(r).toEqual({ desfecho: "publicado", mediaId: "media_recuperada", reaproveitado: true });
    expect(chamadas.some((c) => c.includes("media_publish"))).toBe(false);
    expect(escritas[0].campos.provider_post_id).toBe("media_recuperada");
  });

  it("container PUBLISHED sem a legenda encontrada vai para revisão, e não republica", async () => {
    const { client } = bancoFalso();
    const { fetcher, chamadas } = metaFalsa({ status: "PUBLISHED", midias: [] });

    const r = await reconciliarTentativaAnterior(
      client,
      "post1",
      { providerPostId: null, providerCreationId: "c1", publishAttemptedAt: "2026-09-06", caption: LEGENDA },
      ENV,
      fetcher,
    );

    expect(r?.desfecho).toBe("revisar");
    expect(chamadas.some((c) => c.includes("media_publish"))).toBe(false);
  });

  it("container inalcançável vai para revisão: não saber não é o mesmo que não ter publicado", async () => {
    const { client } = bancoFalso();
    const { fetcher, chamadas } = metaFalsa({ statusFalha: true });

    const r = await reconciliarTentativaAnterior(
      client,
      "post1",
      { providerPostId: null, providerCreationId: "c1", publishAttemptedAt: "2026-09-06", caption: LEGENDA },
      ENV,
      fetcher,
    );

    expect(r?.desfecho).toBe("revisar");
    expect(chamadas.some((c) => c.includes("media_publish"))).toBe(false);
  });

  it("container EXPIRED libera refazer do zero, porque ele nunca publicou", async () => {
    const { client, escritas } = bancoFalso();
    const { fetcher } = metaFalsa({ status: "EXPIRED" });

    const r = await reconciliarTentativaAnterior(
      client,
      "post1",
      { providerPostId: null, providerCreationId: "c1", publishAttemptedAt: "2026-09-06", caption: LEGENDA },
      ENV,
      fetcher,
    );

    expect(r).toBeNull();
    expect(escritas[0].campos.provider_creation_id).toBeNull();
  });

  it("container FINISHED republica o MESMO creation_id, nunca um novo", async () => {
    const { client } = bancoFalso();
    const { fetcher, chamadas } = metaFalsa({ status: "FINISHED" });

    const r = await reconciliarTentativaAnterior(
      client,
      "post1",
      { providerPostId: null, providerCreationId: "c1", publishAttemptedAt: "2026-09-06", caption: LEGENDA },
      ENV,
      fetcher,
    );

    expect(r).toEqual({ desfecho: "publicado", mediaId: "media_novo", reaproveitado: true });
    // A Meta recusa publicar duas vezes o mesmo container; é isso que torna
    // a repetição segura. Criar container novo é que duplicaria o post.
    const publish = chamadas.find((c) => c.includes("media_publish"));
    expect(publish).toBeTruthy();
    expect(chamadas.some((c) => c.includes("/media?") && !c.includes("fields="))).toBe(false);
  });
});

describe("publicação com registro de intenção", () => {
  it("grava o creation_id ANTES de chamar o publish", async () => {
    const { client, escritas } = bancoFalso();
    const { fetcher, chamadas } = metaFalsa({ status: "FINISHED" });

    const ordem: string[] = [];
    const fetcherEspiao = (async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes("media_publish")) ordem.push("publish");
      return fetcher(url as never, init as never);
    }) as unknown as typeof fetch;

    const clienteEspiao = {
      from() {
        return {
          update(campos: Record<string, unknown>) {
            if (campos.provider_creation_id) ordem.push("grava_intencao");
            if (campos.provider_post_id) ordem.push("grava_media");
            escritas.push({ campos, quando: escritas.length });
            return { eq: async () => ({ error: null }) };
          },
        };
      },
    } as unknown as SupabaseClient;

    const r = await publicarComRegistro(clienteEspiao, "post1", "c1", ENV, fetcherEspiao);

    expect(r).toEqual({ desfecho: "publicado", mediaId: "media_novo", reaproveitado: false });
    expect(ordem).toEqual(["grava_intencao", "publish", "grava_media"]);
    expect(chamadas.length).toBeGreaterThan(0);
    void client;
  });

  it("se o banco recusa registrar a intenção, não publica", async () => {
    const { client } = bancoFalso({ falharEm: () => true });
    const { fetcher, chamadas } = metaFalsa({ status: "FINISHED" });

    await expect(publicarComRegistro(client, "post1", "c1", ENV, fetcher)).rejects.toThrow(
      /intenção de publicar/,
    );
    expect(chamadas.some((c) => c.includes("media_publish"))).toBe(false);
  });

  it("publish que falha deixa o container registrado para reconciliar depois", async () => {
    const { client, escritas } = bancoFalso();
    const { fetcher } = metaFalsa({ status: "FINISHED", publishOk: false });

    const r = await publicarComRegistro(client, "post1", "c1", ENV, fetcher);

    expect(r.desfecho).toBe("revisar");
    expect(escritas[0].campos.provider_creation_id).toBe("c1");
  });

  it("quando a gravação do media_id não vai, o erro nomeia a mídia órfã", async () => {
    // Todas as escritas passam, menos as três do media_id.
    let n = 0;
    const client = {
      from() {
        return {
          update(campos: Record<string, unknown>) {
            n += 1;
            const ehMedia = Boolean(campos.provider_post_id);
            return {
              eq: async () => (ehMedia ? { error: { message: "banco fora" } } : { error: null }),
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    const { fetcher } = metaFalsa({ status: "FINISHED" });

    await expect(publicarComRegistro(client, "post1", "c1", ENV, fetcher)).rejects.toThrow(
      /PUBLICADO NO INSTAGRAM E NÃO GRAVADO.*media_novo/s,
    );
    expect(n).toBeGreaterThan(1);
  });
});
