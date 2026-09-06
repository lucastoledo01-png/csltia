import { chromium } from "playwright-core";

const ESTREITOS = "ijltfr.,;:!|()[]/-'’\"";
const LARGOS = "mwMW";

function larguraEm(texto: string): number {
  let em = 0;
  for (const ch of texto) {
    if (ch === " ") em += 0.26;
    else if (LARGOS.includes(ch)) em += 0.85;
    else if (ESTREITOS.includes(ch)) em += 0.3;
    else if (ch === "I") em += 0.32;
    else if (ch >= "0" && ch <= "9") em += 0.58;
    else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) em += 0.62;
    else em += 0.55;
  }
  return em;
}

function linhas(palavras: string[], colunaEm: number): number {
  let n = 1;
  let atual = 0;
  for (const p of palavras) {
    const w = larguraEm(p);
    const proposta = atual === 0 ? w : atual + 0.26 + w;
    if (proposta > colunaEm && atual > 0) { n += 1; atual = w; } else { atual = proposta; }
  }
  return n;
}

const ESCALA = [2.5, 2.3, 2.1, 1.9, 1.74, 1.58, 1.44, 1.31, 1.19, 1.08, 0.98, 0.9];

function corpo(titulo: string, displayLg: number, w: number, h: number): number {
  const palavras = titulo.trim().split(/\s+/).filter(Boolean);
  const coluna = (w - 160) * 0.96;
  const mancha = (h - 160 - 130) * 0.72;
  const maior = palavras.reduce((m, p) => Math.max(m, larguraEm(p)), 0);
  for (const fator of ESCALA) {
    const c = Math.round(displayLg * fator);
    if (maior * c > coluna) continue;
    if (linhas(palavras, coluna / c) * c * 1.05 <= mancha) return c;
  }
  return Math.round(displayLg * ESCALA[ESCALA.length - 1]);
}

const frases = [
  "Corte suspende regra do H-1B",
  "Nova taxa consular entra em vigor",
  "Juiz aponta inconstitucionalidade na regra",
  "USCIS retoma análise de pedidos de green card parados desde julho",
  "Governo dos EUA anuncia mudança no processo de renovação de vistos H-1B e L-1 para brasileiros",
  "Departamento de Estado amplia a lista de consulados que voltam a agendar entrevistas de visto de turista ainda neste mês",
  "Supremo derruba liminar",
  "Regulamentação do parole humanitário para venezuelanos é suspensa por tribunal federal em Nova Orleans nesta sexta",
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });

for (const wrap of ["normal", "balance", "pretty"]) {
  await page.setContent(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Epilogue:ital,wght@0,400;0,800&display=swap">
<style>body{margin:0}#c{width:920px;font-family:"Epilogue",sans-serif;font-weight:800;letter-spacing:-0.03em;line-height:1.05;overflow-wrap:break-word;text-wrap:${wrap}}</style>
</head><body><div id="c"></div></body></html>`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  console.log("=== text-wrap:", wrap);
  for (const f of frases) {
    const c = corpo(f, 62, 1080, 1350);
    const r = await page.evaluate(({ t, s }) => {
      const el = document.getElementById("c") as HTMLElement;
      el.style.fontSize = s + "px";
      el.textContent = t;
      const alt = el.getBoundingClientRect().height;
      let maxW = 0;
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const rect of Array.from(range.getClientRects())) maxW = Math.max(maxW, rect.width);
      return { alt: Math.round(alt), linhas: Math.round(alt / (s * 1.05)), maxW: Math.round(maxW) };
    }, { t: f, s: c });
    console.log(`len=${String(f.length).padStart(3)} corpo=${String(c).padStart(3)} linhas=${r.linhas} altura=${String(r.alt).padStart(4)} larguraMax=${r.maxW} ${r.alt > 763 ? "ESTOURA_MANCHA" : ""} ${r.maxW > 920 ? "ESTOURA_COLUNA" : ""}`);
  }
}
await browser.close();
