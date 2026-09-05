import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, getProjectNewsSources, requireActiveProject } from "../lib/server/projects";
import { collectAllNews } from "../lib/server/newsroom/collector";
import { deduplicateCandidates } from "../lib/server/newsroom/deduplicator";
import { runNewsroomPipeline } from "../lib/server/newsroom/pipeline";
import { identidadeDaPauta, renderEditionToHtml } from "../lib/server/newsroom/newsroom-service";
import { paraRenderizacao, resolverImagens } from "../lib/server/editorial/imagens";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { carregarConfigEditorial } from "../lib/server/editorial/config";
import { criarProvedorOpenAI } from "../lib/server/editorial/embeddings";
import { criarHistoricoStore } from "../lib/server/editorial/history";
import { avaliarPautas } from "../lib/server/editorial/guarda";
import { dominioDe } from "../lib/server/editorial/url-canonica";
import { linkDaNewsletter } from "../lib/visamatch";
import { montarPacotesDasPautas } from "../lib/server/editorial/pacote-factual";
import type { PacoteFactual } from "../lib/server/editorial/pacote-factual";
import { descreverSinais } from "../lib/server/editorial/repeticao";
import { modoDaGuarda } from "../lib/server/editorial/modo";
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

/** Escape mínimo para o preview, que é HTML gerado aqui e não pela edição. */
function e_(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

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
  escrever(
    `Projeto ${project.slug}. Guarda em \`${modoDaGuarda()}\`. ` +
      "Nada foi publicado, enviado ou gravado."
  );
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

  // As falhas de lote explicam pauta "não classificada", que sem isso vira um
  // número solto no relatório.
  const falhas = resultado.linhasDeLog.filter((l) => l.includes("lote "));
  if (falhas.length > 0) {
    escrever("## Falhas de classificação");
    escrever();
    for (const f of falhas) escrever(`- ${f.replace("[GUARDA] ", "")}`);
    escrever();
  }

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
    escrever(
      `- conteúdo: ${p.enriquecimento.enrichmentStatus}, ${p.enriquecimento.contentLength} caracteres, ` +
        `origem ${p.enriquecimento.contentSource}`
    );
    if (p.enriquecimento.enrichmentSources.length > 0) {
      escrever(`- páginas buscadas: ${p.enriquecimento.enrichmentSources.join(", ")}`);
    }
    escrever(`- sinais de repetição: ${descreverSinais(p.veredito.sinais)}`);
    escrever(`- duplicate_confidence: ${p.veredito.duplicate_confidence}`);
    escrever();
    escrever(`Conteúdo factual usado (início): ${p.enriquecimento.texto.slice(0, 700)}`);
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
      escrever(`  ${r.fonte} :: ${r.explicacao.slice(0, 260)}${r.confianca ? ` :: duplicate_confidence ${r.confianca}` : ""}`);
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

    const construcao = await montarPacotesDasPautas(
      resultado.selecionadas.map((p) => ({
        url: p.grupo.primary.url,
        titulo: p.grupo.primary.title,
        texto: p.enriquecimento.texto,
        urls: [p.grupo.primary.url, ...p.grupo.secondary_urls],
      }))
    );
    for (const f of construcao.falhas) escrever(`Pacote factual falhou: ${f}`);

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
      { minimo: config.minimoDePautas, maximo: config.maximoDePautas },
      construcao.pacotes,
      config.maximoDeReparos
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
    escrever("## Fact grounding");
    escrever();
    for (const p of resultado.selecionadas) {
      const pacote: PacoteFactual | undefined = construcao.pacotes.get(p.grupo.primary.url);
      escrever(`### ${p.grupo.primary.title.slice(0, 90)}`);
      escrever();
      if (!pacote) {
        escrever("Pacote factual não foi montado para esta pauta. O texto dela não foi conferido.");
        escrever();
        continue;
      }
      escrever(`Fonte dos fatos: ${pacote.source_urls.join(", ")}`);
      escrever();
      escrever("Fatos utilizados:");
      for (const f of pacote.verified_facts) escrever(`- ${f}`);
      escrever();
      escrever(`Pessoas: ${pacote.people.join(", ") || "nenhuma"}`);
      escrever(`Organizações: ${pacote.organizations.join(", ") || "nenhuma"}`);
      escrever(`Lugares: ${pacote.places.join(", ") || "nenhum"}`);
      escrever(`Datas: ${pacote.dates.join(", ") || "nenhuma"}`);
      escrever(`Números: ${pacote.numbers.join(", ") || "nenhum"}`);
      escrever(`O que a matéria não diz: ${pacote.gaps.join("; ") || "nada registrado"}`);
      escrever();

      // Casa por posição: o redator reescreve o título, então procurar por
      // texto não encontra a matéria que veio desta pauta.
      const posicao = resultado.selecionadas.indexOf(p);
      const conferencia = edicao.ancoragem.find((a) => a.indice === posicao);

      if (!conferencia) {
        escrever("Conferência: não rodou para esta pauta.");
        escrever();
        continue;
      }

      escrever(`Matéria escrita a partir dela: "${conferencia.titulo}"`);
      escrever(
        `hard_fact_grounding: ${conferencia.conferidos} afirmações conferidas, ` +
          (conferencia.ancorado ? "nenhuma sem lastro" : "COM AFIRMAÇÃO SEM LASTRO")
      );
      for (const c of conferencia.naoSustentadas) {
        escrever(`- ${c.severidade}: ${c.tipo} "${c.valor}" em "${c.onde}"`);
      }
      escrever();

      const claimsDaPauta = edicao.claimsSemanticas.claims.filter((c) => c.pauta === posicao);
      escrever(`semantic_claim_grounding: ${claimsDaPauta.length} conclusão(ões) auditada(s)`);
      for (const c of claimsDaPauta) {
        escrever(`- ${c.sustentada ? "sustentada" : "SEM SUSTENTAÇÃO"} (${c.tipo}): "${c.trecho}"`);
        if (c.motivo) escrever(`  ${c.motivo}`);
      }
      escrever();
    }

    const semLastro = edicao.ancoragem.filter((a) => !a.ancorado);
    const avisos = edicao.ancoragem.flatMap((a) =>
      a.naoSustentadas.filter((c) => c.severidade === "aviso")
    );

    escrever("### Ciclo de correção");
    escrever();
    escrever(`Tentativas: ${edicao.tentativasDeReparo} (teto ${config.maximoDeReparos})`);
    for (const r of edicao.rodadasDeReparo) {
      escrever(
        `- tentativa ${r.tentativa}: recebeu ${r.problemasRecebidos.length} apontamento(s), ` +
          `restaram ${r.problemasRestantes.length}`
      );
      for (const d of r.problemasRecebidos) escrever(`  corrigir: ${d}`);
      for (const d of r.problemasRestantes) escrever(`  ainda aberto: ${d}`);
    }
    if (edicao.claimsSemanticas.erro) {
      escrever(`Auditoria de conclusões não rodou: ${edicao.claimsSemanticas.erro}. Isso não é aprovação.`);
    }
    escrever();
    escrever(
      semLastro.length === 0
        ? "Nenhuma afirmação de bloqueio. Em enforce, esta edição passaria pela ancoragem."
        : `${semLastro.length} matéria(s) com afirmação sem lastro. Em enforce, esta edição seria BLOQUEADA.`
    );
    if (avisos.length > 0) {
      escrever(
        `${avisos.length} aviso(s): palavra com inicial maiúscula fora do material, sem bloquear. ` +
          avisos.map((c) => `"${c.valor}"`).join(", ")
      );
    }
    escrever();

    escrever("### QA e custo da redação");
    escrever();
    escrever(`- score: ${edicao.qaResult.score}/100`);
    escrever(`- passed: ${edicao.qaResult.passed}`);
    escrever(`- hallucination_risk: ${edicao.qaResult.hallucination_risk}`);
    escrever(`- tone_check_passed: ${edicao.qaResult.tone_check_passed}`);
    escrever(`- grammar_passed: ${edicao.qaResult.grammar_passed}`);
    escrever(`- story_count_valid: ${edicao.qaResult.story_count_valid}`);
    if (edicao.qaResult.hallucination_risk) {
      escrever("- em enforce, hallucination_risk bloqueia a edição sozinho, qualquer que seja a nota.");
    }
    if (edicao.qaResult.issues.length > 0) {
      for (const i of edicao.qaResult.issues) escrever(`- apontamento: ${i}`);
    }
    escrever(`- custo da redação: US$ ${edicao.totalUsage.estimatedCostUsd.toFixed(4)} (${edicao.totalUsage.totalTokens} tokens)`);
    escrever();
    const motivos = [...edicao.bloqueios];
    if (!resultado.viavel) motivos.unshift(`pautas insuficientes: ${resultado.motivoDaInviabilidade}`);

    /*
     * Caminho real de imagem e renderização.
     *
     * Chama exatamente o que o pipeline chama: `resolverImagens` e
     * `renderEditionToHtml`. Preview que exercita outro código não valida
     * nada. O que NÃO acontece aqui é gravar, publicar ou enviar.
     */
    const escolhas = await resolverImagens(
      edicao.edition.stories.map((story, i) => ({
        titulo: story.title,
        categoria: story.category,
        sourceUrl: story.source_url,
        imagemDoFeed: edicao.selectedCandidates[i]?.image_url ?? "",
      })),
      { historico, janelaEmDias: config.janelaDeImagemEmDias }
    );

    escrever("## Imagens");
    escrever();
    for (const [i, story] of edicao.edition.stories.entries()) {
      const id = identidadeDaPauta(story);
      const e = escolhas.get(id);
      escrever(`### ${i + 1}. ${story.title}`);
      escrever();
      escrever(`- story_id: ${id}`);
      escrever(`- image_url: ${e?.imagemUrl || "nenhuma"}`);
      escrever(`- image_source: ${e?.imageSource ?? "nenhuma"}`);
      escrever(`- identidade da foto: ${e?.imagemCanonica || "n/d"}`);
      escrever(`- motivo da escolha: ${e?.motivo ?? "n/d"}`);
      escrever(`- já usada antes: ${e?.descartadaPorRepeticao ?? "não"}`);
      escrever(
        `- crédito: ${e?.credito ? `${e.credito.provedor}, ${e.credito.fotografo}` : "não exigido ou inexistente"}`
      );
      escrever(`- vínculo: mapa story_id -> url, consultado pelo renderizador com a mesma identidade`);
      escrever();
    }

    const comFoto = [...escolhas.values()].filter((e) => e.imagemUrl);
    const canonicas = new Set(comFoto.map((e) => e.imagemCanonica));
    escrever(`Pautas com foto: ${comFoto.length} de ${edicao.edition.stories.length}`);
    escrever(`Fotos distintas: ${canonicas.size} (se for menor que o número acima, houve repetição)`);
    escrever();

    const html = renderEditionToHtml(edicao.edition, paraRenderizacao(escolhas));
    const caminhoHtml = (saida ?? "preview.md").replace(/\.md$/, "") + ".html";
    fs.writeFileSync(
      path.resolve(process.cwd(), caminhoHtml),
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">` +
        `<title>${e_(edicao.edition.subject)}</title>` +
        `<meta name="description" content="${e_(edicao.edition.preheader)}"></head><body>` +
        `<div style="max-width:680px;margin:0 auto;padding:16px;font-family:system-ui,sans-serif;background:#F4F4F5;">` +
        `<p style="font:12px/1.5 system-ui;color:#555;margin:0 0 12px 0;">` +
        `<strong>Assunto:</strong> ${e_(edicao.edition.subject)}<br>` +
        `<strong>Preheader:</strong> ${e_(edicao.edition.preheader)}</p></div>` +
        html +
        `</body></html>`,
      "utf-8"
    );
    escrever(`Render salvo em ${caminhoHtml}. Nada foi enviado nem publicado.`);

    /*
     * A edição fica guardada em disco.
     *
     * Não é persistência de produção: é para o passo de imagem poder ser
     * repetido sem gerar a edição de novo. Sem isso, conferir a escolha de
     * foto custa uma redação inteira toda vez, e a escolha de foto não tem
     * nada a ver com o texto.
     */
    const caminhoEdicao = (saida ?? "preview.md").replace(/\.md$/, "") + ".edicao.json";
    fs.writeFileSync(
      path.resolve(process.cwd(), caminhoEdicao),
      JSON.stringify(
        {
          edition: edicao.edition,
          selectedCandidates: edicao.selectedCandidates,
          gerado_em: new Date().toISOString(),
        },
        null,
        2
      ),
      "utf-8"
    );
    escrever(`Edição guardada em ${caminhoEdicao}, para repetir o passo de imagem sem reescrever.`);
    escrever();

    escrever("## Editorial Guard");
    escrever();
    escrever(`**${motivos.length === 0 ? "PASS" : "FAIL"}**`);
    escrever();
    if (motivos.length === 0) {
      escrever("Passou nas três conferências: ancoragem dura, conclusões e auditoria.");
      if (edicao.problemasRestantes.length > 0) {
        escrever();
        escrever(
          `${edicao.problemasRestantes.length} apontamento(s) de precisão sobraram depois do reparo. ` +
            "Não bloqueiam e ficam registrados:"
        );
        for (const p of edicao.problemasRestantes) escrever(`- ${p.descricao}`);
      }
    } else {
      for (const m of motivos) escrever(`- ${m}`);
    }
    escrever();

    escrever(
      "**Custo estimado desta rodada: US$ " +
        (resultado.custoUsd + edicao.totalUsage.estimatedCostUsd + construcao.custoUsd).toFixed(4) +
        `** (classificação ${resultado.custoUsd.toFixed(4)}, pacote factual ${construcao.custoUsd.toFixed(4)}, ` +
        `redação ${edicao.totalUsage.estimatedCostUsd.toFixed(4)}), pela tabela de preço da família 4o escrita no código`
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
