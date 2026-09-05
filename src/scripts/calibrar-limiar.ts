import fs from "node:fs";
import path from "node:path";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { criarHistoricoStore, vetoresDoHistorico } from "../lib/server/editorial/history";
import { cosseno } from "../lib/server/editorial/embeddings";
import { DEFAULT_PROJECT_ID } from "../lib/server/projects";

/**
 * Distribuição de semelhança entre pautas já publicadas.
 *
 * Serve para escolher o limiar com dado. O primeiro dry-run mostrou uma pauta
 * repetida real a 0.729, abaixo do limiar inicial de 0.82: a régua nasceu
 * alta. Este script mostra até onde chegam os pares que NÃO são repetição,
 * que é o outro lado da conta.
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

async function main() {
  carregarEnv();
  const store = criarHistoricoStore(getSupabaseAdminClient());
  const historico = await store.janela(DEFAULT_PROJECT_ID, 60);
  const comVetor = vetoresDoHistorico(historico);

  const pares: Array<{ a: string; b: string; score: number; mesmoCanal: boolean }> = [];
  for (let i = 0; i < comVetor.length; i += 1) {
    for (let j = i + 1; j < comVetor.length; j += 1) {
      const A = comVetor[i].registro;
      const B = comVetor[j].registro;
      pares.push({
        a: A.titulo,
        b: B.titulo,
        score: cosseno(comVetor[i].vetor, comVetor[j].vetor),
        mesmoCanal: A.canal === B.canal,
      });
    }
  }

  pares.sort((x, y) => y.score - x.score);

  console.log(`${comVetor.length} registros com vetor, ${pares.length} pares`);
  console.log("\n--- 12 pares mais parecidos ---");
  for (const p of pares.slice(0, 12)) {
    console.log(`${p.score.toFixed(3)} ${p.mesmoCanal ? "[mesmo canal]" : "[canais diferentes]"}`);
    console.log(`   A: ${p.a.slice(0, 78)}`);
    console.log(`   B: ${p.b.slice(0, 78)}`);
  }

  const faixas = [0.9, 0.85, 0.82, 0.8, 0.75, 0.7, 0.65, 0.6];
  console.log("\n--- quantos pares acima de cada limiar ---");
  for (const f of faixas) {
    console.log(`>= ${f}: ${pares.filter((p) => p.score >= f).length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
