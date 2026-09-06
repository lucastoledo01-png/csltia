import { chromium } from "playwright-core";

const palavras = [
  "inconstitucionalidade",
  "Departamento",
  "regulamentacao",
  "regulamentação",
  "suspende",
  "entrevistas",
  "USCIS",
  "MMMMMMMMMM",
];
const frases = [
  "Corte suspende regra do H-1B",
  "USCIS retoma análise de pedidos de green card parados desde julho",
  "Departamento de Estado amplia a lista de consulados que voltam a agendar entrevistas de visto de turista ainda neste mês",
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.setContent(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Epilogue:ital,wght@0,400;0,800&display=swap">
<style>body{margin:0}#p{font-family:"Epilogue",sans-serif;font-weight:800;font-size:100px;letter-spacing:-0.03em;white-space:nowrap;display:inline-block}
#c{width:920px;font-family:"Epilogue",sans-serif;font-weight:800;letter-spacing:-0.03em;line-height:1.05}</style>
</head><body><span id="p"></span><div id="c"></div></body></html>`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

for (const w of palavras) {
  const r = await page.evaluate((t) => {
    const el = document.getElementById("p")!;
    el.textContent = t;
    return el.getBoundingClientRect().width;
  }, w);
  console.log("palavra", w, w.length, "largura@100px", Math.round(r), "fator", (r / (w.length * 100)).toFixed(3));
}

for (const f of frases) {
  for (const fs of [155, 130, 118, 108, 98, 89, 81]) {
    const r = await page.evaluate(
      ({ t, s }) => {
        const el = document.getElementById("c") as HTMLElement;
        el.style.fontSize = s + "px";
        el.textContent = t;
        const linhas = Math.round(el.getBoundingClientRect().height / (s * 1.05));
        return { linhas, altura: Math.round(el.getBoundingClientRect().height) };
      },
      { t: f, s: fs },
    );
    console.log(`frase(${f.length}) fs=${fs} linhas=${r.linhas} altura=${r.altura} charsPorLinha=${(f.length / r.linhas).toFixed(1)} capacidade=${(920 / (fs * 0.54)).toFixed(1)}`);
  }
  console.log("---");
}
await browser.close();
