import { casaComNicho, nomesDoTitulo } from "@/lib/server/editorial/termometro";
import type { VideoAchado } from "./tipos";

/**
 * A ordem dos vídeos achados (28/10/2026).
 *
 * Três sinais, e nenhum chama modelo: a nota da fonte (o quanto o vídeo rende
 * lá), o calor do assunto no termômetro (o ranking que o radar grava em
 * `platform_events` a cada 15 minutos) e o nicho. Fora do nicho não entra: o
 * vídeo viral de futebol rende muito e não é do eua.journal.
 *
 * O assunto casa com uma história do termômetro por NOME próprio em comum
 * (`nomesDoTitulo`), dois ou mais, ou um só quando ele aparece no título do
 * vídeo. Vetor ficaria mais fino, mas o motor Claude não chama OpenAI.
 */

export type LinhaDoRanking = { titulo: string; calor: number };

export type VideoOrdenado = VideoAchado & { nota: number; calorDoAssunto: number; historia: string | null };

export function calorDoAssunto(video: Pick<VideoAchado, "titulo" | "legenda">, ranking: LinhaDoRanking[]): { calor: number; historia: string | null } {
  const doTitulo = nomesDoTitulo(video.titulo);
  const doTexto = new Set([...doTitulo, ...nomesDoTitulo(video.legenda.slice(0, 500))]);
  let melhor: { calor: number; historia: string | null } = { calor: 0, historia: null };
  for (const linha of ranking) {
    const nomes = nomesDoTitulo(linha.titulo);
    const comuns = [...nomes].filter((n) => doTexto.has(n));
    const casa = comuns.length >= 2 || comuns.some((n) => doTitulo.has(n));
    if (casa && linha.calor > melhor.calor) melhor = { calor: linha.calor, historia: linha.titulo };
  }
  return melhor;
}

/*
 * O nicho em inglês (09/11/2026), para os canais americanos: o vídeo tem de
 * falar dos EUA (governo, Congresso, mercado, empresas americanas) e não pode
 * ser esporte nem fofoca. `casaComNicho` lê português e quase nunca acha
 * "EUA" num título da CNBC. Imigração como NOTÍCIA política entra (Trump
 * falando de deportação, o Congresso votando): é a política dos EUA. O que
 * fica fora é a ORIENTAÇÃO de visto, em qualquer idioma (`orientacaoDeVisto`).
 */
const SINAIS_DOS_EUA_EM_INGLES =
  /\b(u\.s|usa|america|american|americans|trump|biden|vance|rubio|bessent|powell|white house|congress|senate|house speaker|capitol|supreme court|pentagon|federal reserve|the fed|fed chair|wall street|nasdaq|dow|s&p|treasury|tariffs?|washington|new york|california|texas|florida|irs|sec|ftc|doj|fbi|elon musk|tesla|nvidia|apple|microsoft|google|amazon|meta|openai|jobs report|inflation|cpi|gdp|mortgage|shutdown|election|governor|mayor)\b/i;
const FORA_DO_NICHO_EM_INGLES =
  /\b(nfl|nba|mlb|nhl|super bowl|touchdown|playoffs?|world series|game \d|score[sd]?|highlights|celebrity|red carpet|oscars?|grammys?|kardashian|horoscope|recipe|weather forecast)\b/i;

export function casaComNichoEmIngles(texto: string): boolean {
  // "US" só em maiúsculas: "us" minúsculo é pronome ("join us").
  return (SINAIS_DOS_EUA_EM_INGLES.test(texto) || /\bUS\b/.test(texto)) && !FORA_DO_NICHO_EM_INGLES.test(texto);
}

/** Vídeo que ensina a tirar visto, green card ou cidadania: fora do eua.journal, em qualquer idioma. */
const ORIENTACAO_DE_VISTO =
  /\b(how to (get|apply|obtain|renew)[^.]{0,40}(visa|green card|citizenship|h-?1b|asylum)|(visa|green card|citizenship|naturali[sz]ation|h-?1b|uscis) (interview|tips|process|application|requirements|checklist|lawyer|attorney|fees)|immigration (lawyer|attorney)|como (tirar|conseguir|renovar|pedir)[^.]{0,30}(visto|green card|cidadania)|entrevista (do|de|no) (visto|consulado)|(dicas|passo a passo)[^.]{0,30}(visto|green card|cidadania)|advogad[oa] de imigra[cç][aã]o)\b/i;

export function orientacaoDeVisto(texto: string): boolean {
  return ORIENTACAO_DE_VISTO.test(texto);
}

function dentroDoNicho(v: VideoAchado): boolean {
  const texto = `${v.titulo}\n${v.legenda.slice(0, 500)}`;
  if (orientacaoDeVisto(texto)) return false;
  return v.idioma === "en" ? casaComNichoEmIngles(texto) : casaComNicho(texto);
}

export function ordenarVideos(videos: VideoAchado[], ranking: LinhaDoRanking[]): { ordenados: VideoOrdenado[]; foraDoNicho: VideoAchado[] } {
  const foraDoNicho: VideoAchado[] = [];
  const ordenados: VideoOrdenado[] = [];
  for (const v of videos) {
    if (!dentroDoNicho(v)) {
      foraDoNicho.push(v);
      continue;
    }
    const assunto = calorDoAssunto(v, ranking);
    ordenados.push({
      ...v,
      calorDoAssunto: assunto.calor,
      historia: assunto.historia,
      nota: Math.round(0.6 * v.notaDaFonte + 0.4 * assunto.calor),
    });
  }
  ordenados.sort((a, b) => b.nota - a.nota);
  return { ordenados, foraDoNicho };
}

/**
 * As buscas do YouTube da rodada: os termos do projeto e os nomes das duas
 * histórias mais quentes do termômetro, até quatro (o teto da cota).
 */
export function consultasDoYoutube(termos: string[], ranking: LinhaDoRanking[], maximo = 4): string[] {
  const dasHistorias = [...ranking]
    .sort((a, b) => b.calor - a.calor)
    .slice(0, 2)
    .map((l) => [...nomesDoTitulo(l.titulo)].slice(0, 3).join(" "))
    .filter(Boolean);
  const vistas = new Set<string>();
  return [...dasHistorias, ...termos]
    .map((t) => t.trim())
    .filter((t) => t && !vistas.has(t.toLowerCase()) && vistas.add(t.toLowerCase()))
    .slice(0, maximo);
}
