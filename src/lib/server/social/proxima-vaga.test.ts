import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/server/projects";
import { proximaVagaDoInstagram, somarDias } from "./proxima-vaga";

const PROJETO = { id: "p1", slug: "t", timezone: "America/Sao_Paulo", settings: {} } as unknown as Project;

/** Um banco de mentira: os posts de cada dia, lidos pela cadeia from/select/eq. */
function banco(postsPorDia: Record<string, Array<{ status: string; scheduled_at: string }>>): SupabaseClient {
  return {
    from: () => {
      let data = "";
      const q = {
        select: () => q,
        eq: (coluna: string, valor: string) => {
          if (coluna === "edition_date") data = valor;
          return q;
        },
        then: (ok: (r: unknown) => unknown) => ok({ data: (postsPorDia[data] ?? []).map((p) => ({ ...p, error_message: null, dry_run: false })), error: null }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

describe("a vaga do Instagram (10/11/2026)", () => {
  it("o dia que ainda tem horário fica com ele", async () => {
    const r = await proximaVagaDoInstagram(PROJETO, "2026-11-10", { client: banco({}), agora: () => new Date("2026-11-10T12:00:00Z") });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.vaga.data).toBe("2026-11-10");
  });

  it("o post pronto às 15:27 de Brasília, com o dia lotado, vai para o dia seguinte (Anthropic e Ring)", async () => {
    // Os dois horários que sobravam (18:07 e 21:30) já tinham dono: Rubio e Massie.
    const lotado = {
      "2026-11-10": [
        { status: "draft", scheduled_at: "2026-11-10T21:07:00Z" },
        { status: "draft", scheduled_at: "2026-11-11T00:30:00Z" },
      ],
    };
    const r = await proximaVagaDoInstagram(PROJETO, "2026-11-10", { client: banco(lotado), agora: () => new Date("2026-11-10T18:27:00Z") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.vaga.data).toBe("2026-11-11");
    expect(new Date(r.vaga.quandoIso).getTime()).toBeGreaterThan(new Date("2026-11-11T03:00:00Z").getTime());
  });

  it("soma dias atravessando o mês", () => {
    expect(somarDias("2026-11-30", 1)).toBe("2026-12-01");
  });
});
