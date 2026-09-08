import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, getProjectNewsSources } from "../lib/server/projects";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { FEEDS_DIRETOS, motivoDaDesativacao } from "../lib/server/newsroom/composicao-alternativa";

/**
 * Aplica a composição de fontes aprovada, em produção.
 *
 * Só roda com `--aplicar`. Sem a flag, imprime exatamente o que faria e sai:
 * a decisão de trocar 39 fontes de uma publicação que está no ar não pode
 * depender de eu ter digitado o comando certo.
 *
 * Nada é apagado. As desativadas viram `enabled = false`, e o histórico das
 * candidatas que elas trouxeram continua em `news_candidates` e
 * `editorial_history`: reverter é ligar de volta.
 *
 *   npx tsx src/scripts/aplicar-composicao.ts            (só mostra)
 *   npx tsx src/scripts/aplicar-composicao.ts --aplicar   (grava)
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
  const aplicar = process.argv.includes("--aplicar");
  const client = getSupabaseAdminClient();

  const ativas = (await getProjectNewsSources(DEFAULT_PROJECT_ID)).filter((f) => f.enabled);
  const desativar = ativas
    .map((f) => ({ fonte: f, motivo: motivoDaDesativacao(f) }))
    .filter((x): x is { fonte: typeof x.fonte; motivo: string } => Boolean(x.motivo));

  const jaExistem = new Set(ativas.map((f) => f.url));
  const acrescentar = FEEDS_DIRETOS.filter((f) => !jaExistem.has(f.url));

  console.log(`${ativas.length} fontes ativas hoje.`);
  console.log(`${desativar.length} a desativar, ${acrescentar.length} a acrescentar.`);
  console.log(`Resultado: ${ativas.length - desativar.length + acrescentar.length} ativas.\n`);

  if (!aplicar) {
    console.log("MODO SECO. Nada foi gravado. Rode com --aplicar para valer.\n");
    for (const d of desativar) console.log(`  desativar  ${d.fonte.id.padEnd(34)} ${d.motivo.slice(0, 90)}`);
    for (const a of acrescentar) console.log(`  acrescentar ${a.id.padEnd(33)} ${a.url}`);
    return;
  }

  let desativadas = 0;
  for (const d of desativar) {
    const { error } = await client
      .from("project_news_sources")
      .update({ enabled: false })
      .eq("project_id", DEFAULT_PROJECT_ID)
      .eq("source_key", d.fonte.id);
    if (error) {
      console.error(`  FALHOU ao desativar ${d.fonte.id}: ${error.message}`);
    } else {
      desativadas += 1;
      console.log(`  desativada ${d.fonte.id}`);
    }
  }

  let acrescentadas = 0;
  for (const a of acrescentar) {
    const { error } = await client.from("project_news_sources").upsert(
      {
        project_id: DEFAULT_PROJECT_ID,
        source_key: a.id,
        name: a.name,
        type: a.type,
        url: a.url,
        enabled: true,
        priority: a.priority,
        category: a.category,
        region: a.region ?? "global",
        keywords: a.keywords ?? [],
      },
      { onConflict: "project_id,source_key" },
    );
    if (error) {
      console.error(`  FALHOU ao acrescentar ${a.id}: ${error.message}`);
    } else {
      acrescentadas += 1;
      console.log(`  acrescentada ${a.id}`);
    }
  }

  const depois = (await getProjectNewsSources(DEFAULT_PROJECT_ID)).filter((f) => f.enabled);
  console.log(`\n${desativadas} desativadas, ${acrescentadas} acrescentadas. ${depois.length} ativas agora.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
