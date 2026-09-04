import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guarda contra a classe de bug que a migração multi-projeto deixou passar.
 *
 * Quando `unique (email)` virou `unique (project_id, email)` — e o mesmo para
 * `slug`, `url`, `edition_date` e `idempotency_key` — cinco chamadas de upsert
 * foram atualizadas e três não. O PostgREST responde `42P10` quando o alvo do
 * ON CONFLICT não casa com nenhuma constraint, então a rota devolve 500 e
 * **nada é gravado**.
 *
 * O que torna esse bug caro é o silêncio: o cadastro na newsletter falhava
 * desde 2026-08-27 e `newsletter_leads` ficou em zero linhas sem ninguém notar,
 * porque nenhum teste exercitava a gravação contra o banco real.
 *
 * Este teste lê o próprio código. É grosseiro de propósito: não depende de
 * banco, roda em milissegundos e falha no instante em que alguém escreve um
 * upsert com alvo antigo.
 */

const RAIZ = join(process.cwd(), "src");

/** Colunas cuja unicidade é composta com `project_id` desde a migração. */
const COLUNAS_ISOLADAS_POR_PROJETO = ["email", "slug", "url", "edition_date", "idempotency_key"];

function arquivosTypeScript(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosTypeScript(caminho);
    return /\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

function alvosDeConflito(): Array<{ arquivo: string; alvo: string }> {
  const encontrados: Array<{ arquivo: string; alvo: string }> = [];

  for (const arquivo of arquivosTypeScript(RAIZ)) {
    const conteudo = readFileSync(arquivo, "utf8");
    for (const achado of conteudo.matchAll(/onConflict:\s*"([^"]+)"/g)) {
      encontrados.push({ arquivo: arquivo.replace(process.cwd() + "/", ""), alvo: achado[1] });
    }
  }

  return encontrados;
}

describe("alvos de ON CONFLICT nos upserts", () => {
  it("encontra os upserts do código", () => {
    // Se isto zerar, o teste virou decorativo — provavelmente o padrão de
    // escrita mudou e a guarda precisa acompanhar.
    expect(alvosDeConflito().length).toBeGreaterThan(0);
  });

  it("nenhum aponta para coluna que hoje é única só junto com project_id", () => {
    const quebrados = alvosDeConflito().filter(({ alvo }) => {
      const colunas = alvo.split(",").map((c) => c.trim());
      if (colunas.includes("project_id")) return false;
      return colunas.some((c) => COLUNAS_ISOLADAS_POR_PROJETO.includes(c));
    });

    expect(
      quebrados,
      `Alvo de ON CONFLICT sem project_id. O PostgREST responde 42P10 e o upsert ` +
        `não grava nada:\n${quebrados.map((q) => `  ${q.arquivo} → "${q.alvo}"`).join("\n")}`,
    ).toEqual([]);
  });
});
