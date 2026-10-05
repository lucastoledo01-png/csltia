import { describe, expect, it, vi } from "vitest";
import { cicloDasSeisCede, produzirNaVespera, type DependenciasDaProducao } from "./producao-vespera";
import { edicoesQueVenceram, momentoDaEdicao } from "./publicacao-agendada";
import type { Project } from "./projects";
import type { RunNewsroomOptions } from "./newsroom/newsroom-service";

/*
 * RF-01: produção de segunda a quinta às 17:00, tudo do dia seguinte, e uma
 * linha em `newsroom_runs` em TODO desfecho. Cada teste abaixo é um desfecho,
 * e cada um confere a linha.
 */

function projeto(estado?: string, cadencia?: unknown): Project {
  return {
    id: "proj-1",
    slug: "desbuguei",
    timezone: "America/Sao_Paulo",
    settings: {
      ...(estado ? { capacidades: { producao_vespera: estado } } : {}),
      ...(cadencia ? { cadencia } : {}),
    },
  } as unknown as Project;
}

// Segunda, 05/10/2026, 17:00 em Brasília.
const SEGUNDA_17H = new Date("2026-10-05T20:00:00Z");
// Sexta, 09/10/2026, 17:00 em Brasília.
const SEXTA_17H = new Date("2026-10-09T20:00:00Z");

function deps(p: Project, extra: Partial<DependenciasDaProducao> = {}) {
  const linhas: Array<Record<string, unknown>> = [];
  const chamadas: Array<{ options: RunNewsroomOptions; env: Record<string, string | undefined> }> = [];
  const d: DependenciasDaProducao = {
    agora: () => SEGUNDA_17H,
    carregarProjeto: async () => p,
    rodarRedacao: vi.fn(async (options, env) => {
      chamadas.push({ options, env });
      return { ok: true };
    }),
    existeLinha: async () => false,
    gravarLinha: async (l) => {
      linhas.push(l);
    },
    env: {},
    ...extra,
  };
  return { d, linhas, chamadas };
}

describe("cada NÃO deixa linha", () => {
  it("capacidade desligada: não produz, grava cancelled com o motivo", async () => {
    const { d, linhas, chamadas } = deps(projeto());
    const r = await produzirNaVespera("proj-1", d);
    expect(r.decisao.motivo).toBe("PRODUCAO_VESPERA_OFF");
    expect(chamadas).toHaveLength(0);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ status: "cancelled", dry_run: true });
    expect(String(linhas[0].error_message)).toContain("PRODUCAO_VESPERA_OFF");
  });

  it("sexta não produz, e a linha diz por quê", async () => {
    const { d, linhas, chamadas } = deps(projeto("enforce"), { agora: () => SEXTA_17H });
    const r = await produzirNaVespera("proj-1", d);
    expect(r.decisao.motivo).toBe("NAO_E_DIA_DE_PRODUCAO");
    expect(chamadas).toHaveLength(0);
    expect(linhas[0]).toMatchObject({ status: "cancelled", dry_run: false });
    expect(String(linhas[0].idempotency_key)).toMatch(/^producao-2026-10-09#nao_e_dia_de_producao-/);
  });

  it("projeto ilegível ainda grava linha de falha", async () => {
    const { d, linhas } = deps(projeto("enforce"), {
      carregarProjeto: async () => {
        throw new Error("Gateway Timeout");
      },
    });
    const r = await produzirNaVespera("proj-1", d);
    expect(r.ok).toBe(false);
    expect(linhas[0]).toMatchObject({ status: "failed" });
    expect(String(linhas[0].error_message)).toContain("Gateway Timeout");
  });

  it("a redação que lança vira linha failed, e a produção NÃO lança", async () => {
    const { d, linhas } = deps(projeto("enforce"), {
      rodarRedacao: async () => {
        throw new Error("Edição bloqueada");
      },
    });
    const r = await produzirNaVespera("proj-1", d);
    expect(r).toMatchObject({ ok: false, erro: "Edição bloqueada" });
    expect(linhas[0]).toMatchObject({ status: "failed" });
    expect(String(linhas[0].idempotency_key)).toMatch(/^daily-edition-2026-10-06#falha-/);
  });

  it("dia sem pauta suficiente: a linha vira cancelled com o motivo da redação", async () => {
    const { d, linhas } = deps(projeto("enforce"), {
      rodarRedacao: async () => ({ ok: false, reason: "editorial_minimum_not_met", detail: "1 pauta aprovada" }),
    });
    await produzirNaVespera("proj-1", d);
    expect(String(linhas[0].error_message)).toContain("EDITORIAL_MINIMUM_NOT_MET");
  });

  it("quando a redação já gravou o próprio run, a garantia não duplica", async () => {
    const { d, linhas } = deps(projeto("enforce"), { existeLinha: async () => true });
    await produzirNaVespera("proj-1", d);
    expect(linhas).toHaveLength(0);
  });
});

describe("o SIM produz amanhã, com hora marcada", () => {
  it("segunda às 17:00 produz a edição de terça, agendada para os horários do projeto", async () => {
    const { d, chamadas } = deps(projeto("enforce"));
    await produzirNaVespera("proj-1", d);
    const { options, env } = chamadas[0];
    expect(options).toMatchObject({
      editionDate: "2026-10-06",
      idempotencyKey: "daily-edition-2026-10-06",
      dryRun: false,
      publishToPortal: true,
      createNewsletterCampaign: true,
      autoSend: true,
      agendamento: { newsletterEm: "2026-10-06T09:07:00.000Z", portalEm: "2026-10-06T09:07:00.000Z" },
    });
    expect(env.SOCIAL_HORARIOS).toBe("08:00,11:22,14:45,18:07,21:30");
  });

  it("os horários vêm do projeto, e não do código", async () => {
    const { d, chamadas } = deps(
      projeto("enforce", { newsletter: { horarios: ["07:30"] }, portal: { horarios: ["08:15"] } }),
    );
    await produzirNaVespera("proj-1", d);
    expect(chamadas[0].options.agendamento).toEqual({
      newsletterEm: "2026-10-06T10:30:00.000Z",
      portalEm: "2026-10-06T11:15:00.000Z",
    });
  });

  it("em ensaio a redação roda em dry-run e a linha sai marcada como ensaio", async () => {
    const { d, chamadas, linhas } = deps(projeto("dry_run"));
    await produzirNaVespera("proj-1", d);
    expect(chamadas[0].options).toMatchObject({ dryRun: true, publishToPortal: false, createNewsletterCampaign: false });
    expect(linhas[0]).toMatchObject({ status: "success", dry_run: true });
    expect(String(linhas[0].error_message)).toMatch(/^ENSAIO/);
  });
});

describe("o ciclo das 06:03", () => {
  it("só cede com a capacidade declarada enforce", () => {
    expect(cicloDasSeisCede(projeto("enforce"))).toBe(true);
  });

  it("NÃO cede sem declaração, em ensaio, desligado, ou sem projeto", () => {
    expect(cicloDasSeisCede(projeto())).toBe(false);
    expect(cicloDasSeisCede(projeto("dry_run"))).toBe(false);
    expect(cicloDasSeisCede(projeto("off"))).toBe(false);
    expect(cicloDasSeisCede(null)).toBe(false);
  });
});

describe("o relógio da publicação", () => {
  const p = projeto("enforce");

  it("a edição de terça vai ao ar no primeiro horário do portal", () => {
    expect(momentoDaEdicao(p, "2026-10-06")).toBe("2026-10-06T09:07:00.000Z");
  });

  it("NÃO publica antes da hora", () => {
    const antes = new Date("2026-10-06T09:06:00Z");
    expect(edicoesQueVenceram(p, [{ id: "e1", edition_date: "2026-10-06" }], antes)).toEqual([]);
  });

  it("publica quando a hora chega", () => {
    const depois = new Date("2026-10-06T09:07:30Z");
    expect(edicoesQueVenceram(p, [{ id: "e1", edition_date: "2026-10-06" }], depois)).toHaveLength(1);
  });

  it("NÃO publica edição de dia sem portal nem newsletter: espera decisão humana", () => {
    // Segunda, 05/10: pela cadência do PRD nenhum canal publica.
    expect(momentoDaEdicao(p, "2026-10-05")).toBeNull();
    expect(edicoesQueVenceram(p, [{ id: "e1", edition_date: "2026-10-05" }], new Date("2026-10-06T00:00:00Z"))).toEqual(
      [],
    );
  });
});
