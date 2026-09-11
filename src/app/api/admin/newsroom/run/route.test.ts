import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A resposta do ensaio mostra o Instagram do dia mesmo com a newsletter barrada.
 *
 * O portão do QA sai por `throw`, e a rota devolvia só `{ok:false, error}`.
 * Num dia bloqueado, o canal social já rodou inteiro antes do portão: em
 * 11/09/2026 ele gravou dois posts e publicou um na Meta, e a execução do dia
 * não dizia nada sobre isso.
 *
 * Estes testes exercitam a cadeia real: o erro sobe de dentro de `runNewsroom`,
 * o invólucro anexa o diagnóstico, e a rota monta a resposta. Nada de `runNewsroom`
 * falso, porque o que está sob teste é justamente a costura entre os dois.
 */

const PROJETO = {
  id: "proj-1",
  slug: "desbuguei",
  timezone: "America/Sao_Paulo",
} as unknown as Awaited<ReturnType<typeof import("@/lib/server/projects").requireActiveProject>>;

vi.mock("@/lib/server/projects", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/projects")>();
  return {
    ...real,
    requireActiveProject: vi.fn(async () => PROJETO),
    projectToday: vi.fn(() => "2026-09-11"),
  };
});

vi.mock("@/lib/server/supabase-admin", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/supabase-admin")>();
  return {
    ...real,
    getSupabaseAdminClient: () => ({
      from: () => ({ insert: () => Promise.resolve({ data: null, error: null }) }),
    }),
  };
});

const projetos = await import("@/lib/server/projects");
const { MOTIVO_QA_BLOQUEOU, comMotivo } = await import("@/lib/server/newsroom/newsroom-service");
const { POST } = await import("./route");

const SEGREDO = "segredo-de-teste-do-cron";

function pedido(corpo: Record<string, unknown>) {
  return new Request("https://casaloti.ia.br/api/admin/newsroom/run", {
    method: "POST",
    headers: {
      authorization: `Bearer ${SEGREDO}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(corpo),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  process.env.CRON_SECRET = SEGREDO;
  vi.mocked(projetos.projectToday).mockReset().mockReturnValue("2026-09-11");
  vi.mocked(projetos.requireActiveProject).mockReset();
});

describe("a rota do ensaio devolve o social junto com o erro da newsletter", () => {
  it("edição bloqueada pelo QA: status blocked, motivo nomeado e social presente", async () => {
    const bloqueio = comMotivo(
      new Error(
        "Edição bloqueada depois de 2 tentativa(s) de correção (QA 93): " +
          "UNGROUNDED_EDITORIAL_CLAIM em 1 conclusão(ões) | REJECT_EDITORIAL_QA: hallucination_risk",
      ),
      MOTIVO_QA_BLOQUEOU,
    );

    vi.mocked(projetos.requireActiveProject)
      .mockRejectedValueOnce(bloqueio)
      .mockResolvedValue(PROJETO);

    process.env.SOCIAL_PIPELINE_V2 = "enforce";
    const resposta = await POST(pedido({ dryRun: true }));
    const corpo = await resposta.json();

    // A newsletter continua bloqueada, e a resposta continua sendo erro.
    expect(resposta.status).toBe(500);
    expect(corpo.ok).toBe(false);
    expect(corpo.newsletter.status).toBe("blocked");
    expect(corpo.newsletter.reason).toBe("EDITORIAL_QA");
    expect(corpo.newsletter.error).toContain("UNGROUNDED_EDITORIAL_CLAIM");

    // E agora o Instagram do dia aparece.
    expect(corpo.social).toBeTruthy();
    expect(corpo.social.mode).toBe("enforce");

    // O campo antigo continua no lugar: a resposta ganhou estrutura, não trocou
    // de contrato.
    expect(corpo.error).toBe(corpo.newsletter.error);
  });

  it("falha técnica sem marca: status failed e motivo genérico", async () => {
    vi.mocked(projetos.requireActiveProject)
      .mockRejectedValueOnce(new Error("supabase fora do ar"))
      .mockResolvedValue(PROJETO);

    process.env.SOCIAL_PIPELINE_V2 = "dry_run";
    const resposta = await POST(pedido({ dryRun: true }));
    const corpo = await resposta.json();

    expect(resposta.status).toBe(500);
    expect(corpo.newsletter.status).toBe("failed");
    expect(corpo.newsletter.reason).toBe("RUN_FAILED");
    expect(corpo.social.mode).toBe("dry_run");
  });

  it("sem o segredo do cron e sem sessão de admin, nada disso é acessível", async () => {
    process.env.ADMIN_SESSION_SECRET = "segredo-de-sessao-do-teste";

    // `requireAdminOrCron` cai na sessão de admin quando o segredo do cron não
    // confere, e é ela que lê o cookie. Sem este par, o teste mediria a falta do
    // shim e não a recusa.
    const semAuth = Object.assign(
      new Request("https://casaloti.ia.br/api/admin/newsroom/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      { cookies: { get: () => undefined } },
    ) as unknown as Parameters<typeof POST>[0];

    const resposta = await POST(semAuth);
    expect(resposta.status).toBe(401);
    expect(vi.mocked(projetos.requireActiveProject)).not.toHaveBeenCalled();
  });
});
