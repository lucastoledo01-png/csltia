import { MARCA } from "@/lib/marca";
import { editoriaDaPauta, nomeDaEditoria } from "@/lib/editorias";
import { semImagemDaCapaNoCorpo } from "@/lib/imagem-da-capa";
import { escapeHtml, safeHttpUrl } from "./html";
import { renderizarArtigoHtml, type Artigo } from "./ramos/artigo";
import { slugDoArtigo } from "./ramos/portal";
import { ehImagemDaBandeira } from "./visual/bandeira";

/**
 * As edições antigas desmontadas em uma matéria por pauta (05/10/2026).
 *
 * Até os ramos, o portal publicava a newsletter inteira como UM artigo,
 * `edicao-AAAA-MM-DD`, com o HTML do e-mail. Quem chegava pela busca
 * procurando um assunto caía numa página de quatro assuntos com cromo de
 * e-mail. O dono pediu que as 23 edições já publicadas virassem matérias no
 * formato de artigo, uma por pauta, como as que o ramo do portal passa a
 * escrever.
 *
 * **Nada aqui chama modelo.** O texto de cada matéria é o texto que a edição
 * já publicou, campo por campo: o resumo vira a abertura, o contexto, o "por
 * que importa" e o "na prática" viram seções com intertítulo, e a fonte vira o
 * crédito. É determinístico de propósito: o que foi ao ar uma vez com o nosso
 * nome é o que vai ao ar de novo, sem uma frase nova que ninguém conferiu. A
 * linha de humor fica de fora, porque ela é do e-mail e não da matéria.
 *
 * Puro, sem banco: o script `src/scripts/artigos-por-pauta.ts` grava, e a
 * página `/artigos/edicao-...` usa o mesmo plano para saber para onde
 * redirecionar o link antigo.
 */

/** Uma pauta como a edição a gravou em `articles.content`. */
export type HistoriaDaEdicao = {
  rank?: number;
  title?: string;
  context?: string;
  summary?: string;
  category?: string;
  humor_line?: string;
  source_url?: string;
  source_name?: string;
  secondary_urls?: string[];
  why_it_matters?: string;
  practical_impact?: string;
};

/** A linha `edicao-*` de `articles`, só com o que o plano lê. */
export type EdicaoComoArtigo = {
  slug: string;
  project_id: string;
  published_at: string | null;
  cover_image: string | null;
  content: unknown;
  content_html: string | null;
};

/** A linha que o plano manda gravar em `articles`. */
export type ArtigoDaPauta = {
  project_id: string;
  slug: string;
  title: string;
  excerpt: string;
  description: string;
  seo_title: string;
  seo_description: string;
  content_html: string;
  content: Array<{ heading: string; paragraphs: string[] }>;
  category: string;
  cover_image: string | null;
  published_at: string;
  updated_at: string;
  status: "published";
  manual_review_status: "approved";
  author: string;
  reading_minutes: number;
  source_urls: string[];
  tags: string[];
  canonical_url: string;
  aeo_questions: unknown[];
};

export type PautaPulada = { posicao: number; titulo: string; categoria: string; motivo: string };

export type PlanoDaEdicao = {
  edicao: string;
  data: string;
  artigos: ArtigoDaPauta[];
  puladas: PautaPulada[];
  /**
   * Pautas sem foto própria recuperável no HTML da edição (ou só com a
   * bandeira). Desde 05/10/2026 elas NÃO viram matéria: estão também em
   * `puladas`, com o motivo `REJECT_NO_PHOTO`.
   */
  semFoto: string[];
};

const PADRAO_DA_EDICAO = /^edicao-(\d{4}-\d{2}-\d{2})$/;

/** A data da edição a partir do slug, ou `null` se o slug não é de edição. */
export function dataDaEdicao(slug: string): string | null {
  return PADRAO_DA_EDICAO.exec(slug)?.[1] ?? null;
}

/**
 * Termos que marcam pauta de imigração, olhados no rótulo e no título.
 *
 * Imigração saiu da linha em 05/10/2026 (`decisoes.md`). O resumo NÃO é
 * olhado: "imigrante" aparece de passagem em pauta de política municipal, e
 * a pauta não é sobre isso. A lista é para o acervo fixo de 23 edições, e o
 * ensaio do script imprime cada pulada para o dono conferir antes de gravar.
 */
const SINAIS_DE_IMIGRACAO: Array<{ rotulo: string; padrao: RegExp }> = [
  { rotulo: "imigração", padrao: /imigra/ },
  { rotulo: "visto", padrao: /\bvistos?\b/ },
  { rotulo: "green card", padrao: /green card/ },
  { rotulo: "deportação", padrao: /deport/ },
  { rotulo: "asilo", padrao: /\basilo\b/ },
  { rotulo: "refugiado", padrao: /refugiad/ },
  { rotulo: "H-1B", padrao: /\bh-?1b\b/ },
  { rotulo: "O-1", padrao: /\bo-1[ab]?\b/ },
  { rotulo: "EB-2/EB-5", padrao: /\beb-?[1-5]\b|\bniw\b/ },
  { rotulo: "I-864", padrao: /\bi-\d{3}\b/ },
  { rotulo: "USCIS", padrao: /\buscis\b/ },
  { rotulo: "ICE", padrao: /\bice\b/ },
  { rotulo: "cidadania", padrao: /cidadania|naturaliza/ },
  { rotulo: "residência", padrao: /resid[eê]ncia/ },
  { rotulo: "intercâmbio", padrao: /intercamb|interc[aâ]mbio/ },
  { rotulo: "estrangeiros", padrao: /estrangeiros/ },
  { rotulo: "detenção", padrao: /centro de deten[cç][aã]o|deten[cç][aã]o e/ },
];

/** O motivo de a pauta ser de imigração, ou `null` se não é. */
export function motivoDeImigracao(categoria: string, titulo: string): string | null {
  const texto = `${categoria} ${titulo}`.toLowerCase();
  const achado = SINAIS_DE_IMIGRACAO.find((s) => s.padrao.test(texto));
  return achado ? `imigração (${achado.rotulo})` : null;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function historiasDe(content: unknown): HistoriaDaEdicao[] {
  return Array.isArray(content) ? (content.filter((h) => h && typeof h === "object") as HistoriaDaEdicao[]) : [];
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

function desfazerEntidades(s: string): string {
  let atual = s;
  for (let i = 0; i < 3; i++) {
    const proximo = atual
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
      .replace(/&([a-z#0-9]+);/gi, (m, nome: string) => ENTIDADES[nome.toLowerCase()] ?? m);
    if (proximo === atual) break;
    atual = proximo;
  }
  return atual;
}

function normalizar(s: string): string {
  return desfazerEntidades(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * A foto de cada pauta, recuperada do HTML da edição.
 *
 * A edição não gravou a foto na pauta: ela existe só dentro do HTML montado.
 * A home pareia por ORDEM (a n-ésima foto é da n-ésima pauta), e isso erra
 * quando uma pauta saiu sem foto: na edição de 16/09 a foto da quarta pauta
 * cairia na segunda. Aqui o pareamento é por POSIÇÃO: a foto de uma pauta é a
 * primeira imagem entre o título dela e o título da próxima. Pauta cujo título
 * não é achado num cabeçalho fica sem foto, e a peça tipográfica aparece.
 */
export function fotosPorPauta(html: string | null, titulos: string[]): Array<string | null> {
  return fotosECreditosPorPauta(html, titulos).map((f) => f?.src ?? null);
}

/** O parágrafo de crédito colado logo depois da foto, com cara de licença ou de banco de imagem. */
const CREDITO_DA_FOTO = /^\s*<p\b[^>]*>([^<]{3,220})<\/p>/i;
const CARA_DE_CREDITO = /\b(cc[ -]|cc0|wikimedia|pexels|unsplash|flickr|foto:|dom[ií]nio p[uú]blico|public domain)/i;

/**
 * A foto de cada pauta e o crédito dela (05/10/2026).
 *
 * O e-mail imprime o crédito logo abaixo da foto ("Dietmar Rabich, CC BY-SA
 * 4.0, via Wikimedia Commons"), e a licença CC BY exige esse crédito visível
 * junto da obra. A matéria nova leva a foto como capa, então leva o crédito
 * junto, para a página imprimir embaixo da capa.
 */
export function fotosECreditosPorPauta(
  html: string | null,
  titulos: string[],
): Array<{ src: string; credito: string | null } | null> {
  if (!html) return titulos.map(() => null);
  const cabecalhos = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)].map((m) => ({
    pos: m.index ?? 0,
    texto: normalizar(m[1]),
  }));
  const imagens = [...html.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi)]
    .map((m) => ({ pos: m.index ?? 0, fim: (m.index ?? 0) + m[0].length, src: m[1] }))
    .filter((i) => !i.src.includes("/marca/"));

  let aPartirDe = -1;
  const posicoes = titulos.map((t) => {
    const alvo = normalizar(t);
    const c = cabecalhos.find((h) => h.pos > aPartirDe && h.texto === alvo);
    if (!c) return null;
    aPartirDe = c.pos;
    return c.pos;
  });

  return posicoes.map((pos, i) => {
    if (pos === null) return null;
    const fim = posicoes.slice(i + 1).find((p): p is number => p !== null) ?? Number.POSITIVE_INFINITY;
    const img = imagens.find((im) => im.pos > pos && im.pos < fim);
    if (!img) return null;
    const depois = CREDITO_DA_FOTO.exec(html.slice(img.fim, img.fim + 600))?.[1];
    const credito = depois ? desfazerEntidades(depois).replace(/\s+/g, " ").trim() : "";
    return { src: desfazerEntidades(img.src), credito: credito && CARA_DE_CREDITO.test(credito) ? credito : null };
  });
}

function paragrafos(s: string): string[] {
  return s
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Corta no limite sem partir palavra, e sem os asteriscos de negrito. */
function aparar(s: string, limite: number): string {
  const limpo = s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*/g, "").replace(/\s+/g, " ").trim();
  if (limpo.length <= limite) return limpo;
  const bruto = limpo.slice(0, limite - 1);
  const espaco = bruto.lastIndexOf(" ");
  return `${(espaco > limite * 0.6 ? bruto.slice(0, espaco) : bruto).replace(/[\s,;:.]+$/, "")}…`;
}

/**
 * As frases inteiras que cabem no limite, e não um corte no meio da frase.
 * A descrição vira a linha fina da página e o resultado de busca, e "Anita..."
 * cortado no nome de alguém lê como defeito. Sem frase que caiba, corta.
 */
function frasesQueCabem(s: string, limite: number): string {
  const limpo = s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*/g, "").replace(/\s+/g, " ").trim();
  let saida = "";
  for (const frase of limpo.split(/(?<=[.!?])\s+/)) {
    const proxima = saida ? `${saida} ${frase}` : frase;
    if (proxima.length > limite) break;
    saida = proxima;
  }
  return saida || aparar(limpo, limite);
}

function hostDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** O corpo da matéria, no mesmo molde do ramo do portal. */
export function corpoDaPauta(h: HistoriaDaEdicao): { artigo: Artigo; html: string } {
  const secoes: Artigo["secoes"] = [];
  const abertura = paragrafos(texto(h.summary));
  if (abertura.length) secoes.push({ intertitulo: "", paragrafos: abertura });
  for (const [intertitulo, campo] of [
    ["Contexto", h.context],
    ["Por que importa", h.why_it_matters],
    ["Na prática", h.practical_impact],
  ] as const) {
    const ps = paragrafos(texto(campo));
    if (ps.length) secoes.push({ intertitulo, paragrafos: ps });
  }

  const titulo = texto(h.title);
  const artigo: Artigo = {
    titulo,
    subtitulo: "",
    titulo_seo: aparar(titulo, 70),
    descricao_seo: frasesQueCabem(abertura[0] ?? titulo, 160),
    secoes,
    perguntas: [],
  };

  let html = renderizarArtigoHtml(artigo, { nome: texto(h.source_name) || hostDe(texto(h.source_url)), url: texto(h.source_url) });
  const outras = (h.secondary_urls ?? []).map(texto).filter((u) => u && u !== texto(h.source_url));
  if (outras.length) {
    html += `<p class="fonte">Leia também: ${outras
      .map((u) => `<a href="${safeHttpUrl(u)}" rel="noopener" target="_blank">${escapeHtml(hostDe(u))}</a>`)
      .join(", ")}</p>`;
  }
  return { artigo, html };
}

/**
 * Os slugs das pautas de uma edição, na ordem, sem repetição dentro dela.
 *
 * `slugDoArtigo` leva a data, então duas edições nunca colidem entre si. Dentro
 * da mesma edição dois títulos iguais ganhariam o mesmo slug, e o upsert
 * gravaria um por cima do outro: o segundo leva sufixo.
 */
export function slugsDaEdicao(titulos: string[], data: string): string[] {
  const vistos = new Map<string, number>();
  return titulos.map((t) => {
    const base = slugDoArtigo(t, data);
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
}

/**
 * O plano de uma edição: as matérias a gravar e as pautas puladas.
 *
 * `published_at` é o da edição mais alguns minutos, decrescentes pela ordem:
 * a primeira pauta fica com o horário mais tarde, para a lista mais recente
 * primeiro mostrar as pautas da edição na ordem em que ela as publicou.
 */
export function planejarEdicao(edicao: EdicaoComoArtigo): PlanoDaEdicao | null {
  const data = dataDaEdicao(edicao.slug);
  if (!data) return null;

  const historias = historiasDe(edicao.content);
  const titulos = historias.map((h) => texto(h.title));
  const slugs = slugsDaEdicao(titulos, data);
  const fotosComCredito = fotosECreditosPorPauta(edicao.content_html, titulos);
  const fotos = fotosComCredito.map((f) => f?.src ?? null);
  const algumaFoto = fotos.some(Boolean);
  const base = Date.parse(edicao.published_at ?? `${data}T09:00:00.000Z`);

  const plano: PlanoDaEdicao = { edicao: edicao.slug, data, artigos: [], puladas: [], semFoto: [] };

  historias.forEach((h, i) => {
    const titulo = titulos[i];
    const categoriaDaEdicao = texto(h.category);
    if (!titulo) {
      plano.puladas.push({ posicao: i, titulo: "(sem título)", categoria: categoriaDaEdicao, motivo: "pauta sem título" });
      return;
    }
    const imigracao = motivoDeImigracao(categoriaDaEdicao, titulo);
    if (imigracao) {
      plano.puladas.push({ posicao: i, titulo, categoria: categoriaDaEdicao, motivo: imigracao });
      return;
    }

    const { artigo, html: corpo } = corpoDaPauta(h);
    const categoria = nomeDaEditoria(editoriaDaPauta(categoriaDaEdicao, titulo));
    /*
     * Sem nenhuma foto recuperável por posição, a capa da edição vai só para a
     * primeira pauta, que é a dona dela; as outras ficam com a peça
     * tipográfica, e não com uma foto de outro assunto.
     */
    const capa = fotos[i] ?? (!algumaFoto && i === 0 ? edicao.cover_image : null);
    /*
     * Pauta sem foto não vira conteúdo (decisão do dono, 05/10/2026). Até
     * aqui ela virava matéria com a peça tipográfica; agora é pulada, como a
     * de imigração. A bandeira de último recurso conta como sem foto: ela não
     * é foto da pauta, e não é mais publicada.
     */
    if (!capa || ehImagemDaBandeira(capa)) {
      plano.semFoto.push(slugs[i]);
      plano.puladas.push({
        posicao: i,
        titulo,
        categoria: categoriaDaEdicao,
        motivo: capa ? "REJECT_NO_PHOTO: só a bandeira de último recurso" : "REJECT_NO_PHOTO: sem foto da pauta na edição",
      });
      return;
    }
    /*
     * A capa NUNCA entra no corpo (05/10/2026): o dono viu a capa e a mesma
     * foto logo abaixo dela. O corpo daqui não tem foto, e a guarda existe
     * para continuar assim se alguém puser uma. O crédito da foto vai no
     * começo do corpo, marcado, e a página o imprime embaixo da capa.
     */
    const credito = capa && fotos[i] === capa ? fotosComCredito[i]?.credito : null;
    const html =
      (credito ? `<p class="credito-da-foto">${escapeHtml(credito)}</p>` : "") +
      semImagemDaCapaNoCorpo(corpo, capa).html;
    const palavras = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    const publicadaEm = new Date(base + (historias.length - i) * 60_000).toISOString();
    const fonte = texto(h.source_url);
    const fontes = [fonte, ...(h.secondary_urls ?? []).map(texto)].filter((u, j, todos) => u && todos.indexOf(u) === j);

    plano.artigos.push({
      project_id: edicao.project_id,
      slug: slugs[i],
      title: titulo,
      excerpt: frasesQueCabem(paragrafos(texto(h.summary))[0] ?? titulo, 220),
      description: artigo.descricao_seo,
      seo_title: artigo.titulo_seo,
      seo_description: artigo.descricao_seo,
      content_html: html,
      content: artigo.secoes.map((s) => ({ heading: s.intertitulo, paragraphs: s.paragrafos })),
      category: categoria,
      cover_image: capa,
      published_at: publicadaEm,
      /*
       * `updated_at` é o da publicação, e não o da gravação: o texto é o que
       * foi ao ar naquele dia, e o `dateModified` da página sai daqui. Gravar
       * "agora" diria à busca que 62 matérias mudaram hoje sem mudar nada.
       */
      updated_at: publicadaEm,
      status: "published",
      manual_review_status: "approved",
      author: MARCA.nome,
      reading_minutes: Math.max(1, Math.ceil(palavras / 200)),
      source_urls: fontes,
      tags: [categoria, `origem:${edicao.slug}`],
      canonical_url: `${MARCA.site}/artigos/${slugs[i]}`,
      aeo_questions: [],
    });
  });

  return plano;
}

/** Para onde vai o link antigo de uma edição: a primeira matéria dela, ou nada. */
export function destinoDaEdicao(edicao: EdicaoComoArtigo): string | null {
  return planejarEdicao(edicao)?.artigos[0]?.slug ?? null;
}
