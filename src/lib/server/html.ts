/**
 * Utilitários para montar HTML a partir de conteúdo não confiável.
 *
 * O corpo da newsletter é montado por concatenação de string com dados que vêm
 * de feeds RSS de terceiros e da saída do modelo de linguagem. Esse HTML é
 * gravado e depois renderizado no portal com dangerouslySetInnerHTML, então um
 * título de RSS com uma tag de script bastava para injetar código na página.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapa texto para interpolação segura em corpo de elemento ou atributo. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Devolve a URL apenas quando é http(s), já escapada para uso em atributo.
 * Bloqueia esquemas executáveis como javascript: e data:.
 */
export function safeHttpUrl(value: unknown, fallback = "#"): string {
  if (typeof value !== "string" || value.trim().length === 0) return fallback;

  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return fallback;
    return escapeHtml(parsed.toString());
  } catch {
    return fallback;
  }
}
