import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, requireActiveProject } from "../lib/server/projects";
import { CATALOGO_EVERGREEN } from "../lib/server/social/evergreen/catalogo";
import { prepararEvergreen } from "../lib/server/social/evergreen/ciclo";
import { calcularVagas } from "../lib/server/social/evergreen/compositor";
import { identidadeDoItem, todosOsItens } from "../lib/server/social/evergreen/tipos";
import type { UsoAnterior } from "../lib/server/social/evergreen/tipos";
import { carregarConfigSocial } from "../lib/server/social/selecao";
import { escreverRelatorio } from "./relatorio";

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

    porDia.push({
      dia,
      noticias,
      elegiveis: r.diagnostico.elegiveis,
      escolhidos: escolhidos.length,
      cortados: r.diagnostico.cortadosPorMotivo,
      total: noticias + escolhidos.length,
      familias,
      itens: escolhidos,
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
