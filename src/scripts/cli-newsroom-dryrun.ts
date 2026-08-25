import fs from "node:fs";
import path from "node:path";
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

async function main() {
  console.log("=== INICIANDO EXECUÇÃO DRY RUN DA REDAÇÃO desbuguei.ia ===");
  try {
    const result = await runNewsroom({ dryRun: true });

    if (!result.ok || !result.edition || !result.tokens || !result.qaResult) {
      console.error("❌ ERRO NA EXECUÇÃO DO DRY RUN: Resultado retornado sem edição completa.");
      return;
    }

    console.log("\n=======================================================");
    console.log("             RELATÓRIO FINAL DO DRY RUN               ");
    console.log("=======================================================");
    console.log(`- Fontes Consultadas: ${result.sourcesAttempted}`);
    console.log(`- Notícias Encontradas: ${result.candidatesFound}`);
    console.log(`- Duplicatas Filtradas: ${result.duplicatesCount}`);
    console.log(`- Janela Temporal Utilizada: ${result.windowHours} horas`);
    console.log(`- Pautas Elegíveis Classificadas: ${result.rankedCandidatesCount}`);
    console.log(`- Pautas Selecionadas para a Edição: ${result.selectedStoriesCount}`);
    console.log(`- Tempo Total de Execução: ${result.executionTimeMs} ms`);
    console.log("\n--- CONSUMO DE TOKENS & CUSTO ESTIMADO ---");
    console.log(`- Prompt Tokens: ${result.tokens.promptTokens}`);
    console.log(`- Completion Tokens: ${result.tokens.completionTokens}`);
    console.log(`- Total Tokens: ${result.tokens.totalTokens}`);
    console.log(`- Custo Estimado: $${result.tokens.estimatedCostUsd.toFixed(5)} USD`);

    console.log("\n--- ASSUNTOS & PREHEADER SUGERIDOS ---");
    console.log(`- Assunto Principal: "${result.edition.subject}"`);
    console.log("- Outras Opções de Assunto:");
    result.edition.subject_options.forEach((opt: string, i: number) => {
      console.log(`  ${i + 1}. ${opt}`);
    });
    console.log(`- Preheader: "${result.edition.preheader}"`);

    console.log("\n--- RESULTADO DA AUDITORIA QA EDITORIAL ---");
    console.log(`- QA Passed: ${result.qaResult.passed ? "Sim ✅" : "Não ❌"}`);
    console.log(`- QA Score: ${result.qaResult.score}/100`);
    console.log(`- Risco de Alucinação: ${result.qaResult.hallucination_risk ? "DETECTADO ⚠️" : "Zero / Limpo ✅"}`);
    console.log(`- Check de Tom & Estilo: ${result.qaResult.tone_check_passed ? "Aprovado ✅" : "Ajustar"}`);

    console.log("\n--- CONTEÚDO EDITORIAL DA EDIÇÃO GERADA ---");
    console.log(`HEADLINE: ${result.edition.headline}`);
    console.log(`INTRODUÇÃO:\n${result.edition.intro}\n`);

    result.edition.stories.forEach((story: any, index: number) => {
      console.log(`[PAUTA ${index + 1}] (${story.category.toUpperCase()}) ${story.title}`);
      console.log(`Resumo: ${story.summary}`);
      console.log(`Por que importa: ${story.why_it_matters}`);
      console.log(`Impacto Prático: ${story.practical_impact}`);
      if (story.humor_line) console.log(`Observação/Humor: "${story.humor_line}"`);
      console.log(`Fonte: ${story.source_name} (${story.source_url})\n`);
    });

    if (result.edition.quick_bits && result.edition.quick_bits.length > 0) {
      console.log("🐛 EM MODO DEBUG (Notas Rápidas):");
      result.edition.quick_bits.forEach((bit: any) => {
        console.log(`- ${bit.title}: ${bit.text}`);
      });
      console.log("");
    }

    console.log(`ENCERRAMENTO: ${result.edition.closing}`);
    console.log(`ASSINATURA OBRIGATÓRIA: ${result.edition.final_line}`);
    console.log("=======================================================\n");
  } catch (err: any) {
    console.error("❌ ERRO NA EXECUÇÃO DO DRY RUN:", err?.message || err);
    process.exit(1);
  }
}

main();
