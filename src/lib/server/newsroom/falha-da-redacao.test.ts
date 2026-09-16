import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Falha técnica da redação tem que deixar linha.
 *
 * Em 10/09/2026 o cron disparou às 09:03:01 UTC e o endpoint respondeu
 * `{"ok":true,"accepted":true}`. A redação rodou: 109 candidatas classificadas
 * e persistidas, 5 aprovadas pela linha editorial, portanto acima do mínimo de
 * 2. Depois disso, nada. Nenhuma linha em `newsroom_runs`, nenhuma em
 * `news_editions`, nenhum artigo, nenhum post.
 *
 * A linha do run é gravada uma vez só, no fim do caminho de sucesso. Qualquer
 * exceção entre a aprovação editorial e a escrita da edição apaga a própria
 * evidência, e o dia fica indistinguível de cron morto, que é o incidente de
 * agosto.
 *
 * É a mesma lição de 06, 07 e 08, que valeu só para o mínimo de pautas: portão
 * que decide não publicar precisa gravar antes de sinalizar. O bloqueio do QA
 * em `enforce` continua saindo por `throw`, e erro técnico no mesmo trecho some
 * do mesmo jeito.
 */

const PROJETO = {
  id: "proj-1",
  slug: "desbuguei",
  timezone: "America/Sao_Paulo",
} as unknown as Awaited<ReturnType<typeof import("../projects").requireActiveProject>>;

vi.mock("../projects", async (importOriginal) => {
  // Mock parcial derruba o que não for redeclarado, e já custou um dia de
  // diagnóstico neste repositório. Tudo o que não é sobrescrito vem do módulo.
  const real = await importOriginal<typeof import("../projects")>();
  return {
    ...real,
    requireActiveProject: vi.fn(async () => PROJETO),
    projectToday: vi.fn(() => "2026-09-10"),
  };
});

/**
 * O cliente que o caminho real usa quando ninguém injeta nada.
 *
 * Existe para a prova que importa aqui: não que a função grava, e sim que ela
 * está LIGADA ao `runNewsroom` que o cron chama. Função de guarda escrita e não
 * chamada é o padrão que este repositório já pagou caro duas vezes.
 */
let gravadasPeloCaminhoReal: Array<Record<string, unknown>> = [];

vi.mock("../supabase-admin", async (importOriginal) => {
  const real = await importOriginal<typeof import("../supabase-admin")>();
  return {
    ...real,
    getSupabaseAdminClient: () => ({
      from() {
        return {
          insert(linha: Record<string, unknown>) {
            gravadasPeloCaminhoReal.push(linha);
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    }),
  };
});

const projetos = await import("../projects");
const { comDetalheDoBloqueio, registrarFalhaDaRedacao, runNewsroom } = await import(
  "./newsroom-service"
);

function bancoFalso() {
  const gravadas: Array<Record<string, unknown>> = [];
  const client = {
    from() {
      return {
        insert(linha: Record<string, unknown>) {
          gravadas.push(linha);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, gravadas };
}

const CONTEXTO = {
  startTime: Date.parse("2026-09-10T09:03:01Z"),
  options: { dryRun: false },
  env: {} as Record<string, string | undefined>,
};

describe("a falha da redação fica gravada", () => {
  beforeEach(() => {
    // Implementação redeclarada aqui, e não só limpa: o describe seguinte usa
    // `mockReset`, e teste que depende da ordem dos describes é teste frágil.
    vi.mocked(projetos.requireActiveProject).mockReset().mockResolvedValue(PROJETO);
    vi.mocked(projetos.projectToday).mockReset().mockReturnValue("2026-09-10");
  });

  it("grava um run com status failed, sem edição, com o motivo legível", async () => {
    const { client, gravadas } = bancoFalso();

    await registrarFalhaDaRedacao(
      new Error("Edição bloqueada depois de 2 tentativa(s) de correção (QA 61): números sem lastro"),
      CONTEXTO,
      client,
    );

    expect(gravadas).toHaveLength(1);
    const linha = gravadas[0];

    // `failed` já está no CHECK da tabela desde a migration original, então
    // registrar a falha não pede alteração de schema.
    expect(linha.status).toBe("failed");
    expect(linha.edition_id).toBeNull();
    expect(linha.dry_run).toBe(false);
    expect(linha.project_id).toBe("proj-1");
    expect(String(linha.error_message)).toContain("RUN_FAILED");
    expect(String(linha.error_message)).toContain("Edição bloqueada");
    expect(linha.started_at).toBe("2026-09-10T09:03:01.000Z");
  });

  it("a chave não disputa a chave canônica do dia", async () => {
    const { client, gravadas } = bancoFalso();
    await registrarFalhaDaRedacao(new Error("qualquer"), CONTEXTO, client);

    const chave = String(gravadas[0].idempotency_key);
    expect(chave).not.toBe("daily-edition-2026-09-10");
    expect(chave.startsWith("daily-edition-2026-09-10#falha-")).toBe(true);
  });

  it("duas falhas no mesmo dia geram chaves distintas", async () => {
    const { client, gravadas } = bancoFalso();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T09:05:11Z"));
    await registrarFalhaDaRedacao(new Error("primeira"), CONTEXTO, client);
    vi.setSystemTime(new Date("2026-09-10T09:41:02Z"));
    await registrarFalhaDaRedacao(new Error("segunda"), CONTEXTO, client);
    vi.useRealTimers();

    expect(gravadas).toHaveLength(2);
    expect(gravadas[0].idempotency_key).not.toBe(gravadas[1].idempotency_key);
  });

  it("dry run não grava nada", async () => {
    const { client, gravadas } = bancoFalso();
    await registrarFalhaDaRedacao(
      new Error("falha em ensaio"),
      { ...CONTEXTO, options: { dryRun: true } },
      client,
    );
    expect(gravadas).toHaveLength(0);
  });

  it("não conseguir gravar não vira uma segunda falha que esconde a primeira", async () => {
    const client = {
      from() {
        return {
          insert() {
            throw new Error("banco fora do ar");
          },
        };
      },
    } as unknown as SupabaseClient;

    await expect(
      registrarFalhaDaRedacao(new Error("a falha original"), CONTEXTO, client),
    ).resolves.toBeUndefined();
  });

  it("erro que não é Error também vira motivo legível", async () => {
    const { client, gravadas } = bancoFalso();
    await registrarFalhaDaRedacao("string solta", CONTEXTO, client);
    expect(String(gravadas[0].error_message)).toBe("RUN_FAILED: string solta");
  });
});

describe("o gravador está ligado ao caminho que o cron chama", () => {
  beforeEach(() => {
    gravadasPeloCaminhoReal = [];
    vi.mocked(projetos.requireActiveProject).mockReset();
    vi.mocked(projetos.projectToday).mockReturnValue("2026-09-10");
  });

  it("erro dentro da redação grava um run failed E é repassado", async () => {
    // Primeira chamada é a da redação, que quebra. Segunda é a do gravador da
    // falha, que precisa resolver o projeto para montar a chave do dia.
    vi.mocked(projetos.requireActiveProject)
      .mockRejectedValueOnce(new Error("coleta quebrou no meio do dia"))
      .mockResolvedValue(PROJETO);

    await expect(runNewsroom({ dryRun: false })).rejects.toThrow("coleta quebrou no meio do dia");

    expect(gravadasPeloCaminhoReal).toHaveLength(1);
    const linha = gravadasPeloCaminhoReal[0];
    expect(linha.status).toBe("failed");
    expect(String(linha.error_message)).toContain("coleta quebrou no meio do dia");
    expect(String(linha.idempotency_key)).toContain("#falha-");
  });

  it("em dry run o erro é repassado e nada é gravado", async () => {
    vi.mocked(projetos.requireActiveProject).mockRejectedValue(new Error("quebrou em ensaio"));

    await expect(runNewsroom({ dryRun: true })).rejects.toThrow("quebrou em ensaio");
    expect(gravadasPeloCaminhoReal).toHaveLength(0);
  });
});


/**
 * Bloqueio editorial tem que dizer QUAL frase, não só quantas.
 *
 * Em 14/09/2026 a edição foi barrada com "UNGROUNDED_EDITORIAL_CLAIM em 2
 * conclusão(ões)". O trecho reprovado existia, montado e anexado ao erro, e foi
 * inteiro para `console.error` dentro de um contêiner sem docker disponível.
 * Restou no banco a contagem, que é justamente o que não permite decidir entre
 * as duas hipóteses opostas: o texto inventou, ou a guarda está apertada.
 *
 * Três dias discutindo o mesmo portão sem nunca ver a frase é o custo de
 * gravar só o resumo.
 */
describe("a falha gravada carrega o que o QA barrou", () => {
  beforeEach(() => {
    vi.mocked(projetos.requireActiveProject).mockReset().mockResolvedValue(PROJETO);
    vi.mocked(projetos.projectToday).mockReset().mockReturnValue("2026-09-10");
  });

  const DETALHE = {
    score: 86,
    riscoDeAlucinacao: true,
    tentativasDeReparo: 2,
    issues: ["tom fora da linha editorial"],
    semLastro: [
      {
        materia: "Nova taxa para o H-1B",
        itens: [{ tipo: "numero", valor: "US$ 100 mil", onde: "practical_impact" }],
      },
    ],
    conclusoes: [
      {
        tipo: "UNGROUNDED_EDITORIAL_CLAIM",
        trecho: "Quem já tem processo aberto deve correr para protocolar antes da virada do mês",
        motivo: "recomendação de ação não sustentada pelo pacote factual",
      },
    ],
    apontamentos: ["data aproximada"],
  };

  it("grava o trecho reprovado, e não só a contagem", async () => {
    const { client, gravadas } = bancoFalso();

    await registrarFalhaDaRedacao(
      comDetalheDoBloqueio(
        new Error("Edição bloqueada depois de 2 tentativa(s) de correção (QA 86): hallucination_risk"),
        DETALHE,
      ),
      CONTEXTO,
      client,
    );

    const mensagem = String(gravadas[0].error_message);
    expect(mensagem).toContain("Quem já tem processo aberto deve correr");
    expect(mensagem).toContain("UNGROUNDED_EDITORIAL_CLAIM");
    expect(mensagem).toContain("recomendação de ação não sustentada");
    expect(mensagem).toContain("US$ 100 mil");
  });

  it("o trecho sobrevive ao corte da coluna", async () => {
    const { client, gravadas } = bancoFalso();

    const erro = new Error("Edição bloqueada depois de 2 tentativa(s) de correção (QA 86)");
    // Stack longo é o concorrente real pelo espaço: ele vem do runtime e não
    // cabe negociar o tamanho.
    erro.stack = `Error: bloqueada\n${"    at umaFuncaoComNomeLongo (/app/.next/server/chunks/algum-chunk.js:1:1)\n".repeat(60)}`;

    await registrarFalhaDaRedacao(comDetalheDoBloqueio(erro, DETALHE), CONTEXTO, client);

    const mensagem = String(gravadas[0].error_message);
    expect(mensagem.length).toBeLessThanOrEqual(2000);
    expect(mensagem).toContain("Quem já tem processo aberto deve correr");
  });

  it("falha sem detalhe continua gravando a linha do stack", async () => {
    const { client, gravadas } = bancoFalso();

    await registrarFalhaDaRedacao(new Error("Gateway Timeout"), CONTEXTO, client);

    const mensagem = String(gravadas[0].error_message);
    expect(mensagem).toContain("RUN_FAILED: Gateway Timeout");
    expect(mensagem).toContain(" | at ");
  });
});

/**
 * A linha de falha precisa dizer onde o funil parou.
 *
 * Em 16/09/2026 três execuções falharam no portão editorial, e as três
 * gravaram `candidates_found: 0`, `sources_count: 0`, `stories_selected: 0`.
 * Os contadores só eram escritos no caminho de sucesso, então a linha que
 * explica o dia bloqueado era exatamente a que não tinha números.
 *
 * A diferença entre "coleta vazia" e "pool cheio e barrado no fim" muda a ação:
 * a primeira é problema de fonte, a segunda é problema de redação. Sem os
 * números, as duas se parecem.
 */
describe("a falha gravada diz onde o funil parou", () => {
  beforeEach(() => {
    vi.mocked(projetos.requireActiveProject).mockReset().mockResolvedValue(PROJETO);
    vi.mocked(projetos.projectToday).mockReset().mockReturnValue("2026-09-10");
  });

  it("grava fontes, coletadas, duplicatas e aprovadas", async () => {
    const { client, gravadas } = bancoFalso();

    await registrarFalhaDaRedacao(
      new Error("Edição bloqueada"),
      {
        ...CONTEXTO,
        funil: {
          sourcesCount: 29,
          candidatesFound: 120,
          uniqueCount: 96,
          duplicatesCount: 24,
          approvedCount: 5,
        },
      },
      client,
    );

    const linha = gravadas[0];
    expect(linha.sources_count).toBe(29);
    expect(linha.candidates_found).toBe(120);
    expect(linha.duplicates_count).toBe(24);
    expect(linha.candidates_filtered).toBe(24);
    expect(linha.stories_selected).toBe(5);
  });

  it("sem os números, grava zeros e não quebra", async () => {
    // Falha antes da coleta existe: leitura de projeto, de fontes, de
    // histórico. Nesses casos zero é a resposta correta, e não ausência de
    // informação.
    const { client, gravadas } = bancoFalso();
    await registrarFalhaDaRedacao(new Error("Gateway Timeout"), CONTEXTO, client);

    expect(gravadas[0].candidates_found).toBe(0);
    expect(gravadas[0].status).toBe("failed");
  });
});
