import type { VideoAchado } from "./tipos";
import { naoENoticia, notaPorVisualizacoes, segundosDaDuracao } from "./youtube";

/**
 * Os canais de notícia do YouTube como fonte de Reel (09/11/2026).
 *
 * A busca por termo (`youtube.ts`) custa 100 unidades da cota por consulta e
 * traz o que rende no YouTube, não o que os canais de notícia publicaram. O
 * canal é lido de outro jeito, pela playlist de uploads, que custa 1 unidade:
 *
 *   channels.list      só quando o canal vem por handle (1 unidade); com o id
 *                      "UC...", a playlist de uploads é "UU" mais o resto do id
 *   playlistItems.list os últimos envios do canal (1 unidade)
 *   videos.list        duração, estatísticas e se é transmissão ao vivo, até
 *                      50 vídeos por chamada (1 unidade)
 *
 * O canal declara o idioma. Vídeo de canal em inglês serve para o Reel: a
 * fala vira legenda em português (`transcricao.ts` e a tarefa `escrever_reel`).
 * O crédito ("Bloomberg") é o que vai na legenda do post, nunca no vídeo.
 */

const API = "https://www.googleapis.com/youtube/v3";

export type IdiomaDoCanal = "en" | "pt";

export type CanalDoYoutube = {
  /** O id do canal ("UC..."), quando conhecido. */
  id: string | null;
  /** O handle ("@BloombergTelevision"), quando o id não veio. */
  handle: string | null;
  nome: string;
  idioma: IdiomaDoCanal;
  /** O nome curto que vai na legenda: "Vídeo: Bloomberg". */
  credito: string;
};

/** O que fica gravado em `metricas.canal` do candidato. */
export type CanalDoCandidato = { nome: string; idioma: IdiomaDoCanal; credito: string; id: string | null };

const ID_DE_CANAL = /^UC[\w-]{22}$/;
const HANDLE = /^@?[\w.-]{3,100}$/;

/** `settings.reels.canais_youtube`: o canal torto sai, com o motivo, e o resto segue. */
export function lerCanais(bruto: unknown): { canais: CanalDoYoutube[]; avisos: string[] } {
  const avisos: string[] = [];
  if (!Array.isArray(bruto)) return { canais: [], avisos };
  const canais: CanalDoYoutube[] = [];
  const vistos = new Set<string>();
  bruto.forEach((item, i) => {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const id = typeof o.id === "string" && ID_DE_CANAL.test(o.id.trim()) ? o.id.trim() : null;
    const handleBruto = typeof o.handle === "string" ? o.handle.trim() : "";
    const handle = HANDLE.test(handleBruto) ? `@${handleBruto.replace(/^@/, "")}` : null;
    const nome = typeof o.nome === "string" ? o.nome.trim() : "";
    const idioma = o.idioma === "en" || o.idioma === "pt" ? o.idioma : null;
    if (!id && !handle) return void avisos.push(`canal ${i + 1} (${nome || "sem nome"}): sem id "UC..." nem handle válido`);
    if (!idioma) return void avisos.push(`canal ${nome || id || handle}: idioma tem de ser "en" ou "pt"`);
    const chave = (id ?? handle ?? "").toLowerCase();
    if (vistos.has(chave)) return;
    vistos.add(chave);
    const credito = typeof o.credito === "string" && o.credito.trim() ? o.credito.trim() : nome || handle || id || "";
    canais.push({ id, handle, nome: nome || credito, idioma, credito });
  });
  return { canais, avisos };
}

/** "UCxxxx" vira "UUxxxx": a playlist de uploads, sem gastar a chamada de channels.list. */
export function playlistDeUploads(canalId: string): string {
  return `UU${canalId.slice(2)}`;
}

export type LeituraDoCanal = { canal: string; ok: boolean; mensagem: string | null; videos: VideoAchado[]; unidades: number };

type Opcoes = {
  agoraMs?: number;
  janelaHoras?: number;
  fetcher?: typeof fetch;
  /** Vídeo mais longo que isto não entra (programa inteiro, transmissão gravada). */
  duracaoMaxima?: number;
  duracaoMinima?: number;
  porCanal?: number;
};

function redigir(texto: string, chave: string): string {
  return chave ? texto.split(chave).join("[redigido]") : texto;
}

async function pedir<T>(fetcher: typeof fetch, url: string, chave: string): Promise<{ ok: true; json: T } | { ok: false; mensagem: string }> {
  try {
    const r = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
    const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!r.ok || j.error) return { ok: false, mensagem: redigir(String(j.error?.message ?? r.status), chave) };
    return { ok: true, json: j };
  } catch (e) {
    return { ok: false, mensagem: redigir(String((e as Error)?.message ?? e), chave) };
  }
}

type ItemDeVideo = {
  id: string;
  snippet?: { title?: string; description?: string; channelTitle?: string; publishedAt?: string; liveBroadcastContent?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
};

/**
 * Lê os canais: os envios recentes de cada um e, numa chamada só para todos,
 * os detalhes dos vídeos. Falha de um canal vira mensagem dele; os outros
 * seguem.
 */
export async function videosDosCanais(
  canais: CanalDoYoutube[],
  chave: string,
  opcoes: Opcoes = {},
): Promise<{ leituras: LeituraDoCanal[]; videos: VideoAchado[]; unidades: number }> {
  if (!chave || canais.length === 0) return { leituras: [], videos: [], unidades: 0 };
  const fetcher = opcoes.fetcher ?? fetch;
  const agoraMs = opcoes.agoraMs ?? Date.now();
  const desde = agoraMs - (opcoes.janelaHoras ?? 48) * 3_600_000;
  const porCanal = opcoes.porCanal ?? 8;
  const leituras: LeituraDoCanal[] = [];
  const recentes = new Map<string, CanalDoYoutube>();

  for (const canal of canais) {
    const leitura: LeituraDoCanal = { canal: canal.nome, ok: true, mensagem: null, videos: [], unidades: 0 };
    leituras.push(leitura);
    let canalId = canal.id;
    if (!canalId && canal.handle) {
      const q = new URLSearchParams({ part: "id", forHandle: canal.handle, key: chave });
      const r = await pedir<{ items?: Array<{ id?: string }> }>(fetcher, `${API}/channels?${q}`, chave);
      leitura.unidades += 1;
      if (!r.ok) {
        Object.assign(leitura, { ok: false, mensagem: r.mensagem });
        continue;
      }
      canalId = r.json.items?.[0]?.id ?? null;
      if (!canalId) {
        Object.assign(leitura, { ok: false, mensagem: `o handle ${canal.handle} não respondeu com canal` });
        continue;
      }
    }
    if (!canalId) continue;
    const q = new URLSearchParams({ part: "contentDetails", playlistId: playlistDeUploads(canalId), maxResults: String(porCanal), key: chave });
    const r = await pedir<{ items?: Array<{ contentDetails?: { videoId?: string; videoPublishedAt?: string } }> }>(
      fetcher,
      `${API}/playlistItems?${q}`,
      chave,
    );
    leitura.unidades += 1;
    if (!r.ok) {
      Object.assign(leitura, { ok: false, mensagem: r.mensagem });
      continue;
    }
    for (const item of r.json.items ?? []) {
      const id = item.contentDetails?.videoId;
      const quando = Date.parse(item.contentDetails?.videoPublishedAt ?? "");
      if (id && Number.isFinite(quando) && quando >= desde) recentes.set(id, { ...canal, id: canalId });
    }
  }

  const ids = [...recentes.keys()];
  const videos: VideoAchado[] = [];
  let unidades = leituras.reduce((s, l) => s + l.unidades, 0);
  for (let i = 0; i < ids.length; i += 50) {
    const q = new URLSearchParams({ part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(","), key: chave });
    const r = await pedir<{ items?: ItemDeVideo[] }>(fetcher, `${API}/videos?${q}`, chave);
    unidades += 1;
    if (!r.ok) {
      for (const l of leituras) if (l.ok) Object.assign(l, { ok: false, mensagem: `detalhes dos vídeos: ${r.mensagem}` });
      continue;
    }
    for (const v of r.json.items ?? []) {
      const canal = recentes.get(v.id);
      if (!canal) continue;
      const video = videoDoCanal(v, canal, agoraMs, opcoes);
      if (!video) continue;
      videos.push(video);
      leituras.find((l) => l.canal === canal.nome)?.videos.push(video);
    }
  }
  return { leituras, videos, unidades };
}

/** Pura: o item de `videos.list` vira candidato, ou `null` quando não serve (ao vivo, longo, curto, não é notícia). */
export function videoDoCanal(v: ItemDeVideo, canal: CanalDoYoutube, agoraMs: number, opcoes: Opcoes = {}): VideoAchado | null {
  // Transmissão ao vivo ou agendada: não tem arquivo fechado para baixar, e tem relógio e "LIVE" na tela.
  if (v.snippet?.liveBroadcastContent && v.snippet.liveBroadcastContent !== "none") return null;
  const segundos = segundosDaDuracao(v.contentDetails?.duration ?? "");
  if (segundos === null || segundos < (opcoes.duracaoMinima ?? 20) || segundos > (opcoes.duracaoMaxima ?? 1200)) return null;
  const titulo = v.snippet?.title ?? "";
  const descricao = v.snippet?.description ?? "";
  if (naoENoticia(titulo, descricao)) return null;
  const publicado = v.snippet?.publishedAt ?? "";
  const horas = Math.max(0.5, (agoraMs - Date.parse(publicado)) / 3_600_000);
  if (!Number.isFinite(horas)) return null;
  const views = Number(v.statistics?.viewCount ?? 0);
  const doCandidato: CanalDoCandidato = { nome: canal.nome, idioma: canal.idioma, credito: canal.credito, id: canal.id };
  return {
    fonte: "youtube",
    origemId: v.id,
    permalink: `https://www.youtube.com/watch?v=${v.id}`,
    urlVideo: null,
    autor: v.snippet?.channelTitle || canal.nome,
    titulo: titulo.slice(0, 200),
    legenda: descricao.slice(0, 2000),
    publicadoEm: publicado,
    idioma: canal.idioma,
    metricas: {
      visualizacoes: views,
      curtidas: Number(v.statistics?.likeCount ?? 0),
      comentarios: Number(v.statistics?.commentCount ?? 0),
      segundos,
      horas: Math.round(horas * 10) / 10,
      canal: doCandidato,
    },
    notaDaFonte: notaPorVisualizacoes(views, horas),
  };
}

/** O canal gravado no candidato, quando ele veio de um canal. */
export function canalDoCandidato(metricas: Record<string, unknown> | null | undefined): CanalDoCandidato | null {
  const c = (metricas ?? {}).canal as Partial<CanalDoCandidato> | undefined;
  if (!c || (c.idioma !== "en" && c.idioma !== "pt") || typeof c.credito !== "string") return null;
  return { nome: String(c.nome ?? c.credito), idioma: c.idioma, credito: c.credito, id: typeof c.id === "string" ? c.id : null };
}
