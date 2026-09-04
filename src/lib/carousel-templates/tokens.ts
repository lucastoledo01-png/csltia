import { z } from "zod";
import { FONTS, FONT_KEYS, type FontKey } from "./fonts";

/**
 * Tokens de design do carrossel — a única coisa que o painel do admin edita
 * livremente (por controle de cor/número, nunca HTML). Tudo que o
 * `base-css.ts` e as variantes desenham sai daqui via `var(--s-*)`.
 */

const HexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "cor hex inválida (use #rrggbb)");

const EyebrowSchema = z.object({
  label: z.string().min(1).max(40),
  bg: HexColor,
  fg: HexColor,
});

const FontKeySchema = z.enum(FONT_KEYS as [FontKey, ...FontKey[]]);

export const TokensSchema = z.object({
  /**
   * Proporção da arte. Os designs aprovados são 1080×1440 (3:4); o viewport do
   * Playwright é derivado daqui, então mudar a altura muda a renderização real,
   * não só o preview.
   */
  canvas: z.object({
    width: z.number().min(320).max(2160),
    height: z.number().min(320).max(2880),
  }),
  /**
   * Qual moldura o slide usa. Os dois designs aprovados têm chrome
   * estruturalmente diferente — impresso versus interface — e não dá para
   * converter um no outro só trocando cor. Ver `chrome.ts`.
   */
  chrome: z.enum(["editorial", "social"]),
  /** Só chaves do conjunto fechado de `fonts.ts` — ver o porquê lá. */
  fonts: z.object({
    display: FontKeySchema,
    body: FontKeySchema,
    accent: FontKeySchema,
    mono: FontKeySchema,
  }),
  colors: z.object({
    bg: HexColor, // fundo pergaminho
    ivory: HexColor, // cartão claro
    ink: HexColor, // texto principal
    stone: HexColor, // texto secundário / meta
    accent: HexColor, // laranja desbuguei
    dark: HexColor, // cartão escuro / CTA / bloco de código
    border: HexColor,
  }),
  type: z.object({
    displayLg: z.number().min(24).max(120), // título de capa
    displayMd: z.number().min(20).max(96), // título de conteúdo
    body: z.number().min(14).max(48),
    mono: z.number().min(10).max(32),
  }),
  radius: z.number().min(0).max(64), // raio de canto dos cartões
  cardPadding: z.number().min(8).max(96),
  eyebrows: z.object({
    noticia: EyebrowSchema,
    tutorial: EyebrowSchema,
    prompt: EyebrowSchema,
  }),
  cta: z.object({
    noticia: z.object({ text: z.string().min(3).max(80) }),
    tutorial: z.object({ text: z.string().min(3).max(80) }),
    prompt: z.object({ text: z.string().min(3).max(80) }),
  }),
});

export type CarouselTokens = z.infer<typeof TokensSchema>;

export const DEFAULT_TOKENS: CarouselTokens = {
  canvas: { width: 1080, height: 1440 },
  chrome: "editorial",
  fonts: { display: "epilogue", body: "epilogue", accent: "playfair", mono: "jetbrains" },
  colors: {
    bg: "#f7f5f0",
    ivory: "#ffffff",
    ink: "#18181b",
    stone: "#71717a",
    accent: "#ff4a1c",
    dark: "#1c1a17",
    border: "#e4e4e7",
  },
  type: {
    displayLg: 62,
    displayMd: 48,
    body: 26,
    mono: 20,
  },
  radius: 28,
  cardPadding: 40,
  eyebrows: {
    noticia: { label: "BUGNEWS", bg: "#dbeafe", fg: "#1e3a8a" },
    tutorial: { label: "PASSO A PASSO", bg: "#ccfbf1", fg: "#0f766e" },
    prompt: { label: "PROMPT", bg: "#ff4a1c", fg: "#ffffff" },
  },
  cta: {
    noticia: { text: "Comente NEWS para receber a edição no Direct" },
    tutorial: { text: "Comente a palavra do post para receber o tutorial escrito" },
    prompt: { text: "Comente a palavra do post e eu te mando o prompt exato" },
  },
};

/**
 * Faz merge raso-recursivo das camadas sobre o default e valida.
 *
 * As camadas vêm na ordem em que ganham precedência: o tema global do painel
 * primeiro, o override do formato depois. É o que permite `tutorial` ser claro
 * e `noticia` ser escuro sem duplicar o tema inteiro — um `--s-bg` só não pode
 * ser `#F5F1ED` e `#080808` ao mesmo tempo.
 *
 * Camada inválida não derruba a montagem: o `safeParse` no fim devolve o
 * default, porque carrossel não deixa de ser gerado por causa de config.
 */
export function mergeTokens(...overrides: unknown[]): CarouselTokens {
  const base = DEFAULT_TOKENS;
  const o = overrides.reduce<Record<string, unknown>>(
    (acc, camada) => (camada && typeof camada === "object" ? deepMerge(acc, camada as Record<string, unknown>) : acc),
    {},
  );

  const merged = {
    canvas: { ...base.canvas, ...asObj(o.canvas) },
    chrome: typeof o.chrome === "string" ? o.chrome : base.chrome,
    fonts: { ...base.fonts, ...asObj(o.fonts) },
    colors: { ...base.colors, ...asObj(o.colors) },
    type: { ...base.type, ...asObj(o.type) },
    radius: typeof o.radius === "number" ? o.radius : base.radius,
    cardPadding: typeof o.cardPadding === "number" ? o.cardPadding : base.cardPadding,
    eyebrows: {
      noticia: { ...base.eyebrows.noticia, ...asObj(asObj(o.eyebrows).noticia) },
      tutorial: { ...base.eyebrows.tutorial, ...asObj(asObj(o.eyebrows).tutorial) },
      prompt: { ...base.eyebrows.prompt, ...asObj(asObj(o.eyebrows).prompt) },
    },
    cta: {
      noticia: { ...base.cta.noticia, ...asObj(asObj(o.cta).noticia) },
      tutorial: { ...base.cta.tutorial, ...asObj(asObj(o.cta).tutorial) },
      prompt: { ...base.cta.prompt, ...asObj(asObj(o.cta).prompt) },
    },
  };

  const parsed = TokensSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_TOKENS;
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Merge recursivo de objetos simples; valor não-objeto sobrescreve. */
function deepMerge(
  base: Record<string, unknown>,
  camada: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [chave, valor] of Object.entries(camada)) {
    const atual = out[chave];
    if (valor && typeof valor === "object" && !Array.isArray(valor) && atual && typeof atual === "object") {
      out[chave] = deepMerge(atual as Record<string, unknown>, valor as Record<string, unknown>);
    } else if (valor !== undefined) {
      out[chave] = valor;
    }
  }
  return out;
}

/** `:root { --s-bg: …; … }` — injetado no `<style>` de cada slide. */
export function tokensToCss(tokens: CarouselTokens): string {
  const c = tokens.colors;
  const t = tokens.type;
  const f = tokens.fonts;
  return `:root{
--s-w:${tokens.canvas.width}px;
--s-h:${tokens.canvas.height}px;
--s-font-display:${FONTS[f.display].stack};
--s-font-body:${FONTS[f.body].stack};
--s-font-accent:${FONTS[f.accent].stack};
--s-font-mono:${FONTS[f.mono].stack};
--s-bg:${c.bg};
--s-ivory:${c.ivory};
--s-ink:${c.ink};
--s-stone:${c.stone};
--s-accent:${c.accent};
--s-dark:${c.dark};
--s-border:${c.border};
--s-display-lg:${t.displayLg}px;
--s-display-md:${t.displayMd}px;
--s-body:${t.body}px;
--s-mono:${t.mono}px;
--s-radius:${tokens.radius}px;
--s-card-pad:${tokens.cardPadding}px;
--s-eb-noticia-bg:${tokens.eyebrows.noticia.bg};
--s-eb-noticia-fg:${tokens.eyebrows.noticia.fg};
--s-eb-tutorial-bg:${tokens.eyebrows.tutorial.bg};
--s-eb-tutorial-fg:${tokens.eyebrows.tutorial.fg};
--s-eb-prompt-bg:${tokens.eyebrows.prompt.bg};
--s-eb-prompt-fg:${tokens.eyebrows.prompt.fg};
}`;
}
