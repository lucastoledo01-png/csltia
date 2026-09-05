import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, getProjectNewsSources, requireActiveProject } from "../lib/server/projects";
import { collectAllNews } from "../lib/server/newsroom/collector";
import { deduplicateCandidates } from "../lib/server/newsroom/deduplicator";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { carregarConfigEditorial } from "../lib/server/editorial/config";
import { criarProvedorOpenAI } from "../lib/server/editorial/embeddings";
import { criarHistoricoStore } from "../lib/server/editorial/history";
import { avaliarPautas } from "../lib/server/editorial/guarda";
import type { Canal } from "../lib/server/editorial/history";

/**
 * Roda a coleta de hoje pela guarda editorial e mostra o que sairia.
 *
 * Não escreve nada: nem edição, nem histórico, nem post. É o passo de
 * validação antes de a guarda entrar no pipeline automático, e continua útil
 * depois disso para conferir um dia específico sem publicar.
 *
 *   npx tsx src/scripts/dry-run-editorial.ts
 *   npx tsx src/scripts/dry-run-editorial.ts --canal=instagram --sem-vetor
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
  const valor = (nome: string) => {
    const achado = argv.find((a) => a.startsWith(`--${nome}=`));
    return achado ? achado.split("=").slice(1).join("=") : null;
  };
  const canal = ((valor("canal") as Canal) || "newsletter") as Canal;
  const comVetor = !argv.includes("--sem-vetor");

  const config = carregarConfigEditorial();
  const project = await requireActiveProject(valor("projeto") ?? DEFAULT_PROJECT_ID);
  const store = criarHistoricoStore(getSupabaseAdminClient());

  console.log("=== DRY RUN DA GUARDA EDITORIAL ===");
  console.log(`projeto: ${project.slug} | canal: ${canal}`);
  console.log(
    `limiares: semântico ${config.limiarSemantico}, título ${config.limiarDeTitulo}, ` +
      `relevância mínima ${config.relevanciaMinima}, pautas ${config.minimoDePautas} a ${config.maximoDePautas}`
  );

  const historico = await store.janela(project.id, config.janelaDeDias);
  const doCanal = historico.filter((h) => h.canal === canal);
  const comVetorNoHistorico = doCanal.filter((h) => Array.isArray(h.vetor) && h.vetor.length > 0);
  console.log(
    `histórico: ${historico.length} registros na janela de ${config.janelaDeDias} dias, ` +
      `${doCanal.length} neste canal, ${comVetorNoHistorico.length} com vetor`
  );

  const sources = await getProjectNewsSources(project.id);
  const coleta = await collectAllNews(sources);
  console.log(
    `coleta: ${coleta.candidates.length} candidatas de ${coleta.sourcesAttempted} fontes, janela de ${coleta.windowHours}h`
  );

  const { uniqueGroups, duplicatesCount } = deduplicateCandidates(coleta.candidates);
  console.log(`dedup do dia: ${uniqueGroups.length} grupos, ${duplicatesCount} duplicatas na própria coleta\n`);

  const resultado = await avaliarPautas(uniqueGroups, {
    canal,
    historico,
    config,
    provedorDeVetor: comVetor ? criarProvedorOpenAI() : null,
  });

  for (const linha of resultado.linhasDeLog) console.log(linha);

  const porMotivo = resultado.recusadas.reduce<Record<string, number>>((acc, r) => {
    acc[r.motivo] = (acc[r.motivo] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`\n--- recusadas por motivo (${resultado.recusadas.length}) ---`);
  for (const [motivo, n] of Object.entries(porMotivo).sort((a, b) => b[1] - a[1])) {
    console.log(`${motivo}: ${n}`);
  }

  console.log(`\n--- o que sairia (${resultado.selecionadas.length}) ---`);
  resultado.selecionadas.forEach((s, i) => {
    const c = s.classificacao;
    console.log(
      `${i + 1}. [${s.pontuacao.total}] ${s.grupo.primary.title}\n` +
        `   ${c.pais} | ${c.eixo} | leitura ${c.leitura} | relevância ${c.relevancia} | ${s.grupo.primary.source_name}\n` +
        `   ${s.pontuacao.explicacao} | repetição: ${s.veredito.explicacao}`
    );
  });

  console.log(
    `\nedição viável: ${resultado.viavel ? "sim" : `não (${resultado.motivoDaInviabilidade})`}`
  );
  console.log(`custo da classificação: US$ ${resultado.custoUsd.toFixed(4)}`);
  console.log("\nNada foi gravado nem publicado.");
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
