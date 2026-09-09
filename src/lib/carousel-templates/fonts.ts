/**
 * Conjunto fechado de fontes do carrossel.
 *
 * O nome da família e a especificação que a carrega ficam **no mesmo lugar**,
 * de propósito. Fonte declarada como texto livre é a receita de um bug caro:
 * o CSS pede `"Bespoke Serif", serif`, o `<link>` não requisita aquela família,
 * o navegador cai no serif do sistema e o slide sai com uma fonte que ninguém
 * escolheu — sem erro, sem log, sem nada.
 *
 * Foi exatamente o que aconteceu no design de origem: o `<link>` do draft pedia
 * `Bespoke+Serif` ao Google Fonts, que não a serve. O preview renderizava com o
 * Times do sistema. Num container headless do Playwright, onde muitas vezes não
 * há serifa instalada, o resultado seria pior e igualmente silencioso.
 *
 * Escolher por chave, e derivar o `<link>` das chaves escolhidas, torna esse
 * descasamento impossível de escrever.
 */

export type FontKey = "epilogue" | "playfair" | "jakarta" | "jetbrains";

type FontSpec = {
  /** Valor de `font-family`, já com o fallback da mesma classe. */
  stack: string;
  /** Trecho `family=…` da URL do Google Fonts, com os pesos que usamos. */
  googleFamily: string;
};

export const FONTS: Record<FontKey, FontSpec> = {
  epilogue: {
    stack: '"Epilogue",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    googleFamily: "Epilogue:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700",
  },
  playfair: {
    stack: '"Playfair Display",Georgia,"Times New Roman",serif',
    googleFamily: "Playfair+Display:ital,wght@0,600;0,700;0,800;0,900;1,400;1,600;1,700",
  },
  jakarta: {
    stack: '"Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,sans-serif',
    googleFamily: "Plus+Jakarta+Sans:wght@400;500;600;700;800",
  },
  jetbrains: {
    stack: '"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace',
    googleFamily: "JetBrains+Mono:wght@400;500;700",
  },
};

export const FONT_KEYS = Object.keys(FONTS) as FontKey[];

/** Rótulos para o seletor do painel. */
export const FONT_LABELS: Record<FontKey, string> = {
  epilogue: "Epilogue — display geométrica",
  playfair: "Playfair Display — serifa de alto contraste",
  jakarta: "Plus Jakarta Sans — sans neutra",
  jetbrains: "JetBrains Mono — monoespaçada",
};

export function isFontKey(value: unknown): value is FontKey {
  return typeof value === "string" && value in FONTS;
}

/**
 * `<link>` que carrega exatamente as fontes pedidas — sem repetição e em ordem
 * estável, para o HTML de um mesmo slide não variar entre renderizações.
 */
export function fontLinkTag(keys: FontKey[]): string {
  const usadas = FONT_KEYS.filter((k) => keys.includes(k));
  const families = usadas.map((k) => `family=${FONTS[k].googleFamily}`).join("&");

  return (
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families}&display=swap">`
  );
}

/**
 * O nome da família como o `document.fonts.check` pergunta por ela.
 *
 * `stack` traz a família mais os fallbacks, e `check` quer uma família só.
 * Derivar daqui em vez de repetir o literal mantém a promessa do cabeçalho
 * deste arquivo: nome e especificação no mesmo lugar.
 */
export function primeiraFamilia(chave: FontKey): string {
  const primeira = FONTS[chave].stack.split(",")[0].trim();
  return primeira.replace(/^"|"$/g, "");
}
