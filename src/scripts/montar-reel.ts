/**
 * Monta um Reel 9:16 a partir de um vídeo, nos moldes do eua.journal (28/10/2026).
 *
 *   npx tsx src/scripts/montar-reel.ts --video <arquivo.mp4> --formato a|b \
 *     --linhas "LINHA 1|*LINHA EM DESTAQUE*|LINHA 3" [--rotulo TRAGÉDIA] [--categoria MUNDO] \
 *     [--corte x:y:largura:altura] [--saida <arquivo.mp4>] \
 *     [--trechos "12.5-30,41-55"] [--legendas legendas.json] [--quadrado]
 *
 * `--legendas` é um JSON `[{ "inicio": 0, "fim": 2.1, "texto": "..." }]`, em
 * segundos do Reel montado (depois dos trechos colados), e só vale no molde B.
 *
 * Os dois moldes, documentados em `docs/reels.md`:
 *
 *   a  o vídeo dentro da moldura do template (`reel/molde-a.jpg`, as bandeiras,
 *      o Capitólio e a Casa Branca), com o rótulo na faixa vermelha e a manchete
 *      em três linhas embaixo, a do meio em vermelho;
 *   b  o vídeo em tela cheia, com a marca no alto, a editoria numa etiqueta
 *      vermelha e a manchete em caixas brancas.
 *
 * `--corte` recorta o vídeo de origem antes de encaixar, em pixels do arquivo
 * original: é como se tira a marca e a legenda de quem publicou primeiro. Sem
 * corte, o vídeo entra inteiro, centralizado. O áudio original é mantido.
 *
 * Não publica nada: grava o MP4. Publicar é com `_publicar-reel-manual.ts`.
 * Precisa de ffmpeg no PATH e do Chromium do Playwright.
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PASTA = path.dirname(fileURLToPath(import.meta.url));

type Formato = "a" | "b";

type Pedido = {
  video: string;
  formato: Formato;
  linhas: string[];
  rotulo: string;
  categoria: string;
  corte: { x: number; y: number; largura: number; altura: number } | null;
  saida: string;
  /** Molde B: por quantos segundos a manchete fica na tela (padrão `SEGUNDOS_DA_MANCHETE`). */
  segundosDaManchete?: number;
  /**
   * Os trechos do vídeo que entram, em segundos do arquivo, colados nesta ordem
   * (09/11/2026, o Reel da fala de um canal). Sem trechos, o vídeo inteiro.
   */
  trechos?: Trecho[];
  /** Molde B: a legenda em português, em segundos do Reel montado (depois dos trechos colados). */
  legendas?: Legenda[];
  /** Molde B: "quadrado" põe o vídeo 1:1 no meio, sobre ele mesmo desfocado. */
  enquadramento?: "cheio" | "quadrado";
  /** Teto do MP4 em bytes: acima dele, o Reel sai de novo em 720x1280, mais comprimido. */
  tetoDeBytes?: number;
};

export type Trecho = { inicio: number; fim: number };
export type Legenda = { inicio: number; fim: number; texto: string };

/** Onde o vídeo entra no molde A, em pixels do 1080x1920 (medido no template de 28/10/2026). */
export const MOLDURA_A = { x: 44, y: 609, largura: 992, altura: 537 };

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] : undefined;
}

export function lerCorte(bruto: string | undefined): Pedido["corte"] {
  if (!bruto) return null;
  const n = bruto.split(":").map(Number);
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x) || x < 0)) throw new Error("--corte é x:y:largura:altura");
  return { x: n[0], y: n[1], largura: n[2], altura: n[3] };
}

/** "12.5-30,41-55" em trechos; torto é recusado. */
export function lerTrechos(bruto: string | undefined): Trecho[] | undefined {
  if (!bruto) return undefined;
  return bruto.split(",").map((par) => {
    const [a, b] = par.split("-").map(Number);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || a < 0) throw new Error('--trechos é "inicio-fim,inicio-fim" em segundos');
    return { inicio: a, fim: b };
  });
}

function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "*TEXTO*" é a linha em destaque (vermelha no molde A). */
export function linhasDoTexto(bruto: string): Array<{ texto: string; destaque: boolean }> {
  return bruto
    .split("|")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith("*") && l.endsWith("*") ? { texto: l.slice(1, -1), destaque: true } : { texto: l, destaque: false }));
}

const FONTES =
  '<link href="https://fonts.googleapis.com/css2?family=Anton&family=Epilogue:wght@300;800&family=Inter:wght@800&family=Source+Serif+4:wght@700&display=swap" rel="stylesheet">';

/**
 * Molde A: o fundo é o template com o rótulo e a manchete cobertos e escritos
 * de novo. A faixa vermelha é redesenhada por cima da antiga, no mesmo
 * enviesado, e a manchete ganha uma faixa escura que se funde ao fundo nas
 * bordas. A moldura fica como está: o vídeo entra por cima dela no ffmpeg.
 */
function htmlDoMoldeA(p: Pedido, fundo: string): string {
  const linhas = linhasDoTexto(p.linhas.join("|"));
  return `<!doctype html><meta charset=utf-8>${FONTES}<style>
*{box-sizing:border-box}html,body{margin:0}body{width:1080px;height:1920px;position:relative;overflow:hidden;background:#050a1c url(${fundo}) 0 0/1080px 1920px no-repeat}
.abs{position:absolute}
#ban{left:112px;top:314px;width:892px;height:216px}
#banin{position:absolute;inset:0;background:linear-gradient(180deg,#e3172d 0%,#b30c1d 55%,#8d0614 100%);transform:skewX(-12deg);box-shadow:0 0 30px rgba(229,30,50,.35)}
#btt{display:inline-block}
#bt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:Anton,sans-serif;font-style:italic;color:#fff;letter-spacing:.01em;transform:skewX(-8deg);text-shadow:0 5px 0 rgba(0,0,0,.25);white-space:nowrap}
#faixa{left:0;right:0;top:1196px;height:368px;background:linear-gradient(180deg,rgba(5,9,26,0) 0%,rgba(5,9,26,.97) 9%,rgba(5,9,26,.97) 91%,rgba(5,9,26,0) 100%)}
#hd{left:60px;right:60px;top:1214px;height:340px;display:flex;flex-direction:column;justify-content:center;align-items:center}
.ln{display:inline-block;font-family:Anton,sans-serif;color:#fff;text-transform:uppercase;line-height:1.02;white-space:nowrap;text-shadow:0 4px 18px rgba(0,0,0,.5)}
.ln.r{color:#e31b2e}
</style>
<div id=ban class=abs><div id=banin></div><div id=bt><span id=btt>${escapar(p.rotulo)}</span></div></div>
<div id=faixa class=abs></div>
<div id=hd class=abs>${linhas.map((l) => `<div class="ln${l.destaque ? " r" : ""}">${escapar(l.texto)}</div>`).join("")}</div>
<script>
// Cada linha cresce até caber: o rótulo em 780px, a manchete em 940px.
function caber(el, max, de, ate){let t=de;el.style.fontSize=t+'px';while(el.getBoundingClientRect().width>max&&t>ate){t-=2;el.style.fontSize=t+'px'}}
document.fonts.ready.then(()=>{caber(document.getElementById('btt'),760,176,90);for(const l of document.querySelectorAll('.ln'))caber(l,940,118,64);document.body.dataset.pronto='1'});
</script>`;
}

/** Molde B: só a camada de cima, transparente, sobre o vídeo em tela cheia. */
/*
 * O molde B do Reel de vídeo (09/11/2026, pedido do dono): a marca é a imagem
 * "eua." do Instagram, e não "eua.journal" escrito em texto, e o bloco da
 * manchete sobe para fora da faixa de baixo, onde o Instagram desenha legenda,
 * nome do perfil e botões. Com a base a 250 px a manchete ficava coberta.
 */
export const BASE_DO_MOLDE_B = 560;

/*
 * A manchete do molde B fica na tela só no começo (09/11/2026, pedido do dono):
 * depois de 4 segundos ela some num fade de meio segundo e sobra o vídeo com a
 * marca. Manchete parada o Reel inteiro cobre a cena e briga com a legenda.
 */
export const SEGUNDOS_DA_MANCHETE = 4;

function logoDoMoldeB(): string {
  const arquivo = path.join(PASTA, "..", "..", "public", "marca", "eua-instagram-fundo-escuro.png");
  return `data:image/png;base64,${readFileSync(arquivo).toString("base64")}`;
}

function htmlDoMoldeB(p: Pedido, comManchete = true): string {
  const linhas = comManchete ? linhasDoTexto(p.linhas.join("|")) : [];
  return `<!doctype html><meta charset=utf-8>${FONTES}<style>
*{box-sizing:border-box}html,body{margin:0;background:transparent}body{width:1080px;height:1920px;position:relative;overflow:hidden}
.abs{position:absolute}
#topo{left:0;right:0;top:0;height:320px;background:linear-gradient(180deg,rgba(0,0,0,.45),rgba(0,0,0,0))}
#sc{left:0;right:0;bottom:0;height:900px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.6) 45%,rgba(0,0,0,.72))}
#tab{left:91px;top:250px;width:210px;filter:drop-shadow(0 2px 10px rgba(0,0,0,.45))}
#base{left:91px;right:60px;bottom:${BASE_DO_MOLDE_B}px}
#cat{display:inline-block;margin:0 0 18px 16px;background:#e5334b;color:#fff;font-family:"Source Serif 4";font-weight:700;font-size:28px;letter-spacing:.06em;padding:7px 18px 5px}
.ln{display:block;width:max-content;max-width:930px;margin-bottom:8px;background:#fff;color:#111;font-family:"Source Serif 4";font-weight:700;font-size:62px;line-height:80px;padding:2px 18px 0;white-space:nowrap}
</style>
<div id=topo class=abs></div><div id=sc class=abs></div>
<img id=tab class=abs src="${logoDoMoldeB()}" alt="" />
<div id=base class=abs>${comManchete && p.categoria ? `<div id=cat>${escapar(p.categoria.toUpperCase())}</div>` : ""}${linhas.map((l) => `<div class=ln>${escapar(l.texto)}</div>`).join("")}</div>
<script>
function caber(el,max,de,ate){let t=de;el.style.fontSize=t+'px';el.style.lineHeight=Math.round(t*1.29)+'px';while(el.scrollWidth>max&&t>ate){t-=2;el.style.fontSize=t+'px';el.style.lineHeight=Math.round(t*1.29)+'px'}}
document.fonts.ready.then(()=>{for(const l of document.querySelectorAll('.ln'))caber(l,930,62,40);document.body.dataset.pronto='1'});
</script>`;
}

/*
 * A legenda da fala no molde B (09/11/2026): faixa preta translúcida, Inter
 * 800 de 42 px, centralizada. O topo fica em y 1395 enquanto a manchete está
 * na tela (logo abaixo dela) e sobe para y 1300 depois que ela some; as duas
 * posições ficam acima da faixa de baixo, onde o Instagram desenha a legenda
 * do post e os botões.
 */
export const TOPO_DA_LEGENDA = { comManchete: 1395, depois: 1300 } as const;

function htmlDaLegenda(texto: string): string {
  return `<!doctype html><meta charset=utf-8>${FONTES}<style>
*{box-sizing:border-box}html,body{margin:0;background:transparent}body{width:1080px;position:relative}
#c{position:absolute;left:0;top:0;width:1080px;text-align:center}
#leg{display:inline-block;max-width:940px;background:rgba(0,0,0,.78);color:#fff;font-family:Inter,sans-serif;font-weight:800;font-size:42px;line-height:1.25;padding:10px 22px 12px;border-radius:6px}
</style><div id=c><div id=leg>${escapar(texto)}</div></div>
<script>document.fonts.ready.then(()=>{document.body.dataset.pronto='1'})</script>`;
}

/** Uma imagem por legenda, do tamanho da faixa (largura do Reel inteira, para a centralização valer). */
async function renderizarLegendas(legendas: Legenda[], pasta: string): Promise<string[]> {
  if (!legendas.length) return [];
  const { chromium } = await import("playwright-core");
  const navegador = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  });
  try {
    const pagina = await navegador.newPage({ viewport: { width: 1080, height: 600 } });
    const arquivos: string[] = [];
    for (const [i, l] of legendas.entries()) {
      await pagina.setContent(htmlDaLegenda(l.texto), { waitUntil: "networkidle" });
      await pagina.waitForFunction(() => document.body.dataset.pronto === "1", null, { timeout: 20_000 });
      const caixa = await pagina.locator("#leg").boundingBox();
      const altura = Math.max(2, Math.ceil(((caixa?.y ?? 0) + (caixa?.height ?? 60)) / 2) * 2);
      const arquivo = path.join(pasta, `legenda-${String(i).padStart(2, "0")}.png`);
      await pagina.screenshot({ path: arquivo, omitBackground: true, clip: { x: 0, y: 0, width: 1080, height: altura } });
      arquivos.push(arquivo);
    }
    return arquivos;
  } finally {
    await navegador.close();
  }
}

async function renderizar(html: string, saida: string, transparente: boolean): Promise<void> {
  const { chromium } = await import("playwright-core");
  const navegador = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  });
  try {
    const pagina = await navegador.newPage({ viewport: { width: 1080, height: 1920 } });
    await pagina.setContent(html, { waitUntil: "networkidle" });
    await pagina.waitForFunction(() => document.body.dataset.pronto === "1", null, { timeout: 20_000 });
    await pagina.screenshot({ path: saida, omitBackground: transparente });
  } finally {
    await navegador.close();
  }
}

function ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
}

/**
 * O filtro do vídeo: o corte, e depois o encaixe. No molde A o vídeo cobre a
 * moldura (preenche e corta o que sobra); no B, a tela inteira.
 */
export function filtroDoVideo(corte: Pedido["corte"], largura: number, altura: number): string {
  const recorte = corte ? `crop=${corte.largura}:${corte.altura}:${corte.x}:${corte.y},` : "";
  return `${recorte}scale=${largura}:${altura}:force_original_aspect_ratio=increase,crop=${largura}:${altura},setsar=1`;
}

/**
 * Pura: o filtro que corta os trechos e os cola, com o áudio de cada um.
 * Sai `[v]` e, com áudio, `[a]`.
 */
export function filtroDosTrechos(trechos: Trecho[], comAudio: boolean): string {
  const n = (x: number) => Number(x.toFixed(3));
  const partes: string[] = [];
  const pares: string[] = [];
  trechos.forEach((t, i) => {
    partes.push(`[0:v]trim=start=${n(t.inicio)}:end=${n(t.fim)},setpts=PTS-STARTPTS[v${i}]`);
    if (comAudio) partes.push(`[0:a]atrim=start=${n(t.inicio)}:end=${n(t.fim)},asetpts=PTS-STARTPTS[a${i}]`);
    pares.push(comAudio ? `[v${i}][a${i}]` : `[v${i}]`);
  });
  partes.push(`${pares.join("")}concat=n=${trechos.length}:v=1:a=${comAudio ? 1 : 0}${comAudio ? "[v][a]" : "[v]"}`);
  return partes.join(";");
}

/**
 * Pura: a cadeia do vídeo no molde B, de `[0:v]` a `[v]`. "quadrado" é o
 * vídeo 1:1 de 1080 em y 300, sobre ele mesmo esticado, desfocado e um pouco
 * escurecido: é o enquadramento do close fechado demais para o 9:16.
 */
export function cadeiaDoVideoB(corte: Pedido["corte"], enquadramento: Pedido["enquadramento"] = "cheio"): string {
  if (enquadramento !== "quadrado") return `[0:v]${filtroDoVideo(corte, 1080, 1920)}[v]`;
  const recorte = corte ? `crop=${corte.largura}:${corte.altura}:${corte.x}:${corte.y},` : "";
  return (
    `[0:v]${recorte}split=2[f0][q0];` +
    `[f0]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=40,eq=brightness=-0.08,setsar=1[f];` +
    `[q0]scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,setsar=1[q];` +
    `[f][q]overlay=0:300[v]`
  );
}

/**
 * Pura: o filtro inteiro do molde B. Entradas: 0 o vídeo, 1 a camada sem a
 * manchete, 2 a camada da manchete, e de 3 em diante uma imagem por legenda.
 * Cada legenda aparece no seu intervalo, com o topo em y 1395 enquanto a
 * manchete está na tela e em y 1300 depois.
 */
export function filtroDoMoldeB(opcoes: {
  corte: Pedido["corte"];
  enquadramento?: Pedido["enquadramento"];
  segundosDaManchete: number;
  legendas?: Legenda[];
}): string {
  const s = opcoes.segundosDaManchete;
  const n = (x: number) => Number(x.toFixed(3));
  const partes = [
    cadeiaDoVideoB(opcoes.corte, opcoes.enquadramento),
    `[v][1:v]overlay=0:0:shortest=1[b]`,
    `[2:v]format=rgba,fade=t=out:st=${s - 0.5}:d=0.5:alpha=1[m]`,
    `[b][m]overlay=0:0:shortest=1[s0]`,
  ];
  const legendas = opcoes.legendas ?? [];
  legendas.forEach((l, i) => {
    const y = `'if(lt(t,${s}),${TOPO_DA_LEGENDA.comManchete},${TOPO_DA_LEGENDA.depois})'`;
    partes.push(`[s${i}][${3 + i}:v]overlay=x=0:y=${y}:eval=frame:enable='between(t,${n(l.inicio)},${n(l.fim)})':shortest=1[s${i + 1}]`);
  });
  partes.push(`[s${legendas.length}]null[s]`);
  return partes.join(";");
}

function temAudio(arquivo: string): boolean {
  const saida = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", arquivo]).toString();
  return saida.trim().length > 0;
}

/** Corta e cola os trechos num arquivo novo, que vira o vídeo de entrada do molde. */
function juntarTrechos(video: string, trechos: Trecho[], saida: string): string {
  const audio = temAudio(video);
  ffmpeg([
    "-i", video,
    "-filter_complex", filtroDosTrechos(trechos, audio),
    "-map", "[v]", ...(audio ? ["-map", "[a]"] : []),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", saida,
  ]);
  return saida;
}

/**
 * Cabe no teto: o Reel que passa dele sai de novo em 720x1280, e se ainda
 * passar, mais comprimido. O bucket de vídeo recusa acima de 10 MB.
 */
function caberNoTeto(arquivo: string, teto: number, pasta: string): void {
  if (statSync(arquivo).size <= teto) return;
  for (const crf of [23, 27, 31]) {
    const menor = path.join(pasta, `menor-${crf}.mp4`);
    ffmpeg([
      "-i", arquivo, "-vf", "scale=720:1280:flags=lanczos,setsar=1",
      "-c:v", "libx264", "-preset", "medium", "-crf", String(crf), "-pix_fmt", "yuv420p", "-r", "30",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", menor,
    ]);
    if (statSync(menor).size <= teto || crf === 31) {
      copyFileSync(menor, arquivo);
      if (statSync(arquivo).size > teto) throw new Error(`o Reel não coube em ${Math.round(teto / 1024 / 1024)} MB nem em 720x1280: encurte os trechos`);
      return;
    }
  }
}

export async function montarReel(p: Pedido): Promise<string> {
  const pasta = mkdtempSync(path.join(os.tmpdir(), "reel-"));
  try {
    if (p.trechos?.length) p = { ...p, video: juntarTrechos(p.video, p.trechos, path.join(pasta, "trechos.mp4")) };
    const camada = path.join(pasta, "camada.png");
    const codificacao = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest"];
    if (p.formato === "a") {
      const fundo = `data:image/jpeg;base64,${readFileSync(path.join(PASTA, "reel", "molde-a.jpg")).toString("base64")}`;
      await renderizar(htmlDoMoldeA(p, fundo), camada, false);
      const m = MOLDURA_A;
      ffmpeg([
        "-loop", "1", "-i", camada, "-i", p.video,
        "-filter_complex", `[1:v]${filtroDoVideo(p.corte, m.largura, m.altura)}[v];[0:v][v]overlay=${m.x}:${m.y}:shortest=1[s]`,
        "-map", "[s]", "-map", "1:a?", ...codificacao, p.saida,
      ]);
    } else {
      // Duas camadas: a de baixo (marca e escurecido) fica o Reel inteiro; a da manchete some em fade.
      const semManchete = path.join(pasta, "camada-sem-manchete.png");
      await renderizar(htmlDoMoldeB(p), camada, true);
      await renderizar(htmlDoMoldeB(p, false), semManchete, true);
      const s = Math.max(1, p.segundosDaManchete ?? SEGUNDOS_DA_MANCHETE);
      const legendas = (p.legendas ?? []).filter((l) => l.texto.trim() && l.fim > l.inicio);
      const imagens = await renderizarLegendas(legendas, pasta);
      ffmpeg([
        "-i", p.video, "-loop", "1", "-i", semManchete, "-loop", "1", "-i", camada,
        ...imagens.flatMap((img) => ["-loop", "1", "-i", img]),
        "-filter_complex",
        filtroDoMoldeB({ corte: p.corte, enquadramento: p.enquadramento, segundosDaManchete: s, legendas }),
        "-map", "[s]", "-map", "0:a?", ...codificacao, p.saida,
      ]);
    }
    if (p.tetoDeBytes) caberNoTeto(p.saida, p.tetoDeBytes, pasta);
    return p.saida;
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

async function main() {
  const video = argumento("--video");
  const formato = (argumento("--formato") ?? "a").toLowerCase();
  const linhas = argumento("--linhas");
  if (!video || !linhas || (formato !== "a" && formato !== "b")) {
    throw new Error('use --video <arquivo> --formato a|b --linhas "L1|*L2*|L3" (ver o topo do arquivo)');
  }
  const saida = argumento("--saida") ?? video.replace(/\.mp4$/i, `-eua-${formato}.mp4`);
  const feito = await montarReel({
    video,
    formato,
    linhas: [linhas],
    rotulo: argumento("--rotulo") ?? "",
    categoria: argumento("--categoria") ?? "",
    corte: lerCorte(argumento("--corte")),
    saida,
    trechos: lerTrechos(argumento("--trechos")),
    legendas: argumento("--legendas") ? (JSON.parse(readFileSync(argumento("--legendas")!, "utf8")) as Legenda[]) : undefined,
    enquadramento: process.argv.includes("--quadrado") ? "quadrado" : "cheio",
  });
  const info = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size", "-of", "csv=p=0", feito]).toString().trim();
  console.log(`pronto: ${feito} (${info})`);
}

if (process.argv[1] && /montar-reel\.(ts|js)$/.test(process.argv[1])) {
  main().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exit(1);
  });
}

