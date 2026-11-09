import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { disfarcarPalavrasPesadas } from "./palavras-pesadas";

const exec = promisify(execFile);

/**
 * O Reel de foto (09/11/2026): o formato padrão do post desde 30/10/2026
 * (`docs/formato-reel-padrao.md`), que até aqui só existia feito à mão por
 * `producao-manual/_modelo-reel-foto/gerar_reels.mjs`. Agora o motor Claude
 * produz o mesmo: foto em 9:16 com zoom lento, a marca no topo, o chapéu e a
 * manchete em caixa alta com o destaque em vermelho, 10 segundos de trilha.
 *
 * As medidas são as do modelo manual, que o dono aprovou: máscara a partir de
 * y 992, base do texto a 338 px do fim, texto entre x 100 e 940. A manchete
 * passa de 4 linhas? O corpo desce de 66 até 50 px antes de desistir.
 *
 * O recorte não tem detector de rosto (o motor Claude não chama a OpenAI): a
 * foto vertical é cortada a partir do terço de cima (`foco.y` 0.2), que é onde
 * o rosto costuma estar; a foto larga demais para virar 9:16 sem perder
 * resolução vai inteira, por cima dela mesma desfocada, acima da manchete.
 */

export const LARGURA = 1080;
export const ALTURA = 1920;
export const DURACAO_S = 10;
const FPS = 30;
/** Base do zoom: 25% acima do quadro, para o recorte encolher sem perder nitidez. */
const BASE_L = 1350;
const BASE_A = 2400;
export const MASCARA_Y = 992;
export const BASE_DO_TEXTO = 338;
/** Menor largura de recorte 9:16 aceita sem cair no fundo desfocado. */
const MENOR_RECORTE = 700;
/** O bucket de vídeo limita a 10 MB. */
export const TETO_DO_VIDEO = 9.5 * 1024 * 1024;

export type Foco = { x: number; y: number };

export type PedidoDoReelDeFoto = {
  foto: Buffer;
  chapeu: string;
  manchete: string;
  /** O trecho da manchete que sai em vermelho; vazio, sem destaque. */
  destaque: string;
  foco?: Partial<Foco>;
  /** Caminho da trilha; o padrão é a trilha do projeto em `public/reels`. */
  trilha?: string;
  ffmpeg?: string;
};

export type ReelDeFoto = {
  video: Buffer;
  /** O primeiro quadro em JPEG: prévia para o Claude e pôster da fila. */
  quadro: Buffer;
  linhas: number;
  corpo: number;
  recorte: "corte" | "fundo";
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Pura: a manchete em HTML, com o destaque em `<em>` quando ele é trecho literal dela. */
export function mancheteEmHtml(manchete: string, destaque: string): string {
  const m = disfarcarPalavrasPesadas(manchete.trim());
  const d = disfarcarPalavrasPesadas(destaque.trim());
  const i = d ? m.toLowerCase().indexOf(d.toLowerCase()) : -1;
  if (i < 0) return esc(m);
  return `${esc(m.slice(0, i))}<em>${esc(m.slice(i, i + d.length))}</em>${esc(m.slice(i + d.length))}`;
}

/** Pura: o quadro transparente que vai por cima da foto. */
export function htmlDoQuadro(entrada: { chapeu: string; mancheteHtml: string; logo: string; corpo: number }): string {
  return `<!doctype html><meta charset=utf-8><link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;800&display=swap" rel="stylesheet"><style>
*{box-sizing:border-box}html,body{margin:0;background:transparent}body{width:${LARGURA}px;height:${ALTURA}px;position:relative;overflow:hidden;font-family:Inter,"Helvetica Neue",Arial,sans-serif}
#top{position:absolute;left:0;right:0;top:0;height:560px;background:linear-gradient(180deg,rgba(0,0,0,.5),rgba(0,0,0,0))}
#bot{position:absolute;left:0;right:0;top:${MASCARA_Y}px;height:${ALTURA - MASCARA_Y}px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.8) 38%,rgba(0,0,0,.6) 70%,rgba(0,0,0,.25))}
#logo{position:absolute;left:100px;top:312px;width:210px}
#blk{position:absolute;left:100px;width:840px;bottom:${BASE_DO_TEXTO}px}
#cat{display:inline-block;color:#fff;font-weight:800;font-size:24px;letter-spacing:.14em;margin-bottom:22px}
#hd{color:#fff;font-weight:800;font-size:${entrada.corpo}px;line-height:1.1;text-transform:uppercase;letter-spacing:-.01em;overflow-wrap:normal}
#hd em{font-style:normal;color:#ff3b53}
</style><div id=top></div><div id=bot></div><img id=logo src="${entrada.logo}">
<div id=blk><div id=cat>${esc(entrada.chapeu.toUpperCase())}</div><div id=hd>${entrada.mancheteHtml}</div></div>`;
}

/**
 * Pura: como a foto vira 9:16. `corte` recorta a foto (x e y em pixel da
 * original); `fundo` quando o recorte ficaria estreito demais.
 */
export function planoDoRecorte(
  largura: number,
  altura: number,
  foco: Foco,
): { modo: "corte"; l: number; a: number; x: number; y: number } | { modo: "fundo" } {
  const alvo = 9 / 16;
  if (largura / altura > alvo) {
    const l = Math.round(altura * alvo);
    if (l < MENOR_RECORTE) return { modo: "fundo" };
    const x = Math.round(Math.max(0, Math.min(largura - l, foco.x * largura - l / 2)));
    return { modo: "corte", l, a: altura, x, y: 0 };
  }
  const a = Math.round(largura / alvo);
  if (largura < MENOR_RECORTE) return { modo: "fundo" };
  const y = Math.round(Math.max(0, Math.min(altura - a, (altura - a) * foco.y)));
  return { modo: "corte", l: largura, a, x: 0, y };
}

async function baseDaFoto(foto: Buffer, foco: Foco): Promise<{ jpeg: Buffer; modo: "corte" | "fundo" }> {
  const sharp = (await import("sharp")).default;
  const img = sharp(foto, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const largura = meta.autoOrient?.width ?? meta.width ?? 0;
  const altura = meta.autoOrient?.height ?? meta.height ?? 0;
  if (!largura || !altura) throw new Error("a foto não abriu (sem largura e altura)");
  const plano = planoDoRecorte(largura, altura, foco);
  if (plano.modo === "corte") {
    const jpeg = await sharp(foto, { failOn: "none" })
      .rotate()
      .extract({ left: plano.x, top: plano.y, width: plano.l, height: plano.a })
      .resize(BASE_L, BASE_A, { kernel: "lanczos3" })
      .jpeg({ quality: 92 })
      .toBuffer();
    return { jpeg, modo: "corte" };
  }
  // A foto inteira na largura, um pouco acima do meio, sobre ela mesma desfocada e escurecida.
  const fundo = await sharp(foto, { failOn: "none" })
    .rotate()
    .resize(BASE_L, BASE_A, { fit: "cover" })
    .blur(40)
    .modulate({ brightness: 0.8 })
    .toBuffer();
  const frente = await sharp(foto, { failOn: "none" }).rotate().resize({ width: BASE_L }).toBuffer();
  const alturaDaFrente = Math.round((altura / largura) * BASE_L);
  const topo = Math.max(0, Math.round(BASE_A * 0.42 - alturaDaFrente / 2));
  const jpeg = await sharp(fundo)
    .composite([{ input: frente, top: topo, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
  return { jpeg, modo: "fundo" };
}

async function quadroTransparente(chapeu: string, mancheteHtml: string): Promise<{ png: Buffer; linhas: number; corpo: number }> {
  const { chromium } = await import("playwright-core");
  const logo = `data:image/png;base64,${readFileSync(path.join(process.cwd(), "public/marca/eua-instagram-fundo-escuro.png")).toString("base64")}`;
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim() || undefined;
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: LARGURA, height: ALTURA }, deviceScaleFactor: 1 });
    let corpo = 66;
    let linhas = 0;
    for (;;) {
      await page.setContent(htmlDoQuadro({ chapeu, mancheteHtml, logo, corpo }), { waitUntil: "load", timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready);
      linhas = await page.evaluate(
        (c) => Math.round((document.getElementById("hd")?.getBoundingClientRect().height ?? 0) / (c * 1.1)),
        corpo,
      );
      if (linhas <= 4 || corpo <= 50) break;
      corpo -= 2;
    }
    const png = await page.screenshot({ omitBackground: true, type: "png" });
    return { png: Buffer.from(png), linhas, corpo };
  } finally {
    await browser.close();
  }
}

export function trilhaPadrao(): string {
  return path.join(process.cwd(), "public/reels/trilha-noticia.m4a");
}

/** Monta o Reel. Precisa de ffmpeg no PATH (ou `FFMPEG_PATH`) e do Chromium do Playwright. */
export async function renderizarReelDeFoto(p: PedidoDoReelDeFoto): Promise<ReelDeFoto> {
  const ffmpeg = p.ffmpeg ?? process.env.FFMPEG_PATH?.trim() ?? "ffmpeg";
  const foco: Foco = { x: p.foco?.x ?? 0.5, y: p.foco?.y ?? 0.2 };
  const trilha = p.trilha ?? trilhaPadrao();
  if (!existsSync(trilha)) throw new Error(`a trilha não está em ${trilha}`);

  const pasta = mkdtempSync(path.join(os.tmpdir(), "reel-de-foto-"));
  try {
    const [base, quadro] = await Promise.all([
      baseDaFoto(p.foto, foco),
      quadroTransparente(p.chapeu, mancheteEmHtml(p.manchete, p.destaque)),
    ]);
    const arqBase = path.join(pasta, "base.jpg");
    const arqQuadro = path.join(pasta, "quadro.png");
    const saida = path.join(pasta, "reel.mp4");
    const capa = path.join(pasta, "capa.jpg");
    writeFileSync(arqBase, base.jpeg);
    writeFileSync(arqQuadro, quadro.png);

    // O zoom do modelo manual: o `perspective` interpola os cantos em fração de pixel, sem tremer.
    const fr = DURACAO_S * FPS;
    const z = 0.07;
    const P = `W/2*(1-1/(1+${z}*in/${fr}))`;
    const Q = `H/2*(1-1/(1+${z}*in/${fr}))`;
    await exec(
      ffmpeg,
      [
        "-v", "error", "-y",
        "-loop", "1", "-framerate", String(FPS), "-t", String(DURACAO_S), "-i", arqBase,
        "-i", arqQuadro,
        "-i", trilha,
        "-filter_complex",
        `[0:v]perspective=x0='${P}':y0='${Q}':x1='W-${P}':y1='${Q}':x2='${P}':y2='H-${Q}':x3='W-${P}':y3='H-${Q}':interpolation=linear:eval=frame,scale=${LARGURA}:${ALTURA}:flags=area,format=yuv420p[v];` +
          `[v][1:v]overlay=0:0,format=yuv420p[o];[2:a]volume=0.55,afade=t=in:d=0.4,afade=t=out:st=${DURACAO_S - 1}:d=1[a]`,
        "-map", "[o]", "-map", "[a]", "-t", String(DURACAO_S),
        "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-profile:v", "high",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
        saida,
      ],
      { timeout: 240_000, maxBuffer: 8 * 1024 * 1024 },
    );
    await exec(ffmpeg, ["-v", "error", "-y", "-ss", "0.5", "-i", saida, "-frames:v", "1", "-q:v", "3", capa], { timeout: 60_000 });
    const video = readFileSync(saida);
    if (video.byteLength > TETO_DO_VIDEO) {
      throw new Error(`o Reel saiu com ${(video.byteLength / 1024 / 1024).toFixed(1)} MB, acima do limite do bucket`);
    }
    return { video, quadro: readFileSync(capa), linhas: quadro.linhas, corpo: quadro.corpo, recorte: base.modo };
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

/** O que a linha do post guarda para o Reel de foto ser refeito igual (`content_json.reel_de_foto`). */
export type RegistroDoReelDeFoto = { destaque: string; foco: Foco | null; chapeu: string; recorte: "corte" | "fundo"; corpo: number };

export type ArtefatoDoReel = {
  url: string;
  path: string;
  filename: string;
  mime: string;
  sha256: string;
  bytes: number;
  largura: number;
  altura: number;
  otimizado: boolean;
};

/**
 * Baixa a foto, monta o Reel e sobe o MP4 no bucket dos Reels, com o hash no
 * nome: a versão refeita é outro arquivo, nunca o mesmo sobrescrito.
 */
export async function congelarReelDeFoto(e: {
  fotoUrl: string;
  chapeu: string;
  manchete: string;
  destaque: string;
  foco?: Partial<Foco> | null;
  /** A pasta no bucket, sem barra no fim. */
  pasta: string;
  subir: (buffer: Buffer, caminho: string, mime: string) => Promise<string | null>;
  fetcher?: typeof fetch;
  renderizar?: typeof renderizarReelDeFoto;
}): Promise<{ ok: true; artefato: ArtefatoDoReel; quadro: Buffer; registro: RegistroDoReelDeFoto } | { ok: false; motivo: string }> {
  let foto: Buffer;
  try {
    const r = await (e.fetcher ?? fetch)(e.fotoUrl, {
      headers: { "User-Agent": "eua.journal/1.0 (+https://euajournal.com)" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return { ok: false, motivo: `a foto não baixou (${r.status}): ${e.fotoUrl}` };
    foto = Buffer.from(await r.arrayBuffer());
  } catch (erro) {
    return { ok: false, motivo: `a foto não baixou: ${erro instanceof Error ? erro.message : String(erro)}` };
  }
  let reel: ReelDeFoto;
  try {
    reel = await (e.renderizar ?? renderizarReelDeFoto)({
      foto,
      chapeu: e.chapeu,
      manchete: e.manchete,
      destaque: e.destaque,
      ...(e.foco ? { foco: e.foco } : {}),
    });
  } catch (erro) {
    return { ok: false, motivo: `o Reel não fechou: ${erro instanceof Error ? erro.message : String(erro)}` };
  }
  const sha256 = createHash("sha256").update(reel.video).digest("hex");
  const filename = `reel-${sha256.slice(0, 12)}.mp4`;
  const caminho = `${e.pasta}/${filename}`;
  const url = await e.subir(reel.video, caminho, "video/mp4");
  if (!url) return { ok: false, motivo: `o Storage recusou o Reel em ${caminho}` };
  const foco = e.foco && (e.foco.x !== undefined || e.foco.y !== undefined) ? { x: e.foco.x ?? 0.5, y: e.foco.y ?? 0.2 } : null;
  return {
    ok: true,
    artefato: { url, path: caminho, filename, mime: "video/mp4", sha256, bytes: reel.video.byteLength, largura: LARGURA, altura: ALTURA, otimizado: false },
    quadro: reel.quadro,
    registro: { destaque: e.destaque, foco, chapeu: e.chapeu, recorte: reel.recorte, corpo: reel.corpo },
  };
}
