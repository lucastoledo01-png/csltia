import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
// Mapa dos EUA como "foto" de fundo do Reel (2160x3840, o dobro do Reel).
// Uso: node gerar_mapa.mjs <mapa.svg> <saida.png> <estados,separados,por,vírgula> "<legenda>"
// O SVG é o "Blank US Map (states only)" do Commons (CC0), com uma classe por estado (tx, ks...).
const [svgPath, saida, lista, legenda] = process.argv.slice(2);
const estados = lista.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const svg = readFileSync(path.resolve(svgPath), "utf8").replace(/<\?xml[^>]*>/, "");
const destaque = estados.map((e) => `svg .${e}, svg .${e} path`).join(",");
const html = `<!doctype html><meta charset=utf-8>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700&display=swap" rel="stylesheet">
<style>
html,body{margin:0}body{width:1080px;height:1920px;background:radial-gradient(ellipse at 50% 35%,#16305a,#071326 70%);font-family:Inter;position:relative;overflow:hidden}
#mapa{position:absolute;left:90px;top:480px;width:900px}
#mapa svg{width:100%;height:auto}
svg .state path, svg .state{fill:#34445f}
svg .borders{stroke:#071326;stroke-width:1.2}
svg .separator1{stroke:#071326}
svg .dccircle{display:none}
${destaque}{fill:#3d7bff !important}
#leg{position:absolute;left:100px;top:420px;color:#dbe6ff;font-size:26px;font-weight:500;display:flex;align-items:center;gap:14px}
#leg i{width:26px;height:26px;border-radius:5px;background:#3d7bff;display:inline-block}
</style>
<div id=mapa>${svg}</div><div id=leg><i></i>${legenda}</div>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 2 });
await p.setContent(html);
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(600);
await p.screenshot({ path: path.resolve(saida) });
await b.close();
console.log("mapa", saida, estados.join(" "));
