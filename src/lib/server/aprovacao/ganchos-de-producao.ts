import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "../projects";
import type { OrigemDoArtigo } from "../ramos/portal";
import type { Artigo, MarcaDoArtigo, ResultadoDoArtigo } from "../ramos/artigo";
import type { ResultadoVisual } from "../visual/tipos";
import type { PautaParaImagem } from "../visual/resolver";
import type { ResultadoDoCongelamento, EntradaDoCongelamento } from "../social/artefato";
import type { ContextoDaRefacao, GanchosDeRefazer, ResultadoDaEtapa } from "./refazer";
import { getSupabaseAdminClient } from "../supabase-admin";

/**
 * Os ganchos de refação ligados de verdade (RF-22, integração de 05/10/2026).
 *
 * A fila nasceu com `GANCHOS_DE_PRODUCAO` vazio, e disse por quê: cada etapa
 * pede a pauta avaliada inteira, que não sobrevive ao ciclo. A integração
 * resolveu o caso do ARTIGO gravando na própria linha da fila
 * (`resumo.origemDoArtigo`) o pacote factual e a classificação de onde a
 * matéria saiu, e o caso da IMAGEM e da ARTE do post lendo o que a linha de
 * `social_posts` já guarda (manchete, foto, gramática, story_id).
 *
 * O que está ligado:
 *
 *   artigo.texto   reescreve pelo MESMO redator e MESMO auditor do ramo
 *                  (`escreverArtigoDaPauta`), com a memória de reprovação e o
 *                  motivo do editor no fim da voz. Reprovado no auditor, a
 *                  refação falha e a peça fica em `refazendo`: a fila não é
 *                  lugar de consertar fato inventado.
 *   artigo.imagem  resolve outra foto por `imagemDaPauta`, sem cache, e troca
 *                  só a capa. O título e o HTML não mudam.
 *   post.imagem    idem, gravando a foto nova em `content_json.visual`.
 *   post.arte      recongela a capa com a manchete e a foto da linha, num
 *                  caminho NOVO (nunca sobrescreve: incidente de 16/09).
 *
 * O que continua SEM refação automática, e por quê:
 *
 *   selecao (todos)    refazer a seleção é escolher OUTRA pauta, e isso é o
 *                      ciclo do dia inteiro de novo, não uma etapa.
 *   post.texto         o gerador do post (`gerarPostDaPauta`) pede a pauta
 *                      avaliada inteira e o pacote, que não estão na linha
 *                      do post; reescrever a legenda por fora seria um segundo
 *                      gerador sem a guarda social.
 *   newsletter.*       o texto é a edição inteira (2 a 4 pautas, um laço de
 *                      reparo e o QA); a imagem é uma por pauta dentro do HTML
 *                      já montado. Nenhuma das duas é etapa de uma peça só.
 *   carrossel          refazer imagem ou arte de N telas exige o compositor do
 *                      carrossel; o gancho recusa com o motivo.
 *
 * Nos casos sem gancho a peça fica em `refazendo` com o motivo no painel, que é
 * o comportamento que a fila já tinha.
 *
 * Tudo aqui, menos o cliente do banco, é importado na hora (`import()` dentro do gancho): este arquivo é
 * lido por `integracao.ts`, que o worker e o ciclo social também importam, e
 * o renderizador e o redator não têm o que fazer no grafo deles.
 */

type Linha = Record<string, unknown>;

/** O que os ganchos precisam do mundo. Injetável, para o teste produzir o "não" sem rede. */
export type MundoDosGanchos = {
  client: () => SupabaseClient;
  projeto: (id: string) => Promise<Project>;
  vozDoArtigo: (projectId: string) => Promise<string>;
  escrever: (
    pauta: { classificacao: { pais: string; eixo: string }; grupo: { primary: { source_name: string } } },
    pacote: OrigemDoArtigo["pacote"],
    marca: MarcaDoArtigo,
  ) => Promise<ResultadoDoArtigo>;
  renderizarHtml: (artigo: Artigo, fonte: { nome: string; url: string }) => Promise<string> | string;
  imagem: (
    pauta: PautaParaImagem,
    ctx: { client: SupabaseClient; projeto: Project; evitar: string[] },
  ) => Promise<ResultadoVisual>;
  congelar: (entrada: EntradaDoCongelamento) => Promise<ResultadoDoCongelamento>;
  agora?: () => number;
};

function falha(motivo: string): ResultadoDaEtapa {
  return { ok: false, motivo };
}

function origemDe(ctx: ContextoDaRefacao): OrigemDoArtigo | null {
  const o = ctx.aprovacao.resumo?.origemDoArtigo;
  return o && typeof o === "object" && o.pacote ? o : null;
}

const SEM_ORIGEM =
  "a fila não guardou a pauta desta matéria (peça anterior à integração de 05/10/2026 ou artigo da edição): refaça à mão";

/** O bloco que vai no fim da voz do redator, na refação. */
export function instrucaoDaRefacao(ctx: Pick<ContextoDaRefacao, "naoRepetir" | "motivo">): string {
  return [
    ctx.naoRepetir,
    `ESTA MATÉRIA FOI REPROVADA PELO EDITOR, e é isto que precisa mudar: ${ctx.motivo}`,
  ]
    .filter((t) => t && t.trim())
    .join("\n\n");
}

async function lerLinha(client: SupabaseClient, tabela: string, colunas: string, id: string, projectId: string) {
  const { data, error } = await client.from(tabela).select(colunas).eq("id", id).eq("project_id", projectId).maybeSingle();
  if (error) throw new Error(`não consegui ler ${tabela} ${id}: ${error.message}`);
  return (data as Linha | null) ?? null;
}

export function criarGanchosDeProducao(mundo: MundoDosGanchos): GanchosDeRefazer {
  const textoDoArtigo = async (ctx: ContextoDaRefacao): Promise<ResultadoDaEtapa> => {
    const origem = origemDe(ctx);
    if (!origem) return falha(SEM_ORIGEM);
    const projeto = await mundo.projeto(ctx.aprovacao.projectId);
    const voz = await mundo.vozDoArtigo(projeto.id);
    const marca: MarcaDoArtigo = {
      nome: projeto.brand.displayName || projeto.name,
      nicho: projeto.niche,
      briefing: projeto.editorialPromptExtra ?? "",
      voz: [voz, instrucaoDaRefacao(ctx)].filter(Boolean).join("\n\n"),
    };
    const r = await mundo.escrever(
      { classificacao: { pais: origem.pais, eixo: origem.eixo }, grupo: { primary: { source_name: origem.fonteNome } } },
      origem.pacote,
      marca,
    );
    if (!r.artigo) return falha(`a reescrita não saiu: ${r.erro ?? r.veredicto.bloqueios.join(" | ")}`);
    if (!r.veredicto.aprovado) {
      return falha(`a reescrita não passou no auditor do artigo: ${r.veredicto.bloqueios.join(" | ")}`);
    }

    const a = r.artigo;
    const html = await mundo.renderizarHtml(a, { nome: origem.fonteNome, url: origem.fonteUrl });
    const palavras = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    const agora = new Date(mundo.agora ? mundo.agora() : Date.now()).toISOString();
    /*
     * O slug e o horário NÃO mudam: o endereço da matéria e a vaga dela na
     * cadência são da peça, não do texto. A capa também fica: a etapa
     * culpada foi o texto.
     */
    const { data, error } = await mundo
      .client()
      .from("articles")
      .update({
        title: a.titulo,
        excerpt: a.subtitulo || a.descricao_seo,
        description: a.descricao_seo,
        content_html: html,
        content: a.secoes.map((s) => ({ heading: s.intertitulo, paragraphs: s.paragrafos })),
        seo_title: a.titulo_seo,
        seo_description: a.descricao_seo.slice(0, 160),
        aeo_questions: a.perguntas,
        reading_minutes: Math.max(1, Math.ceil(palavras / 200)),
        updated_at: agora,
      })
      .eq("id", ctx.aprovacao.pecaId)
      .eq("project_id", ctx.aprovacao.projectId)
      .in("status", ["draft", "scheduled"])
      .select("id");
    if (error) return falha(`a reescrita não foi gravada: ${error.message}`);
    if (!data || data.length === 0) return falha("o artigo não está mais em rascunho nem agendado");
    return { ok: true, resumo: { titulo: a.titulo, texto: a.titulo } };
  };

  const imagemDoArtigo = async (ctx: ContextoDaRefacao): Promise<ResultadoDaEtapa> => {
    const origem = origemDe(ctx);
    if (!origem) return falha(SEM_ORIGEM);
    const projeto = await mundo.projeto(ctx.aprovacao.projectId);
    const client = mundo.client();
    const linha = await lerLinha(client, "articles", "id, cover_image", ctx.aprovacao.pecaId, projeto.id);
    if (!linha) return falha("o artigo não existe mais");
    const atual = typeof linha.cover_image === "string" ? linha.cover_image : "";

    const r = await mundo.imagem(
      {
        storyId: origem.storyId,
        titulo: origem.titulo,
        resumo: origem.resumo,
        categoria: origem.eixo,
        classificacao: {
          atores: origem.atores,
          lugares: origem.lugares,
          acontecimento: origem.acontecimento,
          pais: origem.pais,
        },
      },
      { client, projeto, evitar: atual ? [atual] : [] },
    );
    const nova = r.asset?.imageUrl ?? "";
    if (!nova || nova === atual) return falha("o resolvedor não achou outra foto para esta pauta");

    const { error } = await client
      .from("articles")
      .update({ cover_image: nova, updated_at: new Date(mundo.agora ? mundo.agora() : Date.now()).toISOString() })
      .eq("id", ctx.aprovacao.pecaId)
      .eq("project_id", projeto.id)
      .in("status", ["draft", "scheduled"]);
    if (error) return falha(`a capa nova não foi gravada: ${error.message}`);
    return { ok: true, resumo: { imagens: [nova] } };
  };

  function ehCarrossel(l: Linha): boolean {
    const cj = (l.content_json ?? {}) as Linha;
    return (
      (Array.isArray(cj.slides) && cj.slides.length > 0) ||
      (Array.isArray(l.asset_paths) && l.asset_paths.length > 1) ||
      Boolean(cj.carrossel)
    );
  }

  const COLUNAS_DO_POST = "id, story_id, title, edition_date, content_json, asset_paths";

  const imagemDoPost = async (ctx: ContextoDaRefacao): Promise<ResultadoDaEtapa> => {
    const projeto = await mundo.projeto(ctx.aprovacao.projectId);
    const client = mundo.client();
    const l = await lerLinha(client, "social_posts", COLUNAS_DO_POST, ctx.aprovacao.pecaId, projeto.id);
    if (!l) return falha("o post não existe mais");
    if (ehCarrossel(l)) return falha("carrossel: a refação de imagem de várias telas ainda não está ligada");

    const cj = (l.content_json ?? {}) as Linha;
    const copy = (cj.copy ?? {}) as Linha;
    const arte = (cj.arte ?? {}) as Linha;
    const visual = (cj.visual ?? {}) as Linha;
    const atual = typeof visual.imageUrl === "string" ? visual.imageUrl : "";
    const storyId = typeof l.story_id === "string" && l.story_id ? l.story_id : String(l.id);

    // A classificação mora na candidata, como no `reencapar-arte.ts`.
    let classificacao = { atores: [] as string[], lugares: [] as string[], acontecimento: [] as string[], pais: "EUA" };
    let resumo = "";
    if (typeof l.story_id === "string" && l.story_id) {
      const { data } = await client
        .from("news_candidates")
        .select("summary, classificacao")
        .eq("project_id", projeto.id)
        .eq("story_id", l.story_id)
        .limit(1);
      const c = ((data ?? []) as Linha[])[0];
      const k = (c?.classificacao ?? null) as Linha | null;
      if (k) {
        classificacao = {
          atores: Array.isArray(k.atores) ? (k.atores as string[]) : [],
          lugares: Array.isArray(k.lugares) ? (k.lugares as string[]) : [],
          acontecimento: Array.isArray(k.acontecimento) ? (k.acontecimento as string[]) : [],
          pais: typeof k.pais === "string" ? k.pais : "EUA",
        };
      }
      resumo = typeof c?.summary === "string" ? c.summary : "";
    }

    const r = await mundo.imagem(
      {
        storyId,
        titulo: String(copy.headline ?? l.title ?? ""),
        resumo,
        categoria: String(arte.eixo ?? ""),
        classificacao,
      },
      { client, projeto, evitar: atual ? [atual] : [] },
    );
    const nova = r.asset?.imageUrl ?? "";
    if (!nova || nova === atual) return falha("o resolvedor não achou outra foto para esta pauta");

    const { error } = await client
      .from("social_posts")
      .update({
        content_json: {
          ...cj,
          visual: { ...visual, capa: "foto", imageUrl: nova, credito: r.asset?.attribution ?? "", motivo: r.motivo ?? "" },
        },
        updated_at: new Date(mundo.agora ? mundo.agora() : Date.now()).toISOString(),
      })
      .eq("id", ctx.aprovacao.pecaId)
      .eq("project_id", projeto.id);
    if (error) return falha(`a foto nova não foi gravada: ${error.message}`);
    // A arte vem em seguida (`etapasARefazer`), e é ela que muda o hash do post.
    return { ok: true, resumo: { imagens: [nova] } };
  };

  const arteDoPost = async (ctx: ContextoDaRefacao): Promise<ResultadoDaEtapa> => {
    const projeto = await mundo.projeto(ctx.aprovacao.projectId);
    const client = mundo.client();
    const l = await lerLinha(client, "social_posts", COLUNAS_DO_POST, ctx.aprovacao.pecaId, projeto.id);
    if (!l) return falha("o post não existe mais");
    if (ehCarrossel(l)) return falha("carrossel: a refação de arte de várias telas ainda não está ligada");

    const cj = (l.content_json ?? {}) as Linha;
    const copy = (cj.copy ?? {}) as Linha;
    const arte = (cj.arte ?? {}) as Linha;
    const visual = (cj.visual ?? {}) as Linha;
    const headline = String(copy.headline ?? l.title ?? "").trim();
    if (!headline) return falha("o post não tem manchete gravada");
    const foto = typeof visual.imageUrl === "string" && visual.imageUrl ? visual.imageUrl : "";
    const credito = typeof visual.credito === "string" ? visual.credito : "";

    const { gramaticaEfetiva, varianteDaCapa } = await import("../social/arte");
    const corpo = typeof copy.gancho === "string" ? copy.gancho : "";
    const eixo = String(arte.eixo ?? "");
    const gramatica = gramaticaEfetiva({
      pedida: arte.gramatica === "recorte" ? "recorte" : "jornal",
      eixo,
      headline,
      corpo,
      comFoto: Boolean(foto),
    });

    const agora = mundo.agora ? mundo.agora() : Date.now();
    const congelado = await mundo.congelar({
      capa: {
        headline,
        eixo,
        gramatica,
        ...(gramatica === "recorte" ? { corpo } : {}),
        asset: foto ? { imageUrl: foto, attribution: credito } : null,
        assetSecundario: null,
        motivoSemFoto: foto ? "" : String(visual.motivo ?? ""),
      },
      // Caminho NOVO a cada refação: sobrescrever quebraria o hash de quem aponta para o antigo.
      path: `${projeto.slug}/${String(l.edition_date ?? "")}/refeito-${String(l.id).slice(0, 8)}-${agora}`,
    });
    if (!congelado.ok) return falha(`a arte não fechou: ${congelado.motivo}`);

    const artefato = { ...((arte.artefato as Linha) ?? {}), ...congelado.artefato, index: 1 };
    const { error } = await client
      .from("social_posts")
      .update({
        content_json: { ...cj, arte: { ...arte, artefato, gramatica, variante: varianteDaCapa(Boolean(foto), gramatica) } },
        asset_paths: [congelado.artefato.url],
        slides_manifest: [
          {
            index: 1,
            url: congelado.artefato.url,
            filename: congelado.artefato.filename,
            sha256: congelado.artefato.sha256,
            bytes: congelado.artefato.bytes,
            provider_child_id: null,
          },
        ],
        updated_at: new Date(agora).toISOString(),
      })
      .eq("id", ctx.aprovacao.pecaId)
      .eq("project_id", projeto.id)
      // Nunca mexe em post que já está no ar ou com container criado.
      .is("provider_creation_id", null)
      .neq("status", "published");
    if (error) return falha(`a arte nova não foi gravada: ${error.message}`);
    return { ok: true, resumo: { imagens: [congelado.artefato.url] } };
  };

  return {
    artigo: { texto: textoDoArtigo, imagem: imagemDoArtigo },
    post: { imagem: imagemDoPost, arte: arteDoPost },
  };
}

/** O mundo de verdade: banco, redator, resolvedor e renderizador, carregados na hora. */
export function mundoDeProducao(env: Record<string, string | undefined> = process.env): MundoDosGanchos {
  return {
    // O cliente do banco já está no grafo de `integracao.ts`; só ele entra por import estático.
    client: getSupabaseAdminClient,
    projeto: async (id) => (await import("../projects")).requireActiveProject(id),
    vozDoArtigo: async (projectId) => (await (await import("../ramos/vozes")).vozesDosRamos(projectId)).artigo,
    escrever: async (pauta, pacote, marca) =>
      (await import("../ramos/artigo")).escreverArtigoDaPauta(pauta, pacote, marca, { env }),
    renderizarHtml: async (artigo, fonte) => (await import("../ramos/artigo")).renderizarArtigoHtml(artigo, fonte),
    imagem: async (pauta, ctx) => {
      const { imagemDaPauta } = await import("../visual/acervo/imagem-da-pauta");
      return imagemDaPauta(pauta, {
        client: ctx.client,
        projeto: ctx.projeto,
        ignorarReuso: true,
        opcoes: {
          client: ctx.client,
          env,
          jaUsadosNestaEdicao: new Set(ctx.evitar),
          jaUsadasRecentemente: ctx.evitar,
        },
      });
    },
    congelar: async (entrada) => (await import("../social/artefato")).congelarArtefato(entrada),
  };
}
