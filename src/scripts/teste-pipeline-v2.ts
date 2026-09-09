import fs from "node:fs";
import path from "node:path";
import { runNewsroom } from "../lib/server/newsroom/newsroom-service";
import { escreverRelatorio } from "./relatorio";

/**
 * O pipeline real do newsroom, do começo ao fim, sem publicar.
 *
 * Não é o preview: é `runNewsroom`, a mesma função que o cron chama. Passa por
 * coleta, guarda editorial, redação, ancoragem, QA, resolução de imagem e
 * renderização. Escreve nada porque `dryRun` continua soberano.
 *
 *   npx tsx src/scripts/teste-pipeline-v2.ts --saida=resultado.json
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
  const argv = process.argv.slice(2);
  const valor = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=") ?? null;

  // Os dois modos são declarados aqui para o teste ser o teste, e não o
  // ambiente da máquina.
  process.env.EDITORIAL_GUARD = valor("guard") ?? "enforce";
  process.env.VISUAL_RESOLVER_V2 = valor("visual") ?? "enforce";

  console.log(`EDITORIAL_GUARD=${process.env.EDITORIAL_GUARD} VISUAL_RESOLVER_V2=${process.env.VISUAL_RESOLVER_V2}`);
  console.log("chamando runNewsroom com dryRun, sem portal, sem campanha, sem envio\n");

  const resultado = await runNewsroom({
    dryRun: true,
    publishToPortal: false,
    createNewsletterCampaign: false,
    autoSend: false,
  });

  const saida = valor("saida");
  if (saida) {
    escreverRelatorio(saida, JSON.stringify(resultado, null, 2));
    console.log(`\n[resultado em ${saida}]`);
  }

  const r = resultado as Record<string, unknown>;
  console.log("\n--- resumo ---");
  for (const k of ["ok", "editorialGuardMode", "visualResolverMode", "selectedStoriesCount", "editionId", "articleSlug", "listmonkCampaignId"]) {
    console.log(`${k}: ${JSON.stringify(r[k])}`);
  }
  console.log(`visualResolution: ${JSON.stringify(r.visualResolution)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
