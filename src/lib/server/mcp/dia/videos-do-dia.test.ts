import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/server/projects";
import { buscarVideosDoDia } from "./deps";

/* A busca de vídeos dentro do "faça o dia" (10/11/2026): sem cron, sem travar o dia. */

function cliente(eventos: unknown[]): SupabaseClient {
  return { from: () => ({ insert: async (l: unknown) => (eventos.push(l), { error: null }) }) } as unknown as SupabaseClient;
}
const projeto = (reels: string) => ({ id: "p1", slug: "t", settings: { capacidades: { reels } } }) as unknown as Project;
const desfecho = { modo: "enforce", ok: true, gravados: 3 } as never;

describe("a busca de vídeos do dia", () => {
  it("roda e grava a rodada, marcada como do fazer_o_dia", async () => {
    const eventos: unknown[] = [];
    expect(await buscarVideosDoDia(cliente(eventos), projeto("enforce"), async () => desfecho)).toBe("ok");
    expect(eventos).toEqual([{ event_type: "reels_rodada", project_id: "p1", payload: { modo: "enforce", ok: true, gravados: 3, origem: "fazer_o_dia" } }]);
  });

  it("com os Reels desligados, nem roda", async () => {
    let rodou = false;
    expect(await buscarVideosDoDia(cliente([]), projeto("off"), async () => ((rodou = true), desfecho))).toBe("desligada");
    expect(rodou).toBe(false);
  });

  it("falha e demora não travam o dia", async () => {
    expect(await buscarVideosDoDia(cliente([]), projeto("enforce"), async () => Promise.reject(new Error("cota")))).toBe("falhou");
    expect(await buscarVideosDoDia(cliente([]), projeto("enforce"), () => new Promise(() => {}), 20)).toBe("prazo");
  });
});
