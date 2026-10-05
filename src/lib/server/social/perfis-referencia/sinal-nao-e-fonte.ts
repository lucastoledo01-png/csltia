/**
 * As duas travas que separam SINAL de FONTE (RF-17).
 *
 * Decisão do dono em 05/10/2026: o post viral de um perfil de referência diz
 * QUE assunto está rendendo, e nunca é o que se publica. Nada de repost, nada
 * de arte de terceiro, nada de texto de terceiro. A pauta só existe se a busca
 * achar uma fonte primária investigável, e ela atravessa a mesma
 * classificação e a mesma guarda de qualquer outra pauta.
 *
 * A instrução ao modelo pede isso, e pedido não é garantia: é a lição da cena
 * da foto, em que a proibição mora na instrução E num filtro da resposta.
 * Aqui são duas portas deterministas, cada uma com teste que produz um "não".
 */

/**
 * Domínios de rede social. Candidata com URL daqui não é fonte primária.
 *
 * A busca no Google News pode devolver um item cujo publisher é o próprio
 * Instagram, ou um agregador de posts. Deixar passar seria republicar
 * exatamente o post que deveria ser só sinal.
 */
const DOMINIOS_DE_REDE_SOCIAL = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "fb.watch",
  "threads.net",
  "threads.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "youtu.be",
  "linkedin.com",
  "bsky.app",
  "t.me",
  "whatsapp.com",
];

function hostDe(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return "";
  }
}

/**
 * A candidata pode seguir como pauta? `false` é um "não" firme.
 *
 * Recusa também URL ilegível: sem saber de onde veio, não dá para afirmar que
 * não é a rede social.
 */
export function urlPodeSerFontePrimaria(url: string, permalinksDosSinais: string[] = []): boolean {
  const host = hostDe(url);
  if (!host) return false;
  if (DOMINIOS_DE_REDE_SOCIAL.some((d) => host === d || host.endsWith(`.${d}`))) return false;
  const normal = url.replace(/[?#].*$/, "").replace(/\/+$/, "");
  return !permalinksDosSinais.some((p) => p && p.replace(/[?#].*$/, "").replace(/\/+$/, "") === normal);
}

/**
 * Consulta de busca que trata de imigração.
 *
 * O classificador já recusa a pauta de imigração em `decidirPauta`. Esta trava
 * vem ANTES e por outro motivo: custo. Cada consulta vira uma busca, e cada
 * item da busca vira uma classificação paga. Buscar "H-1B lottery" para
 * depois recusar tudo é pagar para jogar fora.
 *
 * Por início de palavra, e não substring: é a lição do "ice" que casava
 * dentro de "justice" e "police".
 *
 * O erro desta lista é assimétrico, e de propósito: "visa" também pega uma
 * pauta sobre a empresa de cartões. Falso positivo aqui custa UMA busca extra
 * que não acontece; falso negativo custa uma busca paga que o classificador
 * recusa depois. Nenhum dos dois publica nada errado.
 */
const TERMOS_DE_IMIGRACAO = [
  "immigra",
  "imigra",
  "emigra",
  "migrant",
  "migrat",
  "visa",
  "visto",
  "green card",
  "greencard",
  "h-1b",
  "h1b",
  "eb-5",
  "eb5",
  "uscis",
  "deport",
  "asylum",
  "asilo",
  "refugee",
  "refugiad",
  "border",
  "fronteira",
  "naturaliza",
  "citizenship",
  "cidadania americana",
  "ice raid",
  "daca",
  "tps",
];

export function consultaEhDeImigracao(consulta: string): boolean {
  const t = ` ${consulta
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, " ")} `;
  return TERMOS_DE_IMIGRACAO.some((termo) => t.includes(` ${termo}`));
}
