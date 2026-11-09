import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/server/projects";
import { modoDaFila } from "@/lib/server/aprovacao/modo";
import { opcoesDaFilaParaOStore, projetoDaFila } from "@/lib/server/aprovacao/integracao";
import { montarContexto, pautaAvaliadaDoContexto } from "@/lib/server/aprovacao/contexto-de-producao";
import { cadenciaDoProjeto } from "@/lib/server/cadencia";
import type { CandidataPersistida } from "@/lib/server/editorial/candidatos-store";
import { entidadesDaClassificacao } from "@/lib/server/editorial/classificador";
import { impressaoDoAcontecimento } from "@/lib/server/editorial/fingerprint";
import { chapeuDaPeca, gramaticaEfetiva, renderizarCapas, type EntradaDaCapa } from "@/lib/server/social/arte";
import { congelarArtefato, congelarCarrossel, sha256De, type ArtefatoCongelado, type ArtefatoDeSlide } from "@/lib/server/social/artefato";
import { entradasDoCarrossel } from "@/lib/server/social/carrossel/arte";
import type { CopyDoCarrossel } from "@/lib/server/social/carrossel/copy";
import { papeisDoModelo } from "@/lib/server/social/carrossel/estrutura";
import { podarMioloSemFoto } from "@/lib/server/social/carrossel/fotos";
import type { CarrosselGerado } from "@/lib/server/social/gerador";
import type { FotoDoSlide } from "../dia/fotos";
import { subirArquivoParaStorage } from "@/lib/server/social/instagram/armazenamento";
import { renderizarReelDeFoto, type Foco, type ReelDeFoto, type RegistroDoReelDeFoto } from "@/lib/server/social/reel-de-foto";
import { legendaDoInstagram, linhaDeCredito } from "@/lib/server/social/legenda-final";
import { modoDoPipelineSocial, permiteEnforce } from "@/lib/server/social/modo";
import { vagasDaTarde, type PostDoDia } from "@/lib/server/social/quente-da-tarde";
import { topicoDaPauta } from "@/lib/server/social/selecao";
import { avaliarPostSocial } from "@/lib/server/social/social-guard";
import { chaveDeIdempotencia, criarSocialPostsStore, resolverOrigem } from "@/lib/server/social/social-posts-store";
import { zonedTimeToUtc } from "@/lib/server/time";
import type { TarefasStore } from "../tarefas-store";
import type { MaterialDaEscrita, ResultadoDaEscrita } from "./fluxo";
import { visualDoMaterial } from "./material";

/**
 * Montar e agendar o post do Claude (27/10/2026).
 *
 * A mesma sequência que `rodarCicloSocial` faz depois da redação
 * (`social/pipeline-v2.ts`), sem modelo nenhum: os portões, a vaga, o chapéu,
 * a arte congelada, o crédito da legenda e a gravação pelo store, que grava o
 * histórico editorial e põe o post na fila de aprovação.
 *
 * Os portões que o store pula são repetidos aqui, porque quem chama o store
 * direto passa por fora do ciclo:
 *
 * - a fila de aprovação em `enforce`, sem exceção: no motor Claude nada vai ao
 *   ar sem alguém aprovar no painel (decisão do dono);
 * - o Social V2 em `enforce` no projeto, e a liberação do ambiente
 *   (`permiteEnforce`), as mesmas do ciclo.
 *
 * Na v1 a peça é única, no molde jornal, sem bolha: a bolha pede detecção de
 * rosto, que é chamada de modelo, e ainda não virou tarefa do Claude.
 */

export type DepsDoAgendamento = {
  client: SupabaseClient;
  tarefas: TarefasStore;
  candidata: (projectIdDaFonte: string, storyId: string) => Promise<CandidataPersistida | null>;
  env?: Record<string, string | undefined>;
  agora?: () => Date;
  /** Só para teste: o render e o congelamento de verdade abrem o Chromium. */
  renderizar?: typeof renderizarCapas;
  congelar?: typeof congelarArtefato;
  renderizarReel?: typeof renderizarReelDeFoto;
  congelarCarrossel?: typeof congelarCarrossel;
  subir?: (buffer: Buffer, caminho: string, mime: string) => Promise<string | null>;
  fetcher?: typeof fetch;
};

/** O formato da peça do Claude: Reel de foto (o padrão desde 30/10/2026) ou estático. */
export type FormatoDaPeca = "reel" | "estatico" | "carrossel";

/** O bucket dos Reels (`social/reels/trabalho.ts`): o MP4 passa do teto do `public_assets`. */
const BUCKET_DOS_REELS = "reels";

export type PedidoDoPost = { storyId: string; data: string; formato?: FormatoDaPeca; foco?: Partial<Foco> };

type Falha = { ok: false; error: string };

function falha(error: string): Falha {
  return { ok: false, error };
}

/** O post pronto: a escrita que passou na auditoria e na guarda, com o material dela. */
async function postPronto(projeto: Project, storyId: string, data: string, deps: DepsDoAgendamento) {
  const tarefas = await deps.tarefas.doDia(projeto.id, data);
  const escrita = tarefas.find((t) => t.tipo === "escrever_post" && t.chave === storyId);
  if (!escrita) return falha(`não há escrita da pauta ${storyId} em ${data}`);
  const resultado = escrita.resultado as ResultadoDaEscrita | null;
  if (escrita.estado !== "entregue" || !resultado?.pronto) {
    return falha("o post ainda não passou pela auditoria e pela guarda: peça a próxima tarefa e entregue");
  }
  const material = escrita.material as MaterialDaEscrita;
  const candidata = await deps.candidata(material.origem.projectId, storyId);
  const pauta = pautaAvaliadaDoContexto(material.pauta, candidata);
  const veredicto = avaliarPostSocial(
    resultado.copy,
    {
      pauta,
      pacote: material.pacote,
      candidata,
      keyword: material.keyword,
      fechamentoDaNewsletter: (deps.env ?? process.env).NEWSLETTER_FINAL_LINE,
      hashtags: material.hashtags,
    },
    resultado.reparos,
  );
  // A guarda é determinística: o que passou na entrega passa aqui. Se não passar, algo mudou no meio.
  if (!veredicto.passed) {
    return falha(`a guarda não confirma mais o post: ${veredicto.issues.map((i) => i.detalhe).join("; ")}`);
  }
  return { ok: true as const, escrita, material, pauta, candidata, veredicto, copy: resultado.copy };
}

function capaDo(pronto: Exclude<Awaited<ReturnType<typeof postPronto>>, Falha>): EntradaDaCapa {
  const visual = visualDoMaterial(pronto.material);
  const eixo = pronto.pauta.classificacao.eixo ?? "";
  const chapeu = chapeuDaPeca({ eixo, textos: [pronto.copy.headline, pronto.material.pauta.titulo, pronto.material.pauta.resumo] });
  const gramatica = gramaticaEfetiva({ pedida: "jornal", eixo, chapeu, headline: pronto.copy.headline, comFoto: true });
  return {
    headline: pronto.copy.headline,
    eixo,
    chapeu,
    asset: visual.asset,
    assetSecundario: null,
    motivoSemFoto: "",
    gramatica,
  };
}

type Pronto = Exclude<Awaited<ReturnType<typeof postPronto>>, Falha>;

/** O foco que o Claude deu ao escolher a foto, quando o pedido não traz outro. */
async function focoDaFoto(projeto: Project, pedido: PedidoDoPost, deps: DepsDoAgendamento): Promise<Partial<Foco> | undefined> {
  if (pedido.foco && (pedido.foco.x !== undefined || pedido.foco.y !== undefined)) return pedido.foco;
  const tarefas = await deps.tarefas.doDia(projeto.id, pedido.data);
  const foto = tarefas
    .filter((t) => t.tipo === "escolher_foto" && t.chave === pedido.storyId && t.estado === "entregue")
    .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm))[0];
  const foco = (foto?.resultado as { foco?: Partial<Foco> } | null)?.foco;
  return foco && typeof foco === "object" ? foco : undefined;
}

/** O Reel de foto da pauta (09/11/2026): a foto aprovada, o chapéu e a manchete com o destaque. */
async function reelDoPost(
  pronto: Pronto,
  pedido: PedidoDoPost,
  deps: DepsDoAgendamento,
  projeto?: Project,
): Promise<{ ok: true; reel: ReelDeFoto; registro: RegistroDoReelDeFoto } | Falha> {
  const visual = visualDoMaterial(pronto.material);
  const url = visual.asset?.imageUrl;
  if (!url) return falha("a pauta não tem foto aprovada, e o Reel é feito da foto");
  let foto: Buffer;
  try {
    const r = await (deps.fetcher ?? fetch)(url, {
      headers: { "User-Agent": "eua.journal/1.0 (+https://euajournal.com)" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return falha(`a foto não baixou (${r.status}): ${url}`);
    foto = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    return falha(`a foto não baixou: ${e instanceof Error ? e.message : String(e)}`);
  }
  const capa = capaDo(pronto);
  const foco = projeto ? await focoDaFoto(projeto, pedido, deps) : pedido.foco;
  try {
    const chapeu = capa.chapeu ?? "";
    const destaque = pronto.copy.destaque ?? "";
    const reel = await (deps.renderizarReel ?? renderizarReelDeFoto)({ foto, chapeu, manchete: pronto.copy.headline, destaque, foco });
    const focoGravado = foco && (foco.x !== undefined || foco.y !== undefined) ? { x: foco.x ?? 0.5, y: foco.y ?? 0.2 } : null;
    return { ok: true, reel, registro: { destaque, foco: focoGravado, chapeu, recorte: reel.recorte, corpo: reel.corpo } };
  } catch (e) {
    return falha(`o Reel não fechou: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** As fotos dos slides que o Claude entregou junto com a da capa (`extras_resolvidas`). */
async function fotosDosSlidesGravadas(projeto: Project, pedido: PedidoDoPost, deps: DepsDoAgendamento): Promise<FotoDoSlide[]> {
  const tarefas = await deps.tarefas.doDia(projeto.id, pedido.data);
  const foto = tarefas
    .filter((t) => t.tipo === "escolher_foto" && t.chave === pedido.storyId && t.estado === "entregue")
    .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm))[0];
  const lista = (foto?.resultado as { extras_resolvidas?: unknown } | null)?.extras_resolvidas;
  return Array.isArray(lista)
    ? (lista as FotoDoSlide[]).filter((f) => f && typeof f.imageUrl === "string" && f.imageUrl)
    : [];
}

type PecasDoCarrossel = {
  ok: true;
  entradas: ReturnType<typeof entradasDoCarrossel>["entradas"];
  fotos: FotoDoSlide[];
  carrossel: CarrosselGerado;
  copy: CopyDoCarrossel;
};

/**
 * O carrossel de notícia da pauta (09/11/2026): a capa com a foto aprovada e
 * um slide por passo, cada um com a foto que o Claude escolheu para ele. Slide
 * sem foto sai (`podarMioloSemFoto`); abaixo do mínimo, não há carrossel, e
 * quem chama faz o Reel de foto no lugar.
 */
async function pecasDoCarrossel(projeto: Project, pronto: Pronto, pedido: PedidoDoPost, deps: DepsDoAgendamento): Promise<PecasDoCarrossel | Falha> {
  const forma = pronto.material.carrossel;
  const copy = pronto.copy as CopyDoCarrossel;
  if (!forma || !Array.isArray(copy.slides) || copy.slides.length === 0) {
    return falha("a escrita desta pauta não foi feita como carrossel");
  }
  const fotos = await fotosDosSlidesGravadas(projeto, pedido, deps);
  const podado = podarMioloSemFoto({
    papeis: forma.papeis,
    slides: copy.slides,
    fotos: papeisDoModelo(forma.papeis).map((_, i) => fotos[i] ?? null),
  });
  if (podado.formato === "static") return falha(`sem foto para os slides: ${podado.motivo}`);
  const capa = capaDo(pronto);
  const comSlides: CopyDoCarrossel = { ...copy, slides: podado.slides };
  const entradas = entradasDoCarrossel(comSlides, podado.papeis, {
    eixo: capa.eixo ?? "",
    ...(capa.chapeu ? { chapeu: capa.chapeu } : {}),
    asset: capa.asset ?? null,
    motivoSemFoto: "",
    gramatica: capa.gramatica ?? "jornal",
    fotosDoMiolo: podado.fotos,
  }).entradas;
  const fotosQueFicaram = podado.fotos.filter((f): f is FotoDoSlide => Boolean(f?.imageUrl)).map((f) => ({ imageUrl: f.imageUrl, attribution: f.attribution ?? "" }));
  return {
    ok: true,
    entradas,
    fotos: fotosQueFicaram,
    copy: comSlides,
    carrossel: { estrutura: forma.estrutura, papeis: podado.papeis, slides: podado.slides, claims: [], removidos: podado.tirados },
  };
}

/** A prévia da peça, para o Claude olhar antes de agendar. Não grava nada. */
export async function montarPost(
  projeto: Project,
  pedido: PedidoDoPost,
  deps: DepsDoAgendamento,
): Promise<{ ok: true; png: Buffer; telas?: Buffer[]; manchete: string; legenda: string; formato: FormatoDaPeca; nota?: string } | Falha> {
  const pronto = await postPronto(projeto, pedido.storyId, pedido.data, deps);
  if (!pronto.ok) return pronto;
  let credito = linhaDeCredito([visualDoMaterial(pronto.material).asset]);
  let formato = pedido.formato ?? "estatico";
  let nota: string | undefined;
  let png: Buffer | undefined;
  let telas: Buffer[] | undefined;
  if (formato === "carrossel") {
    const c = await pecasDoCarrossel(projeto, pronto, pedido, deps);
    if (c.ok) {
      const artes = await (deps.renderizar ?? renderizarCapas)(c.entradas);
      if (artes.length === 0) return falha("o render do carrossel não devolveu as telas");
      png = artes[0].jpeg;
      telas = artes.slice(1).map((a) => a.jpeg);
      credito = linhaDeCredito([visualDoMaterial(pronto.material).asset, ...c.fotos]);
    } else {
      nota = `o carrossel não fecha (${c.error}); vai como Reel de foto`;
      formato = "reel";
    }
  }
  if (png) {
    // carrossel já desenhado
  } else if (formato === "reel") {
    const reel = await reelDoPost(pronto, pedido, deps, projeto);
    if (!reel.ok) return reel;
    png = reel.reel.quadro;
  } else {
    const [arte] = await (deps.renderizar ?? renderizarCapas)([capaDo(pronto)]);
    if (!arte) return falha("o render não devolveu a peça");
    // A prévia vai em JPEG: o PNG em 2x passa de 4 MB, e a peça congelada para a Meta é feita no agendamento.
    png = arte.jpeg;
  }
  if (!png) return falha("o render não devolveu a peça");
  return {
    ok: true,
    formato,
    png,
    ...(telas ? { telas } : {}),
    ...(nota ? { nota } : {}),
    manchete: pronto.copy.headline,
    legenda: legendaDoInstagram(pronto.veredicto.legendaFinal, { hashtags: "manter", credito }),
  };
}

export async function agendarPost(
  projeto: Project,
  pedido: PedidoDoPost,
  deps: DepsDoAgendamento,
): Promise<{ ok: true; postId: string | null; quando: string; legenda: string; formato: FormatoDaPeca; quadro?: Buffer; nota?: string } | Falha> {
  const env = deps.env ?? process.env;
  if (modoDaFila(projeto) !== "enforce") {
    return falha("a fila de aprovação do projeto não está em enforce: nada do Claude é agendado sem aprovação no painel");
  }
  if (modoDoPipelineSocial(env, projeto) !== "enforce") {
    return falha("o Social V2 do projeto não está em enforce (settings.capacidades.social)");
  }
  const liberacao = permiteEnforce(env);
  if (!liberacao.permitido) return falha(`o ambiente não libera gravar posts: ${liberacao.motivo}`);

  const pronto = await postPronto(projeto, pedido.storyId, pedido.data, deps);
  if (!pronto.ok) return pronto;

  const { data: linhas, error } = await deps.client
    .from("social_posts")
    .select("status, scheduled_at, error_message, dry_run")
    .eq("project_id", projeto.id)
    .eq("edition_date", pedido.data)
    .eq("platform", "instagram");
  if (error) return falha(`os posts do dia não puderam ser lidos: ${error.message}`);
  const cadencia = cadenciaDoProjeto(projeto);
  const agora = deps.agora ? deps.agora() : new Date();
  const vagas = vagasDaTarde({
    horarios: cadencia.instagram.horarios,
    dataIso: pedido.data,
    timezone: projeto.timezone,
    agoraMs: agora.getTime(),
    postsDoDia: (linhas ?? []) as PostDoDia[],
    maximoDoDia: cadencia.instagram.volume.maximo,
    maximoDoCiclo: 1,
  });
  const horaLocal = vagas.teto > 0 ? vagas.horarios[0] : null;
  if (!horaLocal) return falha(`sem vaga no Instagram em ${pedido.data}: ${vagas.motivo}`);
  const quando = zonedTimeToUtc(pedido.data, horaLocal, projeto.timezone).toISOString();

  const capa = capaDo(pronto);
  const chave = chaveDeIdempotencia(pedido.data, pedido.storyId);
  let formato = pedido.formato ?? "estatico";
  let artefatos: ArtefatoDeSlide[] = [];
  let quadro: Buffer | undefined;
  let registroDoReel: RegistroDoReelDeFoto | undefined;
  let carrossel: PecasDoCarrossel | undefined;
  let nota: string | undefined;
  if (formato === "carrossel") {
    const c = await pecasDoCarrossel(projeto, pronto, pedido, deps);
    const congelado = c.ok ? await (deps.congelarCarrossel ?? congelarCarrossel)({ slides: c.entradas, path: `${projeto.slug}/${pedido.data}/${chave}` }) : null;
    if (c.ok && congelado?.ok) {
      carrossel = c;
      artefatos = congelado.artefatos;
    } else {
      // O carrossel que não fecha vira o Reel de foto da mesma pauta: a capa e a legenda já passaram por tudo.
      nota = `o carrossel não fechou (${c.ok ? (congelado && !congelado.ok ? congelado.motivo : "sem artefato") : c.error}); saiu como Reel de foto`;
      formato = "reel";
    }
  }
  if (carrossel) {
    // já congelado
  } else if (formato === "reel") {
    const r = await reelDoPost(pronto, pedido, deps, projeto);
    if (!r.ok) return r;
    const sha = sha256De(r.reel.video);
    const subir = deps.subir ?? ((b: Buffer, c: string, m: string) => subirArquivoParaStorage(b, c, m, BUCKET_DOS_REELS));
    // O hash no nome: a versão refeita é outro arquivo, nunca o mesmo sobrescrito.
    const caminho = `${projeto.slug}/${pedido.data}/${chave}/reel-${sha.slice(0, 12)}.mp4`;
    const url = await subir(r.reel.video, caminho, "video/mp4");
    if (!url) return falha(`o Storage recusou o Reel em ${caminho}`);
    const artefato: ArtefatoCongelado = {
      url,
      path: caminho,
      filename: `reel-${sha.slice(0, 12)}.mp4`,
      mime: "video/mp4",
      sha256: sha,
      bytes: r.reel.video.byteLength,
      largura: 1080,
      altura: 1920,
      otimizado: false,
    };
    artefatos = [{ ...artefato, index: 1 }];
    quadro = r.reel.quadro;
    registroDoReel = r.registro;
  } else {
    const congelado = await (deps.congelar ?? congelarArtefato)({ capa, path: `${projeto.slug}/${pedido.data}/${chave}` });
    if (!congelado.ok) return falha(`a arte não fechou: ${congelado.motivo}`);
    artefatos = [{ ...congelado.artefato, index: 1 }];
  }

  const visual = visualDoMaterial(pronto.material);
  const fotosQueForam = [visual.asset, ...(carrossel?.fotos ?? [])];
  const credito = linhaDeCredito(fotosQueForam);
  const legendaFinal = legendaDoInstagram(pronto.veredicto.legendaFinal, { hashtags: "manter", credito });
  const p = projetoDaFila(projeto, projeto.id);
  const store = criarSocialPostsStore(deps.client, opcoesDaFilaParaOStore(p ? { ...p, slug: projeto.slug } : null, deps.client));

  const r = await store.gravar([
    {
      projectId: projeto.id,
      editionDate: pedido.data,
      post: {
        pauta: pronto.pauta,
        copy: carrossel ? carrossel.copy : pronto.copy,
        ...(carrossel ? { carrossel: carrossel.carrossel } : {}),
        veredicto: pronto.veredicto,
        tentativas: pronto.veredicto.attempts,
        tokens: 0,
        custoUsd: 0,
        reparosAplicados: [],
      },
      chapeu: capa.chapeu,
      vaga: { posicao: pronto.material.posicao, slot: `${pedido.data}-mcp-${horaLocal}`, quandoIso: quando, horaLocal },
      visual,
      candidateId: pronto.candidata?.id ?? pronto.material.candidateId,
      topicId: topicoDaPauta(pronto.pauta),
      eventFingerprint:
        impressaoDoAcontecimento(entidadesDaClassificacao(pronto.pauta.classificacao)) || pedido.storyId,
      origem: resolverOrigem(pedido.storyId, []),
      formato: carrossel ? "carousel" : formato === "reel" ? "reel" : "static",
      ...(registroDoReel ? { reelDeFoto: registroDoReel } : {}),
      ...(carrossel ? { fotosDoCarrossel: carrossel.fotos } : {}),
      artefatos,
      bolha: false,
      gramatica: capa.gramatica ?? "jornal",
      creditoDaLegenda: credito,
      creditosDasFotos: [...new Set(fotosQueForam.map((f) => (f?.attribution ?? "").trim()).filter(Boolean))],
      legendaFinal,
      contexto: montarContexto({
        data: pedido.data,
        pautas: [pronto.pauta],
        pacotes: new Map([[pedido.storyId, pronto.material.pacote]]),
      }),
      posicao: pronto.material.posicao,
    },
  ]);
  if (r.erros.length > 0) return falha(`o post não foi gravado: ${r.erros.join("; ")}`);
  if (r.gravados === 0) {
    return falha(`o post não foi gravado: ${r.bloqueadosPorIdempotencia.map((b) => b.motivo).join("; ") || "bloqueado"}`);
  }

  const { data: gravado } = await deps.client
    .from("social_posts")
    .select("id")
    .eq("project_id", projeto.id)
    .eq("idempotency_key", chave)
    .maybeSingle();
  return { ok: true, postId: (gravado as { id?: string } | null)?.id ?? null, quando, legenda: legendaFinal, formato, ...(quadro ? { quadro } : {}), ...(nota ? { nota } : {}) };
}
