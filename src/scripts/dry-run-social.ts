import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, getProjectNewsSources, requireActiveProject } from "../lib/server/projects";
import { collectFromSource } from "../lib/server/newsroom/collector";
import type { NewsCandidate } from "../lib/server/newsroom/collector";
import { fontesDeOportunidade } from "../lib/server/newsroom/fontes-oportunidade";
import { deduplicateCandidates } from "../lib/server/newsroom/deduplicator";
import { carregarConfigEditorial } from "../lib/server/editorial/config";
import { criarProvedorOpenAI } from "../lib/server/editorial/embeddings";
import { criarHistoricoStore } from "../lib/server/editorial/history";
import { avaliarPautas } from "../lib/server/editorial/guarda";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { dominioDe } from "../lib/server/editorial/url-canonica";
import { carregarConfigSocial, feedMonotematico } from "../lib/server/social/selecao";
import { rodarCicloSocial } from "../lib/server/social/pipeline-v2";
import { montarPacotesDasPautas } from "../lib/server/editorial/pacote-factual";
import type { PacoteFactual } from "../lib/server/editorial/pacote-factual";
import { resolveVisualAsset } from "../lib/server/visual/resolver";
import { carregarConfigDaAgenda, descreverAgenda, distribuirVagas } from "../lib/server/social/agenda";
import { criarCandidatosStore } from "../lib/server/editorial/candidatos-store";
import { conferirFinalistas } from "../lib/server/editorial/finalistas";
import { impressaoDoAcontecimento } from "../lib/server/editorial/fingerprint";
import { entidadesDaClassificacao } from "../lib/server/editorial/classificador";

/**
 * O dia do Instagram, do candidato bruto até a grade de horários.
 *
 * Não gera copy, não busca imagem, não renderiza arte e não publica. A
 * pergunta desta etapa é só uma: partindo do que existe, quantos posts o dia
 * sustenta, quais são, e como eles ficam distribuídos.
 *
 * O contraste com a newsletter é o ponto: a coluna "canal" mostra quais pautas
 * o e-mail também levaria e quais são exclusivas do feed. As exclusivas são a
 * razão de o Instagram ter composição própria.
 *
 *   npx tsx src/scripts/dry-run-social.ts --dia=2026-09-04 --saida=dry-run.md
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

const FUSO = "America/Sao_Paulo";

function diaDe(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "sem-data" : d.toLocaleDateString("en-CA", { timeZone: FUSO });
}

async function main() {
  carregarEnv();

  const argv = process.argv.slice(2);
  const valor = (nome: string) => {
    const achado = argv.find((a) => a.startsWith(`--${nome}=`));
    return achado ? achado.split("=").slice(1).join("=") : null;
  };

  const saida = valor("saida") ?? "dry-run-social.md";
  const semFontesNovas = argv.includes("--sem-fontes-novas");

  // Tetos da newsletter levantados: o pool é o insumo, não a edição.
  process.env.EDITORIAL_MAX_PAUTAS = "40";
  process.env.EDITORIAL_MAX_PAUTAS_BRASIL = "40";
  process.env.EDITORIAL_MIN_PAUTAS = "1";

  const linhas: string[] = [];
  const escrever = (l = "") => {
    linhas.push(l);
    console.log(l);
  };

  const project = await requireActiveProject(DEFAULT_PROJECT_ID);
  const doBanco = await getProjectNewsSources(project.id);
  const novas = semFontesNovas
    ? []
    : fontesDeOportunidade.filter((f) => !doBanco.some((b) => b.url === f.url));
  const fontes = [...doBanco, ...novas];

  const configSocial = carregarConfigSocial(process.env);
  const configAgenda = carregarConfigDaAgenda(process.env, project.timezone || FUSO);

  escrever(`# Dry-run social, ${project.slug}`);
  escrever();
  escrever(`Nada foi gerado, agendado ou publicado. Nenhuma tabela foi tocada.`);
  escrever();
  escrever(
    `${fontes.length} fontes (${doBanco.length} do banco, ${novas.length} de oportunidade ainda não aplicadas). ` +
      `Alvo ${configSocial.alvoPorDia}, máximo ${configSocial.maximoPorDia}, mínimo ${configSocial.minimoPorDia}.`,
  );
  escrever();

  const coletado = await Promise.all(
    fontes
      .filter((f) => f.enabled)
      .map(async (f) => {
        try {
          return await collectFromSource(f, fetch);
        } catch {
          return [] as NewsCandidate[];
        }
      }),
  );

  const todas = coletado.flat();
  const porDia = new Map<string, NewsCandidate[]>();
  for (const c of todas) {
    const d = diaDe(c.published_at);
    if (!porDia.has(d)) porDia.set(d, []);
    porDia.get(d)!.push(c);
  }

  const disponiveis = [...porDia.keys()].filter((d) => d !== "sem-data").sort().reverse();
  const dia = valor("dia") ?? disponiveis[0];

  if (!porDia.has(dia)) {
    escrever(`Nenhuma candidata em ${dia}. Dias disponíveis: ${disponiveis.slice(0, 8).join(", ")}.`);
    fs.writeFileSync(saida, linhas.join("\n"), "utf-8");
    return;
  }

  const { uniqueGroups } = deduplicateCandidates(porDia.get(dia)!);

  escrever(`## Dia ${dia}`);
  escrever();
  escrever(`${porDia.get(dia)!.length} candidatas coletadas, ${uniqueGroups.length} grupos únicos.`);
  escrever();

  const config = carregarConfigEditorial(process.env);
  const historicoStore = criarHistoricoStore(getSupabaseAdminClient());
  const historico = await historicoStore.janela(project.id, config.janelaDeDias);

  const t0 = Date.now();
  const client = getSupabaseAdminClient();
  const candidatosStore = criarCandidatosStore(client);

  const guarda = await avaliarPautas(uniqueGroups, {
    canal: "instagram",
    historico,
    config,
    provedorDeVetor: criarProvedorOpenAI(process.env, fetch),
    env: process.env,
    fetcher: fetch,
    candidatos: { store: candidatosStore, projectId: project.id },
  });
  const msGuarda = Date.now() - t0;

  escrever(`## 1. Pool aprovado`);
  escrever();
  escrever(
    `${guarda.approvedEditorialPool.length} pauta(s) passaram na linha editorial. ` +
      `A newsletter levaria ${guarda.selecionadas.length} delas.`,
  );
  escrever();

  const recusasPorMotivo = new Map<string, number>();
  for (const r of guarda.recusadas) recusasPorMotivo.set(r.motivo, (recusasPorMotivo.get(r.motivo) ?? 0) + 1);

  escrever(`Recusadas: ${[...recusasPorMotivo.entries()].map(([m, n]) => `${m} ${n}`).join(", ") || "nenhuma"}`);
  escrever();

  escrever(`### Reuso e persistência`);
  escrever();
  escrever(`| métrica | valor |`);
  escrever(`| --- | --- |`);
  escrever(`| candidatas lidas do banco | ${guarda.reuso.candidatasLidas} |`);
  escrever(`| classificações reaproveitadas | **${guarda.reuso.classificacoesReaproveitadas}** |`);
  escrever(`| classificadas agora | ${guarda.reuso.classificadasAgora} |`);
  escrever(`| gravadas | ${guarda.reuso.persistidas} |`);
  escrever(`| tokens da guarda | ${guarda.tokens.total.toLocaleString("pt-BR")} |`);
  escrever(`| tempo da guarda | ${(msGuarda / 1000).toFixed(1)}s |`);
  escrever(
    `| persistência degradada | ${guarda.reuso.erros.length > 0 ? `**sim**: ${guarda.reuso.erros.join("; ")}` : "não"} |`,
  );
  escrever();

  // ------------------------------------------------------------------
  // 1b. Conferência dos finalistas.
  // ------------------------------------------------------------------
  const t1 = Date.now();
  const conferencia = await conferirFinalistas(guarda.approvedEditorialPool, {
    canal: "instagram",
    vagas: configSocial.maximoPorDia,
    config,
    store: candidatosStore,
    projectId: project.id,
    env: process.env,
    fetcher: fetch,
  });
  const msVerificacao = Date.now() - t1;

  escrever(`## 1b. Verificação de finalistas`);
  escrever();
  const diag = conferencia.diagnostico;
  escrever(`| métrica | valor |`);
  escrever(`| --- | --- |`);
  escrever(`| finalistas conferidos | ${diag.finalistas} de ${guarda.approvedEditorialPool.length} do pool |`);
  escrever(`| verificados agora | ${diag.verificadasAgora} |`);
  escrever(`| **reaproveitados de outro canal** | **${diag.reaproveitadasDoBanco}** |`);
  escrever(`| chamadas ao verificador | ${diag.chamadasAoVerificador} |`);
  escrever(`| tokens | ${diag.tokens.toLocaleString("pt-BR")} |`);
  escrever(`| tempo | ${(msVerificacao / 1000).toFixed(1)}s |`);
  escrever(`| confirmadas | **${conferencia.confirmadas.length}** |`);
  escrever(`| recusadas pela verificação | ${conferencia.recusadas.length} |`);
  escrever(`| em conflito | ${conferencia.emConflito.length} |`);
  escrever();

  if (conferencia.recusadas.length > 0) {
    escrever(`Recusadas na conferência:`);
    escrever();
    for (const r2 of conferencia.recusadas) {
      escrever(`- ${r2.pauta.grupo.primary.title.slice(0, 60)} :: ${r2.motivo.slice(0, 110)}`);
    }
    escrever();
  }

  if (conferencia.emConflito.length > 0) {
    escrever(`Em conflito, que não publicam sozinhas:`);
    escrever();
    escrever(`| pauta | campos divergentes | primária x verificação |`);
    escrever(`| --- | --- | --- |`);
    for (const c2 of conferencia.emConflito) {
      const materiais = c2.divergencias.filter((x) => x.material);
      escrever(
        `| ${c2.pauta.grupo.primary.title.slice(0, 45)} | ${materiais.map((x) => x.campo).join(", ") || "n/d"} | ` +
          `${materiais.map((x) => `${x.primaria} x ${x.verificacao}`).join("; ") || c2.motivo.slice(0, 40)} |`,
      );
    }
    escrever();
  }

  // Instabilidade residual: que campos ainda divergem.
  const porCampo = new Map<string, number>();
  for (const c2 of conferencia.emConflito) {
    for (const div of c2.divergencias) {
      porCampo.set(div.campo, (porCampo.get(div.campo) ?? 0) + 1);
    }
  }
  if (porCampo.size > 0) {
    escrever(`Instabilidade residual por campo: ${[...porCampo.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}`);
    escrever();
  }

  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // 2. O ciclo social inteiro: copy, guarda, reparo, imagem e agenda.
  // ------------------------------------------------------------------
  const pacotes = new Map<string, PacoteFactual>();
  if (conferencia.confirmadas.length > 0) {
    const construcao = await montarPacotesDasPautas(
      conferencia.confirmadas.map((p) => ({
        url: p.grupo.primary.url,
        titulo: p.grupo.primary.title,
        texto: p.enriquecimento?.texto ?? "",
        urls: [p.grupo.primary.url],
      })),
      process.env,
      fetch,
    );

    // `montarPacotesDasPautas` indexa por URL; o gerador procura por storyId.
    const porUrl = new Map(conferencia.confirmadas.map((p) => [p.grupo.primary.url, p.storyId]));
    for (const [url, pacote] of construcao.pacotes.entries()) {
      const storyId = porUrl.get(url);
      if (storyId) pacotes.set(storyId, pacote);
    }
    escrever(`Pacotes factuais: ${pacotes.size} de ${conferencia.confirmadas.length}.`);
    escrever();
  }

  const candidatasPorStory = await candidatosStore.buscarPorStoryIds(
    project.id,
    conferencia.confirmadas.map((p) => p.storyId),
  );

  // O modo vem forçado aqui: o script existe para diagnosticar.
  const envDoCiclo = { ...process.env, SOCIAL_PIPELINE_V2: "dry_run" };

  const ciclo = await rodarCicloSocial(conferencia.confirmadas, {
    projectId: project.id,
    editionDate: dia,
    marca: {
      nome: project.brand.displayName || project.name,
      nicho: project.niche,
      extra: project.editorialPromptExtra,
      keyword: String(project.settings?.instagram_keyword ?? "").trim() || "VISA",
    },
    historico,
    pacotes,
    candidatas: candidatasPorStory,
    persistenciaDegradada: guarda.reuso.erros.length > 0,
    config: configSocial,
    env: envDoCiclo,
    fetcher: fetch,
    resolverVisual: async (pauta) =>
      resolveVisualAsset(
        {
          storyId: pauta.storyId,
          titulo: pauta.grupo.primary.title,
          resumo: pauta.enriquecimento?.texto ?? "",
          categoria: pauta.classificacao.eixo,
          classificacao: {
            atores: pauta.classificacao.atores,
            lugares: pauta.classificacao.lugares,
            acontecimento: pauta.classificacao.acontecimento,
            pais: pauta.classificacao.pais,
          },
        },
        { env: process.env, fetcher: fetch, somenteLeitura: true },
      ),
  });

  for (const l of ciclo.linhasDeLog) console.log(l);

  const composicao = ciclo.composicao ?? {
    escolhidas: [], cortadas: [], bloqueio: null, linhasDeLog: [],
    diversidade: { eixos: {}, topicos: {}, dominios: {}, paises: {}, imigracao: 0, politicaBrasileira: 0 },
  };
  const naNewsletter = new Set(guarda.selecionadas.map((p) => p.storyId));
  /*
   * O relógio da simulação é o do dia simulado, não o de agora.
   *
   * `distribuirVagas` nunca agenda no passado, e com razão. Rodando à noite
   * uma simulação de um dia anterior, esse piso empurra a grade inteira para a
   * madrugada seguinte e esconde justamente o que se quer ver. Aqui o "agora"
   * é a véspera da janela do dia simulado.
   */
  const agoraSimulado = new Date(`${dia}T03:00:00Z`).getTime();
  const vagas = distribuirVagas(composicao.escolhidas.length, dia, configAgenda, agoraSimulado);

  escrever(`## 2. Posts do dia`);
  escrever();
  escrever(descreverAgenda(ciclo.previews.map((p) => p.vaga)));
  escrever();

  if (ciclo.previews.length === 0) {
    escrever(`Nenhum post. O dia não sustentou nenhuma pauta, e isso não é falha de pipeline.`);
    escrever();
  }

  for (const p of ciclo.previews) {
    const pauta = p.post.pauta;
    const v = p.visual;
    const asset = v?.asset ?? null;

    escrever(`### Post ${p.posicao} :: ${p.vaga?.horaLocal ?? "?"}`);
    escrever();
    escrever(`**${p.post.copy.headline}**`);
    escrever();
    escrever("```");
    escrever(p.post.veredicto.legendaFinal);
    escrever("```");
    escrever();

    escrever(`| campo | valor |`);
    escrever(`| --- | --- |`);
    escrever(`| candidate_id | ${p.candidateId ?? "não persistida"} |`);
    escrever(`| story_id | \`${pauta.storyId}\` |`);
    escrever(`| origem | **${p.origem.originChannel}** (${p.origem.motivo}) |`);
    escrever(`| origin_story_id | ${p.origem.originStoryId ?? "n/d"} |`);
    escrever(`| fonte | ${pauta.grupo.primary.source_name} |`);
    escrever(`| URL | ${pauta.grupo.primary.url.slice(0, 80)} |`);
    escrever(`| verificação | confirm |`);
    escrever(`| relevância | ${pauta.classificacao.relevancia} |`);
    escrever(`| topic_id | ${p.topicId} |`);
    escrever(`| event_fingerprint | \`${p.eventFingerprint.slice(0, 46)}\` |`);
    escrever(`| CTA | ${p.post.copy.cta ? p.post.copy.cta.slice(0, 70) : "**SEM_CTA**"} |`);
    escrever(`| hashtags | ${p.post.veredicto.hashtagsFinais.join(" ")} |`);
    escrever(`| reparos | ${p.post.tentativas} |`);
    escrever(`| Social Guard | ${p.post.veredicto.finalDecision}, ${p.post.veredicto.issues.length} issue(s) |`);
    escrever(`| chave de idempotência | \`${p.chaveDeIdempotencia}\` |`);
    escrever();

    if (p.post.reparosAplicados.length > 0) {
      escrever(`Corrigido no caminho: ${p.post.reparosAplicados.flat().map((x) => `${x.motivo} (${x.detalhe.slice(0, 50)})`).join("; ")}`);
      escrever();
    }

    escrever(`**Visual**`);
    escrever();
    if (asset) {
      escrever(`| campo | valor |`);
      escrever(`| --- | --- |`);
      escrever(`| entidade visual | ${v?.entidade?.nome ?? "n/d"} (${v?.entidade?.tipo ?? "n/d"}) |`);
      escrever(`| centralidade | ${v?.entidade?.confianca ?? "n/d"} |`);
      escrever(`| image_context_type | ${asset.imageContextType} |`);
      escrever(`| fonte do asset | ${asset.source} |`);
      escrever(`| data do asset | ${asset.assetDate ?? "sem data"}${asset.assetAgeYears !== null && asset.assetAgeYears !== undefined ? ` (${asset.assetAgeYears} anos)` : ""} |`);
      escrever(`| licença | ${asset.license} |`);
      escrever(`| atribuição | ${asset.attribution || "não exigida"} |`);
      escrever(`| temporal_relevance | ${asset.temporalRelevanceScore ?? "n/d"} |`);
      escrever(`| semantic_context_fit | ${asset.semanticContextFit ?? "n/d"} |`);
      escrever(`| imagem de arquivo | ${asset.archiveImage ? "sim" : "não"} |`);
      escrever(`| URL | ${asset.imageUrl.slice(0, 90)} |`);
      escrever(`| página da licença | ${asset.sourcePageUrl.slice(0, 80)} |`);
    } else {
      escrever(`**NO_VALID_VISUAL_ASSET**: ${v?.motivo ?? "resolvedor não executou"}`);
    }
    escrever();

    const recusadosVisuais = v?.recusados ?? [];
    if (recusadosVisuais.length > 0) {
      escrever(`Candidatos de imagem descartados:`);
      escrever();
      escrever(`| motivo | arquivo | detalhe |`);
      escrever(`| --- | --- | --- |`);
      for (const rc of recusadosVisuais.slice(0, 8)) {
        escrever(`| ${rc.motivo} | ${rc.identificacao.slice(0, 45)} | ${rc.detalhe.slice(0, 60)} |`);
      }
      escrever();
    }
  }

  const daNewsletter = ciclo.previews.filter((p) => p.origem.originChannel === "newsletter").length;
  escrever(
    `${daNewsletter} de origem newsletter (reaproveitamento planejado), ` +
      `${ciclo.previews.length - daNewsletter} exclusivas do social.`,
  );
  escrever();

  escrever(`## 3. Diversidade`);
  escrever();
  const d = composicao.diversidade;
  escrever(`| dimensão | distribuição |`);
  escrever(`| --- | --- |`);
  escrever(`| país | ${Object.entries(d.paises).map(([k, v]) => `${k} ${v}`).join(", ") || "n/d"} |`);
  escrever(`| eixo | ${Object.entries(d.eixos).map(([k, v]) => `${k} ${v}`).join(", ") || "n/d"} |`);
  escrever(`| tópico | ${Object.entries(d.topicos).map(([k, v]) => `${k} ${v}`).join(", ") || "n/d"} |`);
  escrever(`| domínio | ${Object.entries(d.dominios).map(([k, v]) => `${k} ${v}`).join(", ") || "n/d"} |`);
  escrever(`| imigração | ${d.imigracao} de ${configSocial.maximoDeImigracao} |`);
  escrever(`| política BR | ${d.politicaBrasileira} de ${configSocial.maximoDePoliticaBrasileira} |`);
  escrever();

  const veredito = feedMonotematico(composicao);
  escrever(`**Teste de diversidade: ${veredito.monotematico ? "REPROVADO" : "aprovado"}.** ${veredito.motivo}`);
  escrever();

  escrever(`## 4. Descartados, e em que etapa`);
  escrever();
  escrever(`É esta tabela que explica por que saíram ${ciclo.previews.length} posts e não dez.`);
  escrever();

  type Descarte = { etapa: string; motivo: string; pauta: string };
  const todosOsDescartes: Descarte[] = [];

  for (const r2 of guarda.recusadas) {
    todosOsDescartes.push({ etapa: "linha editorial", motivo: r2.motivo, pauta: r2.titulo });
  }
  for (const r2 of conferencia.recusadas) {
    todosOsDescartes.push({ etapa: "verificação", motivo: "VERIFIED_REJECT", pauta: r2.pauta.grupo.primary.title });
  }
  for (const c2 of conferencia.emConflito) {
    todosOsDescartes.push({
      etapa: "verificação",
      motivo: "EDITORIAL_CLASSIFICATION_CONFLICT",
      pauta: c2.pauta.grupo.primary.title,
    });
  }
  for (const d2 of ciclo.descartados) {
    todosOsDescartes.push({
      etapa: d2.etapa === "composicao" ? "diversidade social" : "copy",
      motivo: d2.motivo.split(":")[0],
      pauta: d2.titulo,
    });
  }

  const porEtapa = new Map<string, Map<string, number>>();
  for (const d2 of todosOsDescartes) {
    if (!porEtapa.has(d2.etapa)) porEtapa.set(d2.etapa, new Map());
    const m = porEtapa.get(d2.etapa)!;
    m.set(d2.motivo, (m.get(d2.motivo) ?? 0) + 1);
  }

  escrever(`| etapa | motivo | quantas |`);
  escrever(`| --- | --- | --- |`);
  for (const [etapa, motivos] of porEtapa.entries()) {
    for (const [motivo, n] of [...motivos.entries()].sort((a, b) => b[1] - a[1])) {
      escrever(`| ${etapa} | ${motivo} | ${n} |`);
    }
  }
  escrever();

  const perdasTardias = todosOsDescartes.filter(
    (d2) => d2.etapa !== "linha editorial",
  );
  if (perdasTardias.length > 0) {
    escrever(`Pautas que chegaram longe e caíram:`);
    escrever();
    escrever(`| pauta | etapa | motivo |`);
    escrever(`| --- | --- | --- |`);
    for (const d2 of perdasTardias) {
      escrever(`| ${d2.pauta.slice(0, 55)} | ${d2.etapa} | ${d2.motivo.slice(0, 45)} |`);
    }
    escrever();
  }

  escrever(`## 4b. Cortes de diversidade da composição social`);
  escrever();
  if (composicao.cortadas.length === 0) {
    escrever(`Nada. Todo o pool coube no feed.`);
  } else {
    escrever(`| motivo | detalhe | pauta |`);
    escrever(`| --- | --- | --- |`);
    for (const c of composicao.cortadas) {
      escrever(`| ${c.motivo} | ${c.detalhe} | ${c.titulo.slice(0, 55)} |`);
    }
  }
  escrever();

  escrever(`## 5. Comparação com a composição da newsletter`);
  escrever();
  escrever(`| | newsletter | social |`);
  escrever(`| --- | --- | --- |`);
  escrever(`| pautas | ${guarda.selecionadas.length} | ${composicao.escolhidas.length} |`);
  escrever(`| teto por domínio | 2 (fixo no código) | ${configSocial.maximoPorDominio} |`);
  escrever(`| teto por ator | 2 (fixo no código) | ${configSocial.maximoPorAtor} |`);
  escrever(`| teto do Brasil | ${config.maximoDePautasBrasil} | ${configSocial.maximoDePoliticaBrasileira} (só política) |`);
  escrever(`| teto total | ${config.maximoDePautas} | ${configSocial.maximoPorDia} |`);
  escrever();

  const dominiosDaNewsletter = new Set(guarda.selecionadas.map((p) => dominioDe(p.grupo.primary.url)));
  escrever(`Domínios na newsletter: ${[...dominiosDaNewsletter].join(", ") || "nenhum"}.`);
  escrever();

  escrever(`## 6. Custo desta simulação`);
  escrever();
  escrever(`${guarda.tokens.total.toLocaleString("pt-BR")} tokens na classificação e avaliação do dia inteiro.`);
  escrever(`Copy, imagem e arte não rodaram nesta etapa.`);

  fs.writeFileSync(saida, linhas.join("\n"), "utf-8");
  console.log(`\nRelatório em ${saida}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
