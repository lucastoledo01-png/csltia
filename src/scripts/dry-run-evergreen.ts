import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, requireActiveProject } from "../lib/server/projects";
import { CATALOGO_EVERGREEN } from "../lib/server/social/evergreen/catalogo";
import {
  decisorDeFormato,
  pacotesDoEvergreen,
  prepararEvergreen,
  verificadorDeClaims,
} from "../lib/server/social/evergreen/ciclo";
import { rodarCicloSocial } from "../lib/server/social/pipeline-v2";
import { calcularVagas } from "../lib/server/social/evergreen/compositor";
import { identidadeDoItem, todosOsItens } from "../lib/server/social/evergreen/tipos";
import type { UsoAnterior } from "../lib/server/social/evergreen/tipos";
import { carregarConfigSocial } from "../lib/server/social/selecao";
import { escreverRelatorio } from "./relatorio";
import { alternarFormatos, determinarFormatoEvergreen } from "../lib/server/social/carrossel/formato";
import { levaCta } from "../lib/server/social/copy";

/** A keyword do funil. Não é lida do banco aqui: o que importa é existir. */
const MARCA_KEYWORD = "NEWS";

/**
 * Sete dias de feed, com e sem conteúdo permanente.
 *
 * A pergunta é uma só: o evergreen resolve a capacidade? A medição do News V2
 * deu 0,9 post por dia contra um alvo de 10, com quatro dos sete dias em zero.
 * O que interessa não é o evergreen "funcionar", é o feed deixar de ter dias
 * vazios sem virar um glossário repetitivo.
 *
 * Duas escolhas de método:
 *
 *   1. A quantidade de notícias por dia vem da medição real de 02 a 08 de
 *      setembro, e não de uma simulação nova. Rodar a coleta e a classificação
 *      de sete dias custaria dezenas de dólares para reproduzir números que já
 *      foram medidos, e o que se está medindo aqui é o comportamento do
 *      evergreen diante deles.
 *
 *   2. O lastro NÃO é buscado. Cada item conta como publicável, porque o que
 *      se mede é seleção, cooldown e diversidade ao longo de sete dias. Buscar
 *      a fonte oficial de cada item de cada dia seriam centenas de requisições
 *      para medir outra coisa. O `--com-lastro` liga a busca de verdade para um
 *      dia só.
 *
 * Nada é gravado, nada é publicado.
 *
 *   npx tsx src/scripts/dry-run-evergreen.ts --saida=/tmp/evergreen-7-dias.md
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

/**
 * Notícias válidas por dia, do funil real de 02 a 08 de setembro de 2026.
 *
 * Estes são os posts que o News V2 produziu de fato, já depois da linha
 * editorial, do verificador e da composição.
 */
const NOTICIAS_MEDIDAS: Array<{ dia: string; noticias: number; programas: string[] }> = [
  { dia: "2026-09-02", noticias: 3, programas: [] },
  { dia: "2026-09-03", noticias: 0, programas: [] },
  { dia: "2026-09-04", noticias: 1, programas: [] },
  { dia: "2026-09-05", noticias: 0, programas: [] },
  { dia: "2026-09-06", noticias: 0, programas: [] },
  { dia: "2026-09-07", noticias: 0, programas: [] },
  { dia: "2026-09-08", noticias: 2, programas: [] },
];

const mediana = (ns: number[]) => {
  const o = [...ns].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

async function main() {
  carregarEnv();
  const argv = process.argv.slice(2);
  const saida = argv.find((a) => a.startsWith("--saida="))?.split("=")[1] ?? "/tmp/evergreen-7-dias.md";
  const comLastro = argv.includes("--com-lastro");
  /*
   * Gerar a copy de verdade é o que responde a pergunta do item 14: a segurança
   * nova derrubou capacidade? Só quem gera sabe quantos posts o Guard e a
   * auditoria semântica DERRUBAM, quantos reparos deram certo e quantos slides
   * saíram por claim sem lastro.
   *
   * Sem arte: o congelamento só existe no ramo enforce, e desenhar 28 posts
   * levaria muito mais tempo do que a medição pede.
   */
  const comGeracao = argv.includes("--com-geracao");
  if (comGeracao && !comLastro) {
    throw new Error("--com-geracao exige --com-lastro: sem pacote factual não há o que verificar.");
  }

  const project = await requireActiveProject(DEFAULT_PROJECT_ID);
  const configSocial = carregarConfigSocial(process.env);

  const linhas: string[] = [];
  const escrever = (l = "") => {
    linhas.push(l);
    console.log(l);
  };

  escrever(`# Sete dias de feed, com e sem conteúdo permanente`);
  escrever();
  escrever(
    `Catálogo: ${CATALOGO_EVERGREEN.length} tópicos, ${todosOsItens(CATALOGO_EVERGREEN).length} combinações. ` +
      `Teto do dia: ${configSocial.maximoPorDia}. Projeto: ${project.slug}.`,
  );
  escrever();
  escrever(
    `As notícias por dia são as do funil real de 02 a 08/09. O lastro ${comLastro ? "é buscado nas fontes oficiais" : "não é buscado: mede-se seleção, cooldown e diversidade"}.`,
  );
  escrever();

  /*
   * O histórico acumula ao longo da simulação.
   *
   * É o que faz o sétimo dia enfrentar o cooldown dos seis anteriores. Sem
   * isso, cada dia começaria com o catálogo inteiro disponível e a medição
   * diria que a repetição nunca acontece.
   */
  const historico: UsoAnterior[] = [];
  const porDia: Array<{
    dia: string;
    noticias: number;
    elegiveis: number;
    escolhidos: number;
    cortados: Record<string, number>;
    total: number;
    familias: Record<string, number>;
    itens: string[];
    formatos: Array<{ storyId: string; formato: string; slides: number; estrutura: string; fatos: number }>;
    /** Selecionados que a fonte oficial não sustentou. */
    semLastro: number;
    geracao: {
      gerados: number;
      carrossel: number;
      estatico: number;
      slides: number[];
      descartados: Array<{ storyId: string; etapa: string; motivo: string }>;
      reparos: number;
      reparosQueSalvaram: number;
      slidesRemovidos: string[];
      claims: number;
      claimsReprovadas: number;
    } | null;
  }> = [];

  for (const { dia, noticias, programas } of NOTICIAS_MEDIDAS) {
    const agoraMs = Date.parse(`${dia}T09:00:00Z`);

    const r = await prepararEvergreen({
      projectId: project.id,
      noticiasNoDia: noticias,
      maximoPorDia: configSocial.maximoPorDia,
      programasDaNoticia: programas,
      historico,
      agoraMs,
      modoForcado: "dry_run",
      env: process.env,
      ...(comLastro
        ? {}
        : {
            /*
             * Lastro presumido: cada item selecionado conta como publicável.
             * O que se mede aqui é a régua de repetição, não a resposta das
             * páginas do USCIS.
             */
            montarLastroDosItens: (async (itens: Array<{ topico: unknown; angulo: unknown }>) => ({
              lastros: itens.map((item) => ({
                item: item as never,
                storyId: identidadeDoItem(item as never),
                pacote: { texto_de_origem: "lastro presumido na simulação" } as never,
                fontes: [],
              })),
              custoUsd: 0,
              tokens: 0,
            })) as never,
        }),
    });

    const escolhidos = r.extras.map((p) => p.storyId);
    for (const storyId of escolhidos) {
      historico.push({
        storyId,
        topicId: storyId.split(":").slice(0, 2).join(":"),
        quandoIso: new Date(agoraMs).toISOString(),
      });
    }

    const familias: Record<string, number> = {};
    for (const p of r.extras) {
      const f = p.grupo.primary.category;
      familias[f] = (familias[f] ?? 0) + 1;
    }

    /*
     * O formato de cada item, decidido com o MESMO código da produção.
     *
     * A posição importa: ela decide se o post leva CTA, e o CTA ocupa um slide.
     * A notícia vem primeiro no dia, então o evergreen começa na posição
     * seguinte à última notícia, igual ao que o gerador faz.
     */
    const formatos = r.lastros
      .filter((l) => l.pacote)
      .map((l, i) => {
        const posicao = noticias + i;
        const d = determinarFormatoEvergreen(l.item, l.pacote!, {
          comCta: levaCta(posicao) && Boolean(MARCA_KEYWORD),
        });
        return {
          storyId: l.storyId,
          formato: d.formato,
          slides: d.slides,
          estrutura: d.estrutura ?? "-",
          fatos: d.fatosUteis,
        };
      });

    /*
     * A geração roda com as MESMAS opções da produção, menos a arte.
     *
     * O decisor de formato e o verificador de claims vêm dos mesmos
     * construtores que `ciclo-do-dia` usa, e não de dublês: medir com dublê
     * responderia sobre o dublê.
     */
    let geracao: (typeof porDia)[number]["geracao"] = null;

    if (comGeracao && r.extras.length > 0) {
      const ciclo = await rodarCicloSocial([], {
        projectId: project.id,
        slugDoProjeto: project.slug,
        editionDate: dia,
        marca: {
          nome: project.brand.displayName || project.name,
          nicho: project.niche,
          extra: project.editorialPromptExtra ?? "",
          keyword: "",
        },
        historico: [],
        pacotes: pacotesDoEvergreen(r.lastros),
        candidatas: r.candidatas,
        extras: r.extras,
        decidirCarrossel: decisorDeFormato(r.lastros),
        verificarClaims: verificadorDeClaims({ env: process.env, fetcher: fetch }),
        config: configSocial,
        env: { ...process.env, SOCIAL_PIPELINE_V2: "dry_run" },
        fetcher: fetch,
        agoraMs: Date.parse(`${dia}T03:00:00Z`),
      });

      const carrosseis = ciclo.previews.filter((p) => p.post.carrossel);
      const claims = carrosseis.flatMap((p) => p.post.carrossel!.claims);

      geracao = {
        gerados: ciclo.previews.length,
        carrossel: carrosseis.length,
        estatico: ciclo.previews.length - carrosseis.length,
        slides: carrosseis.map((p) => p.post.carrossel!.papeis.length),
        descartados: ciclo.descartados.map((d) => ({
          storyId: d.storyId,
          etapa: d.etapa,
          motivo: d.motivo,
        })),
        reparos: ciclo.previews.reduce((a, p) => a + p.post.reparosAplicados.length, 0),
        reparosQueSalvaram: ciclo.previews.filter((p) => p.post.reparosAplicados.length > 0).length,
        slidesRemovidos: carrosseis.flatMap((p) => p.post.carrossel!.removidos),
        claims: claims.length,
        claimsReprovadas: claims.filter((c) => !c.sustentada).length,
      };

      console.log(
        `[${dia}] gerados ${geracao.gerados}, descartados ${geracao.descartados.length}, ` +
          `reparos ${geracao.reparos}, claims ${geracao.claims} (${geracao.claimsReprovadas} reprovadas)`,
      );
    }

    porDia.push({
      dia,
      noticias,
      elegiveis: r.diagnostico.elegiveis,
      escolhidos: escolhidos.length,
      cortados: r.diagnostico.cortadosPorMotivo,
      total: noticias + escolhidos.length,
      familias,
      itens: escolhidos,
      formatos,
      semLastro: r.diagnostico.semLastro.length,
      geracao,
    });
  }

  escrever(`## Dia a dia`);
  escrever();
  escrever(`| dia | News | vagas | elegíveis | Evergreen | total | teto | cooldown | janela | programa | família |`);
  escrever(`| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
  for (const d of porDia) {
    const v = calcularVagas(d.noticias, configSocial.maximoPorDia);
    escrever(
      `| ${d.dia} | ${d.noticias} | ${v.restantes} | ${d.elegiveis} | ${d.escolhidos} | **${d.total}** | ` +
        `${d.cortados.TETO_DO_DIA ?? 0} | ${d.cortados.COOLDOWN_DO_PAR ?? 0} | ${d.cortados.TOPICO_NA_JANELA ?? 0} | ` +
        `${d.cortados.PROGRAMA_JA_NO_DIA ?? 0} | ${d.cortados.FAMILIA_JA_NO_DIA ?? 0} |`,
    );
  }
  escrever();

  const soNews = porDia.map((d) => d.noticias);
  const comEvergreen = porDia.map((d) => d.total);
  const media = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;

  escrever(`## News sozinho contra News + Evergreen`);
  escrever();
  escrever(`| métrica | News sozinho | News + Evergreen |`);
  escrever(`| --- | ---: | ---: |`);
  escrever(`| média por dia | ${media(soNews).toFixed(1)} | **${media(comEvergreen).toFixed(1)}** |`);
  escrever(`| mediana | ${mediana(soNews)} | **${mediana(comEvergreen)}** |`);
  escrever(`| mínimo | ${Math.min(...soNews)} | **${Math.min(...comEvergreen)}** |`);
  escrever(`| máximo | ${Math.max(...soNews)} | **${Math.max(...comEvergreen)}** |`);
  escrever(`| dias em zero | ${soNews.filter((n) => n === 0).length} de 7 | **${comEvergreen.filter((n) => n === 0).length} de 7** |`);
  escrever(`| total na semana | ${soNews.reduce((a, b) => a + b, 0)} | **${comEvergreen.reduce((a, b) => a + b, 0)}** |`);
  escrever();

  escrever(`## Diversidade na semana`);
  escrever();
  const familiaNaSemana: Record<string, number> = {};
  const topicosUsados = new Set<string>();
  for (const d of porDia) {
    for (const [f, n] of Object.entries(d.familias)) familiaNaSemana[f] = (familiaNaSemana[f] ?? 0) + n;
    for (const i of d.itens) topicosUsados.add(i.split(":").slice(0, 2).join(":"));
  }
  escrever(`| família | posts na semana |`);
  escrever(`| --- | ---: |`);
  for (const [f, n] of Object.entries(familiaNaSemana).sort((a, b) => b[1] - a[1])) {
    escrever(`| ${f} | ${n} |`);
  }
  escrever();
  escrever(
    `${topicosUsados.size} tópicos distintos em ${historico.length} posts. ` +
      `Nenhum par tópico+ângulo repetiu: ${new Set(historico.map((h) => h.storyId)).size === historico.length ? "confirmado" : "**FALHOU**"}.`,
  );
  escrever();

  escrever(`## Formatos`);
  escrever();

  const todosOsFormatos = porDia.flatMap((d) => d.formatos);
  const carrosseis = todosOsFormatos.filter((f) => f.formato === "carousel");
  const estaticos = todosOsFormatos.filter((f) => f.formato === "static");
  const noticiasNaSemana = soNews.reduce((a, b) => a + b, 0);

  /*
   * Sem lastro, formato NAO e medicao, e o relatorio precisa dizer isso.
   *
   * A guarda olhava a lista estar vazia, e ela nunca esta: sem lastro o pacote
   * falso nao tem `verified_facts`, `fatosQueViramSlide` devolve zero, e todo
   * item sai `static`. O relatorio entao imprimia "Evergreen carousel 0" e
   * "0% em carrossel" com cara de numero medido. Quem manda e a flag.
   */
  if (!comLastro || todosOsFormatos.length === 0) {
    escrever(
      `Sem lastro buscado, o formato NÃO foi medido: ele depende de quantos fatos o pacote ` +
        `factual sustenta, e o pacote presumido desta simulação não tem fato nenhum. ` +
        `Rode com \`--com-lastro\` para medir formato.`,
    );
    escrever();
  } else {
    const mediaDeSlides = carrosseis.length
      ? carrosseis.reduce((a, f) => a + f.slides, 0) / carrosseis.length
      : 0;

    escrever(`| métrica | valor |`);
    escrever(`| --- | ---: |`);
    escrever(`| News static | ${noticiasNaSemana} |`);
    escrever(`| Evergreen static | ${estaticos.length} |`);
    escrever(`| Evergreen carousel | **${carrosseis.length}** |`);
    escrever(`| média de slides por carrossel | ${mediaDeSlides.toFixed(1)} |`);
    escrever(
      `| % do Evergreen em carrossel | **${((carrosseis.length / todosOsFormatos.length) * 100).toFixed(0)}%** |`,
    );
    escrever(`| posts por dia na semana | ${media(comEvergreen).toFixed(1)} |`);
    escrever();

    escrever(`### Por estrutura`);
    escrever();
    const porEstrutura: Record<string, number> = {};
    for (const f of carrosseis) porEstrutura[f.estrutura] = (porEstrutura[f.estrutura] ?? 0) + 1;
    escrever(`| estrutura | carrosséis |`);
    escrever(`| --- | ---: |`);
    for (const [e, n] of Object.entries(porEstrutura).sort((a, b) => b[1] - a[1])) {
      escrever(`| ${e} | ${n} |`);
    }
    escrever();

    escrever(`### Sequência de formatos, dia a dia`);
    escrever();
    escrever(
      `A notícia é sempre estática nesta fase e vem primeiro. A intercalação age só na cauda, ` +
        `e o que se olha aqui é se o dia alterna em vez de empilhar quatro peças iguais.`,
    );
    escrever();
    escrever(`| dia | sequência |`);
    escrever(`| --- | --- |`);
    for (const d of porDia) {
      const cauda = alternarFormatos(d.formatos, (f) => (f.formato === "carousel" ? "carousel" : "static"));
      const sequencia = [
        ...Array.from({ length: d.noticias }, () => "S"),
        ...cauda.map((f) => (f.formato === "carousel" ? `C${f.slides}` : "S")),
      ];
      escrever(`| ${d.dia} | ${sequencia.join(" ") || "(dia vazio)"} |`);
    }
    escrever();

    const maiorSequencia = Math.max(
      ...porDia.map((d) => {
        const cauda = alternarFormatos(d.formatos, (f) => (f.formato === "carousel" ? "carousel" : "static"));
        let maior = 0;
        let corrente = 0;
        let anterior = "";
        for (const f of cauda) {
          corrente = f.formato === anterior ? corrente + 1 : 1;
          anterior = f.formato;
          maior = Math.max(maior, corrente);
        }
        return maior;
      }),
    );
    escrever(`Maior sequência do mesmo formato dentro da cauda de um dia: **${maiorSequencia}**.`);
    escrever();
  }

  /*
   * O que a segurança nova custou em capacidade.
   *
   * É a pergunta do item 14, e ela só tem resposta com geração de verdade: sem
   * gerar, não se sabe quantos posts o Guard e a auditoria semântica derrubam.
   */
  const comGer = porDia.filter((d) => d.geracao).map((d) => ({ dia: d.dia, g: d.geracao! }));

  if (comGer.length > 0) {
    escrever(`## Capacidade depois da verificação`);
    escrever();

    const soma = (f: (g: (typeof comGer)[number]["g"]) => number) => comGer.reduce((a, x) => a + f(x.g), 0);
    const selecionadosNaSemana = porDia.reduce((a, d) => a + d.escolhidos, 0);
    const gerados = soma((g) => g.gerados);
    const noticiasNaSemana = porDia.reduce((a, d) => a + d.noticias, 0);
    const slides = comGer.flatMap((x) => x.g.slides);

    const porEtapa: Record<string, number> = {};
    const porMotivo: Record<string, number> = {};
    for (const x of comGer) {
      for (const d of x.g.descartados) {
        porEtapa[d.etapa] = (porEtapa[d.etapa] ?? 0) + 1;
        const chave =
          /CLAIM_UNSUPPORTED/.test(d.motivo)
            ? "claim sem lastro"
            : /CLAIM_NOT_AUDITED/.test(d.motivo)
              ? "auditoria não rodou"
              : /SLIDE_GROUNDING/.test(d.motivo)
                ? "número sem lastro no slide"
                : /SLIDE_SHAPE|SLIDE_DENSITY/.test(d.motivo)
                  ? "forma do slide"
                  : /LEGAL_JARGON|LOW_READER|HEADLINE_TOO_LONG/.test(d.motivo)
                    ? "linguagem do leitor"
                    : /HEADLINE|GROUNDING/.test(d.motivo)
                      ? "ancoragem de manchete ou legenda"
                      : "outro";
        porMotivo[chave] = (porMotivo[chave] ?? 0) + 1;
      }
    }

    const cortadosPorCooldown = porDia.reduce(
      (a, d) => a + (d.cortados.COOLDOWN_DO_PAR ?? 0) + (d.cortados.TOPICO_NA_JANELA ?? 0),
      0,
    );
    const semLastroNaSemana = porDia.reduce((a, d) => a + (d.semLastro ?? 0), 0);

    escrever(`| métrica | valor |`);
    escrever(`| --- | ---: |`);
    escrever(`| News static | ${noticiasNaSemana} |`);
    escrever(`| Evergreen static | ${soma((g) => g.estatico)} |`);
    escrever(`| Evergreen carousel | **${soma((g) => g.carrossel)}** |`);
    escrever(
      `| % do Evergreen em carrossel | **${gerados > 0 ? ((soma((g) => g.carrossel) / gerados) * 100).toFixed(0) : 0}%** |`,
    );
    escrever(
      `| média de slides por carrossel | ${slides.length > 0 ? (slides.reduce((a, b) => a + b, 0) / slides.length).toFixed(1) : "0"} |`,
    );
    escrever(`| posts por dia (média) | **${((gerados + noticiasNaSemana) / porDia.length).toFixed(1)}** |`);
    escrever(`| mediana por dia | ${mediana(comGer.map((x) => x.g.gerados + 0))} |`);
    escrever(`| dias em zero | ${comGer.filter((x) => x.g.gerados === 0).length} de ${porDia.length} |`);
    escrever(`| total na semana | ${gerados + noticiasNaSemana} |`);
    escrever();

    escrever(`### O que a verificação custou`);
    escrever();
    escrever(`| etapa | posts |`);
    escrever(`| --- | ---: |`);
    escrever(`| selecionados pelas réguas de repetição | ${selecionadosNaSemana} |`);
    escrever(`| descartados por falta de lastro na fonte | ${semLastroNaSemana} |`);
    escrever(`| descartados na geração e na verificação | **${soma((g) => g.descartados.length)}** |`);
    escrever(`| publicáveis | **${gerados}** |`);
    escrever();

    if (Object.keys(porMotivo).length > 0) {
      escrever(`| motivo do descarte | posts |`);
      escrever(`| --- | ---: |`);
      for (const [m, n] of Object.entries(porMotivo).sort((a, b) => b[1] - a[1])) {
        escrever(`| ${m} | ${n} |`);
      }
      escrever();
    }

    escrever(`| régua de repetição | itens cortados na semana |`);
    escrever(`| --- | ---: |`);
    escrever(`| cooldown do par e janela do tópico | ${cortadosPorCooldown} |`);
    escrever(
      `| teto do dia e falta de vaga | ${porDia.reduce((a, d) => a + (d.cortados.TETO_DO_DIA ?? 0) + (d.cortados.SEM_VAGA ?? 0), 0)} |`,
    );
    escrever();

    escrever(`### Reparo e remoção de slide`);
    escrever();
    escrever(`| métrica | valor |`);
    escrever(`| --- | ---: |`);
    escrever(`| reparos aplicados | ${soma((g) => g.reparos)} |`);
    escrever(`| posts que só passaram DEPOIS de reparo | **${soma((g) => g.reparosQueSalvaram)}** |`);
    escrever(`| slides removidos por claim sem lastro | ${soma((g) => g.slidesRemovidos.length)} |`);
    escrever(`| claims semânticas detectadas | ${soma((g) => g.claims)} |`);
    escrever(`| claims reprovadas pela auditoria | **${soma((g) => g.claimsReprovadas)}** |`);
    escrever();

    const removidos = comGer.flatMap((x) => x.g.slidesRemovidos);
    if (removidos.length > 0) {
      escrever(`Papéis removidos: ${[...new Set(removidos)].join(", ")}.`);
      escrever();
    }
  }

  escrever(`## O que sobra no catálogo`);
  escrever();
  const usados = new Set(historico.map((h) => h.storyId));
  const total = todosOsItens(CATALOGO_EVERGREEN).length;
  const porSemana = usados.size;
  const sustentavel = total / 30;
  escrever(
    `${porSemana} de ${total} combinações usadas em uma semana, ${(porSemana / 7).toFixed(1)} por dia.`,
  );
  escrever();
  escrever(
    `O regime permanente que o catálogo sustenta é \`combinações / cooldown\` = ${total}/30 = ` +
      `**${sustentavel.toFixed(1)} por dia** ocupando o catálogo inteiro, sem folga para a janela do tópico ` +
      `nem para os tetos de diversidade. O teto configurado deixa margem sobre esse número.`,
  );
  escrever();
  escrever(
    porSemana / 7 <= sustentavel
      ? `Ritmo sustentável: o catálogo gira sem esgotar.`
      : `**Ritmo insustentável**: nesse passo o catálogo esgota em ${Math.floor((total / porSemana) * 7)} dias e o feed cai para zero.`,
  );
  escrever();
  escrever(`Nada foi gravado. Nada foi publicado. Nenhuma chamada à Meta.`);

  escreverRelatorio(saida, linhas.join("\n"));
  console.log(`\nRelatório em ${saida}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
