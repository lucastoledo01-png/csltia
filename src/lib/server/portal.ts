import { getSupabaseAdminClient } from "./supabase-admin";
import { editoriaDaPauta, type EditoriaId } from "@/lib/editorias";
import { comRetentativa, LeituraFalhou } from "./leitura";

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

type EdicaoBruta = {
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

export async function pautasRecentes(
  projectId: string,
  limite = 40,
  /*
   * Integração de 05/10/2026: só com os ramos em `enforce` a home lê também
   * `articles`. Ausente, a home é a de antes, uma consulta só.
   */
  opcoes: { incluirArtigosDosRamos?: boolean; timezone?: string } = {},
): Promise<PautaDoPortal[]> {
  const client = getSupabaseAdminClient();

  const edicoes = await comRetentativa("edições do portal", async () => {
    const { data, error } = await client
      .from("news_editions")
      .select("edition_date, slug, stories, content_html")
      .eq("project_id", projectId)
      .eq("status", "published")
      .order("edition_date", { ascending: false })
      .limit(20);

    if (error) throw new LeituraFalhou(`Falha ao carregar edições: ${error.message}`);
    return (data ?? []) as EdicaoBruta[];
  });

  const pautas: PautaDoPortal[] = [];
  const fontesDasPautas = new Map<string, string>();

  for (const edicao of edicoes) {
    const fotos = fotosDoHtml(edicao.content_html);

    (edicao.stories ?? []).forEach((s, i) => {
      const titulo = texto(s.title);
      if (!titulo) return;

      const rotulo = texto(s.category) || "Notícias";

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
        href: `/artigos/${edicao.slug}`,
      });
    });
  }

  if (!opcoes.incluirArtigosDosRamos) return pautas.slice(0, limite);

  const artigos = await comRetentativa("matérias do portal", async () => {
    const { data, error } = await client
      .from("articles")
      .select("slug, title, excerpt, cover_image, category, published_at, source_urls")
      .eq("project_id", projectId)
      .eq("status", "published")
      .not("slug", "like", `${PREFIXO_DO_ARTIGO_DA_EDICAO}%`)
      .order("published_at", { ascending: false })
      .limit(30);
    if (error) throw new LeituraFalhou(`Falha ao carregar matérias: ${error.message}`);
    return (data ?? []) as ArtigoDoRamo[];
  });

  return juntarPautasEArtigos(pautas, artigos, opcoes.timezone, fontesDasPautas).slice(0, limite);
}

/** As pautas separadas nos blocos que a home desenha. */
export function montarHome(pautas: PautaDoPortal[]) {
  const comFoto = pautas.filter((p) => p.imagem);

  // A manchete precisa de foto: é ela que ocupa metade da primeira dobra.
  const destaque = comFoto[0] ?? pautas[0] ?? null;
  const restantes = pautas.filter((p) => p.id !== destaque?.id);

  return {
    destaque,
    /** Coluna da direita da primeira dobra, só título. */
    chamadas: restantes.slice(0, 6),
    /** Faixa de três, com foto. */
    secundarias: restantes.filter((p) => p.imagem).slice(6, 9),
    /** Lista cronológica. */
    ultimas: restantes.slice(9, 25),
    porEditoria: agruparPorEditoria(restantes),
  };
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
