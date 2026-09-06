import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const alvo = "/private/tmp/claude-501/-Users-lucastoledo-Applications-AI-Projects-Claude/381cd9c6-282d-49ea-b3b1-f4e1c8385248/scratchpad/03-longo.html";
const browser = await chromium.launch({ headless: true });

async function info(html: string, nome: string) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  const respostas: string[] = [];
  page.on("response", (r) => { if (r.url().includes("font")) respostas.push(`${r.status()} ${r.url().slice(0, 110)}`); });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const faces = Array.from((document as any).fonts).map((f: any) => `${f.family}|${f.weight}|${f.style}|${f.status}`);
    return {
      check800: document.fonts.check('800 100px "Epilogue"'),
      check400: document.fonts.check('400 100px "Epilogue"'),
      faces: faces.slice(0, 12),
      total: faces.length,
    };
  });
  console.log(nome, JSON.stringify(r, null, 1));
  console.log(nome, "respostas:", respostas.length, respostas.slice(0, 4));
  await page.close();
}

await info(readFileSync(alvo, "utf8"), "SLIDE");
await info(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Epilogue:ital,wght@0,400;0,800&display=swap">
</head><body></body></html>`, "CALIB");
await browser.close();
