import fs from "fs";
import path from "path";
import { runNewsroom } from "../lib/server/newsroom/newsroom-service";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...valueParts] = trimmed.split("=");
        const val = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
        if (key && !process.env[key.trim()]) {
          process.env[key.trim()] = val;
        }
      }
    }
  }
}

async function main() {
  loadEnvLocal();

  console.log("=== DESBUGUEI.IA — DISPARO DA EDIÇÃO DE HOJE (LISTMONK + PORTAL) ===");
  console.log(`[ENV] Listmonk URL: ${process.env.LISTMONK_URL}`);
  console.log(`[ENV] Listmonk Token presente: ${Boolean(process.env.LISTMONK_API_TOKEN)}`);

  const customEnv = {
    ...process.env,
    DRY_RUN: "false",
    NEWSLETTER_AUTO_SEND: "true",
    INSTAGRAM_DRY_RUN: "false",
    INSTAGRAM_AUTO_POST: "false",
  };

  const todayStr = new Date().toISOString().split("T")[0];

  console.log("[START] Iniciando pipeline de coleta, geração de newsletter e disparo via Listmonk...");

  const result = await runNewsroom(
    {
      dryRun: false,
      publishToPortal: true,
      createNewsletterCampaign: true,
      autoSend: true,
      idempotencyKey: `daily-edition-${todayStr}-live-${Date.now()}`,
    },
    customEnv
  );

  console.log("\n=======================================================");
  console.log("             RESULTADO DO DISPARO DE HOJE              ");
  console.log("=======================================================");
  console.log(`- Sucesso: ${result.ok}`);
  console.log(`- Dry Run: ${result.dryRun}`);
  console.log(`- Publicado no Portal: ${result.publishedToPortal} (/artigos/${result.articleSlug})`);
  console.log(`- Campanha Listmonk ID: ${result.listmonkCampaignId || "N/A"} (Status: ${result.campaignStatus})`);
  console.log(`- Notícias Selecionadas: ${result.selectedStoriesCount} de ${result.candidatesFound} encontradas`);
  console.log(`- QA Score: ${result.qaResult?.score}/100`);
  console.log(`- Tokens Totais: ${result.tokens?.totalTokens}`);
  console.log(`- Custo Estimado USD: $${result.tokens?.estimatedCostUsd?.toFixed(4)} USD`);
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("❌ Erro ao executar edição de hoje:", err);
  process.exit(1);
});
