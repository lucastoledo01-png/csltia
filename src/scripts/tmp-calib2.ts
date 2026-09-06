import { chromium } from "playwright-core";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.setContent(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Epilogue:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap">
<style>body{margin:0;font-family:"Epilogue",sans-serif}#p{font-family:"Epilogue",sans-serif;font-weight:800;font-size:100px;letter-spacing:-0.03em;white-space:pre;display:inline-block;position:absolute;top:0}</style>
</head><body><div style="font-weight:800;font-size:40px">Epilogue aqui ÁÉÍÓÚÃÕÇ áéíóúãõç</div><span id="p"></span></body></html>`, { waitUntil: "networkidle" });
await page.evaluate(async () => { await (document as any).fonts.load('800 100px "Epilogue"'); await document.fonts.ready; });

const chars = "abcdefghijklmnopqrstuvwxyzáéíóúâêôãõçàABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÃÕÇ0123456789 .,;:!?-–'\"()%/&+";
const out = await page.evaluate((cs) => {
  const el = document.getElementById("p") as HTMLElement;
  const r: Record<string, number> = {};
  for (const ch of cs) {
    el.textContent = ch.repeat(20);
    r[ch] = el.getBoundingClientRect().width / 20 / 100;
  }
  return r;
}, chars);

const linhas = Object.entries(out).map(([c, w]) => `${c === " " ? "ESPACO" : c}=${w.toFixed(3)}`);
console.log(linhas.join(" "));

// agrupamento sugerido
const grupos: Record<string, string[]> = {};
for (const [c, w] of Object.entries(out)) {
  const faixa = (Math.round(w * 20) / 20).toFixed(2);
  (grupos[faixa] ||= []).push(c);
}
console.log("\n--- por faixa ---");
for (const f of Object.keys(grupos).sort()) console.log(f, grupos[f].join(""));
await browser.close();
