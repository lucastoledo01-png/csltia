import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anexarDesfechoDoAlerta, registrarDiaSemEdicao } from "./newsroom-service";

/**
 * O dia em que a redação decide não publicar tem que deixar linha.
 *
 * Em 06, 07 e 08 de setembro de 2026 o cron disparou, recebeu 202, a redação
 * rodou inteira, a linha editorial aprovou menos que o mínimo e a edição não
 * saiu. Decisão correta. Só que ela era comunicada com `throw`, e um throw ali
 * acontece antes de qualquer escrita: `newsroom_runs` e `news_editions` nunca
 * eram alcançados.
 *
 * O efeito é que três dias de acerto ficaram indistinguíveis de um cron morto,
 * que é o incidente de agosto, e o alerta ainda classificava o acerto como
 * "Redação falhou", em nível crítico.
 */

const BASE = {
  projectId: "proj-1",
  startTime: Date.parse("2026-09-08T09:03:02Z"),
  idempotencyKey: "daily-edition-2026-09-08",
  motivo: "EDITORIAL_MINIMUM_NOT_MET: 1 pauta(s) aprovada(s), mínimo 2. 191 pautas recusadas pela linha editorial.",
  sourcesCount: 63,
  candidatesFound: 216,
  uniqueCount: 195,
  duplicatesCount: 21,
  storiesSelected: 1,
  dryRun: false,
};

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

describe("o dia sem edição fica gravado", () => {
  it("grava um run com status cancelled e sem edição", async () => {
    const { client, gravadas } = bancoFalso();
    await registrarDiaSemEdicao(BASE, client);

    expect(gravadas).toHaveLength(1);
    const linha = gravadas[0];

    // `cancelled` já está no CHECK da tabela desde a migration original, então
    // registrar o dia não pede alteração de schema.
    expect(linha.status).toBe("cancelled");
    expect(linha.edition_id).toBeNull();
    expect(linha.dry_run).toBe(false);
    /*
     * A chave leva sufixo porque `idempotency_key` é UNIQUE global. Com a
     * chave canônica, o dia sem edição ocuparia o lugar do dia, e uma
     * recuperação bem-sucedida mais tarde perderia o registro de sucesso: o
     * dia ficaria arquivado como cancelado tendo publicado.
     */
    expect(linha.idempotency_key).toBe("daily-edition-2026-09-08#sem-edicao");
    expect(linha.idempotency_key).not.toBe(BASE.idempotencyKey);
  });

  it("o motivo carrega o código e os números, não só um texto", async () => {
    const { client, gravadas } = bancoFalso();
    await registrarDiaSemEdicao(BASE, client);

    const motivo = String(gravadas[0].error_message);
    expect(motivo).toContain("EDITORIAL_MINIMUM_NOT_MET");
    expect(motivo).toContain("mínimo 2");
    // Quem lê a tabela seis meses depois precisa saber quanto havia na mesa.
    expect(gravadas[0].candidates_found).toBe(216);
    expect(gravadas[0].stories_selected).toBe(1);
    expect(gravadas[0].sources_count).toBe(63);
  });

  it("status cancelled não bloqueia o run do dia seguinte", () => {
    /*
     * A guarda de idempotência só cancela quando encontra um run
     * `success` com a mesma chave. Um dia gravado como `cancelled` não pode
     * impedir uma nova tentativa no mesmo dia, nem o run de amanhã.
     */
    const fonte = fs.readFileSync(
      path.join(path.resolve(__dirname, "../../../.."), "src/lib/server/newsroom/newsroom-service.ts"),
      "utf-8",
    );
    expect(fonte).toContain('existingRun.status === "success"');
  });

  it("dry-run não grava nada", async () => {
    const { client, gravadas } = bancoFalso();
    await registrarDiaSemEdicao({ ...BASE, dryRun: true }, client);
    expect(gravadas).toEqual([]);
  });

  it("falha ao gravar não vira uma segunda falha", async () => {
    const quebrado = {
      from() {
        return {
          insert() {
            throw new Error("constraint violada");
          },
        };
      },
    } as unknown as SupabaseClient;

    // Não conseguir anotar o dia não pode derrubar quem chamou.
    await expect(registrarDiaSemEdicao(BASE, quebrado)).resolves.toBeUndefined();
  });
});

describe("a decisão editorial não é mais exceção", () => {
  const RAIZ = path.resolve(__dirname, "../../../..");

  it("a mensagem do mínimo não sai mais por throw", () => {
    const fonte = fs.readFileSync(path.join(RAIZ, "src/lib/server/newsroom/newsroom-service.ts"), "utf-8");
    const i = fonte.indexOf("Edição não fecha hoje");
    expect(i).toBeGreaterThan(0);

    // Nas 400 posições anteriores não pode haver um `throw new Error(` que a
    // envolva. Antes havia, e era ele que apagava o rastro do dia.
    const antes = fonte.slice(Math.max(0, i - 400), i);
    expect(antes).not.toContain("throw new Error(");
  });

  it("o motivo tem código próprio, para o alerta e o watchdog distinguirem", () => {
    const servico = fs.readFileSync(path.join(RAIZ, "src/lib/server/newsroom/newsroom-service.ts"), "utf-8");
    const rota = fs.readFileSync(path.join(RAIZ, "src/app/api/cron/newsroom/route.ts"), "utf-8");

    expect(servico).toContain('reason: "editorial_minimum_not_met"');
    expect(rota).toContain('reason === "editorial_minimum_not_met"');
    // O watchdog precisa saber que a chamada chegou: nesse caso o ping é de
    // sucesso, e o aviso vai por alerta.
    // Só o bloco desse motivo, até o `return` dele: o bloco seguinte é o
    // caminho genérico e lá o ping de falha continua correto.
    const inicio = rota.indexOf('reason === "editorial_minimum_not_met"');
    const bloco = rota.slice(inicio, rota.indexOf("return;", inicio));
    expect(bloco).toContain("pingHealthcheck(healthcheck)");
    expect(bloco).not.toContain('pingHealthcheck(healthcheck, "fail")');
  });
});

describe("o desfecho do alerta sobrevive no banco", () => {
  /*
   * A investigação de 06, 07 e 08 travou num beco: os alertas não chegaram e a
   * evidência do motivo estava num `console.error` dentro do contêiner, que o
   * usuário `deploy` não consegue ler. Cinco hipóteses caíram por medição e a
   * sexta ficou sem prova porque a prova estava num log inalcançável.
   *
   * Log serve para quem tem acesso ao log.
   */
  function bancoComRun(errorMessageAtual: string | null) {
    const updates: Array<Record<string, unknown>> = [];
    const client = {
      from() {
        const c: Record<string, unknown> = {
          select: () => c,
          eq: () => c,
          maybeSingle: () => Promise.resolve({ data: { error_message: errorMessageAtual }, error: null }),
          update(linha: Record<string, unknown>) {
            updates.push(linha);
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        };
        return c;
      },
    } as unknown as SupabaseClient;
    return { client, updates };
  }

  it("alerta que falhou deixa motivo, status e descrição na linha do run", async () => {
    const { client, updates } = bancoComRun("EDITORIAL_MINIMUM_NOT_MET: 1 aprovada, mínimo 2.");
    await anexarDesfechoDoAlerta(
      "daily-edition-2026-09-08",
      { enviado: false, motivo: "telegram_recusou", status: 400, descricao: "Bad Request: chat not found" },
      client,
    );

    const msg = String(updates[0].error_message);
    expect(msg).toContain("EDITORIAL_MINIMUM_NOT_MET");
    expect(msg).toContain("alerta=FALHOU");
    expect(msg).toContain("motivo=telegram_recusou");
    expect(msg).toContain("status=400");
    expect(msg).toContain("chat not found");
  });

  it("alerta entregue também fica registrado", async () => {
    const { client, updates } = bancoComRun(null);
    await anexarDesfechoDoAlerta(
      "daily-edition-2026-09-08",
      { enviado: true, motivo: "enviado", status: 200, descricao: null },
      client,
    );
    expect(String(updates[0].error_message)).toContain("alerta=entregue");
  });

  it("falha ao anexar não derruba quem chamou", async () => {
    const quebrado = {
      from() {
        throw new Error("sem conexão");
      },
    } as unknown as SupabaseClient;

    await expect(
      anexarDesfechoDoAlerta("k", { enviado: true, motivo: "enviado", status: 200, descricao: null }, quebrado),
    ).resolves.toBeUndefined();
  });
});
