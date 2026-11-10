import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { disfarcarPalavrasPesadas } from "@/lib/server/social/palavras-pesadas";
import os from "node:os";
import path from "node:path";
import type { Project } from "@/lib/server/projects";
import { projectToday } from "@/lib/server/projects";
import { sha256De, type ArtefatoCongelado } from "@/lib/server/social/artefato";
import { abrirEscritaDoReel, materialDoCandidato } from "@/lib/server/mcp/reels/tarefa";
import type { TarefasStore } from "@/lib/server/mcp/tarefas-store";
import { baixarVideo } from "./baixar";
import type { CandidatoDeReel, CandidatosDeReel } from "./candidatos";
import { canalDoCandidato } from "./canais";
import {
  ASPECTO_DO_MOLDE,
  cortesDeCena,
  folhaDeQuadros,
  medidasDoVideo,
  medirCaixasParaApagar,
  medirCorte,
  medirCorteDoCanal,
  videoEmPe,
  type Corte,
} from "./corte";
import type { ReelParaGravar } from "./gravar";
import { segmentosAte, transcreverDoArquivo, transcreverDoYoutube, type Segmento } from "./transcricao";

export type VideoEmPe = { emPe: boolean; apagar: Corte[] };

/** O vídeo em pé e as marcas de terceiro a apagar nele. Falha ao medir é "não está em pé": o corte segue como era. */
export function medirVideoEmPe(arquivo: string): VideoEmPe {
  try {
    if (!videoEmPe(medidasDoVideo(arquivo))) return { emPe: false, apagar: [] };
    return { emPe: true, apagar: medirCaixasParaApagar(arquivo) };
  } catch {
    return { emPe: false, apagar: [] };
  }
}

/**
 * O trabalho do worker nos Reels (28/10/2026), em dois passos, cada um pego
 * por reivindicação condicional:
 *
 *   preparar   o Claude escolheu o vídeo: baixa, corta no tempo, mede o corte
 *              dos dois moldes, desenha a folha de quadros, sobe tudo no bucket
 *              `reels` e abre a tarefa `escrever_reel`;
 *   renderizar o Claude entregou o texto: monta o Reel no molde, sobe o MP4 e
 *              grava a linha na fila de aprovação, em `aguardando`.
 *
 * Roda no worker porque precisa de ffmpeg, yt-dlp e Chromium. Falha vira
 * `falhou` com o motivo no candidato; nada aqui publica.
 */

export const BUCKET_DOS_REELS = "reels";

export type DepsDoTrabalho = {
  candidatos: CandidatosDeReel;
  tarefas: TarefasStore;
  projeto: (projectId: string) => Promise<Project | null>;
  subir: (buffer: Buffer, caminho: string, mime: string) => Promise<string | null>;
  gravar: (projeto: Project, reel: ReelParaGravar) => Promise<{ ok: true; postId: string } | { ok: false; error: string }>;
  montar: (pedido: {
    video: string;
    formato: "a" | "b";
    linhas: string[];
    rotulo: string;
    categoria: string;
    corte: { x: number; y: number; largura: number; altura: number } | null;
    saida: string;
    trechos?: Array<{ inicio: number; fim: number }>;
    legendas?: Array<{ inicio: number; fim: number; texto: string }>;
    enquadramento?: "cheio" | "quadrado";
    apagar?: Array<{ x: number; y: number; largura: number; altura: number }>;
    tetoDeBytes?: number;
  }) => Promise<string>;
  /** O vídeo em pé e as marcas a apagar nele (10/11/2026); o teste injeta. */
  medirEmPe?: (arquivo: string) => VideoEmPe;
  baixar?: typeof baixarVideo;
  transcrever?: (url: string, idioma: "en" | "pt", pasta: string) => Segmento[];
  /** A fala do arquivo baixado, pelo whisper.cpp do worker; o teste injeta. */
  transcreverArquivo?: (arquivo: string, pasta: string) => { idioma: string | null; segmentos: Segmento[] };
  /** Os cortes de cena do vídeo baixado (ffmpeg); o teste injeta. */
  cenas?: (arquivo: string) => number[];
  fetcher?: typeof fetch;
};

function pasta(): string {
  return mkdtempSync(path.join(os.tmpdir(), "reel-trabalho-"));
}

async function subirArquivo(deps: DepsDoTrabalho, arquivo: string, caminho: string, mime: string): Promise<string> {
  const url = await deps.subir(readFileSync(arquivo), caminho, mime);
  if (!url) throw new Error(`o Storage recusou ${caminho}`);
  return url;
}

/*
 * O vídeo de canal (09/11/2026) é uma entrevista ou um trecho de programa, de
 * alguns minutos, e o que interessa é a fala, que pode estar no meio. Então
 * ele é guardado com mais tempo que os 60 s do vídeo de perfil, e um pouco
 * mais comprimido, para caber no bucket.
 */
export const SEGUNDOS_DO_VIDEO_DE_CANAL = 240;

/** Teto do MP4 final: o bucket de vídeo recusa acima de 10 MB, e a margem evita descobrir isso no upload. */
export const TETO_DO_REEL_EM_BYTES = Math.floor(9.5 * 1024 * 1024);

export async function prepararCandidato(c: CandidatoDeReel, deps: DepsDoTrabalho): Promise<void> {
  const projeto = await deps.projeto(c.projectId);
  if (!projeto) throw new Error(`o projeto ${c.projectId} não existe`);
  const dir = pasta();
  try {
    const canal = c.fonte === "youtube" ? canalDoCandidato(c.metricas) : null;
    /*
     * A fala vem antes do vídeo: é barata (não baixa o vídeo), e o vídeo em
     * inglês sem legenda não tem como virar Reel. Em português a legenda é
     * ajuda para escolher o trecho; sem ela, o Reel sai como sempre.
     */
    let transcricao: Segmento[] | null = null;
    if (canal && c.permalink) {
      try {
        transcricao = (deps.transcrever ?? transcreverDoYoutube)(c.permalink, canal.idioma, dir);
      } catch (e) {
        if (canal.idioma === "en") throw e;
      }
    }
    // O link que o dono mandou (10/11/2026) também é fala longa: guarda os mesmos 240 s do canal.
    const longo = Boolean(canal) || c.fonte === "link";
    const video = await (deps.baixar ?? baixarVideo)(c, dir, {
      fetcher: deps.fetcher,
      ...(longo ? { segundos: SEGUNDOS_DO_VIDEO_DE_CANAL, crf: 21 } : {}),
    });
    /*
     * Sem legenda do YouTube, a fala sai do próprio arquivo (10/11/2026): o
     * vídeo do X da ABC saiu com um minuto de inglês sem legenda. Só inglês e
     * português viram legenda. No link que o dono mandou, falha na
     * transcrição para o Reel com o motivo, em vez de sair sem legenda; no
     * vídeo achado pela descoberta, segue como antes.
     */
    let idioma: "en" | "pt" | null = canal?.idioma ?? null;
    if (!transcricao) {
      try {
        const fala = (deps.transcreverArquivo ?? transcreverDoArquivo)(video.arquivo, dir);
        if (fala.segmentos.length && (fala.idioma === "en" || fala.idioma === "pt")) {
          transcricao = fala.segmentos;
          idioma = fala.idioma;
        } else if (fala.segmentos.length && c.fonte === "link") {
          throw new Error(`a fala do vídeo está em "${fala.idioma ?? "?"}": só inglês e português viram legenda`);
        }
      } catch (e) {
        if (c.fonte === "link") throw e;
        console.error("[REELS] transcrição do arquivo:", e instanceof Error ? e.message : e);
      }
    }
    const comFala = Boolean(transcricao?.length);
    /*
     * O vídeo deitado de canal (a transmissão de TV) tem o corte próprio: sempre
     * dentro da faixa limpa, centrado em quem fala. O vertical do canal (Short)
     * não tem faixa de TV e segue a máscara de sempre.
     */
    const transmissao = Boolean(canal) && video.largura > video.altura;
    const medir = (aspecto: number) => (transmissao ? medirCorteDoCanal(video.arquivo, aspecto) : medirCorte(video.arquivo, aspecto).corte);
    // Em pé, o molde B não tem corte (10/11/2026): a folha mostra o quadro inteiro, que é o que vai ao ar.
    const emPe = videoEmPe(video);
    const corte = {
      a: medir(ASPECTO_DO_MOLDE.a),
      b: emPe ? null : medir(ASPECTO_DO_MOLDE.b),
      ...(canal ? { q: medir(ASPECTO_DO_MOLDE.q) } : {}),
    };
    const molde = canal || comFala || video.largura < video.altura ? "b" : "a";
    const folha = folhaDeQuadros(video.arquivo, path.join(dir, "folha.jpg"), corte[molde]);
    const base = `${projeto.slug}/${c.id}`;
    const videoUrl = await subirArquivo(deps, video.arquivo, `${base}/origem.mp4`, "video/mp4");
    const folhaUrl = await subirArquivo(deps, folha, `${base}/folha-origem.jpg`, "image/jpeg");
    const preparo = {
      videoUrl,
      videoPath: `${base}/origem.mp4`,
      folhaUrl,
      original: { largura: video.largura, altura: video.altura, segundos: video.segundos },
      corte,
      tarefaId: null as string | null,
      ...(canal || comFala
        ? {
            idioma: idioma ?? "en",
            transcricao: transcricao ? segmentosAte(transcricao, video.segundos) : null,
            cenas: (deps.cenas ?? cortesDeCena)(video.arquivo),
          }
        : {}),
    };
    const tarefa = await abrirEscritaDoReel(c.projectId, projectToday(projeto), materialDoCandidato(c, preparo), deps.tarefas);
    await deps.candidatos.preparado(c.id, { ...preparo, tarefaId: tarefa.id });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function renderizarCandidato(c: CandidatoDeReel, deps: DepsDoTrabalho): Promise<{ postId: string; folhaUrl: string }> {
  const projeto = await deps.projeto(c.projectId);
  if (!projeto) throw new Error(`o projeto ${c.projectId} não existe`);
  if (!c.preparo || !c.texto) throw new Error("candidato sem preparo ou sem texto");
  const t = c.texto;
  const dir = pasta();
  try {
    const origem = path.join(dir, "origem.mp4");
    const resposta = await (deps.fetcher ?? fetch)(c.preparo.videoUrl, { signal: AbortSignal.timeout(120_000) });
    if (!resposta.ok) throw new Error(`o vídeo preparado não baixou (${resposta.status})`);
    writeFileSync(origem, Buffer.from(await resposta.arrayBuffer()));

    const saida = path.join(dir, "reel.mp4");
    /*
     * Vídeo em pé no molde B entra inteiro (10/11/2026): nenhum corte, nem o
     * proposto nem o que o Claude escolheu, porque qualquer corte só tira
     * cabeça ou pé. A marca de terceiro é apagada no quadro.
     */
    const emPe = t.molde === "b" && t.enquadramento !== "quadrado" ? (deps.medirEmPe ?? medirVideoEmPe)(origem) : { emPe: false, apagar: [] };
    const corte = emPe.emPe ? null : t.corte;
    // As palavras pesadas saem disfarçadas no vídeo, como na legenda (29/10/2026).
    const linhas = t.linhas.map((l, i) => (i === t.destaque ? `*${disfarcarPalavrasPesadas(l)}*` : disfarcarPalavrasPesadas(l))).join("|");
    await deps.montar({
      video: origem,
      formato: t.molde,
      linhas: [linhas],
      rotulo: disfarcarPalavrasPesadas(t.rotulo),
      categoria: t.categoria,
      corte,
      saida,
      trechos: t.trechos,
      legendas: t.legendas?.map((l) => ({ ...l, texto: disfarcarPalavrasPesadas(l.texto) })),
      enquadramento: t.enquadramento,
      ...(emPe.apagar.length ? { apagar: emPe.apagar } : {}),
      tetoDeBytes: TETO_DO_REEL_EM_BYTES,
    });

    const bytes = readFileSync(saida);
    const sha256 = sha256De(bytes);
    const medidas = medidasDoVideo(saida);
    // O hash no nome: a versão refeita depois de uma reprovação é outro arquivo, nunca o mesmo sobrescrito.
    const caminho = `${projeto.slug}/${c.id}/reel-${sha256.slice(0, 12)}.mp4`;
    const url = await subirArquivo(deps, saida, caminho, "video/mp4");
    const folha = folhaDeQuadros(saida, path.join(dir, "folha.jpg"), null);
    const folhaUrl = await subirArquivo(deps, folha, `${projeto.slug}/${c.id}/folha-${sha256.slice(0, 12)}.jpg`, "image/jpeg");

    const video: ArtefatoCongelado = {
      url,
      path: caminho,
      filename: path.basename(caminho),
      mime: "video/mp4",
      sha256,
      bytes: statSync(saida).size,
      largura: medidas.largura,
      altura: medidas.altura,
      otimizado: false,
    };
    const r = await deps.gravar(projeto, {
      data: projectToday(projeto),
      candidato: {
        id: c.id,
        fonte: c.fonte,
        origemId: c.origemId,
        autor: c.autor,
        permalink: c.permalink,
        credito: canalDoCandidato(c.metricas)?.credito ?? null,
      },
      manchete: t.manchete,
      legenda: t.legenda,
      molde: t.molde,
      desenho: {
        rotulo: t.rotulo,
        categoria: t.categoria,
        linhas: t.linhas,
        destaque: t.destaque,
        corte,
        ...(emPe.emPe ? { em_pe: true, apagado: emPe.apagar } : {}),
        tarefa_id: t.tarefaId,
        ...(t.trechos ? { trechos: t.trechos } : {}),
        ...(t.legendas ? { legendas: t.legendas } : {}),
        ...(t.enquadramento ? { enquadramento: t.enquadramento } : {}),
      },
      video,
      folhaUrl,
      postExistente: c.socialPostId,
    });
    if (!r.ok) throw new Error(r.error);
    return { postId: r.postId, folhaUrl };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Um giro: devolve o que ficou preso, prepara um e renderiza um. */
export async function giroDosReels(deps: DepsDoTrabalho): Promise<{ preparados: number; renderizados: number; falhas: string[] }> {
  const saida = { preparados: 0, renderizados: 0, falhas: [] as string[] };
  await deps.candidatos.recuperarPresos(20).catch(() => 0);

  for (const c of await deps.candidatos.filaDePreparo(1)) {
    if (!(await deps.candidatos.reivindicar(c.id))) continue;
    try {
      await prepararCandidato(c, deps);
      saida.preparados += 1;
    } catch (e) {
      const motivo = `preparo: ${e instanceof Error ? e.message : String(e)}`;
      saida.falhas.push(motivo);
      await deps.candidatos.encerrar(c.id, "falhou", motivo);
    }
  }

  for (const c of await deps.candidatos.filaDeRender(1)) {
    if (!(await deps.candidatos.reivindicar(c.id))) continue;
    try {
      const { postId, folhaUrl } = await renderizarCandidato(c, deps);
      await deps.candidatos.pronta(c.id, postId, { ...c.preparo!, folhaFinalUrl: folhaUrl });
      saida.renderizados += 1;
    } catch (e) {
      const motivo = `render: ${e instanceof Error ? e.message : String(e)}`;
      saida.falhas.push(motivo);
      await deps.candidatos.encerrar(c.id, "falhou", motivo);
    }
  }
  return saida;
}
