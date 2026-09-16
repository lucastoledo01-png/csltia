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

export async function pautasRecentes(projectId: string, limite = 40): Promise<PautaDoPortal[]> {
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

  for (const edicao of edicoes) {
    const fotos = fotosDoHtml(edicao.content_html);

    (edicao.stories ?? []).forEach((s, i) => {
      const titulo = texto(s.title);
      if (!titulo) return;

      const rotulo = texto(s.category) || "Notícias";

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

  return pautas.slice(0, limite);
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
