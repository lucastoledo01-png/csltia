import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, getProjectNewsSources, requireActiveProject } from "../lib/server/projects";
import { collectAllNews } from "../lib/server/newsroom/collector";
import { deduplicateCandidates } from "../lib/server/newsroom/deduplicator";
import { runNewsroomPipeline } from "../lib/server/newsroom/pipeline";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { carregarConfigEditorial } from "../lib/server/editorial/config";
import { criarProvedorOpenAI } from "../lib/server/editorial/embeddings";
import { criarHistoricoStore } from "../lib/server/editorial/history";
import { avaliarPautas } from "../lib/server/editorial/guarda";
import { dominioDe } from "../lib/server/editorial/url-canonica";
import { linkDaNewsletter } from "../lib/visamatch";
import type { RankedCandidate } from "../lib/server/newsroom/ranker";

/**
 * Relatório de validação da fase 1.
 *
 * Roda a coleta real do dia pela guarda editorial, escreve o que ela decidiu e
 * por quê, e opcionalmente redige a edição que sairia. Não publica, não envia,
 * não grava histórico e não toca em nenhuma tabela.
 *
 *   npx tsx src/scripts/relatorio-fase1.ts --saida=relatorio.md
 *   npx tsx src/scripts/relatorio-fase1.ts --saida=relatorio.md --com-edicao
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

type Linha = string;

async function main() {
  carregarEnv();
  const argv = process.argv.slice(2);
  const valor = (nome: string) => {
    const achado = argv.find((a) => a.startsWith(`--${nome}=`));
    return achado ? achado.split("=").slice(1).join("=") : null;
  };
  const comEdicao = argv.includes("--com-edicao");
  const saida = valor("saida");

  const config = carregarConfigEditorial();
  const project = await requireActiveProject(valor("projeto") ?? DEFAULT_PROJECT_ID);
  const store = criarHistoricoStore(getSupabaseAdminClient());
  const out: Linha[] = [];
  const escrever = (l: string = "") => {
    out.push(l);
    console.log(l);
  };

  escrever(`# Validação da fase 1, ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
  escrever();
  escrever(`Projeto ${project.slug}. Nada foi publicado, enviado ou gravado.`);
  escrever();

  // ---------------------------------------------------------------- histórico
  const historicoLongo = await store.janela(project.id, 400);
  const datas = historicoLongo
    .map((h) => (h.publicadoEm ? new Date(h.publicadoEm).getTime() : 0))
    .filter((t) => t > 0)
    .sort((a, b) => a - b);

  const maisAntigo = datas[0] ? new Date(datas[0]) : null;
  const maisRecente = datas[datas.length - 1] ? new Date(datas[datas.length - 1]) : null;
  const diasDeCobertura =
    maisAntigo && maisRecente
      ? Math.round((maisRecente.getTime() - maisAntigo.getTime()) / (24 * 60 * 60 * 1000)) + 1
      : 0;

  const semUrl = historicoLongo.filter((h) => !h.urlCanonica).length;
  const semVetor = historicoLongo.filter((h) => !Array.isArray(h.vetor) || h.vetor.length === 0).length;
  const semEntidades = historicoLongo.filter((h) => {
    const e = h.entidades as { atores?: unknown[] } | undefined;
    return !e || !Array.isArray(e.atores) || e.atores.length === 0;
  }).length;
  const porCanal = historicoLongo.reduce<Record<string, number>>((acc, h) => {
    acc[h.canal] = (acc[h.canal] ?? 0) + 1;
    return acc;
  }, {});

  escrever("## Cobertura do histórico");
  escrever();
  escrever(`- registros: ${historicoLongo.length}`);
  escrever(`- mais antigo: ${maisAntigo ? maisAntigo.toISOString().slice(0, 10) : "nenhum"}`);
  escrever(`- mais recente: ${maisRecente ? maisRecente.toISOString().slice(0, 10) : "nenhum"}`);
  escrever(`- dias reais cobertos: ${diasDeCobertura} (meta 30)`);
  for (const [canal, n] of Object.entries(porCanal)) escrever(`- ${canal}: ${n}`);
  escrever(`- sem URL: ${semUrl}`);
  escrever(`- sem embedding: ${semVetor}`);
  escrever(`- sem entidades: ${semEntidades}`);
  escrever();

  // ------------------------------------------------------------------ coleta
  const sources = await getProjectNewsSources(project.id);
  const coleta = await collectAllNews(sources);
  const { uniqueGroups, duplicatesCount } = deduplicateCandidates(coleta.candidates);

  escrever("## Coleta");
  escrever();
  escrever(`- fontes ativas: ${coleta.sourcesAttempted} de ${sources.length} cadastradas`);
  escrever(`- candidatas na janela de ${coleta.windowHours}h: ${coleta.candidates.length}`);
  escrever(`- grupos após dedup do dia: ${uniqueGroups.length} (${duplicatesCount} duplicatas)`);
  escrever();

  const historico = await store.janela(project.id, config.janelaDeDias);
  const resultado = await avaliarPautas(uniqueGroups, {
    canal: "newsletter",
    historico,
    config,
    provedorDeVetor: criarProvedorOpenAI(),
  });

  // ------------------------------------------------------- pautas escolhidas
  escrever("## Pautas selecionadas");
  escrever();
  resultado.selecionadas.forEach((p, i) => {
    const c = p.classificacao;
    const item = p.grupo.primary;
    escrever(`### ${i + 1}. ${item.title}`);
    escrever();
    escrever(`- fonte: ${item.source_name} (${dominioDe(item.url)})`);
    escrever(`- url: ${item.url}`);
    escrever(`- país: ${c.pais}`);
    escrever(`- categoria: ${c.eixo}${c.imigracao ? ", imigração" : ""}`);
    escrever(`- classificação editorial: leitura ${c.leitura}, relevância ${c.relevancia}/10`);
    escrever(`- motivo da seleção: ${p.motivoDaAprovacao}, ${c.justificativa}`);
    escrever(`- score: ${p.pontuacao.explicacao}`);
    escrever(`- repetição: ${p.veredito.explicacao} (confiança ${p.veredito.confianca})`);
    escrever(`- entidades: atores ${c.atores.join(", ") || "nenhum"}; lugares ${c.lugares.join(", ") || "nenhum"}; acontecimento ${c.acontecimento.join(", ") || "nenhum"}`);
    escrever(`- story_id: ${p.storyId}`);
    escrever();
    escrever(`Resumo factual da fonte: ${(item.description || "").slice(0, 500)}`);
    escrever();
  });

  // ------------------------------------------------------------- rejeições
  const porMotivo = new Map<string, typeof resultado.recusadas>();
  for (const r of resultado.recusadas) {
    const lista = porMotivo.get(r.motivo) ?? [];
    lista.push(r);
    porMotivo.set(r.motivo, lista);
  }

  escrever("## Rejeições, amostra por motivo");
  escrever();
  for (const [motivo, lista] of [...porMotivo.entries()].sort((a, b) => b[1].length - a[1].length)) {
    escrever(`### ${motivo}: ${lista.length}`);
    escrever();
    for (const r of lista.slice(0, 6)) {
      escrever(`- ${r.titulo.slice(0, 110)}`);
      escrever(`  ${r.fonte} :: ${r.explicacao.slice(0, 200)}${r.confianca ? ` :: confiança ${r.confianca}` : ""}`);
    }
    escrever();
  }

  // ------------------------------------------------------- auditoria de fonte
  type Ficha = {
    nome: string;
    dominio: string;
    coletadas: number;
    aprovadas: number;
    negativasEUA: number;
    baixaRelevancia: number;
    repetidas: number;
    semClassificacao: number;
    temas: Map<string, number>;
  };

  const fichas = new Map<string, Ficha>();
  const ficha = (nome: string, url: string): Ficha => {
    const atual = fichas.get(nome) ?? {
      nome,
      dominio: dominioDe(url),
      coletadas: 0,
      aprovadas: 0,
      negativasEUA: 0,
      baixaRelevancia: 0,
      repetidas: 0,
      semClassificacao: 0,
      temas: new Map<string, number>(),
    };
    fichas.set(nome, atual);
    return atual;
  };

  for (const g of uniqueGroups) ficha(g.primary.source_name, g.primary.url).coletadas += 1;
  for (const p of resultado.selecionadas) {
    const f = ficha(p.grupo.primary.source_name, p.grupo.primary.url);
    f.aprovadas += 1;
    f.temas.set(p.classificacao.eixo, (f.temas.get(p.classificacao.eixo) ?? 0) + 1);
  }
  for (const r of resultado.recusadas) {
    const f = ficha(r.fonte, r.url);
    if (r.motivo === "REJECT_US_NEGATIVE") f.negativasEUA += 1;
    else if (r.motivo === "REJECT_LOW_RELEVANCE") f.baixaRelevancia += 1;
    else if (r.motivo.startsWith("REJECT_DUPLICATE")) f.repetidas += 1;
    else if (r.motivo === "REJECT_UNCLASSIFIED") f.semClassificacao += 1;
  }

  escrever("## Auditoria das fontes");
  escrever();
  escrever("| fonte | domínio | coletadas | aprovadas | US negativa | baixa relevância | repetida | sem classificação |");
  escrever("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const f of [...fichas.values()].sort((a, b) => b.coletadas - a.coletadas)) {
    escrever(
      `| ${f.nome} | ${f.dominio} | ${f.coletadas} | ${f.aprovadas} | ${f.negativasEUA} | ${f.baixaRelevancia} | ${f.repetidas} | ${f.semClassificacao} |`
    );
  }
  escrever();

  escrever("## Números da rodada");
  escrever();
  escrever(`- selecionadas: ${resultado.selecionadas.length}`);
  escrever(`- recusadas: ${resultado.recusadas.length}`);
  escrever(`- edição viável: ${resultado.viavel ? "sim" : `não, ${resultado.motivoDaInviabilidade}`}`);
  escrever(
    `- classificação: ${resultado.tokens.prompt} tokens de entrada, ${resultado.tokens.completion} de saída`
  );
  escrever(`- vetores gerados nesta rodada: ${resultado.vetoresGerados}`);
  escrever(
    `- custo estimado da classificação: US$ ${resultado.custoUsd.toFixed(4)} ` +
      "(tabela de preço da família 4o escrita no código; o modelo configurado é outro, então isto é referência, não fatura)"
  );
  escrever();

  // ------------------------------------------------------------- edição
  if (comEdicao && resultado.viavel) {
    escrever("## Edição que sairia hoje");
    escrever();

    const ranked: RankedCandidate[] = resultado.selecionadas.map((p) => ({
      group: p.grupo,
      score: p.pontuacao.total,
      breakdown: {
        impact: p.pontuacao.partes.relevancia,
        novelty: p.pontuacao.partes.ineditismo,
        utility: 0,
        credibility: p.pontuacao.partes.credibilidade,
      },
      reasoning: p.pontuacao.explicacao,
    }));

    const edicao = await runNewsroomPipeline(
      ranked,
      process.env,
      fetch,
      {
        nome: project.brand.displayName || project.name,
        nicho: project.niche,
        extra: project.editorialPromptExtra,
        assinatura:
          String(project.settings?.final_line ?? "").trim() ||
          `Até amanhã. Equipe ${project.brand.displayName || project.name}.`,
      },
      { minimo: config.minimoDePautas, maximo: config.maximoDePautas }
    );

    const e = edicao.edition;
    escrever(`**Assunto:** ${e.subject}`);
    escrever();
    escrever(`**Outras opções de assunto:** ${e.subject_options.join(" | ")}`);
    escrever();
    escrever(`**Preheader:** ${e.preheader}`);
    escrever();
    escrever(`**Manchete:** ${e.headline}`);
    escrever();
    escrever(`**Abertura:** ${e.intro}`);
    escrever();

    e.stories.forEach((s, i) => {
      escrever(`### ${i + 1}. ${s.title}`);
      escrever();
      escrever(`*${s.category}*`);
      escrever();
      escrever(s.summary);
      escrever();
      if (s.context) {
        escrever(`Contexto: ${s.context}`);
        escrever();
      }
      if (s.why_it_matters) {
        escrever(`Por que importa: ${s.why_it_matters}`);
        escrever();
      }
      if (s.practical_impact) {
        escrever(`Impacto prático: ${s.practical_impact}`);
        escrever();
      }
      if (s.humor_line) {
        escrever(`Comentário: ${s.humor_line}`);
        escrever();
      }
      escrever(`Fonte: ${s.source_name}, ${s.source_url}`);
      escrever();
    });

    if (e.quick_bits && e.quick_bits.length > 0) {
      escrever("### Giro rápido");
      escrever();
      for (const q of e.quick_bits) escrever(`- **${q.title}** ${q.text}`);
      escrever();
    }

    escrever("### Análise de perfil");
    escrever();
    escrever("Você pode morar nos Estados Unidos legalmente?");
    escrever();
    escrever(
      "Responda algumas perguntas sobre formação, profissão e situação atual e veja quais caminhos de visto existem para o seu caso. Leva poucos minutos."
    );
    escrever();
    escrever(`Botão: Fazer a análise de perfil, para ${linkDaNewsletter(new Date().toISOString().slice(0, 10))}`);
    escrever();
    escrever("### Fechamento");
    escrever();
    escrever(e.closing);
    escrever();
    escrever(e.final_line);
    escrever();
    escrever("### QA e custo da redação");
    escrever();
    escrever(`- QA: ${edicao.qaResult.score}/100, passou: ${edicao.qaResult.passed}, risco de alucinação: ${edicao.qaResult.hallucination_risk}`);
    if (edicao.qaResult.issues.length > 0) {
      for (const i of edicao.qaResult.issues) escrever(`- apontamento: ${i}`);
    }
    escrever(`- custo da redação: US$ ${edicao.totalUsage.estimatedCostUsd.toFixed(4)} (${edicao.totalUsage.totalTokens} tokens)`);
    escrever();
    escrever(
      `**Custo total desta rodada: US$ ${(resultado.custoUsd + edicao.totalUsage.estimatedCostUsd).toFixed(4)}**`
    );
    escrever();
  }

  escrever("Nada foi publicado, enviado ou gravado por este relatório.");

  if (saida) {
    fs.writeFileSync(path.resolve(process.cwd(), saida), out.join("\n"), "utf-8");
    console.log(`\n[relatório salvo em ${saida}]`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
