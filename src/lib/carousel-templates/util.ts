/** Escapa texto que vai pra dentro do HTML do slide. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** `3` → `"03"`. */
export function pad2(n: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(2, "0");
}

/**
 * URL segura pra usar em `background-image`/`src`. Aceita só `https:` e
 * `data:` (as capas geradas por IA voltam como `data:image/png;base64,…`).
 */
export function safeImageUrl(url: unknown): string {
  const s = String(url ?? "").trim();
  if (s.startsWith("data:image/")) return s;
  try {
    const parsed = new URL(s);
    if (parsed.protocol === "https:") return parsed.toString();
  } catch {
    /* url inválida */
  }
  return "";
}
