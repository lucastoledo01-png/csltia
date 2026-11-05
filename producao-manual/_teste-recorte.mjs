// Folha de comparação do recorte vertical das capas: cada foto em cada caixa, em várias posições.
import { chromium } from "playwright";
const saida = process.argv[2];
const F = "https://commons.wikimedia.org/wiki/Special:FilePath/";
const fotos = [
  ["Caiado oficial", F + "Foto_oficial_do_governador_de_Goi%C3%A1s%2C_Ronaldo_Caiado_em_2023_%28ombros%29.jpg?width=900"],
  ["Flávio 05/11", F + "Entrevistas_Diversas_-_Senador_Fl%C3%A1vio_Bolsonaro_(PL-RJ)_(54611254764).jpg?width=900"],
  ["Trump headshot", F + "Donald_Trump_official_portrait%2C_2025_%28cropped_headshot%29.jpg?width=900"],
  ["Flávio Miami", F + "Fl%C3%A1vio.Bolsonaro.2026.05.21.%28cropped%29.jpg?width=900"],
  ["Apple cubo", F + "New_Fifth_Ave_Apple_Cube.jpg?width=900"],
];
const caixas = [["16:9", "16/9"], ["4:3", "4/3"]];
const pos = ["0%", "20%", "25%", "30%"];
let html = `<body style="font:12px sans-serif;margin:8px">`;
for (const [n, u] of fotos) {
  html += `<div style="display:flex;gap:6px;margin-bottom:6px;align-items:flex-start"><b style="width:90px">${n}</b>`;
  for (const [cn, c] of caixas) for (const p of pos)
    html += `<div><div>${cn} ${p}</div><div style="width:${c === "16/9" ? 200 : 150}px;aspect-ratio:${c};overflow:hidden"><img src="${u}" style="width:100%;height:100%;object-fit:cover;object-position:50% ${p}"></div></div>`;
  html += `</div>`;
}
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.setContent(html, { waitUntil: "networkidle" });
await p.waitForTimeout(3000);
await p.screenshot({ path: `${saida}/recorte.png`, fullPage: true });
await b.close();
console.log("ok");
