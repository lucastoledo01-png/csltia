import type { ProjetoComCapacidades } from "../../capacidades";

/**
 * Em que estado o acervo próprio roda neste projeto.
 *
 *   settings: { "capacidades": { "acervo": "dry_run" } }
 *
 *   off       (ou não declarado) o resolvedor nem sabe que o acervo existe.
 *             É o comportamento de antes de 05/10/2026, byte a byte.
 *   dry_run   o acervo é consultado, o que ele escolheria vai para a nota do
 *             resolvedor, a lista de compras é gravada, e quem ilustra a pauta
 *             continua sendo a cadeia externa de sempre.
 *   enforce   o acervo manda, na ordem da decisão de 29/09/2026.
 *
 * Mesmo contrato de `capacidades.ts`, lido do mesmo lugar: valor declarado e
 * irreconhecível vira `off`, porque um erro de digitação no painel não pode
 * trocar a fonte das imagens. A diferença é que aqui não existe variável de
 * ambiente por baixo: não declarado é `off`, e não "pergunte ao ambiente".
 *
 * Por que não acrescentar "acervo" a `CAPACIDADES` (05/10/2026): o arquivo é
 * compartilhado com outras frentes que estão mexendo nele no mesmo dia, e a
 * leitura aqui é a mesma regra sobre o mesmo jsonb. Quando as frentes se
 * juntarem, trocar este corpo por `resolverCapacidade("acervo", () => "off",
 * projeto)` é uma linha, e o teste deste arquivo continua valendo.
 */

export type ModoDoAcervo = "off" | "dry_run" | "enforce";

export function capacidadeDoAcervo(projeto: ProjetoComCapacidades | null | undefined): ModoDoAcervo {
  const settings = projeto?.settings;
  if (!settings || typeof settings !== "object") return "off";
  const capacidades = (settings as Record<string, unknown>).capacidades;
  if (!capacidades || typeof capacidades !== "object" || Array.isArray(capacidades)) return "off";
  const bruto = (capacidades as Record<string, unknown>).acervo;
  if (typeof bruto !== "string") return "off";
  const t = bruto.trim().toLowerCase();
  if (t === "enforce") return "enforce";
  if (t === "dry_run") return "dry_run";
  return "off";
}
