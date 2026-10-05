import { contencao } from "../newsroom/leitor";

/**
 * As regras do bloco "O que você precisa saber" (decisão do dono, 06/10/2026,
 * opção "a": o bloco fica, com regra no código).
 *
 * Na matéria-piloto de Chicago os quatro tópicos repetiam a abertura que vinha
 * logo embaixo: o leitor lia a mesma coisa duas vezes no primeiro terço da
 * página. Pedido no prompt não segurou, então a régua é determinista e roda
 * no pós-processamento do redator (e no script que reaplica a matéria
 * gravada):
 *
 *   1. no máximo TRÊS tópicos;
 *   2. nenhum tópico repete uma frase da abertura, medido por CONTENÇÃO de
 *      palavras, a mesma medida do leitor (`contencao`), com limiar de 60%;
 *   3. cada tópico carrega um fato SEU: um número, uma data, um prazo, um
 *      próximo passo ou um ator nomeado que a abertura ainda não disse;
 *   4. o bloco só existe quando o corpo passa de 400 palavras: em matéria
 *      curta a abertura já é o resumo.
 *
 * Tópico que falha sai inteiro, sem reescrita (a regra da poda). Se sobrarem
 * menos de dois, o bloco inteiro sai: um tópico sozinho não é lista.
 */

export const MAXIMO_DE_TOPICOS_DO_ESSENCIAL = 3;
export const MINIMO_DE_TOPICOS_DO_ESSENCIAL = 2;
/** O corpo precisa passar disto para o bloco existir. */
export const PALAVRAS_MINIMAS_PARA_O_ESSENCIAL = 400;
/** Acima disto, o tópico só repete uma frase da abertura. */
export const LIMIAR_DE_REPETICAO_DO_ESSENCIAL = 0.6;

export type TopicoRemovido = { indice: number; texto: string; motivo: string };

export type ResultadoDoEssencial = { mantidos: string[]; removidos: TopicoRemovido[] };

function normal(t: string): string {
  return t
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\*/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** As frases de um texto, para medir repetição frase a frase. */
function frases(t: string): string[] {
  return t
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .split(/(?<=[.!?])\s+/)
    .map((f) => f.trim())
    .filter(Boolean);
}

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo", "amanha", "hoje"];

/**
 * Palavras de prazo e de próximo passo. Contam como fato do tópico quando a
 * abertura não as usa: "a votação é na terça" acrescenta, "seguirão para a
 * câmara" depois de uma abertura que já disse isso não acrescenta.
 */
const MARCAS_DE_PROXIMO_PASSO = [
  "prazo", "vence", "vencimento", "ate o dia", "a partir de", "entra em vigor", "passa a valer", "votacao", "vota", "votar",
  "audiencia", "julgamento", "sancao", "sancionar", "veto", "prazo final", "proximo passo", "proxima etapa", "seguira", "seguirao",
  "comeca", "comecara", "termina", "encerra", "inscricoes", "data limite",
];

/** Primeira palavra de frase que é só maiúscula de começo, e não nome. */
const COMECOS_COMUNS = new Set(
  [
    "a", "o", "as", "os", "um", "uma", "uns", "umas", "em", "no", "na", "nos", "nas", "de", "do", "da", "dos", "das", "para", "por",
    "com", "sem", "se", "e", "mas", "ou", "que", "quem", "como", "quando", "onde", "ate", "apos", "antes", "depois", "segundo",
    "duas", "dois", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "metade", "parte", "mais", "menos", "cada",
    "todos", "todas", "nenhum", "nenhuma", "isso", "isto", "esse", "essa", "este", "esta", "ele", "ela", "eles", "elas", "sua", "seu",
    "proposta", "projeto", "medida", "cidade", "governo", "lei", "regra", "plano", "decisao", "pelo", "pela", "ja", "ainda", "nao",
  ].map(normal),
);

/** Os fatos que um texto carrega: número, data, ator nomeado, prazo e próximo passo. */
export function fatosDoTexto(texto: string): string[] {
  const limpo = texto.replace(/\[\[([^\]]+)\]\]/g, "$1").replace(/\*/g, "");
  const fatos: string[] = [];
  for (const m of limpo.matchAll(/\d+(?:[.,]\d+)*/g)) fatos.push(`n:${m[0].replace(/[.,]/g, "")}`);
  const n = ` ${normal(limpo)} `;
  for (const mes of MESES) if (n.includes(` ${mes} `)) fatos.push(`d:${mes}`);
  for (const dia of DIAS) if (n.includes(` ${dia} `) || n.includes(` ${dia} feira `)) fatos.push(`d:${dia}`);
  for (const marca of MARCAS_DE_PROXIMO_PASSO) if (n.includes(` ${marca} `)) fatos.push(`p:${marca}`);
  for (const frase of frases(limpo)) {
    const palavras = [...frase.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)];
    palavras.forEach((m, i) => {
      const w = m[0];
      if (!/^\p{Lu}/u.test(w)) return;
      if (i === 0 && COMECOS_COMUNS.has(normal(w))) return;
      fatos.push(`a:${normal(w)}`);
    });
  }
  return [...new Set(fatos)];
}

/** O fato está dito no texto de referência (a abertura)? */
function fatoDito(fato: string, referencia: string, numerosDaReferencia: Set<string>): boolean {
  const [tipo, valor] = [fato.slice(0, 1), fato.slice(2)];
  if (tipo === "n") return numerosDaReferencia.has(valor);
  return referencia.includes(` ${valor} `);
}

/**
 * Por que o tópico não fica, ou `null` se ele fica. A abertura é a lista de
 * parágrafos de abertura da matéria.
 */
export function motivoParaTirarTopico(topico: string, abertura: readonly string[]): string | null {
  const texto = abertura.join(" ");
  for (const f of frases(texto)) {
    const c = contencao(normal(topico), normal(f));
    if (c >= LIMIAR_DE_REPETICAO_DO_ESSENCIAL) return `repete a abertura (${Math.round(c * 100)}% das palavras do tópico estão numa frase dela)`;
  }
  const c = contencao(normal(topico), normal(texto));
  if (c >= LIMIAR_DE_REPETICAO_DO_ESSENCIAL + 0.2) return `repete a abertura (${Math.round(c * 100)}% das palavras do tópico já estão nela)`;

  const referencia = ` ${normal(texto)} `;
  const numeros = new Set(fatosDoTexto(texto).filter((f) => f.startsWith("n:")).map((f) => f.slice(2)));
  const fatos = fatosDoTexto(topico);
  const novos = fatos.filter((f) => !fatoDito(f, referencia, numeros));
  if (novos.length === 0) {
    return fatos.length
      ? "sem fato próprio (número, data, prazo, próximo passo e nomes já estão na abertura)"
      : "sem fato próprio (nenhum número, data, prazo, próximo passo ou ator nomeado)";
  }
  return null;
}

/**
 * Aplica as quatro regras. `palavrasDoCorpo` é a contagem do corpo da
 * matéria SEM o próprio bloco, as perguntas, o "Leia também" e as fontes.
 */
export function regrarEssencial(topicos: readonly string[], abertura: readonly string[], palavrasDoCorpo: number): ResultadoDoEssencial {
  const removidos: TopicoRemovido[] = [];
  if (topicos.length === 0) return { mantidos: [], removidos };
  if (palavrasDoCorpo <= PALAVRAS_MINIMAS_PARA_O_ESSENCIAL) {
    return {
      mantidos: [],
      removidos: topicos.map((texto, indice) => ({ indice, texto, motivo: `corpo com ${palavrasDoCorpo} palavras: o bloco só existe acima de ${PALAVRAS_MINIMAS_PARA_O_ESSENCIAL}` })),
    };
  }
  const mantidos: Array<{ indice: number; texto: string }> = [];
  topicos.forEach((texto, indice) => {
    const motivo = motivoParaTirarTopico(texto, abertura);
    if (motivo) removidos.push({ indice, texto, motivo });
    else if (mantidos.length >= MAXIMO_DE_TOPICOS_DO_ESSENCIAL) removidos.push({ indice, texto, motivo: `acima de ${MAXIMO_DE_TOPICOS_DO_ESSENCIAL} tópicos` });
    else mantidos.push({ indice, texto });
  });
  if (mantidos.length < MINIMO_DE_TOPICOS_DO_ESSENCIAL) {
    for (const m of mantidos) removidos.push({ ...m, motivo: `sobrou menos de ${MINIMO_DE_TOPICOS_DO_ESSENCIAL} tópicos: o bloco sai inteiro` });
    return { mantidos: [], removidos: removidos.sort((a, b) => a.indice - b.indice) };
  }
  return { mantidos: mantidos.map((m) => m.texto), removidos: removidos.sort((a, b) => a.indice - b.indice) };
}

/* ------------------------------------------------------------------ */
/* A mesma régua sobre o HTML gravado                                  */
/* ------------------------------------------------------------------ */

function textoDeHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " })[e] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contarPalavras(t: string): number {
  return t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** As palavras do corpo de um HTML do molde, sem o bloco, as perguntas, os links de serviço e a legenda. */
export function palavrasDoCorpoNoHtml(html: string): number {
  const corpo = html
    .replace(/<section class="(?:essencial|leia-tambem|perguntas|fontes)">[\s\S]*?<\/section>/g, " ")
    .replace(/<p class="(?:legenda-da-capa|credito-da-foto|fonte)"[^>]*>[\s\S]*?<\/p>/g, " ");
  return contarPalavras(textoDeHtml(corpo));
}

export type EssencialNoHtml = {
  html: string;
  antes: string[];
  depois: string[];
  removidos: TopicoRemovido[];
  palavrasDoCorpo: number;
};

/**
 * Aplica `regrarEssencial` ao HTML gravado de uma matéria do molde, sem
 * reescrever nada: cada `<li>` que fica continua byte a byte o que era, e o
 * bloco inteiro sai quando sobra menos de dois. A abertura é a
 * `<section class="abertura">`.
 */
export function regrarEssencialNoHtml(html: string): EssencialNoHtml {
  const bloco = html.match(/<section class="essencial">[\s\S]*?<\/section>/);
  const palavrasDoCorpo = palavrasDoCorpoNoHtml(html);
  if (!bloco) return { html, antes: [], depois: [], removidos: [], palavrasDoCorpo };
  const itens = [...bloco[0].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  const antes = itens.map(textoDeHtml);
  const aberturaHtml = html.match(/<section class="abertura">([\s\S]*?)<\/section>/)?.[1] ?? "";
  const abertura = [...aberturaHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => textoDeHtml(m[1]));
  const r = regrarEssencial(antes, abertura, palavrasDoCorpo);
  const ficam = new Set(r.mantidos);
  const novoBloco = r.mantidos.length
    ? bloco[0].replace(/<ul>[\s\S]*<\/ul>/, `<ul>${itens.filter((_, i) => ficam.has(antes[i])).map((li) => `<li>${li}</li>`).join("")}</ul>`)
    : "";
  return { html: html.replace(bloco[0], novoBloco), antes, depois: r.mantidos, removidos: r.removidos, palavrasDoCorpo };
}
