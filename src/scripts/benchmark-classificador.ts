import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, getProjectNewsSources, requireActiveProject } from "../lib/server/projects";
import { collectAllNews } from "../lib/server/newsroom/collector";
import { deduplicateCandidates } from "../lib/server/newsroom/deduplicator";
import { classificarPautas, decidirPauta } from "../lib/server/editorial/classificador";
import type { Classificacao } from "../lib/server/editorial/classificador";
import { carregarConfigEditorial } from "../lib/server/editorial/config";

/**
 * Modelo atual contra modelo menor, no mesmo conjunto de candidatas.
 *
 * A classificação é 90% do custo da rodada, então trocar por um modelo mais
 * barato é tentador. Trocar por preço, sem olhar o que muda na decisão, é como
 * escolher fonte de notícia por volume.
 *
 * Não existe gabarito aqui. O modelo atual é a referência, e o que se mede é
 * divergência, separando a que muda a decisão editorial da que não muda.
 *
 *   npx tsx src/scripts/benchmark-classificador.ts --menor=gpt-5.4-mini --n=100
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

type Amostra = { id: string; titulo: string; descricao: string; fonte: string; url: string };

async function rodar(modelo: string, amostra: Amostra[]) {
  const inicio = Date.now();
  const r = await classificarPautas(amostra, { ...process.env, OPENAI_MODEL_TRIAGE: modelo });
  return { ...r, modelo, segundos: (Date.now() - inicio) / 1000 };
}

function comparar(a: Classificacao | undefined, b: Classificacao | undefined) {
  if (!a || !b) return null;
  const config = carregarConfigEditorial();
  return {
    pais: a.pais === b.pais,
    leitura: a.leitura === b.leitura,
    imigracao: a.imigracao === b.imigracao,
    relevancia: Math.abs(a.relevancia - b.relevancia),
    entidades: intersecao(a.atores, b.atores),
    decisaoA: decidirPauta(a, config).aprovada,
    decisaoB: decidirPauta(b, config).aprovada,
  };
}

function intersecao(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const A = new Set(a.map((x) => x.toLowerCase()));
  const B = new Set(b.map((x) => x.toLowerCase()));
  let comum = 0;
  for (const x of A) if (B.has(x)) comum += 1;
  const uniao = new Set([...A, ...B]).size;
  return uniao === 0 ? 1 : comum / uniao;
}

async function main() {
  carregarEnv();
  const argv = process.argv.slice(2);
  const valor = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=") ?? null;

  const atual = process.env.OPENAI_MODEL_TRIAGE || "gpt-4o-mini";
  const menor = valor("menor") || "gpt-5.4-mini";
  const n = Number(valor("n") || 100);

  const project = await requireActiveProject(DEFAULT_PROJECT_ID);
  const sources = await getProjectNewsSources(project.id);
  const coleta = await collectAllNews(sources);
  const { uniqueGroups } = deduplicateCandidates(coleta.candidates);

  const amostra: Amostra[] = uniqueGroups.slice(0, n).map((g) => ({
    id: g.primary.id,
    titulo: g.primary.title,
    descricao: g.primary.description || g.primary.content || "",
    fonte: g.primary.source_name,
    url: g.primary.url,
  }));

  console.log(`=== BENCHMARK DO CLASSIFICADOR ===`);
  console.log(`amostra: ${amostra.length} candidatas, as mesmas para os dois`);
  console.log(`referência: ${atual}`);
  console.log(`candidato: ${menor}\n`);

  const [refer, cand] = [await rodar(atual, amostra), await rodar(menor, amostra)];

  for (const r of [refer, cand]) {
    console.log(
      `${r.modelo}: ${r.classificacoes.size}/${amostra.length} classificadas, ` +
        `${r.tokens.prompt} + ${r.tokens.completion} tokens, ${r.segundos.toFixed(1)}s, ` +
        `US$ ${r.custoUsd.toFixed(4)} pela tabela do código` +
        (r.lotesComFalha.length > 0 ? `, ${r.lotesComFalha.length} lote(s) com falha` : "")
    );
  }

  let comparados = 0;
  let paisIgual = 0;
  let leituraIgual = 0;
  let imigracaoIgual = 0;
  let somaRelevancia = 0;
  let somaEntidades = 0;
  const passariaQueNaoDeveria: string[] = [];
  const barrariaQueDeveriaPassar: string[] = [];

  for (const item of amostra) {
    const c = comparar(refer.classificacoes.get(item.id), cand.classificacoes.get(item.id));
    if (!c) continue;

    comparados += 1;
    if (c.pais) paisIgual += 1;
    if (c.leitura) leituraIgual += 1;
    if (c.imigracao) imigracaoIgual += 1;
    somaRelevancia += c.relevancia;
    somaEntidades += c.entidades;

    if (c.decisaoA !== c.decisaoB) {
      const linha = `${item.titulo.slice(0, 80)} (${item.fonte})`;
      if (c.decisaoB) passariaQueNaoDeveria.push(linha);
      else barrariaQueDeveriaPassar.push(linha);
    }
  }

  const pct = (x: number) => `${((x / comparados) * 100).toFixed(1)}%`;

  console.log(`\n--- concordância em ${comparados} pautas comparáveis ---`);
  console.log(`país: ${pct(paisIgual)}`);
  console.log(`leitura (positivo/neutro/desfavorável): ${pct(leituraIgual)}`);
  console.log(`é imigração: ${pct(imigracaoIgual)}`);
  console.log(`relevância, diferença média: ${(somaRelevancia / comparados).toFixed(2)} ponto(s)`);
  console.log(`entidades, sobreposição média: ${((somaEntidades / comparados) * 100).toFixed(1)}%`);

  console.log(`\n--- divergência que muda a decisão ---`);
  console.log(`o menor aprovaria e a referência recusa: ${passariaQueNaoDeveria.length}`);
  for (const l of passariaQueNaoDeveria.slice(0, 8)) console.log(`   ${l}`);
  console.log(`o menor recusaria e a referência aprova: ${barrariaQueDeveriaPassar.length}`);
  for (const l of barrariaQueDeveriaPassar.slice(0, 8)) console.log(`   ${l}`);

  console.log(
    `\nCusto por rodada de ~200 candidatas, pela tabela do código: ` +
      `referência US$ ${((refer.custoUsd / comparados) * 200).toFixed(3)}, ` +
      `candidato US$ ${((cand.custoUsd / comparados) * 200).toFixed(3)}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
