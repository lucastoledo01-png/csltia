import { getSupabaseAdminClient } from "./supabase-admin";
import { EDITORIAS, editoriaDaPauta, type EditoriaId } from "@/lib/editorias";
import { comRetentativa, LeituraFalhou } from "./leitura";
import { motivoDeImigracao, slugsDaEdicao } from "./artigos-por-pauta";

/**
 * O conteúdo da home do portal.
 *
 * A unidade que o leitor vê é a PAUTA, não a edição. A edição é o formato do
 * e-mail: uma peça com quatro assuntos dentro. Numa home de portal, quatro
 * assuntos dentro de um card só produzem uma página com quatro itens por
 * semana, e o leitor não encontra o assunto que procura.
 *
 * Então a home desmonta as edições em pautas. Cada pauta vira um card, com
 * rótulo próprio, editoria inferida e link para a edição onde ela saiu.
 *
 * ## A foto, e por que ela é extraída do HTML
 *
 * A pauta gravada em `news_editions.stories` não guarda a própria foto: as
 * imagens da edição são resolvidas no render e existem, hoje, apenas dentro do
 * `content_html` já montado. Extrair dali é uma ponte, não um destino: a
 * ordem das imagens no HTML é a ordem das pautas, e é isso que as pareia.
 *
 * O destino é a pauta carregar `image_url` quando for gravada. Enquanto não
 * for, a ponte entrega a foto certa e falha de forma visível se a ordem mudar,
 * porque a foto errada aparece no card errado.
 */

export type PautaDoPortal = {
  id: string;
  titulo: string;
  resumo: string;
  rotulo: string;
  editoria: EditoriaId;
  imagem: string | null;
  fonte: string;
  data: string;
  /** Link para a edição onde a pauta saiu. */
  href: string;
};

export type EdicaoBruta = {
  edition_date: string;
  slug: string;
  stories: Array<Record<string, unknown>> | null;
  content_html: string | null;
};

/** As fotos do HTML da edição, na ordem, sem os arquivos da marca. */
function fotosDoHtml(html: string | null): string[] {
  if (!html) return [];
  return [...html.matchAll(/<img[^>]+src="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !u.includes("/marca/"));
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** A linha de `articles` que a home lê, quando os ramos publicam matéria própria. */
export type ArtigoDoRamo = {
  slug: string;
  title: string | null;
  excerpt: string | null;
  cover_image: string | null;
  category: string | null;
  published_at: string | null;
  source_urls: string[] | null;
};

/** O prefixo do artigo que é a EDIÇÃO regravada, e não matéria própria. */
const PREFIXO_DO_ARTIGO_DA_EDICAO = "edicao-";

function dataLocal(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * As matérias próprias do portal entram na home junto das pautas das edições.
 *
 * Integração de 05/10/2026. Com os ramos em `enforce`, o portal deixou de
 * regravar o e-mail e passou a publicar uma matéria por pauta, que é a unidade
 * que a home sempre quis. Só que a home lia `news_editions` e nada mais: as
 * matérias iam ao ar e não apareciam em lugar nenhum da primeira página.
 *
 * Três regras, e cada uma evita um defeito visível:
 *
 *   - o artigo `edicao-AAAA-MM-DD` não entra: ele É a edição, que já está na
 *     home desmontada em pautas, e entraria duas vezes;
 *   - a pauta da edição cuja fonte é a mesma de uma matéria própria sai, e a
 *     matéria fica: é o mesmo fato, e a matéria é a peça escrita para o portal;
 *   - mais recente primeiro. A matéria tem hora (`published_at`) e a pauta da
 *     edição só tem dia, então no mesmo dia a matéria vem antes, e a ordem das
 *     pautas dentro da edição é preservada.
 *
 * Pura, para o teste produzir o "não" sem banco.
 */
export function juntarPautasEArtigos(
  pautasDasEdicoes: PautaDoPortal[],
  artigos: ArtigoDoRamo[],
  timezone = "America/Sao_Paulo",
  fontesDasPautas: Map<string, string> = new Map(),
): PautaDoPortal[] {
  const proprios = artigos.filter(
    (a) => a.slug && !a.slug.startsWith(PREFIXO_DO_ARTIGO_DA_EDICAO) && (a.title ?? "").trim() && a.published_at,
  );
  const fontesDosArtigos = new Set(proprios.map((a) => a.source_urls?.[0]).filter((u): u is string => Boolean(u)));

  const doRamo = proprios.map((a) => {
    const titulo = (a.title ?? "").trim();
    const rotulo = (a.category ?? "").trim() || "Notícias";
    return {
      quando: a.published_at as string,
      pauta: {
        id: `artigo:${a.slug}`,
        titulo,
        resumo: (a.excerpt ?? "").trim(),
        rotulo,
        editoria: editoriaDaPauta(rotulo, titulo),
        imagem: a.cover_image || null,
        fonte: "",
        data: dataLocal(a.published_at as string, timezone),
        href: `/artigos/${a.slug}`,
      } satisfies PautaDoPortal,
    };
  });

  const dasEdicoes = pautasDasEdicoes
    .filter((p) => {
      const fonte = fontesDasPautas.get(p.id);
      return !(fonte && fontesDosArtigos.has(fonte));
    })
    // Meia-noite UTC do dia: no mesmo dia, toda matéria com hora vem antes.
    .map((p) => ({ quando: `${p.data}T00:00:00.000Z`, pauta: p }));

  return [...doRamo, ...dasEdicoes]
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => b.quando.localeCompare(a.quando) || a.i - b.i)
    .map((x) => x.pauta);
}

/**
 * As pautas das edições, prontas para a home. Pura, para o teste.
 *
 * Duas regras de 05/10/2026, do dia em que as edições viraram uma matéria por
 * pauta (`artigos-por-pauta.ts`):
 *
 *   - a pauta cuja matéria própria está publicada aponta para a matéria, e não
 *     para a edição. O slug é o MESMO que o script gravou (`slugsDaEdicao`), e
 *     só vale se a matéria está no ar: antes de o dono rodar o script, a pauta
 *     continua apontando para a edição, que continua publicada;
 *   - a pauta de imigração sai. A linha deixou o assunto, o script não a
 *     transformou em matéria, e o link dela levaria, pelo redirecionamento da
 *     edição, a outra pauta.
 */
export function pautasDasEdicoes(
  edicoes: EdicaoBruta[],
  slugsPublicados: Set<string> = new Set(),
): { pautas: PautaDoPortal[]; fontesDasPautas: Map<string, string> } {
  const pautas: PautaDoPortal[] = [];
  const fontesDasPautas = new Map<string, string>();

  for (const edicao of edicoes) {
    const fotos = fotosDoHtml(edicao.content_html);
    const historias = edicao.stories ?? [];
    const slugs = slugsDaEdicao(
      historias.map((s) => texto(s.title)),
      edicao.edition_date,
    );

    historias.forEach((s, i) => {
      const titulo = texto(s.title);
      if (!titulo) return;

      const rotulo = texto(s.category) || "Notícias";
      if (motivoDeImigracao(rotulo, titulo)) return;

      const fonteUrl = texto(s.source_url);
      if (fonteUrl) fontesDasPautas.set(`${edicao.slug}#${i}`, fonteUrl);

      pautas.push({
        id: `${edicao.slug}#${i}`,
        titulo,
        resumo: texto(s.summary),
        rotulo,
        editoria: editoriaDaPauta(rotulo, titulo),
        imagem: fotos[i] ?? null,
        fonte: texto(s.source_name),
        data: edicao.edition_date,
        href: slugsPublicados.has(slugs[i]) ? `/artigos/${slugs[i]}` : `/artigos/${edicao.slug}`,
      });
    });
  }

  return { pautas, fontesDasPautas };
}

/** Só a pauta cuja matéria está publicada vira cartão (06/10/2026). */
export function soComMateriaPublicada(pautas: PautaDoPortal[], slugsPublicados: Set<string>): PautaDoPortal[] {
  return pautas.filter((p) => p.href.startsWith("/artigos/") && slugsPublicados.has(p.href.slice("/artigos/".length)));
}

export async function pautasRecentes(
  projectId: string,
  limite = 40,
  /*
   * Integração de 05/10/2026: só com os ramos em `enforce` a home lê também
   * `articles`. Ausente, a home é a de antes, uma consulta só.
   *
   * Depois, no mesmo dia: a home lê sempre os slugs publicados (duas colunas
   * de uma tabela pequena), para a pauta apontar para a matéria por pauta.
   */
  opcoes: {
    incluirArtigosDosRamos?: boolean;
    timezone?: string;
    /** Quantas edições ler. A home lê 20; a página de editoria lê mais, porque filtra. */
    edicoes?: number;
    /** Quantas matérias dos ramos ler, com os ramos em `enforce`. */
    artigos?: number;
  } = {},
): Promise<PautaDoPortal[]> {
  const client = getSupabaseAdminClient();

  const edicoes = await comRetentativa("edições do portal", async () => {
    const { data, error } = await client
      .from("news_editions")
      .select("edition_date, slug, stories, content_html")
      .eq("project_id", projectId)
      .eq("status", "published")
      .order("edition_date", { ascending: false })
      .limit(opcoes.edicoes ?? 20);

    if (error) throw new LeituraFalhou(`Falha ao carregar edições: ${error.message}`);
    return (data ?? []) as EdicaoBruta[];
  });

  /*
   * Os slugs das matérias por pauta já publicadas (05/10/2026), para a pauta
   * da edição apontar direto para a matéria dela. Sem esta leitura a pauta
   * aponta para a edição, que redireciona: o leitor chega, com um salto a
   * mais. Não vale derrubar a home por isso, e a falha vira conjunto vazio.
   */
  const slugsPublicados = await comRetentativa("matérias por pauta", async () => {
    const { data, error } = await client
      .from("articles")
      .select("slug")
      .eq("project_id", projectId)
      .eq("status", "published")
      .not("slug", "like", `${PREFIXO_DO_ARTIGO_DA_EDICAO}%`)
      .limit(2000);
    if (error) throw new LeituraFalhou(`Falha ao carregar matérias: ${error.message}`);
    return new Set(((data ?? []) as Array<{ slug: string }>).map((r) => r.slug));
  }).catch(() => new Set<string>());

  const { pautas: todasDasEdicoes, fontesDasPautas } = pautasDasEdicoes(edicoes, slugsPublicados);

  /*
   * O portal recomeça do zero em 06/10/2026, por decisão do dono: as matérias
   * antigas saíram do ar e a unidade da home é a MATÉRIA publicada. Pauta de
   * edição sem matéria publicada não vira cartão, porque o cartão apontaria
   * para uma página que não existe mais. As matérias são lidas sempre, e não
   * só com os ramos em `enforce`.
   */
  const pautas = soComMateriaPublicada(todasDasEdicoes, slugsPublicados);
  void opcoes.incluirArtigosDosRamos;

  const artigos = await comRetentativa("matérias do portal", async () => {
    const { data, error } = await client
      .from("articles")
      .select("slug, title, excerpt, cover_image, category, published_at, source_urls")
      .eq("project_id", projectId)
      .eq("status", "published")
      .not("slug", "like", `${PREFIXO_DO_ARTIGO_DA_EDICAO}%`)
      .order("published_at", { ascending: false })
      .limit(opcoes.artigos ?? 30);
    if (error) throw new LeituraFalhou(`Falha ao carregar matérias: ${error.message}`);
    return (data ?? []) as ArtigoDoRamo[];
  });

  return juntarPautasEArtigos(pautas, artigos, opcoes.timezone, fontesDasPautas).slice(0, limite);
}

/** As pautas separadas nos blocos que a home desenha. */
/**
 * A manchete fixada pelo dono, em `projects.settings.portal.destaque` (o slug).
 *
 * Entrou em 05/10/2026 para pôr a matéria-modelo da auditoria de SEO no alto da
 * home sem mexer na data dela: trocar `published_at` faria uma pauta de 24/09
 * aparecer como de hoje. A matéria fixada vai para o começo da lista, e
 * `montarHome` a escolhe como manchete porque ela tem foto. Sem a chave, slug
 * que não existe ou matéria fora do ar, a home é a de sempre.
 */
export async function comDestaqueFixado(
  pautas: PautaDoPortal[],
  projeto: { settings?: Record<string, unknown> | null } | null,
  ler: (slug: string) => Promise<{
    title: string;
    excerpt?: string | null;
    category?: string | null;
    cover_image?: string | null;
    published_at?: string | null;
  } | null> = async (slug) => (await import("./articles-service")).getArticleBySlug(slug),
): Promise<PautaDoPortal[]> {
  const portal = (projeto?.settings as Record<string, unknown> | null | undefined)?.portal;
  const slug = portal && typeof portal === "object" ? (portal as Record<string, unknown>).destaque : null;
  if (typeof slug !== "string" || !slug.trim()) return pautas;
  // Fixada com prazo: `destaque_ate` (AAAA-MM-DD) vencido devolve a home de sempre,
  // para a manchete não envelhecer esquecida no alto da página.
  const ate = (portal as Record<string, unknown>).destaque_ate;
  if (typeof ate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ate) && ate < hojeEmSaoPaulo()) return pautas;
  const artigo = await ler(slug.trim()).catch(() => null);
  if (!artigo?.title) return pautas;
  const href = `/artigos/${slug.trim()}`;
  const fixada: PautaDoPortal = {
    id: `destaque:${slug.trim()}`,
    titulo: artigo.title,
    resumo: artigo.excerpt ?? "",
    rotulo: artigo.category ?? "",
    editoria: editoriaDaPauta(artigo.category ?? "", artigo.title),
    imagem: artigo.cover_image ?? null,
    fonte: "",
    data: artigo.published_at ?? "",
    href,
  };
  return [fixada, ...pautas.filter((p) => p.href !== href && p.titulo !== artigo.title)];
}

/** Quantas pautas o feed "Últimas notícias" mostra, somadas às chamadas que sobram da coluna. */
const TAMANHO_DO_FEED = 16;

/**
 * A home, com cada pauta em UM lugar só.
 *
 * Até 05/10/2026 os blocos eram fatias da mesma lista por posição: a grade de
 * três pegava "da sétima foto em diante" e o feed "da décima pauta em diante",
 * e as duas faixas se sobrepunham; "O mais novo de cada editoria" pegava a
 * primeira de cada editoria, que era quase sempre a mesma da coluna Destaques.
 * O dono abriu a home e viu a mesma matéria três vezes. Agora a montagem
 * reparte: cada bloco só recebe o que nenhum bloco acima dele recebeu.
 */
export function montarHome(todas: PautaDoPortal[]) {
  /*
   * A mesma notícia em duas edições seguidas chega como duas pautas, com ids
   * diferentes e o mesmo endereço ou o mesmo título (medido em 05/10/2026: a
   * pauta da juíza de Oklahoma saiu duas vezes no feed). Fica a primeira, que
   * é a mais nova.
   */
  const vistas = new Set<string>();
  const pautas = todas.filter((p) => {
    const chaves = [p.href, `t:${normalizarTitulo(p.titulo)}`];
    if (chaves.some((c) => vistas.has(c))) return false;
    chaves.forEach((c) => vistas.add(c));
    return true;
  });
  const comFoto = pautas.filter((p) => p.imagem);

  // A manchete precisa de foto: é ela que ocupa metade da primeira dobra.
  const destaque = comFoto[0] ?? pautas[0] ?? null;
  const usadas = new Set<string>(destaque ? [destaque.id] : []);
  const livres = () => pautas.filter((p) => !usadas.has(p.id));
  const reservar = (lista: PautaDoPortal[]) => {
    for (const p of lista) usadas.add(p.id);
    return lista;
  };

  /** Coluna da direita da primeira dobra, só título (as que sobram abrem o feed). */
  const chamadas = reservar(livres().slice(0, 6));
  /** Faixa de três, com foto. */
  const secundarias = reservar(livres().filter((p) => p.imagem).slice(0, 3));
  /** Lista cronológica. */
  const ultimas = reservar(livres().slice(0, TAMANHO_DO_FEED));
  /**
   * A mais nova de cada editoria que AINDA NÃO está na página. Editoria cujas
   * pautas já apareceram todas fica de fora: o bloco é um índice, e repetir
   * título que está logo acima não indexa nada.
   */
  const maisNovaPorEditoria = EDITORIAS.flatMap(({ id }) => {
    const pauta = livres().find((p) => p.editoria === id);
    return pauta ? [{ editoria: id, pauta }] : [];
  });

  return {
    destaque,
    chamadas,
    secundarias,
    ultimas,
    maisNovaPorEditoria,
    porEditoria: agruparPorEditoria(pautas.filter((p) => p.id !== destaque?.id)),
    secoes: secoesEmFoco(pautas),
  };
}

/** Um card por editoria em "Seções em foco": a foto mais recente dela, ou nenhuma. */
export type SecaoEmFoco = { editoria: EditoriaId; imagem: string | null; total: number };

/**
 * As seis editorias, sempre, na ordem do menu.
 *
 * A foto é a da pauta mais recente da editoria que TEM foto, e não a da pauta
 * mais recente: uma editoria cuja última pauta saiu sem foto continuaria com a
 * peça tipográfica por dias tendo foto na anterior. Sem pauta com foto, sem
 * foto, e o card mostra a peça tipográfica com a cor da editoria.
 */
export function secoesEmFoco(pautas: PautaDoPortal[]): SecaoEmFoco[] {
  /*
   * Uma foto não se repete na fileira enquanto houver outra. As edições de
   * setembro usaram a mesma foto de Wall Street como reserva em dezenas de
   * pautas, e três cards vizinhos com a mesma foto leem como defeito. A
   * editoria pega a foto mais recente dela que ainda não está num card à
   * esquerda; se todas estiverem, fica com a mais recente mesmo.
   */
  const usadas = new Set<string>();
  return EDITORIAS.map(({ id }) => {
    const daEditoria = pautas.filter((p) => p.editoria === id);
    const fotos = daEditoria.map((p) => p.imagem).filter((f): f is string => Boolean(f));
    const imagem = fotos.find((f) => !usadas.has(f)) ?? fotos[0] ?? null;
    if (imagem) usadas.add(imagem);
    return { editoria: id, imagem, total: daEditoria.length };
  });
}

/** As pautas de uma editoria, na ordem em que chegaram (mais recente primeiro). */
export function pautasDaEditoria(pautas: PautaDoPortal[], editoria: EditoriaId): PautaDoPortal[] {
  return pautas.filter((p) => p.editoria === editoria);
}

function agruparPorEditoria(pautas: PautaDoPortal[]) {
  const mapa = new Map<EditoriaId, PautaDoPortal[]>();
  for (const p of pautas) {
    const atual = mapa.get(p.editoria) ?? [];
    atual.push(p);
    mapa.set(p.editoria, atual);
  }

  /*
   * Seção com uma matéria só não vira seção: fica um título de editoria com um
   * card solto embaixo, e a página parece quebrada. Duas é o mínimo para o
   * bloco ter a forma que o desenho pede.
   */
  return [...mapa.entries()]
    .filter(([, itens]) => itens.length >= 2)
    .map(([editoria, itens]) => ({ editoria, itens: itens.slice(0, 4) }));
}

function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function normalizarTitulo(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
