/**
 * A identidade de uma foto, e a capa que não se repete no corpo (05/10/2026).
 *
 * O dono abriu uma matéria e viu a capa e, logo abaixo, a MESMA foto de novo.
 * A causa: a edição antiga publicada como artigo traz o HTML do e-mail, e o
 * e-mail põe a foto da primeira pauta dentro do corpo; a página desenha essa
 * mesma foto como capa por cima. Dois endereços diferentes para o mesmo
 * arquivo (um com `&amp;`, outro com `?w=1200`, ou a miniatura do Commons
 * contra o original) faziam uma comparação de texto achar que eram duas.
 *
 * Por isso a comparação é por IDENTIDADE, a mesma ideia do incidente "A mesma
 * foto em quatro posts": o arquivo, sem os parâmetros de entrega. Puro e sem
 * dependência de servidor, porque a página e os scripts usam igual.
 */

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" };

function desfazerEntidades(s: string): string {
  let atual = s;
  for (let i = 0; i < 4; i++) {
    const proximo = atual.replace(/&([a-z#0-9]+);/gi, (m, nome: string) => ENTIDADES[nome.toLowerCase()] ?? m);
    if (proximo === atual) break;
    atual = proximo;
  }
  return atual;
}

function decodificar(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * A identidade da foto: host e caminho do ARQUIVO, sem consulta, sem âncora e
 * sem o tamanho. A miniatura do Commons (`/thumb/a/ab/X.jpg/1280px-X.jpg`)
 * vira o original (`/a/ab/X.jpg`); `&amp;` e `%28` são desfeitos antes. Vazio
 * para endereço vazio.
 */
export function identidadeDaImagem(src: string | null | undefined): string {
  const bruto = desfazerEntidades((src ?? "").trim());
  if (!bruto) return "";
  // O otimizador do Next serve a foto em `/_next/image?url=<original>&w=...`:
  // a identidade é a do original.
  const otimizada = bruto.match(/\/_next\/image\?(?:[^#]*&)?url=([^&#]+)/);
  if (otimizada) return identidadeDaImagem(decodificar(otimizada[1]));
  let host = "";
  let caminho = bruto;
  try {
    const u = new URL(bruto);
    host = u.hostname.toLowerCase().replace(/^www\./, "");
    caminho = u.pathname;
  } catch {
    caminho = bruto.split(/[?#]/)[0];
  }
  caminho = decodificar(caminho);
  const miniatura = caminho.match(/^\/wikipedia\/commons\/thumb\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)\/[^/]+$/i);
  if (miniatura) caminho = `/wikipedia/commons/${miniatura[1]}/${miniatura[2]}/${miniatura[3]}`;
  return `${host}${caminho}`.toLowerCase();
}

/** Parece crédito de foto: curto, e com a cara de licença ou de banco de imagem. */
const CARA_DE_CREDITO = /\b(cc[ -]|cc0|via wikimedia|wikimedia commons|pexels|unsplash|flickr|foto:|dom[ií]nio p[uú]blico|public domain)/i;

function textoSimples(html: string): string {
  return desfazerEntidades(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * O corpo sem nenhuma foto igual à capa, e o crédito dela, se havia.
 *
 * Tira a `<img>` (e o `<a>` ou `<figure>` que só embrulham ela) cuja identidade
 * é a da capa. O parágrafo de crédito colado logo depois da foto também sai do
 * corpo e volta como `creditoDaCapa`: a licença CC BY exige o crédito visível
 * junto da obra (incidente "Atribuição de licença guardada em coluna"), e a
 * obra agora é a capa, então é embaixo dela que o crédito vai.
 *
 * Também reconhece o crédito que o desmonte das edições grava no começo do
 * corpo (`<p class="credito-da-foto">`), pelo mesmo motivo.
 */
export function semImagemDaCapaNoCorpo(
  html: string | null | undefined,
  capa: string | null | undefined,
): { html: string; creditoDaCapa: string | null; legendaDaCapa: string | null; removidas: number } {
  let corpo = html ?? "";
  let credito: string | null = null;
  let removidas = 0;

  /*
   * A descrição da foto da capa (06/10/2026): o que a foto mostra, para o
   * `alt` e para a legenda visível. Mora no corpo, como o crédito, porque a
   * tabela não tem coluna para ela e o dono não quer DDL agora. A página a
   * tira do corpo e a desenha embaixo da capa.
   */
  let legenda: string | null = null;
  const descrita = corpo.match(/<p[^>]*class="legenda-da-capa"[^>]*>([\s\S]*?)<\/p>/i);
  if (descrita) {
    legenda = textoSimples(descrita[1]) || null;
    corpo = corpo.replace(descrita[0], "");
  }

  const marcado = corpo.match(/<p[^>]*class="credito-da-foto"[^>]*>([\s\S]*?)<\/p>/i);
  if (marcado) {
    credito = textoSimples(marcado[1]) || null;
    corpo = corpo.replace(marcado[0], "");
  }

  const alvo = identidadeDaImagem(capa);
  if (!alvo) return { html: corpo, creditoDaCapa: credito, legendaDaCapa: legenda, removidas };

  const IMG = /(<figure\b[^>]*>\s*)?(<a\b[^>]*>\s*)?<img\b[^>]*\bsrc\s*=\s*"([^"]*)"[^>]*>(\s*<\/a>)?(\s*<figcaption\b[^>]*>[\s\S]*?<\/figcaption>)?(\s*<\/figure>)?/gi;
  corpo = corpo.replace(IMG, (inteiro: string, ...grupos: unknown[]) => {
    const src = String(grupos[2] ?? "");
    if (identidadeDaImagem(src) !== alvo) return inteiro;
    removidas += 1;
    const legenda = typeof grupos[4] === "string" ? textoSimples(grupos[4]) : "";
    if (legenda && !credito && CARA_DE_CREDITO.test(legenda)) credito = legenda;
    return "\u0000FOTO_DA_CAPA\u0000";
  });

  // O crédito colado logo depois da foto removida sai junto e vira o da capa.
  corpo = corpo.replace(/\u0000FOTO_DA_CAPA\u0000(\s*<p\b[^>]*>([\s\S]{0,400}?)<\/p>)?/g, (_m, paragrafo?: string, dentro?: string) => {
    if (!paragrafo || !dentro) return "";
    const texto = textoSimples(dentro);
    if (texto.length <= 220 && CARA_DE_CREDITO.test(texto)) {
      if (!credito) credito = texto;
      return "";
    }
    return paragrafo;
  });

  return { html: corpo, creditoDaCapa: credito, legendaDaCapa: legenda, removidas };
}

/** Quantas vezes cada foto aparece como capa, por identidade. */
export function usoDasCapas(capas: Array<string | null | undefined>): Map<string, number> {
  const uso = new Map<string, number>();
  for (const c of capas) {
    const id = identidadeDaImagem(c);
    if (id) uso.set(id, (uso.get(id) ?? 0) + 1);
  }
  return uso;
}

/*
 * O endereço da foto para fora da página (auditoria de SEO, 05/10/2026).
 *
 * Medido no ar: 15 das 62 matérias publicadas gravaram a capa do Pexels com
 * `&amp%3Bcs=tinysrgb&amp%3Bdpr=2...`, o `&amp;` do HTML do e-mail com o
 * ponto e vírgula já codificado. O banco de imagem ignora os parâmetros
 * tortos e devolve a foto, mas o endereço sai assim no `og:image`, no
 * `twitter:image` e no `image` do NewsArticle. E 41 capas são o ORIGINAL do
 * Commons, que chega a 9 MB (a foto de Wall Street que está em 32 matérias):
 * pesado demais para a prévia do WhatsApp e do Facebook.
 */

/** O endereço sem `&amp;` e sem `&amp%3B`, em quantas camadas houver. */
export function enderecoLimpoDaImagem(src: string | null | undefined): string {
  let atual = (src ?? "").trim();
  for (let i = 0; i < 4; i++) {
    const proximo = atual.replace(/&amp(?:;|%3B)/gi, "&");
    if (proximo === atual) break;
    atual = proximo;
  }
  return atual;
}

/**
 * A foto do Wikimedia Commons na largura pedida, e não o original.
 *
 * O caminho da miniatura é o do próprio Commons:
 * `/commons/thumb/a/ab/Arquivo.jpg/1280px-Arquivo.jpg`. Use larguras da escada
 * padrão do Commons (960, 1280, 1920): medido em 05/10/2026, 1200 responde 400
 * e 1280 responde 200, inclusive para original menor que isso. SVG e TIFF
 * ficam como estão, porque a miniatura deles muda de extensão.
 */
export function miniaturaDoCommons(src: string, largura: number): string {
  const m = src.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+\.(?:jpe?g|png|webp))(?:[?#].*)?$/i);
  if (!m) return src;
  const [, a, ab, arquivo] = m;
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${ab}/${arquivo}/${largura}px-${arquivo}`;
}

/** A capa como vai para `og:image`, `twitter:image` e o `image` do JSON-LD: limpa, e miniatura de 1280 no Commons. */
export function imagemParaCompartilhar(src: string | null | undefined): string {
  const limpo = enderecoLimpoDaImagem(src);
  return limpo ? miniaturaDoCommons(limpo, 1280) : "";
}

/**
 * O crédito mínimo de uma foto do Commons sem crédito gravado.
 *
 * Medido em 05/10/2026: 41 das 62 matérias publicadas têm capa do Commons e
 * NENHUMA mostra crédito, e a foto mais usada (Wall Street, em 32 matérias) é
 * CC BY-SA 4.0, que exige atribuição. Sem o autor e a licença à mão, o mínimo
 * honesto é o link para a página do arquivo, onde os dois estão. Quem grava
 * crédito de verdade (`credito-da-foto` no corpo) continua vencendo.
 */
export function creditoDoCommons(src: string | null | undefined): { texto: string; href: string } | null {
  const limpo = enderecoLimpoDaImagem(src);
  const m =
    limpo.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)\//i) ??
    limpo.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/i);
  if (!m) return null;
  return { texto: "Foto: Wikimedia Commons (autor e licença na página do arquivo)", href: `https://commons.wikimedia.org/wiki/File:${m[1]}` };
}
