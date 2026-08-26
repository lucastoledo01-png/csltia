import fs from "fs";
import path from "path";
import { runInstagramCarouselService } from "../lib/server/social/instagram/instagram-service";

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

  console.log("=== DESBUGUEI.IA — DISPARO AO VIVO DE CARROSSEL ESCRITO ELEGANTE (ESTILO CLAUDE & GIO EXPLICA) ===");

  const customEnv = {
    ...process.env,
    INSTAGRAM_ACCOUNT_ID: "17841465061867883",
    INSTAGRAM_ACCESS_TOKEN:
      "EAAcHmrXDrZBABSXp7azR23gQJRfCOgUfRvrxx14TUfb4OD3uMyh831iZBfcLbzOEY8vRjqfZCDKG5meSUj68QqR4ZCFGeZCVkCZCNwIe4NZAol62A7PGOlAO4ySixdZAKYhfW7pJjxJuv1uNTiXNZAIH3CaFRJz8YsKkqopU7QdPllS6OZBbuBc1Rfyz0RjfdI4gZDZD",
    INSTAGRAM_DRY_RUN: "false",
    INSTAGRAM_AUTO_POST: "true",
  };

  const timestamp = Date.now();
  const idempotencyKey = `instagram-carousel-written-style-${timestamp}`;

  console.log(`[START] Gerando carrossel escrito de 5 slides com background estético e publicando no Instagram...`);

  const result = await runInstagramCarouselService(
    {
      dryRun: false,
      autoPost: true,
      idempotencyKey,
    },
    customEnv
  );

  console.log("\n=======================================================");
  console.log("      RESULTADO DA PUBLICAÇÃO DO CARROSSEL ESCRITO     ");
  console.log("=======================================================");
  console.log(`- Sucesso: ${result.ok}`);
  console.log(`- Status: ${result.status}`);
  console.log(`- Media ID da Meta: ${result.providerPostId || "N/A"}`);
  console.log(`- Título do Post: ${result.carousel?.title}`);
  console.log(`- Slides Renderizados: ${result.carousel?.slides.length}`);
  console.log(`- Custo Estimado USD: $${result.tokens?.estimatedCostUsd?.toFixed(4)} USD`);
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("❌ Erro ao publicar carrossel escrito:", err);
  process.exit(1);
});
