import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const alvo = "/private/tmp/claude-501/-Users-lucastoledo-Applications-AI-Projects-Claude/381cd9c6-282d-49ea-b3b1-f4e1c8385248/scratchpad/03-longo.html";
const palavras = ["consulados", "inconstitucionalidade", "suspende", "Departamento", "entrevistas", "USCIS"];
const browser = await chromium.launch({ headless: true });

async function medir(html: string, css: string) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(({ ws, estilo }) => {
    const s = document.createElement("span");
    s.setAttribute("style", estilo);
    document.body.appendChild(s);
    return ws.map((w) => {
      s.textContent = w;
      return [w, Math.round(s.getBoundingClientRect().width)] as [string, number];
    });
  }, { ws: palavras, estilo: css });
  await page.close();
  return r;
}

const estilo = 'font-family:"Epilogue",sans-serif;font-weight:800;font-size:100px;letter-spacing:-0.03em;white-space:nowrap;display:inline-block;position:absolute';
console.log("no slide:", JSON.stringify(await medir(readFileSync(alvo, "utf8"), estilo)));

const calib = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Epilogue:ital,wght@0,400;0,800&display=swap">
<style>body{margin:0}</style></head><body></body></html>`;
console.log("calibracao:", JSON.stringify(await medir(calib, estilo)));
await browser.close();
