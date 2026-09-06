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

function linhas(texto: string, colunaEm: number): number {
  let n = 1;
  let atual = 0;
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const w = larguraEm(palavra);
    const proposta = atual === 0 ? w : atual + 0.26 + w;
    if (proposta > colunaEm && atual > 0) {
      n += 1;
      atual = w;
    } else {
      atual = proposta;
    }
  }
  return n;
}

const frases = [
  "Corte suspende regra do H-1B",
  "USCIS retoma análise de pedidos de green card parados desde julho",
  "Departamento de Estado amplia a lista de consulados que voltam a agendar entrevistas de visto de turista ainda neste mês",
  "Juiz aponta inconstitucionalidade na regra",
  "Governo dos EUA anuncia mudança no processo de renovação de vistos H-1B e L-1 para brasileiros",
  "Nova taxa consular entra em vigor",
];
const tamanhos = [155, 143, 130, 118, 108, 98, 89, 81, 74, 67, 61, 56];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.setContent(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Epilogue:ital,wght@0,400;0,800&display=swap">
<style>body{margin:0}#c{width:920px;font-family:"Epilogue",sans-serif;font-weight:800;letter-spacing:-0.03em;line-height:1.05;overflow-wrap:break-word}</style>
</head><body><div id="c"></div></body></html>`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

let erros = 0;
let subestima = 0;
for (const f of frases) {
  for (const fs of tamanhos) {
    const real = await page.evaluate(
      ({ t, s }) => {
        const el = document.getElementById("c") as HTMLElement;
        el.style.fontSize = s + "px";
        el.textContent = t;
        return Math.round(el.getBoundingClientRect().height / (s * 1.05));
      },
      { t: f, s: fs },
    );
    const prev = linhas(f, (920 * 0.96) / fs);
    if (prev !== real) {
      erros += 1;
      if (prev < real) subestima += 1;
      console.log(`DIF len=${f.length} fs=${fs} previsto=${prev} real=${real}`);
    }
  }
}
console.log("total de pares:", frases.length * tamanhos.length, "divergencias:", erros, "subestimativas:", subestima);
await browser.close();
