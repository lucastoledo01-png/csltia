import { escapeHtml } from "./html";
import { validarAncoragem, type PacoteFactual } from "./editorial/pacote-factual";

/**
 * A legenda e o `alt` da foto da capa (06/10/2026).
 *
 * A descrição vem da conferência visual (`conferirImagem`), que ABRE a foto e
 * diz em uma frase o que vê. Ela não entra sem passar pela mesma ancoragem do
 * texto: nome próprio, número ou data que o pacote da matéria não tem derruba
 * a descrição inteira. É o jeito de garantir que a legenda nunca diga QUEM
 * está na foto quando ninguém disse: "um homem discursa" passa, "o prefeito
 * discursa" sem o prefeito no pacote não passa.
 *
 * Sem descrição que sirva, a legenda é neutra e diz só o assunto.
 */

const LIMITE = 160;

export function legendaDaFoto(descricao: string | null | undefined, pacote: PacoteFactual): string | null {
  const limpa = (descricao ?? "").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
  if (!limpa || limpa.length > LIMITE) return null;
  const anc = validarAncoragem(limpa, pacote);
  // Aqui até o AVISO de nome derruba: na legenda não há contexto que justifique um nome solto.
  if (anc.naoSustentadas.length > 0) return null;
  return `${limpa.charAt(0).toUpperCase()}${limpa.slice(1)}.`;
}

export function legendaNeutra(assunto: string | null | undefined): string {
  const a = (assunto ?? "").trim();
  return a ? `Imagem ilustrativa: ${a}.` : "Imagem ilustrativa.";
}

/** O marcador que `semImagemDaCapaNoCorpo` lê e a página desenha embaixo da capa. */
export function htmlDaLegenda(legenda: string): string {
  return `<p class="legenda-da-capa">${escapeHtml(legenda)}</p>`;
}
