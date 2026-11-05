import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
// Mapa dos EUA como "foto" de fundo do Reel (2160x3840, o dobro do Reel).
// Uso: node gerar_mapa.mjs <mapa.svg> <saida.png> <grupos.json>
// O SVG é o "Blank US Map (states only)" do Commons (CC0), com uma classe por estado (tx, ks...).
// grupos.json: { "base": "#2b3a55", "grupos": [ { "cor": "#3d7bff", "legenda": "...", "estados": ["tx", ...] } ] }
// O estado fora de todo grupo fica com a cor "base". Legenda vazia não aparece.
const [svgPath, saida, gruposPath] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(path.resolve(gruposPath), "utf8"));
const svg = readFileSync(path.resolve(svgPath), "utf8").replace(/<\?xml[^>]*>/, "");
const regras = cfg.grupos
  .map((g) => `${g.estados.map((e) => `svg .${e.toLowerCase()}, svg .${e.toLowerCase()} path`).join(",")}{fill:${g.cor} !important}`)
  .join("\n");
const legenda = cfg.grupos
  .filter((g) => g.legenda)
  .map((g) => `<span><i style="background:${g.cor}"></i>${g.legenda}</span>`)
  .join("");
const html = `<!doctype html><meta charset=utf-8>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700&display=swap" rel="stylesheet">
<style>
html,body{margin:0}body{width:1080px;height:1920px;background:radial-gradient(ellipse at 50% 35%,#16305a,#071326 70%);font-family:Inter;position:relative;overflow:hidden}
#mapa{position:absolute;left:90px;top:470px;width:900px}
#mapa svg{width:100%;height:auto}
svg .state path, svg .state{fill:${cfg.base ?? "#2b3a55"}}
svg .borders{stroke:#071326;stroke-width:1.4}
svg .separator1{stroke:#071326}
svg .dccircle{display:none}
${regras}
#leg{position:absolute;left:100px;right:100px;top:395px;color:#dbe6ff;font-size:24px;font-weight:500;display:flex;flex-wrap:wrap;gap:10px 26px}
#leg span{display:flex;align-items:center;gap:10px}
#leg i{width:24px;height:24px;border-radius:5px;display:inline-block}
</style>
<div id=mapa>${svg}</div><div id=leg>${legenda}</div>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 2 });
await p.setContent(html);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(600);
await p.screenshot({ path: path.resolve(saida) });
await b.close();
console.log("mapa", saida, cfg.grupos.map((g) => `${g.legenda || "-"}: ${g.estados.length}`).join(" | "));
