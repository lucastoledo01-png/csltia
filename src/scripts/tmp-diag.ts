import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const alvo = "/private/tmp/claude-501/-Users-lucastoledo-Applications-AI-Projects-Claude/381cd9c6-282d-49ea-b3b1-f4e1c8385248/scratchpad/03-longo.html";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
await page.setContent(readFileSync(alvo, "utf8"), { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const info = await page.evaluate(() => {
  const h = document.querySelector(".n-manchete") as HTMLElement;
  const cs = getComputedStyle(h);
  const range = document.createRange();
  const no = h.firstChild!;
  const texto = h.textContent!;
  const linhas: string[] = [];
  let topoAtual = -1;
  let inicio = 0;
  for (let i = 0; i < texto.length; i++) {
    range.setStart(no, i);
    range.setEnd(no, i + 1);
    const t = Math.round(range.getBoundingClientRect().top);
    if (topoAtual === -1) topoAtual = t;
    else if (t !== topoAtual) {
      linhas.push(texto.slice(inicio, i));
      inicio = i;
      topoAtual = t;
    }
  }
  linhas.push(texto.slice(inicio));
  return {
    largura: h.getBoundingClientRect().width,
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    letterSpacing: cs.letterSpacing,
    wordSpacing: cs.wordSpacing,
    linhas,
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
