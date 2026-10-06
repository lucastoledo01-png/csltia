import { resolverCapacidade, type EstadoDaCapacidade, type ProjetoComCapacidades } from "../../capacidades";
import type { PacoteFactual } from "../../editorial/pacote-factual";
import { determinarFormatoDaNoticia, type DecisaoDeFormato } from "./formato";

/**
 * O carrossel da NOTÍCIA é uma capacidade do projeto (06/10/2026).
 *
 * Até aqui a notícia saía sempre em peça única, e o carrossel só existia para o
 * conteúdo permanente, que está desligado. O método do Not Journal muda a
 * notícia, então ele entra pelo mesmo caminho de toda mudança de canal: não
 * declarado vale `off`, que é a peça única de sempre; `dry_run` decide e só
 * anota no log o que viraria carrossel; `enforce` faz o carrossel.
 */
export function modoDoCarrosselDaNoticia(projeto?: ProjetoComCapacidades | null): EstadoDaCapacidade {
  return resolverCapacidade("carrossel_noticia", () => "off", projeto);
}

export type Decisor = (
  pauta: { storyId: string },
  pacote: PacoteFactual | null,
  comCta: boolean,
) => DecisaoDeFormato | null;

/**
 * O decisor do dia: o do conteúdo permanente para o que é dele, e o da notícia
 * para o resto.
 *
 * O do conteúdo permanente responde `null` para pauta que não é dele, e é isso
 * que separa os dois: a notícia nunca passa pela régua de família e ângulo, e
 * o conteúdo permanente nunca passa pela régua de passos.
 */
export function decisorDoDia(
  doPermanente: Decisor | null,
  modo: EstadoDaCapacidade,
  registrar: (linha: string) => void = (l) => console.log(l),
): Decisor | null {
  if (modo === "off") return doPermanente;

  return (pauta, pacote, comCta) => {
    const permanente = doPermanente?.(pauta, pacote, comCta) ?? null;
    if (permanente) return permanente;

    const decisao = determinarFormatoDaNoticia(pacote);
    if (modo === "dry_run") {
      registrar(`[CARROSSEL NOTICIA] dry_run: ${pauta.storyId} seria ${decisao.formato} (${decisao.motivo})`);
      return null;
    }
    return decisao;
  };
}
