import { chromium } from "playwright-core";

const CLASSES: Array<[string, number]> = [
  [" ", 0.22],
  ["ijl.,;:!'|íIÍ", 0.26],
  ["ft()[]/-–\"r1", 0.43],
  ["zksvyELFJTZÉ?", 0.54],
  ["bdhnpqADKUVXY%+", 0.65],
  ["CGHÇ&", 0.7],
  ["NOQÓÕ", 0.74],
  ["mMwW", 0.9],
];
function larguraEm(t: string): number {
  let em = 0;
  fora: for (const ch of t) {
    for (const [set, w] of CLASSES) if (set.includes(ch)) { em += w; continue fora; }
    em += 0.61;
  }
  return em;
}
function linhas(ls: number[], colunaEm: number): number {
  let n = 1, atual = 0;
  for (const l of ls) {
    const p = atual === 0 ? l : atual + 0.22 + l;
    if (p > colunaEm && atual > 0) { n += 1; atual = l; } else { atual = p; }
  }
  return n;
}

const frases = [
  "Corte suspende regra do H-1B",
  "Nova taxa consular entra em vigor",
  "Supremo derruba liminar",
  "Juiz aponta inconstitucionalidade na regra",
  "USCIS retoma análise de pedidos de green card parados desde julho",
  "Governo dos EUA anuncia mudança no processo de renovação de vistos H-1B e L-1 para brasileiros",
  "Departamento de Estado amplia a lista de consulados que voltam a agendar entrevistas de visto de turista ainda neste mês",
  "Regulamentação do parole humanitário para venezuelanos é suspensa por tribunal federal em Nova Orleans nesta sexta",
  "Casa Branca confirma nova rodada de deportações e amplia a fiscalização em aeroportos do país inteiro",
  "Taxa do H-1B sobe",
];
const tamanhos = [223, 205, 186, 171, 155, 143, 130, 118, 108, 98, 89, 81, 74, 67, 61, 56];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.setContent(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Epilogue:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap">
<style>body{margin:0}#c{width:920px;font-family:"Epilogue",sans-serif;font-weight:800;letter-spacing:-0.03em;line-height:1.05;overflow-wrap:break-word}</style>
</head><body><div id="c">Epilogue</div></body></html>`, { waitUntil: "networkidle" });
await page.evaluate(async () => { await (document as any).fonts.load('800 100px "Epilogue"'); await document.fonts.ready; });

for (const margem of [1.0, 0.99, 0.98, 0.96]) {
  let dif = 0, sub = 0;
  for (const f of frases) {
    const ls = f.split(/\s+/).map(larguraEm);
    for (const fs of tamanhos) {
      const real = await page.evaluate(({ t, s }) => {
        const el = document.getElementById("c") as HTMLElement;
        el.style.fontSize = s + "px";
        el.textContent = t;
        return Math.round(el.getBoundingClientRect().height / (s * 1.05));
      }, { t: f, s: fs });
      const maior = Math.max(...ls);
      if (maior * fs > 920 * margem) continue;
      const prev = linhas(ls, (920 * margem) / fs);
      if (prev !== real) { dif++; if (prev < real) { sub++; console.log(`SUB margem=${margem} len=${f.length} fs=${fs} prev=${prev} real=${real}`); } }
    }
  }
  console.log(`margem=${margem} divergencias=${dif} subestimativas=${sub}`);
}
await browser.close();
