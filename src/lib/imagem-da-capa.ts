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
): {
  html: string;
  creditoDaCapa: string | null;
  /** O link do crédito gravado (a página do arquivo), quando o parágrafo trouxe um. */
  creditoDaCapaHref: string | null;
  /** As dimensões do original, quando o crédito gravado as trouxe (06/10/2026). */
  dimensoesDaCapa: { largura: number; altura: number } | null;
  legendaDaCapa: string | null;
  removidas: number;
} {
  let corpo = html ?? "";
  let credito: string | null = null;
  let creditoHref: string | null = null;
  let dimensoes: { largura: number; altura: number } | null = null;
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

  const marcado = corpo.match(/<p([^>]*class="credito-da-foto"[^>]*)>([\s\S]*?)<\/p>/i);
  if (marcado) {
    credito = textoSimples(marcado[2]) || null;
    /*
     * Desde 06/10/2026 o crédito gravado leva o link da página do arquivo e as
     * dimensões do original (`credito-da-capa.ts`). O link volta desfeito de
     * entidade, porque a página o escapa de novo ao desenhar.
     */
    const href = marcado[2].match(/<a\b[^>]*\bhref\s*=\s*"([^"]+)"/i)?.[1];
    if (href) creditoHref = desfazerEntidades(href);
    const largura = Number(marcado[1].match(/data-largura="(\d+)"/)?.[1] ?? 0);
    const altura = Number(marcado[1].match(/data-altura="(\d+)"/)?.[1] ?? 0);
    if (largura > 0 && altura > 0) dimensoes = { largura, altura };
    corpo = corpo.replace(marcado[0], "");
  }

  const alvo = identidadeDaImagem(capa);
  if (!alvo) return { html: corpo, creditoDaCapa: credito, creditoDaCapaHref: creditoHref, dimensoesDaCapa: dimensoes, legendaDaCapa: legenda, removidas };

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

  return { html: corpo, creditoDaCapa: credito, creditoDaCapaHref: creditoHref, dimensoesDaCapa: dimensoes, legendaDaCapa: legenda, removidas };
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

/**
 * Os hosts que o otimizador do `next/image` aceita, os mesmos de
 * `images.remotePatterns` no `next.config.ts` (há teste que compara as duas
 * listas). Foto de host fora daqui não passa pelo otimizador: o `next/image`
 * lança e derruba a página, e quem desenha cai no `<img>` simples.
 */
export const HOSTS_OTIMIZAVEIS = [
  "images.pexels.com",
  "images.unsplash.com",
  "azqpdesusdzqndvsqmko.supabase.co",
  "casaloti.ia.br",
  "euajournal.com",
  "upload.wikimedia.org",
  "live.staticflickr.com",
  // Os bancos de imagem oficiais (06/10/2026); o Senado e o Flickr usam o host acima.
  "www.camara.leg.br",
  "www.whitehouse.gov",
  "www.federalreserve.gov",
  "images-assets.nasa.gov",
] as const;

export function hostOtimizavel(src: string | null | undefined): boolean {
  try {
    const u = new URL(src ?? "");
    return u.protocol === "https:" && (HOSTS_OTIMIZAVEIS as readonly string[]).includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * A foto na largura pedida, quando o banco de imagem sabe redimensionar
 * (06/10/2026).
 *
 * A capa do Pexels é gravada como `w=600&h=360&fit=crop`, pequena demais para
 * a manchete (auditoria de SEO, item 24: no celular de 412px a 1,75x a foto é
 * esticada; no computador, mais ainda). Aqui ela vira a mesma foto na largura
 * pedida, sem altura nem corte, que a caixa de proporção fixa já recorta com
 * `object-cover`. O Commons vai para a miniatura (o original chega a 9 MB), e
 * o Unsplash ganha a largura. Os demais hosts ficam como estão.
 *
 * O resultado é a FONTE para o otimizador, que entrega WebP no tamanho da
 * tela: é ele, e não o banco de imagem, que decide os bytes que o leitor baixa.
 */
export function fotoNaLargura(src: string | null | undefined, largura: number): string {
  const limpo = enderecoLimpoDaImagem(src);
  if (!limpo) return "";
  let u: URL;
  try {
    u = new URL(limpo);
  } catch {
    return limpo;
  }
  if (u.hostname === "upload.wikimedia.org") return miniaturaDoCommons(limpo, largura);
  if (u.hostname === "images.pexels.com" || u.hostname === "images.unsplash.com") {
    for (const p of ["h", "fit", "dpr", "crop"]) u.searchParams.delete(p);
    u.searchParams.set("w", String(largura));
    if (u.hostname === "images.pexels.com") {
      u.searchParams.set("auto", "compress");
      u.searchParams.set("cs", "tinysrgb");
    }
    return u.toString();
  }
  return limpo;
}

export type ImagemDoJsonLd = { "@type": "ImageObject"; url: string; width: number; height: number };

/** Os três cortes que o Google pede para a foto do NewsArticle (16:9, 4:3 e 1:1), a 1200 de largura. */
const CORTES_DO_JSON_LD: Array<[number, number]> = [
  [1200, 675],
  [1200, 900],
  [1200, 1200],
];

/**
 * A capa como vai para o `image` do NewsArticle: `ImageObject` com largura e
 * altura (06/10/2026). Sem as duas, o Google não sabe se a foto serve para o
 * carrossel de notícias, que pede ao menos 1200 de largura.
 *
 * Só sai dimensão que é VERDADE. O Pexels e o Unsplash recortam no tamanho
 * pedido (`fit=crop`), então os três cortes têm a medida que dizem ter. O
 * Commons vai na miniatura de 1280, com a altura pela proporção do original,
 * quando o crédito gravado ou a página do arquivo deram a medida. Outro host
 * vai com a medida do original, se ela é conhecida. Sem medida nenhuma, o
 * endereço puro, como era antes: dimensão inventada é pior que nenhuma.
 */
export function imagensDaCapaParaJsonLd(
  src: string | null | undefined,
  dimensoes?: { largura: number; altura: number } | null,
): Array<ImagemDoJsonLd | string> {
  const limpo = enderecoLimpoDaImagem(src);
  if (!limpo) return [];
  let u: URL;
  try {
    u = new URL(limpo);
  } catch {
    return [];
  }
  if (u.hostname === "images.pexels.com" || u.hostname === "images.unsplash.com") {
    return CORTES_DO_JSON_LD.map(([w, h]) => {
      const c = new URL(limpo);
      for (const p of ["w", "h", "fit", "dpr", "crop"]) c.searchParams.delete(p);
      c.searchParams.set("w", String(w));
      c.searchParams.set("h", String(h));
      c.searchParams.set("fit", "crop");
      if (c.hostname === "images.pexels.com") {
        c.searchParams.set("auto", "compress");
        c.searchParams.set("cs", "tinysrgb");
      }
      return { "@type": "ImageObject" as const, url: c.toString(), width: w, height: h };
    });
  }
  const ok = dimensoes && dimensoes.largura > 0 && dimensoes.altura > 0 ? dimensoes : null;
  if (u.hostname === "upload.wikimedia.org") {
    const miniatura = miniaturaDoCommons(limpo, 1280);
    if (!ok) return [miniatura];
    // Original menor que a miniatura, ou formato sem miniatura: vai o original, com a medida dele.
    if (ok.largura <= 1280 || miniatura === limpo) {
      return [{ "@type": "ImageObject", url: limpo.replace(/[?#].*$/, ""), width: ok.largura, height: ok.altura }];
    }
    return [{ "@type": "ImageObject", url: miniatura, width: 1280, height: Math.round((ok.altura * 1280) / ok.largura) }];
  }
  return ok ? [{ "@type": "ImageObject", url: limpo, width: ok.largura, height: ok.altura }] : [limpo];
}

/**
 * Onde a caixa de proporção fixa corta a foto (06/10/2026, "não cortar a cara").
 *
 * O dono abriu a matéria do Caiado e a capa mostrava da boca para baixo: o
 * retrato oficial é em pé (1273x1516) e a caixa da matéria é 16:9, então o
 * `object-cover` centralizado jogava fora o alto e o pé por igual, e o alto era
 * a cabeça. Em foto de gente o rosto está no terço de cima; no retrato oficial,
 * colado no topo.
 *
 * A regra: o excesso sai do PÉ, nunca do alto. Foto deitada perto de 16:9
 * quase não perde nada, então a regra só muda alguma coisa onde o corte é
 * grande, que é exatamente a foto em pé de uma pessoa.
 *
 * A exceção é o cartão do logotipo (`visual/cartao-da-marca.ts`): ele foi
 * desenhado para o corte CENTRAL, com o logotipo entre 31% e 53% da altura.
 *
 * Toda foto de capa do portal e da newsletter passa por aqui; há teste que
 * reprova `object-cover` de capa sem esta classe.
 */
export type RecorteDaFoto = { classe: "object-top" | "object-center"; css: string };

export function recorteDaFoto(src: string | null | undefined): RecorteDaFoto {
  if (/\/api\/visual\/cartao-da-marca/.test(src ?? "")) return { classe: "object-center", css: "object-position:center center;" };
  return { classe: "object-top", css: "object-position:center top;" };
}
