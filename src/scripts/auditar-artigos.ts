import fs from "node:fs";
import path from "node:path";
import {
  auditarMateria,
  contextoDoConjunto,
  relatorioEmCsv,
  relatorioEmMarkdown,
  resumirAuditoria,
  type ResultadoDaAuditoria,
} from "../lib/server/auditoria-de-artigo";
import { urlDoArtigo } from "../lib/server/dados-estruturados-do-artigo";
import { identidadeDaImagem } from "../lib/imagem-da-capa";
import { distribuicaoDaEstrutura, estruturaDaMateria, estruturaEmMarkdown } from "../lib/server/estrutura-da-materia";
import { argumento, carregarEnv, clienteDoBanco, lerEnsaioDoDesmonte, lerPagina, lerPublicadas, type LinhaDoArtigo } from "./artigos-comum";

/**
 * A auditoria das matérias publicadas (05/10/2026). SÓ LÊ: nenhuma escrita no
 * banco, nenhuma chamada de modelo.
 *
 *   npx tsx src/scripts/auditar-artigos.ts
 *       audita o que está publicado agora, lendo a página no ar de cada uma
 *       (JSON-LD, canônico, foto repetida); se as edições ainda estão no ar,
 *       audita também as matérias que o desmonte delas gravaria
 *
 *   npx tsx src/scripts/auditar-artigos.ts --saida docs/auditorias/artigos-2026-10-05.md
 *       grava o relatório em Markdown e o mesmo em CSV ao lado
 *
 *   npx tsx src/scripts/auditar-artigos.ts --arquivo docs/design/artigo-modelo-2026-10-05/artigo-modelo.json
 *       audita matérias de um arquivo local (o piloto), contra o conjunto do
 *       desmonte para as conferências de repetição
 *
 *   --sem-pagina   não lê a página no ar; usa o JSON-LD que o código desta versão monta
 *
 *   npx tsx src/scripts/auditar-artigos.ts --estrutura
 *       só a estrutura das publicadas pelas réguas das skills de SEO, AEO e
 *       GEO (`estrutura-da-materia.ts`): palavras, intertítulo em pergunta,
 *       fonte na abertura, perguntas, legenda, crédito, assuntos e o piso de
 *       dois assuntos. Lê o banco, não a página; com --saida, grava a tabela
 *
 * O JSON-LD de quem está no ar vem da PÁGINA servida, não do código: o
 * relatório mede o que o Google lê hoje. Para as matérias do desmonte, que
 * ainda não têm página, vale o que o molde desta versão monta.
 */

async function auditarConjunto(
  artigos: LinhaDoArtigo[],
  conjunto: LinhaDoArtigo[],
  lerAoVivo: boolean,
): Promise<{ resultados: ResultadoDaAuditoria[]; uso: Map<string, number> }> {
  const ctx = contextoDoConjunto(conjunto);
  const resultados: ResultadoDaAuditoria[] = [];
  for (const a of artigos) {
    const pagina = lerAoVivo ? await lerPagina(urlDoArtigo(a.slug)) : null;
    if (lerAoVivo && !pagina) console.warn(`  a página de ${a.slug} não respondeu 200; auditada pelo molde desta versão`);
    resultados.push(auditarMateria(a, { ...ctx, pagina }));
  }
  return { resultados, uso: ctx.usoDasCapas };
}

function linhaDeResumo(nome: string, r: ResultadoDaAuditoria[], uso: Map<string, number>): void {
  const s = resumirAuditoria(r, uso);
  console.log(`\n== ${nome}`);
  console.log(`matérias auditadas        ${s.auditadas}`);
  console.log(`nota média                ${s.notaMedia}`);
  console.log(`dividem a capa            ${s.compartilhamCapa}`);
  for (const f of s.falhasPorChecagem.slice(0, 8)) console.log(`  ${String(f.falhas).padStart(3)}  ${f.rotulo}`);
}

async function main(): Promise<void> {
  carregarEnv();
  const saida = argumento("--saida");
  const arquivo = argumento("--arquivo");
  const lerAoVivo = !process.argv.includes("--sem-pagina");
  const client = clienteDoBanco();
  const blocos: string[] = [];
  const csv: string[] = [];
  const data = new Date().toISOString().slice(0, 10);

  if (process.argv.includes("--estrutura")) {
    const publicadas = await lerPublicadas(client);
    const lista = publicadas.map(estruturaDaMateria);
    const d = distribuicaoDaEstrutura(lista);
    const tabela = estruturaEmMarkdown(d);
    console.log(`\n== estrutura das ${d.total} publicadas\n${tabela}`);
    if (saida) {
      fs.mkdirSync(path.dirname(saida), { recursive: true });
      fs.writeFileSync(saida, `# Estrutura das matérias publicadas, ${data}\n\nGerado por \`npx tsx src/scripts/auditar-artigos.ts --estrutura\`. Só leitura.\n\n${tabela}\n`);
      console.log(`\ntabela em ${saida}`);
    }
    return;
  }

  if (arquivo) {
    const locais = JSON.parse(fs.readFileSync(arquivo, "utf-8")) as LinhaDoArtigo[] | LinhaDoArtigo;
    const lista = Array.isArray(locais) ? locais : [locais];
    // O conjunto de comparação é o que está no ar; sem matéria no ar além das
    // edições, é o que o desmonte gravaria.
    const noAr = (await lerPublicadas(client)).filter((a) => !a.slug.startsWith("edicao-"));
    const base = noAr.length > 0 ? noAr : await lerEnsaioDoDesmonte(client);
    const conjunto = [...base.filter((a) => !lista.some((l) => l.slug === a.slug)), ...lista];
    const { resultados, uso: usoDoConjunto } = await auditarConjunto(lista, conjunto, false);
    // O resumo fala só das capas DESTAS matérias, e não das repetições do resto do site.
    const proprias = new Set(lista.map((l) => identidadeDaImagem(l.cover_image)));
    const uso = new Map([...usoDoConjunto].filter(([id]) => proprias.has(id)));
    linhaDeResumo(`arquivo ${arquivo}`, resultados, uso);
    for (const r of resultados) {
      console.log(`\n${r.slug}: nota ${r.nota}`);
      for (const c of r.checagens) console.log(`  ${c.passou ? "ok   " : "FALHA"} ${c.rotulo}: ${c.detalhe}`);
    }
    blocos.push(
      relatorioEmMarkdown(
        "Matéria-modelo",
        "Auditada pelo molde desta versão (o JSON-LD é o que a página monta com este código), contra as matérias publicadas para as conferências de repetição (descrição e capa).",
        resultados,
        resumirAuditoria(resultados, uso),
      ),
      "### Cada conferência",
      "",
      ...resultados.flatMap((r) => [
        `| Conferência | Peso | Resultado | Detalhe |`,
        `|---|---|---|---|`,
        ...r.checagens.map((c) => `| ${c.rotulo} | ${c.peso} | ${c.passou ? "passou" : "FALHOU"} | ${c.detalhe.replace(/\|/g, "\\|")} |`),
        "",
      ]),
    );
    csv.push(relatorioEmCsv(resultados));
  } else {
    const publicadas = await lerPublicadas(client);
    const { resultados, uso } = await auditarConjunto(publicadas, publicadas, lerAoVivo);
    linhaDeResumo("publicadas agora", resultados, uso);
    blocos.push(
      relatorioEmMarkdown(
        "1. O que está publicado agora",
        `As ${publicadas.length} matérias com \`status = published\` em ${data}. ${
          lerAoVivo ? "JSON-LD, canônico e foto repetida lidos da página servida em produção." : "JSON-LD montado pelo molde desta versão."
        }`,
        resultados,
        resumirAuditoria(resultados, uso),
      ),
    );
    csv.push(relatorioEmCsv(resultados));

    /*
     * As mesmas matérias, com a página que ESTE código monta: mostra o que a
     * parte de molde (JSON-LD, foto repetida, perguntas visíveis) resolve
     * sozinha, antes de qualquer correção no banco.
     */
    if (lerAoVivo) {
      const pelo = await auditarConjunto(publicadas, publicadas, false);
      linhaDeResumo("publicadas agora, pelo molde desta versão", pelo.resultados, pelo.uso);
      const s1 = resumirAuditoria(resultados, uso);
      const s2 = resumirAuditoria(pelo.resultados, pelo.uso);
      blocos.push(
        `## 1b. As mesmas matérias com o molde desta versão`,
        "",
        `Mesmo banco, com o JSON-LD, o canônico e o corpo que a página desta versão monta. Nota média ${s1.notaMedia} no ar, ${s2.notaMedia} com o molde novo. O que sobra depende de dado no banco (título, descrição, perguntas, intertítulos) e é o que \`corrigir-artigos.ts\` trata.`,
        "",
        "| Conferência | Reprovadas no ar | Reprovadas com o molde novo |",
        "|---|---|---|",
        ...s1.falhasPorChecagem.map((f) => `| ${f.rotulo} | ${f.falhas} | ${s2.falhasPorChecagem.find((x) => x.id === f.id)?.falhas ?? 0} |`),
        "",
      );
    }

    const edicoesNoAr = publicadas.filter((a) => a.slug.startsWith("edicao-")).length;
    if (edicoesNoAr > 0) {
      const ensaio = await lerEnsaioDoDesmonte(client);
      const naoEdicoes = publicadas.filter((a) => !a.slug.startsWith("edicao-"));
      const conjunto = [...naoEdicoes, ...ensaio];
      const r2 = await auditarConjunto(ensaio, conjunto, false);
      linhaDeResumo("depois do desmonte (ensaio)", r2.resultados, r2.uso);
      blocos.push(
        relatorioEmMarkdown(
          "2. Depois do desmonte das edições (ensaio do #69)",
          `${edicoesNoAr} edições ainda estão no ar, então o \`artigos-por-pauta.ts\` não rodou. Aqui estão as ${ensaio.length} matérias que ele GRAVARIA, montadas pelo mesmo plano, sem gravar nada, e auditadas pelo molde desta versão.`,
          r2.resultados,
          resumirAuditoria(r2.resultados, r2.uso),
        ),
      );
      csv.push(relatorioEmCsv(r2.resultados));
    }
  }

  if (!saida) return;
  const cabecalho = [
    `# Auditoria de artigos, ${data}`,
    "",
    "Gerado por `npx tsx src/scripts/auditar-artigos.ts`. Só leitura: nenhuma escrita no banco e nenhuma chamada de modelo.",
    "As réguas estão em `src/lib/server/auditoria-de-artigo.ts`, com o peso de cada conferência; a nota soma 100.",
    "",
  ];
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  fs.writeFileSync(saida, `${[...cabecalho, ...blocos].join("\n")}\n`);
  fs.writeFileSync(saida.replace(/\.md$/, ".csv"), `${csv.filter(Boolean).join("\n\n")}\n`);
  console.log(`\nrelatório em ${saida} e ${saida.replace(/\.md$/, ".csv")}`);
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
