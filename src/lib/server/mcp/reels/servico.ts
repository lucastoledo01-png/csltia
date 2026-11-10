import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { candidatosSupabase, type CandidatoDeReel, type CandidatosDeReel } from "@/lib/server/social/reels/candidatos";
import { modoDosReels } from "@/lib/server/social/reels/descoberta";
import { linkDoPainel } from "../dia";
import { tarefasSupabase, type TarefasStore } from "../tarefas-store";
import type { AcessoDoMcp } from "../tokens";

/**
 * As ferramentas do Reel no MCP (28/10/2026). Nenhuma publica nem aprova: o
 * Claude escolhe o vídeo, escreve o texto (pela tarefa `escrever_reel`) e olha
 * o resultado; o Reel só vai ao ar aprovado no painel.
 */

type Resposta = { ok: true; [chave: string]: unknown } | { ok: false; error: string; status: number };

export type DepsDoReelNoMcp = {
  candidatos: CandidatosDeReel;
  tarefas: TarefasStore;
  baixarImagem: (url: string) => Promise<{ mime: string; base64: string } | null>;
  /** O vídeo do link como candidato (10/11/2026): devolve o id da linha, nova ou a que já existia. */
  candidatoDoLink?: (projectId: string, video: VideoDoLink) => Promise<string>;
  /** Título e canal do vídeo do YouTube, pelo oEmbed público (sem chave). */
  dadosDoYoutube?: (url: string) => Promise<{ titulo: string; canal: string } | null>;
};

export type VideoDoLink = {
  fonte: "youtube" | "link";
  origemId: string;
  permalink: string;
  autor: string;
  titulo: string;
  idioma: "en" | "pt";
  credito: string;
};

/** Pura: o id do vídeo do YouTube num link (watch, youtu.be, shorts, embed, live). */
export function idDoYoutube(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (host !== "youtube.com" && host !== "music.youtube.com") return null;
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Pura: o vídeo que o dono mandou, pronto para virar candidato. Do YouTube,
 * com o canal como crédito e o idioma da fala, que liga a transcrição e a
 * legenda em português, como num canal da lista. De outro lugar (Instagram,
 * X), o yt-dlp do worker baixa pelo link, sem transcrição.
 */
export function videoDoLink(
  url: string,
  dados: { titulo: string; canal: string } | null,
  extra: { idioma?: unknown; credito?: unknown; titulo?: unknown },
): VideoDoLink | { erro: string } {
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const idioma = extra.idioma === "pt" ? "pt" : "en";
  const yt = idDoYoutube(url);
  if (yt) {
    const canal = texto(extra.credito) || dados?.canal || "";
    if (!canal) return { erro: "não consegui ler o canal do vídeo: informe credito (o nome do canal, que entra como crédito na legenda)" };
    return {
      fonte: "youtube",
      origemId: yt,
      permalink: `https://www.youtube.com/watch?v=${yt}`,
      autor: canal,
      titulo: (dados?.titulo || texto(extra.titulo) || "vídeo do YouTube").slice(0, 200),
      idioma,
      credito: canal,
    };
  }
  if (!/^https?:\/\//.test(url)) return { erro: "informe url: o link do vídeo (YouTube, Instagram, X)" };
  const credito = texto(extra.credito);
  if (!credito) return { erro: "informe credito: quem publicou o vídeo (entra como crédito na legenda do post)" };
  return {
    fonte: "link",
    origemId: createHash("sha1").update(url).digest("hex").slice(0, 20),
    permalink: url,
    autor: credito,
    titulo: (texto(extra.titulo) || "vídeo").slice(0, 200),
    idioma,
    credito,
  };
}

export function depsDoReelNoMcp(client: SupabaseClient): DepsDoReelNoMcp {
  return {
    candidatos: candidatosSupabase(client),
    tarefas: tarefasSupabase(client),
    async candidatoDoLink(projectId, v) {
      const linha = {
        project_id: projectId,
        fonte: v.fonte,
        origem_id: v.origemId,
        permalink: v.permalink,
        url_video: null,
        autor: v.autor,
        titulo: v.titulo,
        legenda: null,
        publicado_em: new Date().toISOString(),
        // O canal no formato da descoberta: é o que liga a transcrição e o crédito no worker.
        metricas: { origem: "link_do_dono", canal: { nome: v.autor, idioma: v.idioma, credito: v.credito, id: null } },
        nota: 100,
        estado: "nova",
      };
      const { error } = await client.from("reels_candidatos").upsert(linha, { onConflict: "project_id,fonte,origem_id", ignoreDuplicates: true });
      if (error) throw new Error(`o vídeo do link não foi gravado: ${error.message}`);
      const { data, error: e } = await client
        .from("reels_candidatos")
        .select("id")
        .eq("project_id", projectId)
        .eq("fonte", v.fonte)
        .eq("origem_id", v.origemId)
        .maybeSingle();
      if (e || !data) throw new Error(`o vídeo do link não foi relido: ${e?.message ?? "sem linha"}`);
      return String((data as { id: string }).id);
    },
    async dadosDoYoutube(url) {
      try {
        const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10_000) });
        if (!r.ok) return null;
        const j = (await r.json()) as { title?: string; author_name?: string };
        return j.author_name ? { titulo: String(j.title ?? ""), canal: String(j.author_name) } : null;
      } catch {
        return null;
      }
    },
    async baixarImagem(url) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!r.ok) return null;
        return { mime: r.headers.get("content-type") ?? "image/jpeg", base64: Buffer.from(await r.arrayBuffer()).toString("base64") };
      } catch {
        return null;
      }
    },
  };
}

function resumo(c: CandidatoDeReel) {
  return {
    id: c.id,
    fonte: c.fonte,
    autor: c.autor,
    titulo: c.titulo,
    link: c.permalink,
    nota: c.nota,
    publicado_em: c.publicadoEm,
    historia_do_termometro: c.metricas.historia ?? null,
    metricas: c.metricas,
  };
}

export async function reelsSugeridos(acesso: AcessoDoMcp, args: { limite?: unknown }, deps: DepsDoReelNoMcp): Promise<Resposta> {
  if (modoDosReels(acesso.projeto) === "off") {
    return { ok: false, status: 409, error: "os Reels estão desligados neste projeto (settings.capacidades.reels)" };
  }
  const limite = Math.min(20, Math.max(1, Number(args.limite ?? 8) || 8));
  const lista = await deps.candidatos.sugeridos(acesso.projeto.id, limite);
  return {
    ok: true,
    reels: lista.map(resumo),
    proximo_passo: lista.length
      ? "Escolha um e chame produzir_reel com o id. Abra o link para ver o vídeo de origem."
      : "Nenhum candidato novo. A descoberta roda de hora em hora, das 9h às 17h.",
  };
}

export async function produzirReel(
  acesso: AcessoDoMcp,
  args: { candidato_id?: unknown; url?: unknown; idioma?: unknown; credito?: unknown; titulo?: unknown },
  deps: DepsDoReelNoMcp,
): Promise<Resposta> {
  let id = typeof args.candidato_id === "string" ? args.candidato_id : "";
  // O vídeo que o dono mandou (10/11/2026): vira candidato e segue o mesmo caminho dos sugeridos.
  if (!id && typeof args.url === "string" && args.url.trim()) {
    if (modoDosReels(acesso.projeto) === "off") {
      return { ok: false, status: 409, error: "os Reels estão desligados neste projeto (settings.capacidades.reels)" };
    }
    if (!deps.candidatoDoLink) return { ok: false, status: 501, error: "o Reel por link não está ligado neste caminho" };
    const url = args.url.trim();
    const dados = idDoYoutube(url) && deps.dadosDoYoutube ? await deps.dadosDoYoutube(url) : null;
    const video = videoDoLink(url, dados, args);
    if ("erro" in video) return { ok: false, status: 400, error: video.erro };
    id = await deps.candidatoDoLink(acesso.projeto.id, video);
  }
  const c = id ? await deps.candidatos.porId(id) : null;
  if (!c || c.projectId !== acesso.projeto.id) return { ok: false, status: 404, error: "candidato não encontrado neste projeto" };
  // O que falhou (download, render, sem vaga) tenta de novo com o preparo e o texto que já tinha.
  if (c.estado === "falhou") {
    if (!(await deps.candidatos.tentarDeNovo(id))) return { ok: false, status: 409, error: "outro pedido mexeu neste candidato antes" };
    return { ok: true, candidato_id: id, proximo_passo: "De volta ao worker, com o texto que você já entregou. Acompanhe com ver_reel." };
  }
  if (c.estado !== "nova") return { ok: false, status: 409, error: `o candidato está "${c.estado}"${c.motivo ? `: ${c.motivo}` : ""}` };
  if (!(await deps.candidatos.escolher(id))) return { ok: false, status: 409, error: "outro pedido escolheu este candidato antes" };
  return {
    ok: true,
    candidato_id: id,
    proximo_passo:
      "O worker baixa o vídeo, mede o corte e abre a tarefa escrever_reel, em cerca de um minuto. " +
      "Chame ver_reel para ver a folha de quadros com o corte, e proxima_tarefa com tipo escrever_reel para escrever.",
  };
}

export async function verReel(
  acesso: AcessoDoMcp,
  args: { candidato_id?: unknown },
  deps: DepsDoReelNoMcp,
): Promise<Resposta & { imagem?: { mime: string; base64: string } | null }> {
  const id = typeof args.candidato_id === "string" ? args.candidato_id : "";
  const c = id ? await deps.candidatos.porId(id) : null;
  if (!c || c.projectId !== acesso.projeto.id) return { ok: false, status: 404, error: "candidato não encontrado neste projeto" };

  const tarefa = c.preparo?.tarefaId ? await deps.tarefas.porId(c.preparo.tarefaId) : null;
  const etapa =
    c.estado === "pronta"
      ? "pronto: o Reel está na fila de aprovação do painel"
      : c.estado === "renderizando"
        ? "o worker está trabalhando neste vídeo"
        : c.estado === "escolhida" && !c.preparo
          ? "esperando o worker baixar e preparar"
          : c.estado === "escolhida" && !c.texto
            ? `esperando o texto: tarefa ${tarefa?.id ?? "?"} (${tarefa?.estado ?? "?"})`
            : c.estado === "escolhida"
              ? "texto aceito, esperando o render"
              : `${c.estado}${c.motivo ? `: ${c.motivo}` : ""}`;

  // A folha do Reel pronto quando há; antes disso, a do vídeo de origem com o corte proposto.
  const folha = (c.estado === "pronta" ? c.preparo?.folhaFinalUrl : null) ?? c.preparo?.folhaUrl ?? null;
  return {
    ok: true,
    ...resumo(c),
    estado: c.estado,
    etapa,
    texto: c.texto
      ? {
          molde: c.texto.molde,
          manchete: c.texto.manchete,
          legenda: c.texto.legenda,
          corte: c.texto.corte,
          ...(c.texto.trechos ? { trechos: c.texto.trechos } : {}),
          ...(c.texto.legendas ? { legendas_da_fala: c.texto.legendas } : {}),
          ...(c.texto.enquadramento ? { enquadramento: c.texto.enquadramento } : {}),
        }
      : null,
    idioma_da_fala: c.preparo?.idioma ?? null,
    corte_proposto: c.preparo?.corte ?? null,
    tarefa: tarefa ? { id: tarefa.id, estado: tarefa.estado, motivos: tarefa.motivos } : null,
    painel: c.estado === "pronta" ? linkDoPainel(acesso.projeto.slug) : null,
    imagem: folha ? await deps.baixarImagem(folha) : null,
  };
}

