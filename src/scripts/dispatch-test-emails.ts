import fs from "node:fs";
import path from "node:path";
import { createListmonkClient } from "../lib/server/listmonk";
import { runNewsroom } from "../lib/server/newsroom/newsroom-service";

// Carregar .env.local se disponível
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const envConfig = fs.readFileSync(envLocalPath, "utf8");
  for (const line of envConfig.split("\n")) {
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

const TEST_EMAILS = [
  "lucastoledo97@hotmail.com",
  "lucastoledo01@gmail.com",
  "contato@lokta.com.br",
];

async function main() {
  console.log("=== DISPARANDO EDIÇÃO DE TESTE PARA OS E-MAILS DE TESTE ===");
  console.log("Destinatários:", TEST_EMAILS.join(", "));

  const listmonk = createListmonkClient();

  // 1. Cadastrar/atualizar e-mails de teste no Listmonk
  console.log("\n[1/3] Cadastrando/atualizando destinatários de teste no Listmonk...");
  for (const email of TEST_EMAILS) {
    try {
      const res = await listmonk.upsertSubscriber({ email, source: "test_dispatch" });
      console.log(`- ${email}: ${res.ok ? "Cadastrado/Sincronizado ✅" : `Skipped/Motivo (${res.reason})`}`);
    } catch (err) {
      console.warn(`- Falha ao cadastrar ${email}:`, err);
    }
  }

  // 2. Executar a redação e gerar edição real das últimas notícias
  console.log("\n[2/3] Executando redação autônoma das notícias do Brasil e do mundo...");
  const newsroomResult = await runNewsroom({
    dryRun: false,
    publishToPortal: true,
    createNewsletterCampaign: true,
    autoSend: true,
    idempotencyKey: `test-dispatch-${Date.now()}`,
  });

  if (!newsroomResult.ok || !newsroomResult.edition) {
    console.error("❌ Falha na execução da redação:", newsroomResult);
    process.exit(1);
  }

  console.log("\n=======================================================");
  console.log("             RELATÓRIO DO DISPARO DE TESTE             ");
  console.log("=======================================================");
  console.log(`- Headline: ${newsroomResult.edition.headline}`);
  console.log(`- Assunto do E-mail: "${newsroomResult.edition.subject}"`);
  console.log(`- Preheader: "${newsroomResult.edition.preheader}"`);
  console.log(`- Pautas Processadas: ${newsroomResult.selectedStoriesCount}`);
  console.log(`- Artigo Publicado no Portal: /artigos/${newsroomResult.articleSlug}`);
  console.log(`- ID da Campanha no Listmonk: #${newsroomResult.listmonkCampaignId || "N/A"}`);
  console.log(`- Status do Disparo: ${newsroomResult.campaignStatus || "enviado"}`);
  console.log(`- QA Score: ${newsroomResult.qaResult.score}/100`);
  console.log(`- Assinatura Final: ${newsroomResult.edition.final_line}`);
  console.log("=======================================================\n");

  console.log("✅ Disparo concluído com sucesso! Verifique a caixa de entrada dos 3 e-mails.");
}

main().catch((err) => {
  console.error("❌ Erro fatal durante o disparo:", err);
  process.exit(1);
});
