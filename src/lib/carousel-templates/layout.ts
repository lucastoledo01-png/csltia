import { z } from "zod";
import type { InstagramSlide } from "./types";

/**
 * Layout como dado: blocos posicionados que a IA preenche, em vez de variante
 * escolhida entre as prontas.
 *
 * A inversão é essa. Até aqui a IA decidia a forma (escolhia uma variante) e o
 * conteúdo. Agora a forma é desenhada uma vez, à mão, e a IA só entrega texto e
 * imagem para dentro dos slots. É o que torna o resultado previsível: se o post
 * de hoje ficou torto, o de amanhã ficaria torto de outro jeito — com layout
 * fixo, o que se corrige uma vez fica corrigido.
 *
 * ## Por que as posições são percentuais
 *
 * Bloco em pixels amarra o layout ao canvas em que foi desenhado. Em
 * porcentagem, o mesmo desenho serve a 1080×1440 e a 1080×1350 sem reabrir o
 * editor. O canvas de referência fica gravado só para avisar que mudou.
 *
 * ## O problema que decide o desenho inteiro: texto de tamanho variável
 *
 * Um bloco tem largura e altura fixas; o texto que a IA escreve, não. Uma
 * manchete duas vezes mais longa que a de exemplo transborda a caixa e o post
 * sai quebrado — e sai **publicado**, porque ninguém revisa 100% dos posts.
 *
 * Duas defesas, e as duas são necessárias:
 *
 * 1. `maxChars` — orçamento de caracteres derivado da caixa, que vai no prompt
 *    da IA. Evita o problema na origem, mas é pedido, não garantia.
 * 2. `ajuste` — o que fazer quando o texto não coube mesmo assim. `encolher`
 *    reduz a fonte até caber (com piso); `cortar` trunca com reticências.
 *    Nenhum dos dois deixa transbordar.
 *
 * A defesa 2 roda no navegador, dentro do próprio Chromium que tira o
 * screenshot, porque só ali se sabe a largura real do texto renderizado —
 * fonte, kerning e quebra de linha não são calculáveis no servidor.
 */

/** Slots que um bloco de texto pode ocupar. Cada um vem do slide. */
export const SLOTS_DE_TEXTO = [
  "titulo",
  "chapeu",
  "corpo",
  "destaque",
  "cta",
  "numero",
  "total",
] as const;

export type SlotDeTexto = (typeof SLOTS_DE_TEXTO)[number];

export const ROTULO_DO_SLOT: Record<SlotDeTexto, string> = {
  titulo: "Título",
  chapeu: "Chapéu (eyebrow)",
  corpo: "Corpo",
  destaque: "Destaque",
  cta: "CTA",
  numero: "Número do slide",
  total: "Total de slides",
};

/** De onde sai a imagem de um bloco de imagem. */
export const FONTES_DE_IMAGEM = ["fundo", "fixa"] as const;
export type FonteDeImagem = (typeof FONTES_DE_IMAGEM)[number];

const Percentual = z.number().min(-50).max(150);

export const BlocoSchema = z.object({
  id: z.string().min(1),
  tipo: z.enum(["texto", "imagem", "forma"]),

  // Posição e tamanho em % do canvas.
  x: Percentual,
  y: Percentual,
  w: z.number().min(1).max(200),
  h: z.number().min(1).max(200),
  z: z.number().int().min(0).max(999).default(1),

  // --- texto ---
  slot: z.enum(SLOTS_DE_TEXTO).optional(),
  /** Texto fixo, para rótulos que não vêm da IA. */
  textoFixo: z.string().max(400).default(""),
  fonte: z.enum(["display", "body", "accent", "mono"]).default("display"),
  /** Tamanho em px no canvas de referência. */
  tamanho: z.number().min(8).max(400).default(64),
  /** Piso do auto-encolhimento, em px. Abaixo disso o texto fica ilegível. */
  tamanhoMinimo: z.number().min(8).max(400).default(24),
  peso: z.number().int().min(100).max(900).default(800),
  entrelinha: z.number().min(0.7).max(3).default(1.05),
  espacamento: z.number().min(-0.1).max(0.5).default(-0.03),
  cor: z.string().default("#111111"),
  alinhamento: z.enum(["left", "center", "right"]).default("left"),
  alinhamentoVertical: z.enum(["start", "center", "end"]).default("start"),
  caixaAlta: z.boolean().default(false),
  ajuste: z.enum(["encolher", "cortar"]).default("encolher"),
  /**
   * Pinta, dentro deste texto, o trecho que a IA marcou como destaque.
   *
   * É o "235 mil" em amarelo no meio da manchete branca. Sem isto, destacar
   * exigiria um bloco separado posicionado sobre a palavra — impossível, porque
   * a palavra muda de lugar a cada notícia.
   */
  realcarDestaque: z.boolean().default(false),
  /** Cor do trecho realçado. Vazio usa o accent do tema. */
  corDoRealce: z.string().default(""),

  // --- imagem ---
  imagem: z.enum(FONTES_DE_IMAGEM).optional(),
  imagemUrl: z.string().max(2000).default(""),
  encaixe: z.enum(["cover", "contain"]).default("cover"),

  // --- comum ---
  fundo: z.string().default(""),
  raio: z.number().min(0).max(200).default(0),
  opacidade: z.number().min(0).max(1).default(1),
  padding: z.number().min(0).max(200).default(0),
  /** Escurece a imagem para o texto por cima ficar legível. */
  veu: z.number().min(0).max(1).default(0),
  /**
   * Como o véu cobre a imagem.
   *
   * `solido` escurece tudo por igual e lava a foto. `base` é um degradê que
   * nasce embaixo e some no meio — escurece só onde o texto está e deixa o
   * rosto da foto intacto, que é o que os posts de notícia fazem.
   */
  veuTipo: z.enum(["solido", "base"]).default("solido"),
  rotacao: z.number().min(-180).max(180).default(0),
});

export type Bloco = z.infer<typeof BlocoSchema>;

export const LayoutSchema = z.object({
  canvas: z.object({ width: z.number().min(100), height: z.number().min(100) }),
  blocks: z.array(BlocoSchema).max(40),
});

export type Layout = z.infer<typeof LayoutSchema>;

/** Bloco novo com padrões utilizáveis — o editor não deve pedir 20 campos. */
export function blocoNovo(tipo: Bloco["tipo"], z_ = 1): Bloco {
  return BlocoSchema.parse({
    id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    tipo,
    x: 8,
    y: tipo === "imagem" ? 0 : 55,
    w: tipo === "imagem" ? 100 : 84,
    h: tipo === "imagem" ? 100 : 20,
    z: z_,
    ...(tipo === "texto" ? { slot: "titulo" as const } : {}),
    ...(tipo === "imagem" ? { imagem: "fundo" as const, x: 0 } : {}),
    ...(tipo === "forma" ? { fundo: "#111111", h: 6 } : {}),
  });
}

/**
 * Orçamento de caracteres de um bloco de texto.
 *
 * Estimativa deliberadamente grosseira: a largura média de um glifo fica perto
 * de 0,5 do corpo da fonte em fontes de texto, e a conta serve para dizer à IA
 * "escreva até N caracteres", não para diagramar. Errar para menos é seguro —
 * texto curto demais não quebra layout nenhum.
 */
export function orcamentoDeCaracteres(bloco: Bloco, canvas: Layout["canvas"]): number {
  if (bloco.tipo !== "texto") return 0;

  const larguraPx = (bloco.w / 100) * canvas.width - bloco.padding * 2;
  const alturaPx = (bloco.h / 100) * canvas.height - bloco.padding * 2;
  if (larguraPx <= 0 || alturaPx <= 0) return 0;

  const larguraDoGlifo = bloco.tamanho * 0.5;
  const alturaDaLinha = bloco.tamanho * bloco.entrelinha;

  const porLinha = Math.max(1, Math.floor(larguraPx / larguraDoGlifo));
  const linhas = Math.max(1, Math.floor(alturaPx / alturaDaLinha));

  return porLinha * linhas;
}

/** Conteúdo de um slide, já resolvido para os slots. */
export function conteudoDosSlots(
  slide: InstagramSlide,
  ctx: { eyebrowLabel: string; ctaText: string; slideIndex: number; total: number },
): Record<SlotDeTexto, string> {
  return {
    titulo: slide.title ?? "",
    chapeu: (slide.eyebrow || ctx.eyebrowLabel) ?? "",
    corpo: slide.body ?? "",
    destaque: slide.highlight_text ?? "",
    cta: (slide.cta_text || ctx.ctaText) ?? "",
    numero: String(ctx.slideIndex),
    total: String(ctx.total),
  };
}
