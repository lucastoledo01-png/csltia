import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, getProjectNewsSources, requireActiveProject } from "../lib/server/projects";
import { collectFromSource, janelaDaFonte } from "../lib/server/newsroom/collector";
import { fontesDeOportunidade } from "../lib/server/newsroom/fontes-oportunidade";
import type { NewsCandidate } from "../lib/server/newsroom/collector";
import { deduplicateCandidates } from "../lib/server/newsroom/deduplicator";
import { carregarConfigEditorial } from "../lib/server/editorial/config";
import { criarProvedorOpenAI } from "../lib/server/editorial/embeddings";
import { criarHistoricoStore } from "../lib/server/editorial/history";
import { avaliarPautas } from "../lib/server/editorial/guarda";
import { classificarPautas } from "../lib/server/editorial/classificador";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { dominioDe } from "../lib/server/editorial/url-canonica";
import { escreverRelatorio } from "./relatorio";

/**
 * Quanta pauta boa existe por dia.
 *
 * A pergunta que precede o scheduler da fase 3: dez posts por dia é meta
 * sustentável ou é slot vazio esperando ser preenchido com pauta ruim. A única
 * forma honesta de responder é passar a coleta real pelo filtro editorial real
 * e contar o funil, dia a dia.
 *
 * Duas escolhas de método que mudam a leitura do número:
 *
 *   1. A coleta aqui NÃO aplica a janela de horas. `collectAllNews` corta em
 *      24h ou 72h conforme a fonte; este script pega tudo que o feed entrega e
 *      separa por data de publicação. É assim que se enxerga vários dias numa
 *      execução só, e é também por isso que o dia mais antigo da amostra é
 *      sempre subestimado: o feed já descartou parte dele.
 *
 *   2. Os tetos de pauta são levantados de propósito. Medir capacidade com
 *      `EDITORIAL_MAX_PAUTAS=4` responderia "quatro", que é a configuração, não
 *      a capacidade.
 *
 * Não publica, não agenda, não grava em tabela nenhuma.
 *
 *   npx tsx src/scripts/medir-capacidade-social.ts --saida=capacidade.md
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
  if (Number.isNaN(d.getTime())) return "sem-data";
  return d.toLocaleDateString("en-CA", { timeZone: FUSO });
}

const AGREGADORES = new Set(["news.google.com", "news.yahoo.com", "flipboard.com"]);

function contar<T>(itens: T[], chave: (x: T) => string): Array<[string, number]> {
  const mapa = new Map<string, number>();
  for (const item of itens) {
    const k = chave(item) || "(vazio)";
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
}

async function main() {
  carregarEnv();

  const argv = process.argv.slice(2);
  const valor = (nome: string) => {
    const achado = argv.find((a) => a.startsWith(`--${nome}=`));
    return achado ? achado.split("=").slice(1).join("=") : null;
  };

  const saida = valor("saida") ?? "capacidade-social.md";
  const diasParaAvaliar = Number(valor("dias") ?? 3);
  const soColeta = argv.includes("--so-coleta");
  const comDistribuicao = argv.includes("--distribuicao") || argv.includes("--so-distribuicao");
  const soDistribuicao = argv.includes("--so-distribuicao");

  /*
   * Tetos levantados só neste processo.
   *
   * Vale para a medição, nunca para produção: nada aqui escreve em lugar
   * nenhum, e o processo morre no fim.
   */
  process.env.EDITORIAL_MAX_PAUTAS = "40";
  process.env.EDITORIAL_MAX_PAUTAS_BRASIL = "40";
  process.env.EDITORIAL_MIN_PAUTAS = "1";

  const linhas: string[] = [];
  const escrever = (l: string = "") => {
    linhas.push(l);
    console.log(l);
  };

  const project = await requireActiveProject(DEFAULT_PROJECT_ID);
  const doBanco = await getProjectNewsSources(project.id);

  /*
   * As fontes novas entram do arquivo, não do banco.
   *
   * O objetivo é comparar a cobertura antes e depois sem tocar em produção:
   * `project_news_sources` continua como está, e o SQL de semente é entregue
   * para revisão. Com `--com-fontes-novas` a medição roda contra o conjunto
   * ampliado; sem a bandeira, contra o que está no ar hoje.
   */
  const novas = argv.includes("--com-fontes-novas")
    ? fontesDeOportunidade.filter((f) => !doBanco.some((b) => b.url === f.url))
    : [];

  const fontes = [...doBanco, ...novas];

  escrever(`# Capacidade editorial diária, ${project.slug}`);
  escrever();
  escrever(`Medido em ${new Date().toISOString()}. Fuso das datas: ${FUSO}.`);
  escrever();

  // ------------------------------------------------------------------
  // 1. Coleta, sem a janela de horas.
  // ------------------------------------------------------------------
  escrever(`## 1. Coleta bruta`);
  escrever();
  escrever(
    `${fontes.length} fonte(s): ${doBanco.length} do banco` +
      (novas.length > 0 ? ` mais ${novas.length} de oportunidade, ainda não aplicadas em produção` : ""),
  );
  escrever();

  const porFonte: Array<{ nome: string; dominio: string; janela: number; itens: NewsCandidate[]; erro?: string }> = [];

  await Promise.all(
    fontes
      .filter((f) => f.enabled)
      .map(async (fonte) => {
        try {
          const itens = await collectFromSource(fonte, fetch);
          porFonte.push({
            nome: fonte.name,
            dominio: dominioDe(fonte.url),
            janela: janelaDaFonte(fonte),
            itens,
          });
        } catch (erro) {
          porFonte.push({
            nome: fonte.name,
            dominio: dominioDe(fonte.url),
            janela: janelaDaFonte(fonte),
            itens: [],
            erro: (erro as Error).message,
          });
        }
      }),
  );

  porFonte.sort((a, b) => b.itens.length - a.itens.length);

  escrever(`| fonte | domínio | janela | itens | erro |`);
  escrever(`| --- | --- | --- | --- | --- |`);
  for (const f of porFonte) {
    escrever(`| ${f.nome} | ${f.dominio} | ${f.janela}h | ${f.itens.length} | ${f.erro ? f.erro.slice(0, 40) : ""} |`);
  }
  escrever();

  const todas = porFonte.flatMap((f) => f.itens);
  escrever(`**${todas.length} itens no total**, antes de qualquer filtro.`);
  escrever();

  // ------------------------------------------------------------------
  // 2. Distribuição por dia de publicação.
  // ------------------------------------------------------------------
  const porDia = new Map<string, NewsCandidate[]>();
  for (const c of todas) {
    const dia = diaDe(c.published_at);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia)!.push(c);
  }

  const diasOrdenados = [...porDia.keys()].filter((d) => d !== "sem-data").sort().reverse();

  escrever(`## 2. Distribuição por dia`);
  escrever();
  escrever(`| dia | coletadas | únicas após dedup | fonte direta | via agregador |`);
  escrever(`| --- | --- | --- | --- | --- |`);

  const grupoPorDia = new Map<string, ReturnType<typeof deduplicateCandidates>["uniqueGroups"]>();

  for (const dia of diasOrdenados) {
    const doDia = porDia.get(dia)!;
    const { uniqueGroups } = deduplicateCandidates(doDia);
    grupoPorDia.set(dia, uniqueGroups);

    const agregador = uniqueGroups.filter((g) => AGREGADORES.has(dominioDe(g.primary.url))).length;
    escrever(
      `| ${dia} | ${doDia.length} | ${uniqueGroups.length} | ${uniqueGroups.length - agregador} | ${agregador} |`,
    );
  }
  escrever();
  escrever(
    `"Fonte direta" é a pauta que já chega com o veículo de origem. "Via agregador" chega pelo Google News ` +
      `e só vira pauta publicável depois de resolvida para a fonte original; sem isso, é ` +
      `\`REJECT_SOURCE_UNRESOLVED\`. A coluna mede o trabalho de resolução pendente, não descarte.`,
  );
  escrever();
  escrever(
    `O dia mais antigo da amostra é subestimado: o feed já descartou parte dele antes desta coleta.`,
  );
  escrever();

  if (soColeta) {
    escreverRelatorio(saida, linhas.join("\n"));
    console.log(`\nRelatório em ${saida}`);
    return;
  }

  // ------------------------------------------------------------------
  // 2b. Distribuição da classificação, antes de qualquer corte.
  //
  // O funil diz quantas sobraram. Isto diz onde elas param, que é a pergunta
  // que decide se dez posts por dia é meta ou é slot vazio.
  // ------------------------------------------------------------------
  if (comDistribuicao) {
    escrever(`## 2b. Onde as candidatas param`);
    escrever();

    for (const dia of diasOrdenados.slice(0, diasParaAvaliar)) {
      const grupos = grupoPorDia.get(dia)!;
      if (grupos.length === 0) continue;

      console.log(`\n[DISTRIBUIÇÃO] ${dia}: classificando ${grupos.length}...`);

      const { classificacoes, lotesComFalha } = await classificarPautas(
        grupos.map((g) => ({
          id: g.primary.id,
          titulo: g.primary.title,
          descricao: g.primary.description || g.primary.content || "",
          fonte: g.primary.source_name,
          url: g.primary.url,
        })),
        process.env,
        fetch,
      );

      const cs = [...classificacoes.values()];

      escrever(`### ${dia}`);
      escrever();
      escrever(
        `${cs.length} de ${grupos.length} classificadas. ` +
          `${grupos.length - cs.length} sem classificação` +
          (lotesComFalha.length > 0 ? `: ${lotesComFalha.join(" ; ")}` : "."),
      );
      escrever();

      escrever(`| relevância | total | EUA | Brasil | imigração | EUA oportunidade | EUA desfavorável |`);
      escrever(`| --- | --- | --- | --- | --- | --- | --- |`);
      for (let n = 10; n >= 0; n--) {
        const nesse = cs.filter((c) => Math.round(c.relevancia) === n);
        if (nesse.length === 0) continue;
        escrever(
          `| ${n} | ${nesse.length} | ${nesse.filter((c) => c.pais === "EUA").length} | ` +
            `${nesse.filter((c) => c.pais === "Brasil").length} | ${nesse.filter((c) => c.imigracao).length} | ` +
            `${nesse.filter((c) => c.pais === "EUA" && c.leitura === "oportunidade").length} | ` +
            `${nesse.filter((c) => c.pais === "EUA" && c.leitura === "desfavoravel").length} |`,
        );
      }
      escrever();

      escrever(`Quantas sobreviveriam a cada piso de relevância, já sem as EUA desfavoráveis:`);
      escrever();
      escrever(`| piso | passam | EUA | Brasil | eixos distintos |`);
      escrever(`| --- | --- | --- | --- | --- |`);
      for (const piso of [6, 5, 4, 3, 2]) {
        const passam = cs.filter(
          (c) => c.relevancia >= piso && !(c.pais === "EUA" && c.leitura === "desfavoravel"),
        );
        const eixos = new Set(passam.map((c) => c.eixo));
        escrever(
          `| ${piso} | ${passam.length} | ${passam.filter((c) => c.pais === "EUA").length} | ` +
            `${passam.filter((c) => c.pais === "Brasil").length} | ${eixos.size} |`,
        );
      }
      escrever();
    }
  }

  if (soDistribuicao) {
    escreverRelatorio(saida, linhas.join("\n"));
    console.log(`\nRelatório em ${saida}`);
    return;
  }

  // ------------------------------------------------------------------
  // 3. Funil editorial, dia a dia.
  // ------------------------------------------------------------------
  const config = carregarConfigEditorial(process.env);
  const store = criarHistoricoStore(getSupabaseAdminClient());
  const historico = await store.janela(project.id, config.janelaDeDias);

  escrever(`## 3. Funil editorial`);
  escrever();
  escrever(`Histórico consultado: ${historico.length} registro(s) na janela de ${config.janelaDeDias} dias.`);
  escrever(`Tetos levantados para a medição: máximo ${config.maximoDePautas}, Brasil ${config.maximoDePautasBrasil}.`);
  escrever();

  let custoTotal = 0;
  let tokensTotais = 0;
  const resumoPorDia: Array<{
    dia: string;
    unicas: number;
    antesDoTeto: number;
    aprovadas: number;
    eua: number;
    brasil: number;
    recusas: Array<[string, number]>;
    eixos: Array<[string, number]>;
    entidades: Array<[string, number]>;
    titulos: Array<{
      titulo: string;
      pais: string;
      eixo: string;
      nota: number;
      fonte: string;
      url: string;
      naEdicao: boolean;
      imigracao: boolean;
      leitura: string;
      ator: string;
    }>;
  }> = [];

  for (const dia of diasOrdenados.slice(0, diasParaAvaliar)) {
    const grupos = grupoPorDia.get(dia)!;
    if (grupos.length === 0) continue;

    console.log(`\n[MEDIÇÃO] ${dia}: avaliando ${grupos.length} grupo(s)...`);

    const r = await avaliarPautas(grupos, {
      canal: "instagram",
      historico,
      config,
      provedorDeVetor: criarProvedorOpenAI(process.env, fetch),
      env: process.env,
      fetcher: fetch,
    });

    custoTotal += r.custoUsd;
    tokensTotais += r.tokens.total;

    const eua = r.selecionadas.filter((p) => p.classificacao.pais === "EUA").length;
    const brasil = r.selecionadas.filter((p) => p.classificacao.pais === "Brasil").length;

    /*
     * Capacidade é o que passou no filtro, não o que coube na edição.
     *
     * `selecionadas` já veio cortada por teto global, teto Brasil, 2 por ator
     * e 2 por domínio. Medir capacidade por ela seria medir a configuração.
     */
    const antesDoTeto = r.approvedEditorialPool.length;

    resumoPorDia.push({
      dia,
      unicas: grupos.length,
      antesDoTeto,
      aprovadas: r.selecionadas.length,
      eua,
      brasil,
      recusas: contar(r.recusadas, (x) => x.motivo),
      eixos: contar(r.approvedEditorialPool, (p) => p.classificacao.eixo),
      entidades: contar(
        r.approvedEditorialPool.flatMap((p) => [...p.classificacao.atores, ...p.classificacao.lugares]),
        (x) => x,
      ),
      titulos: r.approvedEditorialPool
        .slice()
        .sort((a, b) => b.pontuacao.total - a.pontuacao.total)
        .map((p) => ({
          titulo: p.grupo.primary.title,
          pais: p.classificacao.pais,
          eixo: p.classificacao.eixo,
          nota: p.pontuacao.total,
          fonte: p.grupo.primary.source_name,
          url: p.grupo.primary.url,
          naEdicao: r.selecionadas.some((s2) => s2.storyId === p.storyId),
          imigracao: p.classificacao.imigracao,
          leitura: p.classificacao.leitura,
          ator: p.classificacao.atores[0] ?? "",
        })),
    });
  }

  escrever(`| dia | únicas | passam no filtro | cabem na edição | EUA | Brasil | eixos |`);
  escrever(`| --- | --- | --- | --- | --- | --- | --- |`);
  for (const d of resumoPorDia) {
    escrever(
      `| ${d.dia} | ${d.unicas} | **${d.antesDoTeto}** | ${d.aprovadas} | ${d.eua} | ${d.brasil} | ${d.eixos.length} |`,
    );
  }
  escrever();
  escrever(
    `A diferença entre as duas colunas do meio é o corte de \`ordenarESelecionar\`: teto global, teto Brasil, ` +
      `e dois tetos NÃO configuráveis, 2 por ator e 2 por domínio, escritos como valor padrão de parâmetro ` +
      `em \`pontuacao.ts\` e nunca passados pela guarda. O que eles cortam não aparece em \`recusadas\`.`,
  );
  escrever();

  const aprovadas = resumoPorDia.map((d) => d.antesDoTeto).sort((a, b) => a - b);
  if (aprovadas.length > 0) {
    const mediana = aprovadas[Math.floor(aprovadas.length / 2)];
    const media = aprovadas.reduce((a, b) => a + b, 0) / aprovadas.length;
    escrever(
      `Passam no filtro por dia: mínimo ${aprovadas[0]}, mediana ${mediana}, ` +
        `média ${media.toFixed(1)}, máximo ${aprovadas[aprovadas.length - 1]}.`,
    );
    escrever();
  }

  for (const d of resumoPorDia) {
    escrever(`### ${d.dia}`);
    escrever();
    escrever(`Recusas: ${d.recusas.map(([m, n]) => `${m} ${n}`).join(", ") || "nenhuma"}`);
    escrever();
    escrever(`Eixos: ${d.eixos.map(([e, n]) => `${e} ${n}`).join(", ") || "nenhum"}`);
    escrever();
    const repetidas = d.entidades.filter(([, n]) => n > 1);
    escrever(`Entidades repetidas: ${repetidas.map(([e, n]) => `${e} ${n}x`).join(", ") || "nenhuma"}`);
    escrever();
    escrever(`| # | canal | país | imig | leitura | eixo | nota | pauta | fonte |`);
    escrever(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
    d.titulos.forEach((t, i) => {
      escrever(
        `| ${i + 1} | ${t.naEdicao ? "newsletter+IG" : "só IG"} | ${t.pais} | ${t.imigracao ? "sim" : "não"} | ` +
          `${t.leitura} | ${t.eixo} | ${t.nota} | ${t.titulo.slice(0, 70)} | ${t.fonte} |`,
      );
    });
    escrever();
    const atores = contar(d.titulos, (t) => t.ator).filter(([a]) => a !== "(vazio)");
    const dominios = contar(d.titulos, (t) => {
      try {
        return new URL(t.url).hostname.replace(/^www\./, "");
      } catch {
        return "(url inválida)";
      }
    });
    escrever(`Concentração por ator principal: ${atores.map(([a, n]) => `${a} ${n}x`).join(", ") || "nenhuma"}`);
    escrever();
    escrever(`Concentração por domínio: ${dominios.map(([a, n]) => `${a} ${n}x`).join(", ")}`);
    escrever();
  }

  escrever(`## 4. Custo da medição`);
  escrever();
  escrever(`US$ ${custoTotal.toFixed(4)} em ${tokensTotais.toLocaleString("pt-BR")} tokens, para ${resumoPorDia.length} dia(s).`);
  escrever();
  escrever(
    `O valor em dólar é referência: \`calculateCost\` usa uma tabela de preços que não cobre o modelo em uso. ` +
      `O número de tokens é o dado confiável.`,
  );

  escreverRelatorio(saida, linhas.join("\n"));
  console.log(`\nRelatório em ${saida}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
