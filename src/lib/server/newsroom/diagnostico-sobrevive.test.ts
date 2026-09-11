import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * O Instagram do dia não some quando a newsletter é bloqueada.
 *
 * Em 10 e 11/09/2026 a edição foi bloqueada pelo portão do QA
 * (`UNGROUNDED_EDITORIAL_CLAIM` mais `hallucination_risk`). O portão sai por
 * `throw`, e o diagnóstico do social vivia num `let` local que só aparecia nos
 * dois `return` do caminho feliz. Resultado: o canal social rodou inteiro,
 * gravou dois posts e publicou um deles na Meta, e a resposta da execução dizia
 * apenas `{ok:false, error}`.
 *
 * Os dois são consumidores independentes do mesmo trabalho editorial, e o
 * social roda ANTES do portão de propósito. A resposta precisa refletir isso.
 *
 * Nada aqui afrouxa o QA: a decisão e a mensagem do erro seguem idênticas.
 */

const PROJETO = {
  id: "proj-1",
  slug: "desbuguei",
  timezone: "America/Sao_Paulo",
} as unknown as Awaited<ReturnType<typeof import("../projects").requireActiveProject>>;

vi.mock("../projects", async (importOriginal) => {
  const real = await importOriginal<typeof import("../projects")>();
  return {
    ...real,
    requireActiveProject: vi.fn(async () => PROJETO),
    projectToday: vi.fn(() => "2026-09-11"),
  };
});

vi.mock("../supabase-admin", async (importOriginal) => {
  const real = await importOriginal<typeof import("../supabase-admin")>();
  return {
    ...real,
    getSupabaseAdminClient: () => ({
      from: () => ({ insert: () => Promise.resolve({ data: null, error: null }) }),
    }),
  };
});

const projetos = await import("../projects");
const {
  MOTIVO_FALHA_GENERICA,
  MOTIVO_QA_BLOQUEOU,
  comMotivo,
  diagnosticoSocialDoErro,
  motivoDoErro,
  runNewsroom,
} = await import("./newsroom-service");

describe("o motivo do erro é estruturado, e a mensagem não muda", () => {
  it("erro sem marca cai no motivo genérico", () => {
    expect(motivoDoErro(new Error("qualquer coisa"))).toBe(MOTIVO_FALHA_GENERICA);
    expect(motivoDoErro("nem erro é")).toBe(MOTIVO_FALHA_GENERICA);
    expect(motivoDoErro(null)).toBe(MOTIVO_FALHA_GENERICA);
  });

  it("marcar o erro não altera mensagem, identidade nem serialização", () => {
    const original = new Error("Edição bloqueada depois de 2 tentativa(s)");
    const marcado = comMotivo(original, MOTIVO_QA_BLOQUEOU);

    // Identidade: é o MESMO erro. O alerta do Telegram e a linha `failed` de
    // `newsroom_runs` leem exatamente o que liam antes.
    expect(marcado).toBe(original);
    expect(marcado.message).toBe("Edição bloqueada depois de 2 tentativa(s)");
    expect(motivoDoErro(marcado)).toBe(MOTIVO_QA_BLOQUEOU);

    // Não enumerável: nada que percorra as chaves do erro passa a ver isto.
    expect(Object.keys(marcado)).not.toContain("__motivoDaRedacao");
    expect(JSON.stringify(marcado)).toBe("{}");
  });

  it("erro congelado é repassado sem o anexo, em vez de explodir", () => {
    const congelado = Object.freeze(new Error("imutável"));
    expect(() => comMotivo(congelado, MOTIVO_QA_BLOQUEOU)).not.toThrow();
    expect(motivoDoErro(congelado)).toBe(MOTIVO_FALHA_GENERICA);
  });

  it("sem diagnóstico anexado, a leitura devolve null", () => {
    expect(diagnosticoSocialDoErro(new Error("x"))).toBeNull();
    expect(diagnosticoSocialDoErro(undefined)).toBeNull();
  });
});

describe("o diagnóstico social sobrevive ao erro da newsletter", () => {
  beforeEach(() => {
    vi.mocked(projetos.projectToday).mockReset().mockReturnValue("2026-09-11");
    vi.mocked(projetos.requireActiveProject).mockReset();
  });

  it("o erro carrega o diagnóstico do social, e continua sendo erro", async () => {
    vi.mocked(projetos.requireActiveProject)
      .mockRejectedValueOnce(new Error("quebrou depois do social"))
      .mockResolvedValue(PROJETO);

    const erro = await runNewsroom({ dryRun: false }, { SOCIAL_PIPELINE_V2: "enforce" }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toBe("quebrou depois do social");

    const social = diagnosticoSocialDoErro(erro);
    expect(social).not.toBeNull();
    // O rastro nasce semeado com o modo lido do ambiente, então mesmo uma falha
    // antes do social diz em que modo o canal estava.
    expect(social?.mode).toBe("enforce");
  });

  it("o modo semeado acompanha o ambiente, e não um padrão fixo", async () => {
    vi.mocked(projetos.requireActiveProject)
      .mockRejectedValueOnce(new Error("quebrou"))
      .mockResolvedValue(PROJETO);

    const erro = await runNewsroom({ dryRun: false }, { SOCIAL_PIPELINE_V2: "dry_run" }).catch(
      (e: unknown) => e,
    );
    expect(diagnosticoSocialDoErro(erro)?.mode).toBe("dry_run");
  });
});

describe("o portão do QA continua sendo o portão do QA", () => {
  const fonte = fs.readFileSync(
    path.join(process.cwd(), "src/lib/server/newsroom/newsroom-service.ts"),
    "utf-8",
  );

  it("a condição de bloqueio não mudou", () => {
    expect(fonte).toContain('if (!pipelineResult.aprovado && modo === "enforce") {');
  });

  it("o bloqueio continua saindo por throw, agora nomeado", () => {
    const trecho = fonte.slice(fonte.indexOf('if (!pipelineResult.aprovado && modo === "enforce")'));
    expect(trecho.slice(0, 900)).toContain("throw comMotivo(");
    expect(trecho.slice(0, 900)).toContain("MOTIVO_QA_BLOQUEOU");
    // A mensagem é a mesma de antes, palavra por palavra.
    expect(trecho).toContain("`Edição bloqueada depois de ${pipelineResult.tentativasDeReparo} tentativa(s) de correção `");
  });

  it("o social continua ANTES do portão do QA", () => {
    // Se algum dia alguém mover o social para depois do gate, um dia bloqueado
    // levaria o feed junto. A ordem é regra de produto, não acidente.
    expect(fonte.indexOf("await rodarSocialDoDia(")).toBeLessThan(
      fonte.indexOf("if (!pipelineResult.aprovado && modo === \"enforce\")"),
    );
  });

  it("nenhuma cópia paralela do diagnóstico ficou para trás", () => {
    // Duas variáveis que podem discordar é o defeito seguinte.
    expect(fonte).not.toContain("let diagnosticoSocial");
  });
});
