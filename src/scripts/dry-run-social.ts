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
import { carregarConfigSocial, comporFeedSocial, feedMonotematico } from "../lib/server/social/selecao";
import { carregarConfigDaAgenda, descreverAgenda, distribuirVagas } from "../lib/server/social/agenda";

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
  const store = criarHistoricoStore(getSupabaseAdminClient());
  const historico = await store.janela(project.id, config.janelaDeDias);

  const guarda = await avaliarPautas(uniqueGroups, {
    canal: "instagram",
    historico,
    config,
    provedorDeVetor: criarProvedorOpenAI(process.env, fetch),
    env: process.env,
    fetcher: fetch,
  });

  escrever(`## 1. Pool aprovado`);
  escrever();
  escrever(
    `${guarda.aprovadas.length} pauta(s) passaram na linha editorial. ` +
      `A newsletter levaria ${guarda.selecionadas.length} delas.`,
  );
  escrever();

  const recusasPorMotivo = new Map<string, number>();
  for (const r of guarda.recusadas) recusasPorMotivo.set(r.motivo, (recusasPorMotivo.get(r.motivo) ?? 0) + 1);

  escrever(`Recusadas: ${[...recusasPorMotivo.entries()].map(([m, n]) => `${m} ${n}`).join(", ") || "nenhuma"}`);
  escrever();

  // ------------------------------------------------------------------
  const composicao = comporFeedSocial(guarda.aprovadas, configSocial);
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
  escrever(descreverAgenda(vagas));
  escrever();

  if (composicao.escolhidas.length === 0) {
    escrever(`Nenhum post. O dia não sustentou nenhuma pauta, e isso não é falha de pipeline.`);
  } else {
    escrever(`| hora | origem | país | imig | eixo | tópico | nota | pauta | fonte |`);
    escrever(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
    composicao.escolhidas.forEach((e, i) => {
      const p = e.pauta;
      const origem = naNewsletter.has(p.storyId) ? "newsletter" : "só social";
      escrever(
        `| ${vagas[i]?.horaLocal ?? "?"} | ${origem} | ${p.classificacao.pais} | ` +
          `${p.classificacao.imigracao ? "sim" : "não"} | ${p.classificacao.eixo} | ${e.topico} | ${e.nota} | ` +
          `${p.grupo.primary.title.slice(0, 60)} | ${p.grupo.primary.source_name.slice(0, 26)} |`,
      );
    });
    escrever();

    escrever(`### URLs`);
    escrever();
    composicao.escolhidas.forEach((e, i) => {
      escrever(`${i + 1}. ${e.pauta.grupo.primary.url}`);
    });
    escrever();
  }

  const daNewsletter = composicao.escolhidas.filter((e) => naNewsletter.has(e.pauta.storyId)).length;
  escrever(
    `${daNewsletter} vieram da newsletter (reaproveitamento planejado), ` +
      `${composicao.escolhidas.length - daNewsletter} são exclusivas do social.`,
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

  escrever(`## 4. O que ficou de fora da composição social`);
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
