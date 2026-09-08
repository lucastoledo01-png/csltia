import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, getProjectNewsSources, requireActiveProject } from "../lib/server/projects";
import { collectFromSource } from "../lib/server/newsroom/collector";
import type { NewsCandidate } from "../lib/server/newsroom/collector";
import { fontesDeOportunidade } from "../lib/server/newsroom/fontes-oportunidade";
import { carregarConfigEditorial } from "../lib/server/editorial/config";
import { criarProvedorOpenAI } from "../lib/server/editorial/embeddings";
import { criarHistoricoStore } from "../lib/server/editorial/history";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { dominioDe } from "../lib/server/editorial/url-canonica";
import { carregarConfigSocial, feedMonotematico } from "../lib/server/social/selecao";
import { descreverAgenda } from "../lib/server/social/agenda";
import { rodarFunilDoDia } from "../lib/server/social/funil";
import { renderizarCapas } from "../lib/server/social/arte";
import { paginaDePreview } from "../lib/server/social/preview";
import type { PostDePreview } from "../lib/server/social/preview";
import { escreverRelatorio } from "./relatorio";

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
 * Com `--arte`, renderiza a capa de cada post e escreve uma página que se
 * abre no navegador: a arte, a legenda exata e o diagnóstico lado a lado. É a
 * única saída em que dá para ver se o post está publicável.
 *
 *   npx tsx src/scripts/dry-run-social.ts --dia=2026-09-04 --saida=dry-run.md
 *   npx tsx src/scripts/dry-run-social.ts --dia=2026-09-04 --arte --preview=preview/
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
  const comArte = argv.includes("--arte");
  const pastaDePreview = valor("preview") ?? (comArte ? "preview-social" : null);

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
    escreverRelatorio(saida, linhas.join("\n"));
    return;
  }

  escrever(`## Dia ${dia}`);
  escrever();

  const config = carregarConfigEditorial(process.env);
  const historicoStore = criarHistoricoStore(getSupabaseAdminClient());
  const historico = await historicoStore.janela(project.id, config.janelaDeDias);

  const client = getSupabaseAdminClient();

  /*
   * O dia inteiro roda pelo mesmo caminho que a medição de sete dias usa.
   *
   * Enquanto eram duas implementações, a medição media um pipeline que não era
   * o que rodava aqui, e um ajuste num dos dois passava despercebido no outro.
   */
  const t0 = Date.now();
  const funil = await rodarFunilDoDia(porDia.get(dia)!, {
    dia,
    projectId: project.id,
    marca: {
      nome: project.brand.displayName || project.name,
      nicho: project.niche,
      extra: project.editorialPromptExtra ?? "",
      keyword: String(project.settings?.instagram_keyword ?? "").trim() || "VISA",
    },
    historico,
    config,
    configSocial,
    client,
    provedorDeVetor: criarProvedorOpenAI(process.env, fetch),
    env: process.env,
    fetcher: fetch,
  });

  const { guarda, conferencia, ciclo } = funil;
  const msGuarda = Date.now() - t0;

  escrever(`${funil.resumo.coletadas} candidatas coletadas, ${funil.resumo.gruposUnicos} grupos únicos.`);
  escrever();

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
  // 1b. Conferência dos finalistas, já rodada acima.
  // ------------------------------------------------------------------

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
  escrever(`| tempo | incluído no total do dia |`);
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
  // 2. O ciclo social inteiro: copy, guarda, reparo, imagem e agenda.
  //    Tudo isso já rodou dentro de `rodarFunilDoDia`.
  // ------------------------------------------------------------------
  for (const l of ciclo.linhasDeLog) console.log(l);

  const composicao = ciclo.composicao ?? {
    escolhidas: [], cortadas: [], bloqueio: null, linhasDeLog: [],
    diversidade: { eixos: {}, topicos: {}, dominios: {}, paises: {}, imigracao: 0, politicaBrasileira: 0 },
  };
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
      escrever();
      /*
       * Sem imagem, o motivo sozinho não diz nada acionável. "NO_VALID_IMAGE"
       * pode ser entidade não identificada, entidade sem página no acervo, ou
       * acervo consultado e sem arquivo com licença aceita: três problemas com
       * três correções diferentes.
       */
      escrever(`| campo | valor |`);
      escrever(`| --- | --- |`);
      escrever(
        `| entidade visual | ${v?.entidade ? `${v.entidade.nome} (${v.entidade.tipo}, confiança ${v.entidade.confianca})` : "**não identificada**"} |`,
      );
      for (const f of v?.fontesConsultadas ?? []) {
        escrever(`| fonte consultada | ${f.fonte}: ${f.encontrados} encontrado(s). ${f.nota.slice(0, 90)} |`);
      }
      if ((v?.fontesConsultadas ?? []).length === 0) {
        escrever(`| fontes consultadas | nenhuma |`);
      }
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
  escrever(`Copy e busca de imagem rodaram; o custo delas não está somado aqui.`);

  escreverRelatorio(saida, linhas.join("\n"));
  console.log(`\nRelatório em ${saida}`);

  // ------------------------------------------------------------------
  // 7. Preview visível.
  //
  // O relatório acima diz quantos posts e por quê. Ele não diz se a manchete
  // cabe na arte, se o crédito da licença cai em cima do título, ou se a foto
  // aprovada é a foto errada para a notícia. Isso só o olho responde.
  // ------------------------------------------------------------------
  if (!pastaDePreview) {
    console.log(`Sem --arte: nenhuma página de preview gerada.`);
    return;
  }

  const pasta = path.resolve(process.cwd(), pastaDePreview, dia);
  fs.mkdirSync(pasta, { recursive: true });

  const entradas = ciclo.previews.map((p) => ({
    headline: p.post.copy.headline,
    eixo: p.post.pauta.classificacao.eixo,
    asset: p.visual?.asset ?? null,
    motivoSemFoto: p.visual?.motivo ?? "resolvedor não executou",
  }));

  let artes: Awaited<ReturnType<typeof renderizarCapas>> = [];
  if (comArte && entradas.length > 0) {
    console.log(`Renderizando ${entradas.length} capa(s)...`);
    try {
      artes = await renderizarCapas(entradas, { fetcher: fetch });
    } catch (erro) {
      console.error(`Render da arte falhou: ${(erro as Error).message}`);
    }
  }

  const observacoes: string[] = [];
  const posts: PostDePreview[] = ciclo.previews.map((p, i) => {
    const arte = artes[i] ?? null;
    const v = p.visual;
    const asset = v?.asset ?? null;
    const nome = `post-${String(p.posicao).padStart(2, "0")}.png`;

    if (arte) {
      fs.writeFileSync(path.join(pasta, nome), arte.png);
      fs.writeFileSync(path.join(pasta, nome.replace(".png", ".html")), arte.html, "utf-8");
    }

    const diagnostico = [
      { campo: "story_id", valor: p.post.pauta.storyId },
      { campo: "fonte", valor: p.post.pauta.grupo.primary.source_name },
      { campo: "URL", valor: p.post.pauta.grupo.primary.url },
      { campo: "origem", valor: `${p.origem.originChannel} (${p.origem.motivo})` },
      { campo: "verificação", valor: "confirm" },
      { campo: "relevância", valor: String(p.post.pauta.classificacao.relevancia) },
      { campo: "eixo", valor: p.post.pauta.classificacao.eixo },
      { campo: "CTA", valor: p.post.copy.cta || "SEM_CTA", alerta: !p.post.copy.cta },
      { campo: "hashtags", valor: p.post.veredicto.hashtagsFinais.join(" ") },
      { campo: "reparos", valor: String(p.post.tentativas), alerta: p.post.tentativas > 0 },
      {
        campo: "Social Guard",
        valor: `${p.post.veredicto.finalDecision}, ${p.post.veredicto.issues.length} issue(s)`,
        alerta: p.post.veredicto.finalDecision !== "publicar",
      },
      { campo: "chave de idempotência", valor: p.chaveDeIdempotencia },
      { campo: "topic_id", valor: p.topicId },
      {
        campo: "layout do painel",
        valor: arte?.diagnosticoDoLayout ?? "arte não renderizada",
        alerta: arte?.diagnosticoDoLayout === "LAYOUT_MISSING_IMAGE_SLOT",
      },
      { campo: "event_fingerprint", valor: p.eventFingerprint.slice(0, 46) },
    ];

    if (asset) {
      diagnostico.push(
        { campo: "entidade visual", valor: `${v?.entidade?.nome ?? "n/d"} (${v?.entidade?.tipo ?? "n/d"})` },
        { campo: "image_context_type", valor: asset.imageContextType },
        { campo: "fonte do asset", valor: asset.source },
        {
          campo: "data do asset",
          valor: `${asset.assetDate ?? "sem data"}${asset.assetAgeYears != null ? ` (${asset.assetAgeYears} anos)` : ""}`,
        },
        { campo: "licença", valor: asset.license },
        { campo: "autor", valor: asset.author || "não identificado" },
        {
          campo: "atribuição impressa",
          valor: asset.attribution || "não exigida por esta licença (registro completo fica no banco)",
        },
        { campo: "temporal_relevance", valor: String(asset.temporalRelevanceScore ?? "n/d") },
        { campo: "semantic_context_fit", valor: String(asset.semanticContextFit ?? "n/d") },
        { campo: "imagem de arquivo", valor: asset.archiveImage ? "sim" : "não" },
        { campo: "página da licença", valor: asset.sourcePageUrl },
      );
    } else {
      diagnostico.push({ campo: "imagem", valor: v?.motivo ?? "resolvedor não executou", alerta: true });
      diagnostico.push({
        campo: "entidade visual",
        valor: v?.entidade
          ? `${v.entidade.nome} (${v.entidade.tipo}, confiança ${v.entidade.confianca})`
          : "não identificada",
        alerta: !v?.entidade,
      });
      for (const f of v?.fontesConsultadas ?? []) {
        diagnostico.push({ campo: `consultou ${f.fonte}`, valor: `${f.encontrados} encontrado(s). ${f.nota}` });
      }
      if ((v?.fontesConsultadas ?? []).length === 0) {
        diagnostico.push({ campo: "fontes consultadas", valor: "nenhuma", alerta: true });
      }
    }

    return {
      posicao: p.posicao,
      hora: p.vaga?.horaLocal ?? "?",
      headline: p.post.copy.headline,
      legenda: p.post.veredicto.legendaFinal,
      hashtags: p.post.veredicto.hashtagsFinais,
      arte: arte ? `data:image/jpeg;base64,${arte.jpeg.toString("base64")}` : "",
      arquivo: arte ? nome : "",
      comFoto: arte?.capa.comFoto ?? Boolean(asset),
      motivoSemFoto: arte?.capa.motivoSemFoto || (v?.motivo ?? ""),
      diagnostico,
      recusadosVisuais: (v?.recusados ?? []).slice(0, 8).map((r) => ({
        motivo: r.motivo,
        identificacao: r.identificacao,
        detalhe: r.detalhe,
      })),
    };
  });

  const semFoto = posts.filter((p) => !p.comFoto).length;
  if (semFoto > 0) {
    observacoes.push(
      `${semFoto} de ${posts.length} post(s) sem foto licenciada. A capa de texto é a saída honesta, ` +
        `não um degradê: notícia factual não recebe imagem inventada nem foto de banco.`,
    );
  }
  const comCredito = posts.filter((p) => p.diagnostico.some((d) => d.campo === "atribuição impressa" && d.valor !== "não exigida"));
  if (comCredito.length > 0) {
    observacoes.push(`${comCredito.length} post(s) com licença que exige atribuição: o crédito sai impresso na arte.`);
  }

  const paginaHtml = paginaDePreview({
    dia,
    projeto: project.brand.displayName || project.name,
    alvo: configSocial.alvoPorDia,
    maximo: configSocial.maximoPorDia,
    posts,
    descartes: [...porEtapa.entries()].flatMap(([etapa, motivos]) =>
      [...motivos.entries()].sort((a, b) => b[1] - a[1]).map(([motivo, quantas]) => ({ etapa, motivo, quantas })),
    ),
    observacoes,
  });

  const caminhoDaPagina = path.join(pasta, "index.html");
  escreverRelatorio(caminhoDaPagina, paginaHtml);
  console.log(`Preview em ${caminhoDaPagina}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
