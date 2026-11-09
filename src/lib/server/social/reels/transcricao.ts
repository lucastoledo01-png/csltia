import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * A fala do vídeo, com tempo, sem modelo nenhum (09/11/2026).
 *
 * O YouTube gera legenda automática para quase todo vídeo falado. O yt-dlp a
 * baixa em VTT sem baixar o vídeo (`--skip-download`), e este arquivo a
 * transforma em segmentos de fala com início e fim. É com eles que o Claude
 * escolhe o trecho do Reel e escreve a legenda em português, na tarefa
 * `escrever_reel`.
 *
 * A legenda automática do YouTube vem "rolando": cada bloco repete a linha do
 * bloco anterior e acrescenta a nova, com o tempo de cada palavra marcado
 * (`<00:00:01.520><c> word</c>`). Ler os blocos como estão daria cada frase
 * duas vezes. Quando há tempo por palavra, ele é a fonte; quando não há
 * (legenda manual), vale o bloco, sem a linha repetida do anterior.
 */

export type Segmento = { inicio: number; fim: number; texto: string };

/** "00:01:02.500" ou "01:02.500" em segundos. */
export function segundosDoTempo(t: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(t.trim());
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0")) / 1000;
}

type Bloco = { inicio: number; fim: number; linhas: string[] };

function blocos(vtt: string): Bloco[] {
  const saida: Bloco[] = [];
  for (const parte of vtt.replace(/\r/g, "").split(/\n{2,}/)) {
    const linhas = parte.split("\n");
    const i = linhas.findIndex((l) => l.includes("-->"));
    if (i < 0) {
      // A legenda automática abre o bloco com uma linha de um espaço; se ela chegar vazia, o texto vem solto aqui.
      const anterior = saida[saida.length - 1];
      if (anterior && !anterior.linhas.some((l) => l.trim())) anterior.linhas.push(...linhas);
      continue;
    }
    const [a, b] = linhas[i].split("-->");
    const inicio = segundosDoTempo(a);
    const fim = segundosDoTempo((b ?? "").trim().split(/\s+/)[0] ?? "");
    if (inicio === null || fim === null) continue;
    saida.push({ inicio, fim, linhas: linhas.slice(i + 1) });
  }
  return saida;
}

const TEMPO_EMBUTIDO = /<(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})>/;

function semMarcas(t: string): string {
  return t
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Palavra = { inicio: number; texto: string };

/** As palavras com tempo, das linhas que trazem o tempo embutido (só a linha nova de cada bloco traz). */
function palavrasComTempo(bs: Bloco[]): Palavra[] {
  const palavras: Palavra[] = [];
  for (const b of bs) {
    for (const linha of b.linhas) {
      if (!TEMPO_EMBUTIDO.test(linha)) continue;
      // Divide pela marca de tempo: o pedaço antes da primeira marca começa no início do bloco.
      const pedacos = linha.split(/<(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\d{1,2}:\d{2}[.,]\d{3})>/);
      let tempo = b.inicio;
      for (let k = 0; k < pedacos.length; k++) {
        if (k % 2 === 1) {
          tempo = segundosDoTempo(pedacos[k]) ?? tempo;
          continue;
        }
        for (const p of semMarcas(pedacos[k]).split(" ").filter(Boolean)) palavras.push({ inicio: tempo, texto: p });
      }
    }
  }
  return palavras;
}

/**
 * Junta as palavras em segmentos de fala: quebra numa pausa de mais de 1,2 s,
 * no fim de frase, ou quando o segmento passa de 8 s. Segmento curto é o que
 * deixa o Claude cortar no ponto certo.
 */
function segmentosDasPalavras(palavras: Palavra[], fimDoUltimo: number): Segmento[] {
  const saida: Segmento[] = [];
  let atual: Palavra[] = [];
  const fechar = (fim: number) => {
    if (!atual.length) return;
    saida.push({ inicio: arred(atual[0].inicio), fim: arred(Math.max(fim, atual[0].inicio + 0.2)), texto: atual.map((p) => p.texto).join(" ") });
    atual = [];
  };
  palavras.forEach((p, i) => {
    const seguinte = palavras[i + 1];
    atual.push(p);
    const fimDeFrase = /[.!?]$/.test(p.texto);
    const pausa = seguinte ? seguinte.inicio - p.inicio > 1.2 : false;
    const longo = p.inicio - atual[0].inicio >= 8;
    if (!seguinte) fechar(fimDoUltimo);
    else if (fimDeFrase || pausa || longo) fechar(pausa ? p.inicio + 0.6 : seguinte.inicio);
  });
  return saida;
}

function arred(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Pura: o VTT vira segmentos de fala, em ordem, sem repetição. */
export function segmentosDoVtt(vtt: string): Segmento[] {
  const bs = blocos(vtt);
  if (!bs.length) return [];
  const palavras = palavrasComTempo(bs);
  if (palavras.length) return segmentosDasPalavras(palavras, bs[bs.length - 1].fim);

  // Sem tempo por palavra: cada bloco, sem a linha que repete a última do bloco anterior.
  const saida: Segmento[] = [];
  let ultima = "";
  for (const b of bs) {
    const novas: string[] = [];
    for (const l of b.linhas.map(semMarcas).filter(Boolean)) {
      if (l === ultima || novas.includes(l)) continue;
      novas.push(l);
    }
    const anterior = saida[saida.length - 1];
    // O bloco que só repete a fala do anterior estende o tempo dela.
    if (!novas.length) {
      if (anterior) anterior.fim = arred(Math.max(anterior.fim, b.fim));
      continue;
    }
    ultima = novas[novas.length - 1];
    const texto = novas.join(" ");
    saida.push({ inicio: arred(b.inicio), fim: arred(b.fim), texto });
  }
  return saida.filter((s) => s.fim > s.inicio);
}

/** Só os segmentos que começam antes de `ate` segundos, com o fim cortado nele. */
export function segmentosAte(segmentos: Segmento[], ate: number): Segmento[] {
  return segmentos.filter((s) => s.inicio < ate).map((s) => ({ ...s, fim: Math.min(s.fim, arred(ate)) }));
}

const IDIOMAS: Record<"en" | "pt", string[]> = {
  en: ["en", "en-US", "en-GB", "en-orig"],
  pt: ["pt", "pt-BR", "pt-orig"],
};

/**
 * Baixa a legenda do vídeo pelo yt-dlp (a manual quando existe, senão a
 * automática), sem baixar o vídeo. Devolve os segmentos, ou lança com o
 * motivo: sem legenda, o vídeo em inglês não vira Reel, porque não há o que
 * traduzir.
 */
export function transcreverDoYoutube(url: string, idioma: "en" | "pt", pasta: string): Segmento[] {
  const langs = IDIOMAS[idioma];
  try {
    execFileSync(
      "yt-dlp",
      [
        "--no-playlist", "--no-progress", "--skip-download",
        "--js-runtimes", "node",
        "--write-subs", "--write-auto-subs",
        "--sub-langs", langs.join(","),
        "--sub-format", "vtt",
        "-o", path.join(pasta, "fala.%(ext)s"),
        url,
      ],
      { stdio: "pipe", timeout: 120_000 },
    );
  } catch (e) {
    const detalhe = (e as { stderr?: Buffer }).stderr?.toString().trim().split("\n").pop() ?? (e as Error).message;
    throw new Error(`o yt-dlp não baixou a legenda do vídeo: ${detalhe.slice(0, 300)}`);
  }
  const arquivos = readdirSync(pasta).filter((f) => f.startsWith("fala.") && f.endsWith(".vtt"));
  // A ordem de preferência é a de `langs`: a faixa "en" antes da "en-orig".
  const escolhido = langs.map((l) => `fala.${l}.vtt`).find((f) => arquivos.includes(f)) ?? arquivos[0];
  if (!escolhido) throw new Error(`o vídeo não tem legenda em ${idioma === "en" ? "inglês" : "português"} no YouTube (nem automática): sem a fala com tempo, não há como legendar`);
  const segmentos = segmentosDoVtt(readFileSync(path.join(pasta, escolhido), "utf8"));
  if (!segmentos.length) throw new Error(`a legenda do vídeo (${escolhido}) veio vazia`);
  return segmentos;
}
