/** Escapa texto que vai pra dentro do HTML do slide. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Código de formulário e de visto não quebra no meio.
 *
 * `USCIS muda prazo de análise do I-765` saiu da arte como `do I-` numa linha
 * e `765` na seguinte: para o navegador, o hífen é oportunidade de quebra, e
 * ele não sabe que ali não é hifenização, é o nome da coisa. Nesta vertical
 * isso não é caso de borda: I-765, H-1B, EB-2, DS-160 e N-400 são o vocabulário
 * de todo dia.
 *
 * O `nowrap` fica num `span` em vez de num hífen sem quebra (U+2011) porque
 * Playfair Display não tem esse glifo, e caractere ausente vira retângulo
 * vazio na manchete.
 *
 * Recebe texto JÁ escapado: a entrada é a saída de `esc`, e nenhuma das
 * entidades que ela produz (`&amp;` e companhia) casa com o padrão.
 */
export function manterCodigosJuntos(escapado: string): string {
  return escapado.replace(/\b([A-Z]{1,3})-([0-9]{1,4}[A-Z]?[0-9]?)\b/g, '<span class="n-junto">$1-$2</span>');
}

/**
 * Palavra com hífen não se parte na virada da linha.
 *
 * O navegador trata o hífen como oportunidade de quebra, e numa manchete em
 * caixa alta o resultado engana o olho: o post publicado em 16/09/2026 saiu
 * com IMPEDI- no fim de uma linha e LA no começo da outra, e quem lê de
 * relance vê uma palavra cortada, não uma ênclise.
 *
 * Vale para qualquer par de letras, e é por isso que é uma função separada de
 * {@link manterCodigosJuntos}: aquela existe para sigla com número, do tipo
 * H-1B e EB-2, e casar as duas num padrão só faria cada mudança numa regra
 * mexer na outra.
 *
 * Recebe texto JÁ escapado, e o `&amp;` que `esc` produz não casa com o padrão
 * porque não tem hífen.
 */
export function manterHifenizadasJuntas(escapado: string): string {
  return escapado.replace(
    /\b([\p{L}]{2,})-([\p{L}]{1,})\b/gu,
    '<span class="n-junto">$1-$2</span>',
  );
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

/**
 * As duas proteções de quebra, na ordem que importa.
 *
 * O hífen de palavra roda ANTES do de sigla, e não é indiferente: se a ordem
 * se invertesse, o segundo passaria a varrer um texto que já tem
 * `<span class="n-junto">` dentro, e qualquer mudança de nome de classe viraria
 * um casamento acidental de padrão. Rodando primeiro, cada um vê só o texto.
 *
 * Os dois padrões não se sobrepõem: sigla exige dígito depois do hífen
 * (H-1B, EB-2) e palavra exige duas letras ou mais antes dele (impedi-la).
 */
export function protegerQuebras(escapado: string): string {
  return manterCodigosJuntos(manterHifenizadasJuntas(escapado));
}
