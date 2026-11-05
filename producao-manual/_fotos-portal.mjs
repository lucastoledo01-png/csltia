// Fotografa a home do portal rolando devagar (para as fotos preguiçosas carregarem) e informa as fotos que não abriram.
import { chromium } from "playwright";
const saida = process.argv[2];
const url = process.argv[3] ?? "https://euajournal.com/";
const b = await chromium.launch();
for (const [nome, vp] of [["desk", { width: 1400, height: 1000 }], ["cel", { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport: vp });
  await p.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  for (let y = 0; y < 12000; y += 600) { await p.evaluate((v) => window.scrollTo(0, v), y); await p.waitForTimeout(400); }
  await p.waitForTimeout(4000);
  await p.evaluate(() => window.scrollTo(0, 0));
  const quebradas = await p.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.currentSrc || i.src));
  console.log(nome, "fotos que não abriram:", quebradas.length, quebradas.slice(0, 8));
  await p.screenshot({ path: `${saida}/${nome}-home.png`, fullPage: true });
  await p.close();
}
await b.close();
