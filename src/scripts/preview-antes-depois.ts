import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PROJECT_ID, requireActiveProject } from "../lib/server/projects";
import { getSupabaseAdminClient } from "../lib/server/supabase-admin";
import { montarPacotesDasPautas } from "../lib/server/editorial/pacote-factual";
import type { PacoteFactual } from "../lib/server/editorial/pacote-factual";
import { runNewsroomPipeline } from "../lib/server/newsroom/pipeline";
import type { RankedCandidate } from "../lib/server/newsroom/ranker";
import { renderEditionToHtml } from "../lib/server/newsroom/newsroom-service";
import { formatarNumerosDaEdicao } from "../lib/server/newsroom/numeros-editoriais";
import { conferirLinguagemDoLeitor, TERMOS_TECNICOS } from "../lib/server/newsroom/leitor";
import type { EditionContent } from "../lib/server/newsroom/schemas";
import { escreverRelatorio } from "./relatorio";

/**
 * A mesma edição, antes e depois das correções de redação e de layout.
 *
 * O "antes" não é uma reconstrução: é o `content_html` que efetivamente foi
 * para a caixa de entrada, lido do banco. O "depois" reescreve as MESMAS
 * pautas com o prompt novo e renderiza com o template novo.
 *
 * Um limite que vale declarar: o pacote factual do "depois" é montado a partir
 * do resumo gravado, não do texto original da matéria, que não fica guardado.
 * Os fatos são os mesmos, o material é mais magro. Serve para comparar redação
 * e layout, não para medir profundidade.
 *
 * Não envia, não cria campanha, não grava em news_editions.
 *
 *   npx tsx src/scripts/preview-antes-depois.ts --dia=2026-09-09
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

const LARGURAS = [320, 375, 390, 430];
const DESKTOP = 900;

/** Envelope mínimo de e-mail, para o screenshot medir o que o leitor vê. */
function paginaDeEmail(fragmento: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:0;background:#F4F4F5;}</style>
</head><body>${fragmento}</body></html>`;
}

async function main() {
  carregarEnv();
  const argv = process.argv.slice(2);
  const dia = argv.find((a) => a.startsWith("--dia="))?.split("=")[1] ?? "2026-09-09";
  const saida = argv.find((a) => a.startsWith("--saida="))?.split("=")[1] ?? `/tmp/antes-depois-${dia}`;
  fs.mkdirSync(saida, { recursive: true });

  const project = await requireActiveProject(DEFAULT_PROJECT_ID);
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("news_editions")
    .select("subject, subject_options, preheader, headline, intro, stories, quick_bits, closing, final_line, content_html")
    .eq("edition_date", dia)
    .maybeSingle();

  if (error || !data) throw new Error(`edição de ${dia} não encontrada: ${error?.message ?? "sem linha"}`);

  const antes = {
    subject: data.subject as string,
    subject_options: (data.subject_options as string[]) ?? [],
    preheader: data.preheader as string,
    headline: data.headline as string,
    intro: data.intro as string,
    stories: data.stories as EditionContent["stories"],
    quick_bits: (data.quick_bits as EditionContent["quick_bits"]) ?? [],
    closing: data.closing as string,
    final_line: data.final_line as string,
  } as EditionContent;

  const htmlAntes = String(data.content_html ?? "");
  const linhas: string[] = [`# Edição de ${dia}, antes e depois`, ""];
  const escrever = (l = "") => {
    linhas.push(l);
    console.log(l);
  };

  escrever(`O "antes" é o HTML que foi para a caixa de entrada, lido de \`news_editions\`.`);
  escrever(`O "depois" reescreve as MESMAS pautas com o prompt novo e renderiza com o template novo.`);
  escrever();

  // ---- o que os novos apontamentos pegariam no texto que saiu -------------
  escrever(`## O que o guard novo apontaria no texto que saiu`);
  escrever();
  const achadosAntes = conferirLinguagemDoLeitor(antes);
  if (achadosAntes.length === 0) {
    escrever(`Nada. O texto que saiu passaria pelos novos apontamentos.`);
  } else {
    escrever(`| pauta | motivo | apontamento |`);
    escrever(`| --- | --- | --- |`);
    for (const a of achadosAntes) {
      escrever(`| ${a.indice + 1} | \`${a.motivo}\` | ${a.descricao.replace(/\|/g, " ").slice(0, 200)} |`);
    }
  }
  escrever();

  // ---- reescrever as mesmas pautas ---------------------------------------
  console.log("Montando o pacote factual das mesmas pautas...");
  const construcao = await montarPacotesDasPautas(
    antes.stories.map((s) => ({
      url: s.source_url,
      titulo: s.title,
      texto: [s.summary, s.context, s.practical_impact].filter(Boolean).join("\n\n"),
      urls: [s.source_url],
    })),
    process.env,
    fetch,
  );

  const pacotes = new Map<string, PacoteFactual>(construcao.pacotes);
  const ranked = antes.stories.map((s) => ({
    group: { primary: { title: s.title, url: s.source_url, source_name: s.source_name }, secondary_urls: [] },
    score: 70,
    breakdown: { impact: 7, novelty: 5, utility: 5, credibility: 8 },
    reasoning: s.category,
  })) as unknown as RankedCandidate[];

  console.log("Reescrevendo com o prompt novo...");
  const r = await runNewsroomPipeline(
    ranked,
    process.env,
    fetch,
    {
      nome: project.brand.displayName || project.name,
      nicho: project.niche,
      extra: project.editorialPromptExtra,
      assinatura: String(project.settings?.final_line ?? "").trim() || "Até amanhã.",
    },
    { minimo: antes.stories.length, maximo: antes.stories.length },
    pacotes,
    2,
    70,
  );

  const depois = formatarNumerosDaEdicao(r.edition);
  const htmlDepois = renderEditionToHtml(depois, new Map(), false, new Map());

  // ---- comparação textual -------------------------------------------------
  escrever(`## Hero`);
  escrever();
  escrever(`| | texto |`);
  escrever(`| --- | --- |`);
  escrever(`| antes | ${antes.headline} |`);
  escrever(`| depois | ${depois.headline} |`);
  escrever();

  escrever(`## Títulos das pautas`);
  escrever();
  escrever(`| # | antes | chars | depois | chars |`);
  escrever(`| --- | --- | ---: | --- | ---: |`);
  for (let i = 0; i < Math.max(antes.stories.length, depois.stories.length); i += 1) {
    const a = antes.stories[i]?.title ?? "";
    const d = depois.stories[i]?.title ?? "";
    escrever(`| ${i + 1} | ${a} | ${a.length} | ${d} | ${d.length} |`);
  }
  escrever();

  escrever(`## Termos técnicos`);
  escrever();
  const contar = (e: EditionContent) => {
    const texto = e.stories
      .map((s) => [s.title, s.summary, s.context, s.why_it_matters, s.practical_impact].join(" "))
      .join(" ")
      .toLowerCase();
    const achados = TERMOS_TECNICOS.filter((t) => texto.includes(t));
    const codigos = [...new Set([...texto.matchAll(/\b(?:[a-z]{1,3}-\d{1,4}[a-z]?\d?|niw|ead)\b/g)].map((m) => m[0]))];
    return { achados, codigos };
  };
  const ta = contar(antes);
  const td = contar(depois);
  escrever(`| | termos da lista | siglas e formulários |`);
  escrever(`| --- | --- | --- |`);
  escrever(`| antes | ${ta.achados.join(", ") || "nenhum"} | ${ta.codigos.join(", ") || "nenhum"} |`);
  escrever(`| depois | ${td.achados.join(", ") || "nenhum"} | ${td.codigos.join(", ") || "nenhum"} |`);
  escrever();
  const restantes = conferirLinguagemDoLeitor(depois);
  escrever(`Apontamentos do guard no texto novo: ${restantes.length}`);
  for (const a of restantes) {
    escrever(`- pauta ${a.indice + 1}, \`${a.motivo}\`: ${a.descricao.slice(0, 180)}`);
  }
  escrever();

  escrever(`## Números`);
  escrever();
  const numeros = (e: EditionContent) => {
    const texto = e.stories.map((s) => `${s.title} ${s.summary} ${s.context}`).join(" ");
    return [...new Set([...texto.matchAll(/(?:R\$|US\$|\$|€)\s?[\d.,]+|[\d.,]+\s?%/g)].map((m) => m[0]))];
  };
  escrever(`- antes: ${numeros(antes).join(" · ") || "nenhum"}`);
  escrever(`- depois: ${numeros(depois).join(" · ") || "nenhum"}`);
  escrever();

  escrever(`## Texto completo, depois`);
  escrever();
  for (const s of depois.stories) {
    escrever(`### ${s.title}`);
    escrever();
    escrever(s.summary);
    if (s.context) escrever(`\n${s.context}`);
    escrever(`\n**Por que importa:** ${s.why_it_matters}`);
    escrever(`\n**Na prática:** ${s.practical_impact}`);
    escrever();
  }

  // ---- screenshots --------------------------------------------------------
  const { chromium } = await import("playwright-core");
  const navegador = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim() || undefined,
  });

  const alturas: Record<string, Record<number, number>> = { antes: {}, depois: {} };
  const problemasDeLayout: string[] = [];

  try {
    for (const [rotulo, html] of [["antes", htmlAntes], ["depois", htmlDepois]] as const) {
      for (const largura of [...LARGURAS, DESKTOP]) {
        const page = await navegador.newPage({ viewport: { width: largura, height: 900 } });
        await page.setContent(paginaDeEmail(html), { waitUntil: "networkidle" });
        await page.waitForTimeout(150);

        const medida = await page.evaluate(() => ({
          altura: document.body.scrollHeight,
          /* Overflow horizontal: o corpo não pode rolar de lado. */
          vazaLado: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          /* Elemento que passa da borda direita. */
          estourando: [...document.querySelectorAll<HTMLElement>("*")]
            .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
            .map((el) => `${el.tagName.toLowerCase()}.${el.className || "-"}`)
            .slice(0, 3),
          /* Quantas linhas o maior título ocupa. */
          linhasDoMaiorTitulo: Math.max(
            0,
            ...[...document.querySelectorAll<HTMLElement>("h1,h2")].map((h) => {
              const lh = parseFloat(getComputedStyle(h).lineHeight) || 1;
              return Math.round(h.getBoundingClientRect().height / lh);
            }),
          ),
          larguraDoTexto: (() => {
            const p = document.querySelector<HTMLElement>("p");
            return p ? Math.round(p.getBoundingClientRect().width) : 0;
          })(),
        }));

        alturas[rotulo][largura] = medida.altura;

        if (largura !== DESKTOP) {
          if (medida.vazaLado) problemasDeLayout.push(`${rotulo} ${largura}px: rola de lado`);
          for (const e of medida.estourando) problemasDeLayout.push(`${rotulo} ${largura}px: ${e} passa da borda`);
          if (medida.linhasDoMaiorTitulo > 5) {
            problemasDeLayout.push(`${rotulo} ${largura}px: título com ${medida.linhasDoMaiorTitulo} linhas`);
          }
        }

        if (largura === 390 || largura === DESKTOP) {
          const nome = `${rotulo}-${largura}px.png`;
          await page.screenshot({ path: path.join(saida, nome), fullPage: true });
          if (largura === 390) {
            escrever(`- ${rotulo} em 390px: texto com ${medida.larguraDoTexto}px de largura, ` +
              `maior título em ${medida.linhasDoMaiorTitulo} linhas, altura total ${medida.altura}px`);
          }
        }
        await page.close();
      }
    }
  } finally {
    await navegador.close();
  }

  escrever();
  escrever(`## Altura total, por largura`);
  escrever();
  escrever(`| largura | antes | depois |`);
  escrever(`| --- | ---: | ---: |`);
  for (const l of [...LARGURAS, DESKTOP]) {
    escrever(`| ${l}px | ${alturas.antes[l]}px | ${alturas.depois[l]}px |`);
  }
  escrever();

  escrever(`## Problemas de layout`);
  escrever();
  if (problemasDeLayout.length === 0) escrever(`Nenhum, em 320, 375, 390 e 430px.`);
  else for (const p of problemasDeLayout) escrever(`- ${p}`);
  escrever();

  escrever(`Custo desta reescrita: US$ ${r.totalUsage.estimatedCostUsd.toFixed(4)}. Nada foi enviado ou gravado.`);

  fs.writeFileSync(path.join(saida, "antes.html"), paginaDeEmail(htmlAntes), "utf-8");
  fs.writeFileSync(path.join(saida, "depois.html"), paginaDeEmail(htmlDepois), "utf-8");
  escreverRelatorio(path.join(saida, "relatorio.md"), linhas.join("\n"));
  console.log(`\nRelatório e screenshots em ${saida}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
