/**
 * Keyword de campanha — etapa 7 do Sistema PROMPT.
 *
 * A keyword é ao mesmo tempo o que a pessoa comenta no post e a chave que
 * amarra csltia e OpenReply. O casamento do lado do OpenReply é textual, então
 * acento, espaço ou caixa mista viram comentários que não disparam Direct
 * nenhum — e o erro só aparece depois que o post já está no ar.
 *
 * Por isso o formato é estreito de propósito: A-Z e 0-9, 3 a 20 caracteres. O
 * mesmo formato está no CHECK da tabela `prompt_campaigns`, para que nenhum
 * caminho de escrita consiga gravar uma keyword que o funil não casa.
 */

export const KEYWORD_MIN_LENGTH = 3;
export const KEYWORD_MAX_LENGTH = 20;

/** Precisa ser idêntico ao CHECK de `prompt_campaigns.keyword`. */
export const KEYWORD_PATTERN = /^[A-Z0-9]{3,20}$/;

/**
 * Põe a keyword na forma canônica: sem acento, maiúscula, só letra e número.
 *
 * `GTA 26` → `GTA26` · `Ação!` → `ACAO` · `foto-87` → `FOTO87`
 *
 * Normaliza em vez de rejeitar porque quem digita no painel escreve do jeito
 * humano; a rejeição fica para o que sobra depois da limpeza.
 */
export function normalizeKeyword(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export type KeywordValidation =
  | { ok: true; keyword: string }
  | { ok: false; error: string };

/**
 * Normaliza e confere o formato. Devolve a keyword canônica — é ela que deve
 * ser gravada e enviada ao OpenReply, nunca o texto cru.
 */
export function validateKeyword(raw: unknown): KeywordValidation {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Keyword é obrigatória." };
  }

  const keyword = normalizeKeyword(raw);

  if (keyword.length < KEYWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Keyword precisa de pelo menos ${KEYWORD_MIN_LENGTH} letras ou números (sem acento, espaço ou símbolo).`,
    };
  }

  if (keyword.length > KEYWORD_MAX_LENGTH) {
    return {
      ok: false,
      error: `Keyword pode ter no máximo ${KEYWORD_MAX_LENGTH} caracteres — quanto mais curta, mais gente digita certo.`,
    };
  }

  if (!KEYWORD_PATTERN.test(keyword)) {
    return { ok: false, error: "Keyword aceita apenas letras e números." };
  }

  return { ok: true, keyword };
}
