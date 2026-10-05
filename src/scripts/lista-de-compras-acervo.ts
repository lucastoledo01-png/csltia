import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID } from "../lib/server/projects";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { listaDeCompras } from "../lib/server/visual/acervo/lista-de-compras";

/**
 * A lista de produção do acervo: o que foi pedido e não havia, por frequência.
 *
 * Só lê. Decisão de 29/09/2026: depois de uma semana, isto é o que fotografar,
 * e não um chute.
 *
 *   npx tsx src/scripts/lista-de-compras-acervo.ts            (últimos 7 dias)
 *   npx tsx src/scripts/lista-de-compras-acervo.ts --dias=30
 */

function carregarEnv(): void {
  for (const arquivo of [".env.local", ".env"]) {
    const caminho = path.resolve(process.cwd(), arquivo);
    if (!fs.existsSync(caminho)) continue;
    for (const linha of fs.readFileSync(caminho, "utf-8").split("\n")) {
      const t = linha.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const [chave, ...resto] = t.split("=");
      const valor = resto.join("=").trim().replace(/^["']|["']$/g, "");
      if (chave && !process.env[chave.trim()]) process.env[chave.trim()] = valor;
    }
  }
}

async function main(): Promise<void> {
  carregarEnv();
  const dias = Number(process.argv.find((a) => a.startsWith("--dias="))?.slice(7) ?? 7);
  const itens = await listaDeCompras(getSupabaseAdminClient(), DEFAULT_PROJECT_ID, dias);

  console.log(`Lista de compras do acervo, últimos ${dias} dias: ${itens.length} item(ns)`);
  console.log("pautas  vazio  janela  tipo      pais  chave                                  exemplo");
  for (const i of itens) {
    console.log(
      `${String(i.pautas).padStart(6)}  ${String(i.vazio).padStart(5)}  ${String(i.janela).padStart(6)}  ` +
        `${i.tipo.padEnd(8)}  ${(i.pais || "-").padEnd(4)}  ${i.chave.padEnd(38)} ${i.exemplo.slice(0, 70)}`,
    );
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
