import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "../projects";
import type { PautaAvaliada } from "../editorial/guarda";
import type { CandidataPersistida } from "../editorial/candidatos-store";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { RegistroHistorico } from "../editorial/history";
import type { ConfigEditorial } from "../editorial/config";
import type { ResultadoVisual } from "../visual/tipos";
import type { PautaParaImagem } from "../visual/resolver";
import type { MarcaSocial } from "../social/copy";
import type { PostGerado, PostDescartado } from "../social/gerador";
import type { DecisaoDeFormato } from "../social/carrossel/formato";
import type { ConteudoDoArtigo } from "../ramos/portal";
import type { PecaPronta } from "../ramos/peca";
import { temFotoDaPauta } from "../ramos/sem-foto";
import { legendaDoInstagram, linhaDeCredito } from "../social/legenda-final";
import type { ContextoDeProducao, PautaDoContexto, ResumoDaPeca } from "./contrato";
import type { PecaParaFila } from "./fila";
import type { ContextoDaRefacao, GanchoDeEtapa, ResultadoDaEtapa } from "./refazer";
import { hashDoArtigo, hashDoPostDaLinha } from "./hash";
import { avisosDoPost, resumoDoPostDaLinha } from "./resumo-do-post";
import { resumoDoArtigo } from "./ramos-na-fila";
import { fotoNovaServe, imagemNaRefacao } from "../aprendizado/imagem";
import { avaliarPauta, padroesVazios, tracosDaCandidata, type PadroesDaSelecao } from "../aprendizado/selecao";
import {
  motivoDeFora,
  ordenarPeloPool,
  pautaAvaliadaDoContexto,
  pautaCitadaNoMotivo,
  pautaDaCandidata,
  pautaDaOrigemDoArtigo,
  type MotivoDeFora,
} from "./contexto-de-producao";

/**
 * Os ganchos que faltavam, ligados em 06/10/2026, véspera de a fila valer.
 *
 * Até aqui a refação cobria o texto e a imagem do artigo e a imagem e a arte do
 * post de peça única. O resto (a seleção em todo ramo, o texto do post, a
 * newsletter inteira e o carrossel) deixava a peça em `refazendo` para
 * sempre. O motivo registrado era que cada etapa pedia a pauta avaliada
 * inteira, que não sobrevive ao ciclo. Agora a pauta, o pacote e a referência
 * ao pool do dia vão para a linha da fila (`resumo.contexto`), e quando a peça
 * é anterior a isso o contexto é remontado das tabelas do canal e de
 * `news_candidates` (`contextoDaPeca`). Sem como remontar, o gancho diz o que
 * faltou, e o painel mostra "não dá para refazer: ...".
 *
 * Nenhum gancho aqui é um segundo gerador: cada um chama a função do ciclo
 * (`gerarPostDaPauta`, `runNewsroomPipeline`, `rodarRamoDoPortal`,
 * `rodarSocialDoDia`, `imagemDaPauta`, `congelarCarrossel`) pelo `mundo`, que
 * os testes trocam por dublês.
 *
 * Todo gancho escreve SÓ na peça reprovada (ou cria a substituta). A mesma
 * pauta no outro canal é outra peça, com aprovação própria, e não é tocada
 * (decisão do dono, 06/10/2026). A foto refeita é da peça: `imagemDaPauta` com
 * `ignorarReuso` não regrava a foto compartilhada da pauta.
 */

type Linha = Record<string, unknown>;

/** O que estes ganchos pedem do mundo, além do que `ganchos-de-producao.ts` já pede. */
export type MundoDaRefacao = {
  client: () => SupabaseClient;
  projeto: (id: string) => Promise<Project>;
  candidatasPorStory: (projectId: string, storyIds: string[]) => Promise<Map<string, CandidataPersistida>>;
  /** Por URL, casando também a canônica. A chave do mapa é a URL pedida. */
  candidatasPorUrl: (projectId: string, urls: string[]) => Promise<Map<string, CandidataPersistida>>;
  /** As candidatas aprovadas em volta de uma data, para a peça antiga que não guardou o pool. */
  poolDoDia: (projectId: string, data: string) => Promise<CandidataPersistida[]>;
  historico: (projectId: string) => Promise<RegistroHistorico[]>;
  config: () => ConfigEditorial;
  montarPacote: (pauta: PautaDoContexto) => Promise<PacoteFactual | null>;
  /** A foto da pauta como o ciclo a vê (compartilhada, em leitura): para decidir se a pauta pode entrar. */
  fotoDaPauta: (pauta: PautaParaImagem, ctx: { client: SupabaseClient; projeto: Project }) => Promise<ResultadoVisual>;
  /** Uma foto NOVA, só para esta peça (`ignorarReuso`). Ver `ganchos-de-producao.ts`. */
  imagem: (
    pauta: PautaParaImagem,
    ctx: { client: SupabaseClient; projeto: Project; evitar: string[]; recusas?: string[] },
  ) => Promise<ResultadoVisual>;
  marcaDoPost: (projeto: Project, instrucao: string) => Promise<MarcaSocial>;
  gerarPost: (
    pauta: PautaAvaliada,
    posicao: number,
    opcoes: { marca: MarcaSocial; pacote: PacoteFactual; candidata: CandidataPersistida | null; carrossel: DecisaoDeFormato | null },
  ) => Promise<{ post: PostGerado | null; descarte: PostDescartado | null }>;
  /** O ciclo social sobre um pool pequeno, com teto de um post. Devolve a linha gravada. */
  produzirPost: (e: {
    projeto: Project;
    data: string;
    pool: PautaAvaliada[];
    publicarEm: string | null;
  }) => Promise<{ ok: true; linha: Linha; storyId: string } | { ok: false; motivo: string }>;
  /** O ramo do portal sobre UMA pauta, gravando a matéria agendada. */
  produzirArtigo: (e: {
    projeto: Project;
    data: string;
    pauta: PautaAvaliada;
    pacote: PacoteFactual;
    publicarEm: string | null;
  }) => Promise<{ ok: true; linha: Linha; peca: PecaPronta<ConteudoDoArtigo> } | { ok: false; motivo: string }>;
  /** A redação da newsletter de novo, com o motivo do editor, e o HTML redesenhado. */
  reescreverNewsletter: (e: {
    projeto: Project;
    data: string;
    pautas: PautaDoContexto[];
    pacotes: Record<string, PacoteFactual>;
    imagens: Record<string, string>;
    legendas: Record<string, string>;
    instrucao: string;
  }) => Promise<{ ok: true; edicao: Linha; html: string; avisos: string[] } | { ok: false; motivo: string }>;
  /** Só o HTML do e-mail, com o texto gravado e as fotos dadas. */
  renderizarNewsletter: (e: {
    projeto: Project;
    data: string;
    edicao: Linha;
    pautas?: PautaDoContexto[];
    imagens: Record<string, string>;
    legendas: Record<string, string>;
  }) => Promise<string>;
  agora?: () => number;
};

function falha(motivo: string): ResultadoDaEtapa {
  return { ok: false, motivo };
}

function agoraIso(mundo: MundoDaRefacao): string {
  return new Date(mundo.agora ? mundo.agora() : Date.now()).toISOString();
}

async function lerLinha(client: SupabaseClient, tabela: string, colunas: string, id: string, projectId: string) {
  const { data, error } = await client.from(tabela).select(colunas).eq("id", id).eq("project_id", projectId).maybeSingle();
  // "Não consegui olhar" lança: é falha técnica, e a refação volta para a fila.
  if (error) throw new Error(`não consegui ler ${tabela} ${id}: ${error.message}`);
  return (data as Linha | null) ?? null;
}

/** O bloco que vai no fim da voz do redator, na refação. Mesma forma do de `ganchos-de-producao.ts`. */
export function instrucaoDaPeca(ctx: Pick<ContextoDaRefacao, "naoRepetir" | "motivo">, peca: string, extra = ""): string {
  return [
    ctx.naoRepetir,
    `${peca.toUpperCase()} FOI REPROVADA PELO EDITOR, e é isto que precisa mudar: ${ctx.motivo}`,
    extra,
  ]
    .filter((t) => t && t.trim())
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// O contexto da peça, gravado ou remontado
// ---------------------------------------------------------------------------

export type ContextoLido = { ok: true; contexto: ContextoDeProducao; remontado: boolean } | { ok: false; motivo: string };

const DATA = /(\d{4}-\d{2}-\d{2})$/;

/**
 * O contexto da peça: o gravado na fila, ou remontado das tabelas.
 *
 * Remontado quer dizer: a pauta lida de `news_candidates` (a mesma
 * classificação e o mesmo texto que a guarda gravou naquele dia), o pacote
 * de `news_candidates.factual_package` quando existe e montado de novo quando
 * não, e as fotos da newsletter do histórico editorial. O contexto remontado
 * volta no `resumo` da etapa, e a próxima refação já o encontra gravado.
 */
export async function contextoDaPeca(ctx: ContextoDaRefacao, mundo: MundoDaRefacao): Promise<ContextoLido> {
  const a = ctx.aprovacao;
  const gravado = a.resumo?.contexto;
  const origem = a.resumo?.origemDoArtigo;
  if (gravado && Array.isArray(gravado.pautas) && gravado.pautas.length > 0) {
    // O artigo guarda o pacote em `origemDoArtigo`, e não em dobro no contexto.
    if (a.ramo === "artigo" && origem?.pacote && !gravado.pacotes?.[origem.storyId]) {
      return { ok: true, remontado: false, contexto: { ...gravado, pacotes: { ...(gravado.pacotes ?? {}), [origem.storyId]: origem.pacote } } };
    }
    return { ok: true, contexto: gravado, remontado: false };
  }

  const client = mundo.client();

  if (a.ramo === "artigo") {
    const l = await lerLinha(client, "articles", "id, slug, source_urls", a.pecaId, a.projectId);
    if (!l) return { ok: false, motivo: "o artigo não existe mais" };
    const slug = String(l.slug ?? "");
    const data = DATA.exec(slug)?.[1] ?? "";
    if (origem?.pacote) {
      return {
        ok: true,
        remontado: true,
        contexto: {
          versao: 1,
          data,
          pautas: [pautaDaOrigemDoArtigo(origem)],
          pacotes: { [origem.storyId]: origem.pacote },
          reconstruido: "origemDoArtigo da fila",
        },
      };
    }
    if (slug.startsWith("edicao-")) {
      return {
        ok: false,
        motivo:
          "esta matéria é a edição da newsletter publicada no portal, com várias pautas: não há uma pauta para refazer. Cancele ou refaça a newsletter",
      };
    }
    const fonte = Array.isArray(l.source_urls) ? String((l.source_urls as unknown[])[0] ?? "") : "";
    if (!fonte) return { ok: false, motivo: "matéria anterior a 05/10/2026 sem a URL da fonte gravada: não sei de que pauta ela saiu" };
    const c = (await mundo.candidatasPorUrl(a.projectId, [fonte])).get(fonte);
    if (!c) return { ok: false, motivo: `a pauta desta matéria (${fonte}) não está mais em news_candidates` };
    return {
      ok: true,
      remontado: true,
      contexto: {
        versao: 1,
        data,
        pautas: [pautaDaCandidata(c)],
        ...(c.factualPackage ? { pacotes: { [c.storyId]: c.factualPackage } } : {}),
        reconstruido: "articles.source_urls + news_candidates",
      },
    };
  }

  if (a.ramo === "post") {
    const l = await lerLinha(client, "social_posts", "id, story_id, edition_date, content_json", a.pecaId, a.projectId);
    if (!l) return { ok: false, motivo: "o post não existe mais" };
    const cj = (l.content_json ?? {}) as Linha;
    const naLinha = cj.contexto_da_refacao as ContextoDeProducao | undefined;
    if (naLinha && Array.isArray(naLinha.pautas) && naLinha.pautas.length > 0) {
      return { ok: true, contexto: naLinha, remontado: true };
    }
    const storyId = typeof l.story_id === "string" ? l.story_id : "";
    if (!storyId) return { ok: false, motivo: "post sem story_id gravado: não sei de que pauta ele saiu" };
    const c = (await mundo.candidatasPorStory(a.projectId, [storyId])).get(storyId);
    if (!c) return { ok: false, motivo: `a pauta deste post (${storyId}) não está em news_candidates (evergreen ou perfil de referência?)` };
    return {
      ok: true,
      remontado: true,
      contexto: {
        versao: 1,
        data: String(l.edition_date ?? ""),
        pautas: [pautaDaCandidata(c)],
        ...(c.factualPackage ? { pacotes: { [c.storyId]: c.factualPackage } } : {}),
        reconstruido: "social_posts.story_id + news_candidates",
      },
    };
  }

  // Newsletter
  const l = await lerLinha(client, "news_editions", "id, edition_date, stories", a.pecaId, a.projectId);
  if (!l) return { ok: false, motivo: "a edição não existe mais" };
  const historias = Array.isArray(l.stories) ? (l.stories as Linha[]) : [];
  if (historias.length === 0) return { ok: false, motivo: "a edição gravada não tem histórias" };
  const data = String(l.edition_date ?? "");
  const urls = historias.map((st) => String(st.source_url ?? "")).filter(Boolean);
  const candidatas = await mundo.candidatasPorUrl(a.projectId, urls);
  const historico = await mundo.historico(a.projectId);
  const { gerarStoryId } = await import("../editorial/history");
  const pautas: PautaDoContexto[] = [];
  const pacotes: Record<string, PacoteFactual> = {};
  const imagens: Record<string, string> = {};
  const legendas: Record<string, string> = {};
  for (const st of historias) {
    const url = String(st.source_url ?? "");
    const id = gerarStoryId({ url: url || undefined, titulo: String(st.title ?? "") });
    const c = candidatas.get(url);
    pautas.push(
      c
        ? { ...pautaDaCandidata(c), storyId: id, url }
        : {
            storyId: id,
            titulo: String(st.title ?? ""),
            url,
            fonteNome: String(st.source_name ?? ""),
            publicadoEm: "",
            resumo: [st.summary, st.context].filter(Boolean).join("\n\n"),
            categoria: String(st.category ?? ""),
            eixo: "",
            pais: "",
            atores: [],
            lugares: [],
            acontecimento: [],
          },
    );
    if (c?.factualPackage) pacotes[id] = c.factualPackage;
    const h = historico.find(
      (r) => r.canal === "newsletter" && (r.storyId === id || (url && (r.url === url || r.urlCanonica === url))) && r.imagemUrl,
    );
    if (h?.imagemUrl) imagens[id] = h.imagemUrl;
    if (h?.imagemCredito) legendas[id] = h.imagemCredito;
  }
  return {
    ok: true,
    remontado: true,
    contexto: {
      versao: 1,
      data,
      pautas,
      ...(Object.keys(pacotes).length ? { pacotes } : {}),
      imagens,
      legendas,
      reconstruido: "news_editions.stories + news_candidates + editorial_history",
    },
  };
}

/** O pacote de cada pauta: o gravado, o da candidata, ou montado de novo pela mesma função do ciclo. */
async function pacotesDe(
  pautas: PautaDoContexto[],
  contexto: ContextoDeProducao,
  candidatas: Map<string, CandidataPersistida>,
  mundo: MundoDaRefacao,
): Promise<{ pacotes: Record<string, PacoteFactual>; faltando: string[] }> {
  const pacotes: Record<string, PacoteFactual> = {};
  const faltando: string[] = [];
  for (const p of pautas) {
    const pacote = contexto.pacotes?.[p.storyId] ?? candidatas.get(p.storyId)?.factualPackage ?? (await mundo.montarPacote(p));
    if (pacote) pacotes[p.storyId] = pacote;
    else faltando.push(p.titulo);
  }
  return { pacotes, faltando };
}

function paraImagem(p: PautaDoContexto): PautaParaImagem {
  return {
    storyId: p.storyId,
    titulo: p.titulo,
    resumo: p.resumo,
    categoria: p.eixo || p.categoria,
    classificacao: { atores: p.atores, lugares: p.lugares, acontecimento: p.acontecimento, pais: p.pais || "EUA" },
  };
}

const ROTULO_DE_FORA: Record<MotivoDeFora, string> = {
  JA_NO_CANAL: "já no canal",
  NAO_APROVADA: "não aprovada pela linha editorial",
  IMIGRACAO: "imigração",
  SEM_CLASSIFICACAO: "sem classificação",
  MESMO_ACONTECIMENTO: "mesmo acontecimento de outra peça do canal",
  REPETIDA_NO_CANAL: "já publicada no canal",
};

type Queda = MotivoDeFora | "SEM_FOTO" | "SEM_PACOTE" | "NAO_SAIU" | "RECUSA_DO_EDITOR";

function resumoDasQuedas(quedas: Map<Queda, number>): string {
  const rotulo = (k: string) =>
    k === "SEM_FOTO"
      ? "sem foto"
      : k === "SEM_PACOTE"
        ? "sem pacote factual"
        : k === "NAO_SAIU"
          ? "não passou na redação"
          : k === "RECUSA_DO_EDITOR"
            ? "fonte ou ator recusado pelo editor neste canal"
            : ROTULO_DE_FORA[k as MotivoDeFora];
  return [...quedas.entries()].map(([k, n]) => `${n} ${rotulo(k)}`).join(", ");
}

/**
 * As candidatas do pool que podem entrar no lugar, NESTE canal, em ordem.
 *
 * A referência gravada (`contexto.pool`) é relida em `news_candidates`; peça
 * antiga, sem pool gravado, usa as aprovadas em volta da data. Fora ficam as
 * que o canal já tem no dia, as que a seleção já recusou nesta vaga, e o que
 * `motivoDeFora` recusa.
 *
 * E o que o canal aprendeu (06/10/2026): a fonte ou o ator recusado três
 * vezes na seleção DESTE canal sai, e a candidata parecida com as recusadas
 * vai para o fim da fila, sem sair dela.
 */
async function elegiveisDoCanal(
  mundo: MundoDaRefacao,
  projectId: string,
  contexto: ContextoDeProducao,
  canal: { storyIds: string[]; impressoes?: string[]; historico: RegistroHistorico["canal"] },
  padroes: PadroesDaSelecao = padroesVazios(),
): Promise<{ elegiveis: CandidataPersistida[]; quedas: Map<Queda, number>; conferidas: number }> {
  const config = mundo.config();
  const pool = contexto.pool?.length
    ? await mundo.candidatasPorStory(projectId, contexto.pool)
    : new Map((await mundo.poolDoDia(projectId, contexto.data)).map((c) => [c.storyId, c] as const));
  const noCanal = new Set([...canal.storyIds, ...(contexto.recusadas ?? [])]);
  const vetoresDoCanal = await mundo.candidatasPorStory(projectId, [...noCanal]);
  const historico = await mundo.historico(projectId);
  const quedas = new Map<Queda, number>();
  const elegiveis: CandidataPersistida[] = [];
  const penalidades = new Map<string, number>();
  const ordenadas = ordenarPeloPool(contexto.pool, pool);
  for (const c of ordenadas) {
    const fora = motivoDeFora(
      c,
      {
        storyIds: noCanal,
        vetores: [...vetoresDoCanal.values()].map((v) => v.embedding),
        impressoes: new Set(canal.impressoes ?? []),
      },
      { registros: historico, canal: canal.historico, config },
      config.limiarDeAgrupamento,
    );
    if (fora) {
      quedas.set(fora, (quedas.get(fora) ?? 0) + 1);
      continue;
    }
    const aprendida = avaliarPauta(tracosDaCandidata(c), padroes);
    if (aprendida.bloqueio) {
      quedas.set("RECUSA_DO_EDITOR", (quedas.get("RECUSA_DO_EDITOR") ?? 0) + 1);
      continue;
    }
    elegiveis.push(c);
    penalidades.set(c.storyId, aprendida.penalidade);
  }
  // Estável: sem penalidade nenhuma, a ordem é a do pool, como antes.
  const ordem = new Map(elegiveis.map((c, i) => [c.storyId, i] as const));
  elegiveis.sort(
    (a, b) =>
      (penalidades.get(a.storyId) ?? 0) - (penalidades.get(b.storyId) ?? 0) ||
      (ordem.get(a.storyId) ?? 0) - (ordem.get(b.storyId) ?? 0),
  );
  return { elegiveis, quedas, conferidas: ordenadas.length };
}

// ---------------------------------------------------------------------------
// Post: texto (peça única e carrossel)
// ---------------------------------------------------------------------------

const COLUNAS_DO_POST = "id, story_id, title, caption, edition_date, content_json, asset_paths, status";

function ehCarrossel(l: Linha): boolean {
  const cj = (l.content_json ?? {}) as Linha;
  return (
    cj.formato === "carousel" ||
    (Array.isArray(l.asset_paths) && l.asset_paths.length > 1) ||
    (Array.isArray(((cj.copy ?? {}) as Linha).slides) && (((cj.copy ?? {}) as Linha).slides as unknown[]).length > 0)
  );
}

export const CARROSSEL_SEM_FORMA =
  "carrossel gravado antes de 06/10/2026 sem a estrutura dos slides: não dá para refazê-lo slide a slide. Cancele ou reprove a seleção";

function textoDoPost(mundo: MundoDaRefacao): GanchoDeEtapa {
  return async (ctx) => {
    const projeto = await mundo.projeto(ctx.aprovacao.projectId);
    const client = mundo.client();
    const l = await lerLinha(client, "social_posts", COLUNAS_DO_POST, ctx.aprovacao.pecaId, projeto.id);
    if (!l) return falha("o post não existe mais");
    const cx = await contextoDaPeca(ctx, mundo);
    if (!cx.ok) return falha(cx.motivo);
    const pc = cx.contexto.pautas[0];
    const candidatas = await mundo.candidatasPorStory(projeto.id, [pc.storyId]);
    const { pacotes, faltando } = await pacotesDe([pc], cx.contexto, candidatas, mundo);
    if (faltando.length) return falha("sem pacote factual para esta pauta: o post não é reescrito sem ele (RF-05)");

    const cj = (l.content_json ?? {}) as Linha;
    let decisao: DecisaoDeFormato | null = null;
    if (ehCarrossel(l)) {
      const forma = (cj.carrossel ?? {}) as Linha;
      if (!forma.estrutura || !Number(forma.slides)) return falha(CARROSSEL_SEM_FORMA);
      decisao = {
        formato: "carousel",
        estrutura: forma.estrutura as DecisaoDeFormato["estrutura"],
        slides: Number(forma.slides),
        motivo: "refação do texto do carrossel, na forma que ele já tinha",
        fatosUteis: 0,
      };
    }

    const marca = await mundo.marcaDoPost(projeto, instrucaoDaPeca(ctx, "esta peça"));
    const posicao = Number(cx.contexto.posicao) || 1;
    const pauta = pautaAvaliadaDoContexto(pc, candidatas.get(pc.storyId) ?? null);
    const r = await mundo.gerarPost(pauta, posicao, {
      marca,
      pacote: pacotes[pc.storyId],
      candidata: candidatas.get(pc.storyId) ?? null,
      carrossel: decisao,
    });
    if (!r.post) return falha(`a reescrita não passou na guarda do post: ${r.descarte?.motivo ?? "sem motivo"}`);
    if (decisao && !r.post.carrossel) return falha("a reescrita do carrossel voltou como peça única");

    const visual = (cj.visual ?? {}) as Linha;
    /*
     * A linha curta do crédito (06/10/2026): a que o post gravou, ou, em post
     * anterior a isso, montada de novo com a foto de fundo e as dos slides.
     * As duas chaves da atribuição continuam lidas (`credito` era a antiga).
     */
    const fotosDoCarrossel = (((cj.carrossel ?? {}) as Linha).fotos ?? []) as Array<Linha | null>;
    const credito =
      typeof visual.creditoNaLegenda === "string" && visual.creditoNaLegenda
        ? visual.creditoNaLegenda
        : linhaDeCredito([
            {
              author: String(visual.author ?? ""),
              license: String(visual.license ?? ""),
              attribution: String(visual.attribution ?? visual.credito ?? ""),
            },
            ...fotosDoCarrossel.map((f) =>
              f ? { author: String(f.author ?? ""), license: String(f.license ?? ""), attribution: String(f.attribution ?? "") } : null,
            ),
          ]);
    const legenda = legendaDoInstagram(r.post.veredicto.legendaFinal, { hashtags: "manter", credito });
    const { error } = await client
      .from("social_posts")
      .update({
        title: r.post.copy.headline.slice(0, 300),
        caption: legenda,
        content_json: {
          ...cj,
          copy: r.post.copy,
          hashtags: r.post.veredicto.hashtagsFinais,
          ...(r.post.carrossel
            ? {
                carrossel: {
                  ...((cj.carrossel ?? {}) as Linha),
                  slides: r.post.carrossel.slides.length,
                  papeis: r.post.carrossel.papeis,
                },
              }
            : {}),
          ...(cx.remontado ? { contexto_da_refacao: cx.contexto } : {}),
        },
        social_guard_status: "passed",
        social_guard_reasons: {
          finalDecision: r.post.veredicto.finalDecision,
          attempts: r.post.veredicto.attempts,
          issues: r.post.veredicto.issues,
          reparosAplicados: r.post.reparosAplicados,
          refacao: { etapa: "texto", motivo: ctx.motivo },
        },
        updated_at: agoraIso(mundo),
      })
      .eq("id", ctx.aprovacao.pecaId)
      .eq("project_id", projeto.id)
      .is("provider_creation_id", null)
      .neq("status", "published");
    if (error) return falha(`o texto novo não foi gravado: ${error.message}`);
    // A arte vem em seguida (`etapasARefazer`): a manchete está impressa nela, e é ela que muda o hash.
    return {
      ok: true,
      resumo: { titulo: r.post.copy.headline, texto: legenda, ...(cx.remontado ? { contexto: cx.contexto } : {}) },
      detalhe: `texto reescrito em ${r.post.tentativas} tentativa(s)`,
    };
  };
}

// ---------------------------------------------------------------------------
// Seleção: post e artigo trocam de PEÇA; a newsletter troca uma história
// ---------------------------------------------------------------------------

const TENTATIVAS_DE_SUBSTITUTA = 3;

function selecaoDoPost(mundo: MundoDaRefacao): GanchoDeEtapa {
  return async (ctx) => {
    const projeto = await mundo.projeto(ctx.aprovacao.projectId);
    const client = mundo.client();
    const cx = await contextoDaPeca(ctx, mundo);
    if (!cx.ok) return falha(cx.motivo);
    const data = cx.contexto.data;
    if (!data) return falha("o post não tem data de edição gravada: não sei de que dia é o pool");

    const { data: irmaos, error } = await client
      .from("social_posts")
      .select("id, story_id, event_fingerprint")
      .eq("project_id", projeto.id)
      .eq("edition_date", data);
    if (error) throw new Error(`não consegui ler os posts de ${data}: ${error.message}`);
    const doDia = (irmaos ?? []) as Linha[];
    const recusadas = [...(cx.contexto.recusadas ?? []), ...cx.contexto.pautas.map((p) => p.storyId)];

    const { elegiveis, quedas, conferidas } = await elegiveisDoCanal(
      mundo,
      projeto.id,
      { ...cx.contexto, recusadas },
      {
        storyIds: doDia.map((p) => String(p.story_id ?? "")).filter(Boolean),
        impressoes: doDia.map((p) => String(p.event_fingerprint ?? "")).filter(Boolean),
        historico: "instagram",
      },
      ctx.aprendizado?.selecao,
    );
    if (elegiveis.length === 0) {
      return falha(
        `nenhuma outra pauta do dia serve para o Instagram (${conferidas} conferida(s)` +
          (quedas.size ? `: ${resumoDasQuedas(quedas)}` : "") +
          ")",
      );
    }

    // O ciclo social decide de novo, com a verificação, a foto, a copy, a guarda e a arte.
    const pool = elegiveis.slice(0, 5).map((c) => pautaAvaliadaDoContexto(pautaDaCandidata(c), c));
    const r = await mundo.produzirPost({ projeto, data, pool, publicarEm: ctx.aprovacao.publicarEm });
    if (!r.ok) return falha(`nenhuma das ${pool.length} pauta(s) seguinte(s) virou post: ${r.motivo}`);

    const escolhida = elegiveis.find((c) => c.storyId === r.storyId) ?? null;
    const contexto: ContextoDeProducao = {
      versao: 1,
      data,
      pautas: [escolhida ? pautaDaCandidata(escolhida) : pautaDaCandidata(elegiveis[0])],
      pool: cx.contexto.pool,
      recusadas,
    };
    const naLinha = resumoDoPostDaLinha(r.linha);
    const substituta: PecaParaFila = {
      ramo: "post",
      pecaId: String(r.linha.id),
      hash: hashDoPostDaLinha(r.linha),
      publicarEm: ctx.aprovacao.publicarEm ?? (typeof r.linha.scheduled_at === "string" ? r.linha.scheduled_at : null),
      avisos: avisosDoPost(r.linha),
      resumo: { ...naLinha, contexto: { ...(naLinha.contexto ?? contexto), recusadas } },
    };
    return { ok: true, substituta, detalhe: `nova pauta: ${String(r.linha.title ?? "").slice(0, 80)}` };
  };
}

function selecaoDoArtigo(mundo: MundoDaRefacao): GanchoDeEtapa {
  return async (ctx) => {
    const projeto = await mundo.projeto(ctx.aprovacao.projectId);
    const client = mundo.client();
    const cx = await contextoDaPeca(ctx, mundo);
    if (!cx.ok) return falha(cx.motivo);
    const data = cx.contexto.data;
    if (!data) return falha("a matéria não tem data no endereço: não sei de que dia é o pool");

    const { data: irmas, error } = await client
      .from("articles")
      .select("id, slug, source_urls")
      .eq("project_id", projeto.id)
      .like("slug", `%-${data}`);
    if (error) throw new Error(`não consegui ler as matérias de ${data}: ${error.message}`);
    const urls = ((irmas ?? []) as Linha[])
      .flatMap((m) => (Array.isArray(m.source_urls) ? (m.source_urls as unknown[]).slice(0, 1) : []))
      .map(String)
      .filter(Boolean);
    const doCanal = urls.length ? await mundo.candidatasPorUrl(projeto.id, urls) : new Map<string, CandidataPersistida>();
    const recusadas = [...(cx.contexto.recusadas ?? []), ...cx.contexto.pautas.map((p) => p.storyId)];

    const { elegiveis, quedas, conferidas } = await elegiveisDoCanal(
      mundo,
      projeto.id,
      { ...cx.contexto, recusadas },
      { storyIds: [...doCanal.values()].map((c) => c.storyId), historico: "article" },
      ctx.aprendizado?.selecao,
    );

    let tentadas = 0;
    for (const c of elegiveis) {
      if (tentadas >= TENTATIVAS_DE_SUBSTITUTA) break;
      const pc = pautaDaCandidata(c);
      const pacote = c.factualPackage ?? (await mundo.montarPacote(pc));
      if (!pacote) {
        quedas.set("SEM_PACOTE", (quedas.get("SEM_PACOTE") ?? 0) + 1);
        continue;
      }
      tentadas += 1;
      // O ramo do portal confere a foto, escreve, audita e grava, como no ciclo.
      const r = await mundo.produzirArtigo({
        projeto,
        data,
        pauta: pautaAvaliadaDoContexto(pc, c),
        pacote,
        publicarEm: ctx.aprovacao.publicarEm,
      });
      if (!r.ok) {
        quedas.set("NAO_SAIU", (quedas.get("NAO_SAIU") ?? 0) + 1);
        continue;
      }
      const { resumo, publicarEm } = resumoDoArtigo(r.peca);
      const contexto: ContextoDeProducao = {
        ...(resumo.contexto ?? { versao: 1, data, pautas: [pc] }),
        pool: cx.contexto.pool ?? resumo.contexto?.pool,
        recusadas,
      };
      const substituta: PecaParaFila = {
        ramo: "artigo",
        pecaId: String(r.linha.id),
        hash: hashDoArtigo(String(r.linha.title ?? ""), String(r.linha.content_html ?? ""), String(r.linha.cover_image ?? "")),
        publicarEm: ctx.aprovacao.publicarEm ?? publicarEm,
        avisos: r.peca.avisos.map((detalhe) => ({ codigo: "AVISO_DO_RAMO", detalhe })),
        resumo: { ...resumo, contexto },
      };
      return { ok: true, substituta, detalhe: `nova pauta: ${r.peca.titulo.slice(0, 80)}` };
    }
    return falha(
      `nenhuma outra pauta do dia virou matéria (${conferidas} conferida(s)` +
        (quedas.size ? `: ${resumoDasQuedas(quedas)}` : "") +
        ")",
    );
  };
}

// ---------------------------------------------------------------------------
// Newsletter: texto, imagem e seleção, sempre dentro da MESMA edição
// ---------------------------------------------------------------------------

const COLUNAS_DA_EDICAO =
  "id, edition_date, subject, subject_options, preheader, headline, intro, stories, quick_bits, closing, final_line, content_html";

/** A pauta que o editor apontou, ou a que o motivo cita pelo título. */
function pautaApontada(ctx: ContextoDaRefacao, pautas: PautaDoContexto[]): PautaDoContexto | null {
  if (ctx.alvo) {
    const p = pautas.find((x) => x.storyId === ctx.alvo);
    if (p) return p;
  }
  return pautaCitadaNoMotivo(pautas, ctx.motivo);
}

function semFotoGravada(cx: ContextoDeProducao): string[] {
  return cx.pautas.filter((p) => !cx.imagens?.[p.storyId]).map((p) => p.titulo);
}

async function gravarEdicao(
  mundo: MundoDaRefacao,
  ctx: ContextoDaRefacao,
  campos: Linha,
): Promise<string | null> {
  const { data, error } = await mundo
    .client()
    .from("news_editions")
    .update({ ...campos, updated_at: agoraIso(mundo) })
    .eq("id", ctx.aprovacao.pecaId)
    .eq("project_id", ctx.aprovacao.projectId)
    .select("id");
  if (error) return `a edição nova não foi gravada: ${error.message}`;
  if (!data || (data as unknown[]).length === 0) return "a edição não foi encontrada para gravar";
  return null;
}

function camposDaEdicao(edicao: Linha, html: string): Linha {
  const palavras = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  const campos: Linha = { content_html: html, word_count: palavras };
  for (const k of ["subject", "subject_options", "preheader", "headline", "intro", "stories", "quick_bits", "closing", "final_line"]) {
    if (edicao[k] !== undefined) campos[k] = edicao[k];
  }
  for (const [k, col] of [
    ["qa_passed", "qa_passed"],
    ["qa_score", "qa_score"],
    ["qa_hallucination_risk", "qa_hallucination_risk"],
    ["qa_issues", "qa_issues"],
  ]) {
    if (edicao[k] !== undefined) campos[col] = edicao[k];
  }
  return campos;
}

function resumoDaEdicao(edicao: Linha, contexto: ContextoDeProducao): Partial<ResumoDaPeca> {
  const historias = Array.isArray(edicao.stories) ? (edicao.stories as Linha[]) : [];
  return {
    titulo: String(edicao.subject ?? ""),
    texto: String(edicao.subject ?? ""),
    pacoteFactual: historias.map((st) => String(st.title ?? "")).filter(Boolean),
    contexto,
  };
}

function textoDaNewsletter(mundo: MundoDaRefacao): GanchoDeEtapa {
  return async (ctx) => {
    const projeto = await mundo.projeto(ctx.aprovacao.projectId);
    const cx = await contextoDaPeca(ctx, mundo);
    if (!cx.ok) return falha(cx.motivo);
    const semFoto = semFotoGravada(cx.contexto);
    if (semFoto.length) {
      return falha(
        `não sei que foto a edição usou em ${semFoto.map((t) => `"${t.slice(0, 50)}"`).join(", ")} (edição anterior a 06/10/2026): ` +
          "reprove a IMAGEM dessa pauta primeiro, ou cancele",
      );
    }
    const candidatas = await mundo.candidatasPorStory(projeto.id, cx.contexto.pautas.map((p) => p.storyId));
    const { pacotes, faltando } = await pacotesDe(cx.contexto.pautas, cx.contexto, candidatas, mundo);
    if (faltando.length) return falha(`sem pacote factual para ${faltando.join(", ")}: a edição não é reescrita sem ele (RF-05)`);

    const apontada = pautaApontada(ctx, cx.contexto.pautas);
    const foco = apontada
      ? `O editor apontou a pauta "${apontada.titulo}". Mude o que ele pediu nela; nas outras, mantenha os fatos e mexa só se o motivo pedir.`
      : "";
    const r = await mundo.reescreverNewsletter({
      projeto,
      data: cx.contexto.data,
      pautas: cx.contexto.pautas,
      pacotes,
      imagens: cx.contexto.imagens ?? {},
      legendas: cx.contexto.legendas ?? {},
      instrucao: instrucaoDaPeca(ctx, "esta edição", foco),
    });
    if (!r.ok) return falha(r.motivo);
    const erro = await gravarEdicao(mundo, ctx, camposDaEdicao(r.edicao, r.html));
    if (erro) return falha(erro);
    const contexto = { ...cx.contexto, pacotes };
    return {
      ok: true,
      resumo: resumoDaEdicao(r.edicao, contexto),
      detalhe: `edição reescrita${apontada ? ` (foco: ${apontada.titulo.slice(0, 50)})` : ""}${r.avisos.length ? `; avisos: ${r.avisos.join(" | ")}` : ""}`,
    };
  };
}

function imagemDaNewsletter(mundo: MundoDaRefacao): GanchoDeEtapa {
  return async (ctx) => {
    const projeto = await mundo.projeto(ctx.aprovacao.projectId);
    const client = mundo.client();
    const cx = await contextoDaPeca(ctx, mundo);
    if (!cx.ok) return falha(cx.motivo);
    const edicao = await lerLinha(client, "news_editions", COLUNAS_DA_EDICAO, ctx.aprovacao.pecaId, projeto.id);
    if (!edicao) return falha("a edição não existe mais");

    const apontada = pautaApontada(ctx, cx.contexto.pautas);
    // Sem pauta apontada nem citada: troca as fotos de todas, que é o que "a imagem" quer dizer na edição.
    const alvos = apontada ? [apontada] : cx.contexto.pautas;
    const imagens = { ...(cx.contexto.imagens ?? {}) };
    const legendas = { ...(cx.contexto.legendas ?? {}) };
    // As fotos da edição, e as que a newsletter já recusou; a cena recebe o porquê (06/10/2026).
    const { evitar, recusas } = imagemNaRefacao(Object.values(imagens), ctx.motivo, ctx.aprendizado?.imagem);
    const trocadas: string[] = [];
    const semOutra: string[] = [];
    for (const p of alvos) {
      const r = await mundo.imagem(paraImagem(p), { client, projeto, evitar, recusas });
      const nova = temFotoDaPauta(r) ? (r.asset?.imageUrl ?? "") : "";
      if (!fotoNovaServe(nova, [imagens[p.storyId] ?? ""], evitar)) {
        semOutra.push(p.titulo);
        continue;
      }
      imagens[p.storyId] = nova;
      if (r.asset?.attribution) legendas[p.storyId] = r.asset.attribution;
      else delete legendas[p.storyId];
      evitar.push(nova);
      trocadas.push(p.titulo);
    }
    if (trocadas.length === 0) {
      return falha(`o resolvedor não achou outra foto para ${semOutra.map((t) => `"${t.slice(0, 50)}"`).join(", ")}`);
    }
    const faltam = cx.contexto.pautas.filter((p) => !imagens[p.storyId]).map((p) => p.titulo);
    if (faltam.length) {
      return falha(`a edição ficaria sem foto em ${faltam.join(", ")}: pauta sem foto não vira conteúdo (05/10/2026)`);
    }

    // O texto não muda: só o HTML é redesenhado com as fotos novas.
    const html = await mundo.renderizarNewsletter({
      projeto,
      data: cx.contexto.data,
      edicao,
      pautas: cx.contexto.pautas,
      imagens,
      legendas,
    });
    const erro = await gravarEdicao(mundo, ctx, { content_html: html });
    if (erro) return falha(erro);
    const contexto = { ...cx.contexto, imagens, legendas };
    return {
      ok: true,
      resumo: { contexto, imagens: Object.values(imagens) },
      detalhe:
        `foto nova em ${trocadas.map((t) => `"${t.slice(0, 50)}"`).join(", ")}` +
        (semOutra.length ? `; sem outra foto para ${semOutra.join(", ")}` : ""),
    };
  };
}

function selecaoDaNewsletter(mundo: MundoDaRefacao): GanchoDeEtapa {
  return async (ctx) => {
    const projeto = await mundo.projeto(ctx.aprovacao.projectId);
    const client = mundo.client();
    const cx = await contextoDaPeca(ctx, mundo);
    if (!cx.ok) return falha(cx.motivo);
    const sai = pautaApontada(ctx, cx.contexto.pautas);
    if (!sai) {
      return falha(
        "a troca de pauta da newsletter precisa saber QUAL pauta sai: reprove de novo escolhendo a pauta no painel, ou citando o título dela no motivo",
      );
    }
    const ficam = cx.contexto.pautas.filter((p) => p.storyId !== sai.storyId);
    const semFoto = semFotoGravada({ ...cx.contexto, pautas: ficam });
    if (semFoto.length) {
      return falha(`não sei que foto a edição usou em ${semFoto.join(", ")} (edição anterior a 06/10/2026): reprove a imagem antes`);
    }
    const recusadas = [...(cx.contexto.recusadas ?? []), sai.storyId];

    const { elegiveis, quedas, conferidas } = await elegiveisDoCanal(
      mundo,
      projeto.id,
      { ...cx.contexto, recusadas },
      { storyIds: cx.contexto.pautas.map((p) => p.storyId), historico: "newsletter" },
      ctx.aprendizado?.selecao,
    );

    let entra: { pc: PautaDoContexto; pacote: PacoteFactual; foto: string; credito: string } | null = null;
    for (const c of elegiveis.slice(0, 5)) {
      const pc = pautaDaCandidata(c);
      // A foto antes do pacote, pela ordem do custo (pauta sem foto não vira conteúdo).
      const v = await mundo.fotoDaPauta(paraImagem(pc), { client, projeto });
      if (!temFotoDaPauta(v)) {
        quedas.set("SEM_FOTO", (quedas.get("SEM_FOTO") ?? 0) + 1);
        continue;
      }
      const pacote = c.factualPackage ?? (await mundo.montarPacote(pc));
      if (!pacote) {
        quedas.set("SEM_PACOTE", (quedas.get("SEM_PACOTE") ?? 0) + 1);
        continue;
      }
      entra = { pc, pacote, foto: v.asset?.imageUrl ?? "", credito: v.asset?.attribution ?? "" };
      break;
    }
    if (!entra) {
      return falha(
        `nenhuma outra pauta do dia serve para a newsletter (${conferidas} conferida(s)` +
          (quedas.size ? `: ${resumoDasQuedas(quedas)}` : "") +
          ")",
      );
    }

    const pautas = cx.contexto.pautas.map((p) => (p.storyId === sai.storyId ? entra!.pc : p));
    const candidatas = await mundo.candidatasPorStory(projeto.id, ficam.map((p) => p.storyId));
    const { pacotes, faltando } = await pacotesDe(ficam, cx.contexto, candidatas, mundo);
    if (faltando.length) return falha(`sem pacote factual para ${faltando.join(", ")}`);
    pacotes[entra.pc.storyId] = entra.pacote;
    const imagens = { ...(cx.contexto.imagens ?? {}) };
    const legendas = { ...(cx.contexto.legendas ?? {}) };
    delete imagens[sai.storyId];
    delete legendas[sai.storyId];
    imagens[entra.pc.storyId] = entra.foto;
    if (entra.credito) legendas[entra.pc.storyId] = entra.credito;

    const r = await mundo.reescreverNewsletter({
      projeto,
      data: cx.contexto.data,
      pautas,
      pacotes,
      imagens,
      legendas,
      instrucao: instrucaoDaPeca(
        ctx,
        "esta edição",
        `A pauta "${sai.titulo}" saiu da edição por decisão do editor, e "${entra.pc.titulo}" entrou no lugar dela. ` +
          "As outras pautas continuam com os mesmos fatos.",
      ),
    });
    if (!r.ok) return falha(r.motivo);
    const erro = await gravarEdicao(mundo, ctx, camposDaEdicao(r.edicao, r.html));
    if (erro) return falha(erro);
    const contexto: ContextoDeProducao = { ...cx.contexto, pautas, pacotes, imagens, legendas, recusadas };
    return {
      ok: true,
      resumo: resumoDaEdicao(r.edicao, contexto),
      detalhe: `saiu "${sai.titulo.slice(0, 50)}", entrou "${entra.pc.titulo.slice(0, 50)}"`,
    };
  };
}

export function criarGanchosPorEtapa(mundo: MundoDaRefacao) {
  return {
    post: { texto: textoDoPost(mundo), selecao: selecaoDoPost(mundo) },
    artigo: { selecao: selecaoDoArtigo(mundo) },
    newsletter: {
      texto: textoDaNewsletter(mundo),
      imagem: imagemDaNewsletter(mundo),
      selecao: selecaoDaNewsletter(mundo),
    },
  };
}
