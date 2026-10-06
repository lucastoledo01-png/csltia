/**
 * Dólar em texto português se escreve US$, com número brasileiro.
 *
 * Em 06/10/2026 a amostra do evergreen do FDIC saiu com a manchete "Quem
 * guarda dinheiro em banco segurado nos EUA tem cobertura de até $250,000". O
 * modelo copiou a grafia da fonte americana, que é o que o prompt pede para
 * número ("não arredonde, não complete"), e ninguém traduziu a FORMA. O leitor
 * brasileiro lê "250,000" como duzentos e cinquenta com três casas decimais.
 *
 * A regra é de apresentação e é determinística: roda depois da geração, em
 * toda copy em português (newsletter, artigo, post, legenda e slide), pelo
 * mesmo caminho que tira o travessão (`limparVicios`). O prompt também pede,
 * mas pedido reduz a frequência e código fecha o caminho.
 *
 * O VALOR não muda, só a grafia. Por isso a ancoragem continua valendo: ela
 * compara os dígitos e o tipo ("$250,000" na fonte e "US$ 250.000" no texto são
 * os mesmos dígitos, os dois marcados como moeda). Escala vira palavra em
 * português ("$1.5 million" vira "US$ 1,5 milhão"), e os dígitos continuam os
 * mesmos.
 *
 * O que NÃO é tocado, de propósito:
 *   - R$ e qualquer outra moeda com cifrão (A$, C$, HK$): a letra colada antes
 *     do cifrão diz que não é dólar americano;
 *   - número sem marca de dólar: "250,000 pedidos" não é dinheiro, e decidir
 *     a grafia de uma contagem não é tarefa desta regra;
 *   - endereço de página: um cifrão dentro de URL é parte do endereço.
 */

/** Escala em inglês ou português abreviado, com a forma singular e a plural. */
const ESCALAS: Array<{ padrao: RegExp; singular: string; plural: string }> = [
  { padrao: /^(?:trillions?|tri(?:lh(?:ão|ões|ao|oes))?)$/i, singular: "trilhão", plural: "trilhões" },
  { padrao: /^(?:billions?|bn|b|bi(?:lh(?:ão|ões|ao|oes))?)$/i, singular: "bilhão", plural: "bilhões" },
  { padrao: /^(?:millions?|mm|m|mi(?:lh(?:ão|ões|ao|oes))?)$/i, singular: "milhão", plural: "milhões" },
  { padrao: /^(?:thousands?|k|mil)$/i, singular: "mil", plural: "mil" },
];

/**
 * O prefixo do dólar: `US$`, `U$`, `US $`, `USD` ou o cifrão sozinho.
 *
 * O cifrão sozinho só vale quando não há letra nem dígito colado antes dele,
 * senão "R$", "A$" e "HK$" seriam lidos como dólar americano.
 */
const PREFIXO = String.raw`(?<prefixo>(?<![A-Za-z0-9])(?:US\s?\$|U\$|USD)|(?<![A-Za-z0-9$])\$)`;

/** O número como vier: com milhar, com decimal, em qualquer convenção. */
const NUMERO = String.raw`\d[\d.,]*\d|\d`;

/**
 * Escala logo depois do número, quando há.
 *
 * Palavra pode vir com espaço ("$1.5 million", "$3 bi"). Letra solta só vale
 * colada no número ("$250K", "$5M"): com espaço, "$5 M&A" viraria milhões.
 */
const ESCALA = String.raw`(?:\s?(?<palavra>trillions?|billions?|millions?|thousands?|trilh(?:ão|ões|ao|oes)|bilh(?:ão|ões|ao|oes)|milh(?:ão|ões|ao|oes)|mil|tri|bi|mi)|(?<letra>bn|mm|[kKmMbB]))?(?![\p{L}\d])`;

const COM_PREFIXO = new RegExp(`${PREFIXO}\\s?(?<numero>${NUMERO})${ESCALA}`, "gu");

/** "3,000 USD", com a sigla depois do número. Só a sigla: "3,000 dollars" fica com o redator. */
const COM_SUFIXO = new RegExp(`(?<![\\d.,$])(?<numero>${NUMERO})${ESCALA}\\s?USD(?![A-Za-z])`, "gu");

type NumeroLido = { inteiro: string; decimal: string };

/**
 * Lê o número decidindo qual separador é o decimal.
 *
 * Os dois separadores presentes: o último é o decimal ("1,234.56" e
 * "1.234,56"). Um só, repetido ou seguido de exatamente três dígitos em grupos
 * desde o começo ("250,000", "1.500.000"): é milhar. Um só, com outra
 * quantidade de dígitos depois ("1.5", "1,5", "19.99"): é decimal.
 *
 * Sobra um caso ambíguo, a vírgula com um grupo só de três dígitos: "1,239".
 * Em inglês é mil duzentos e trinta e nove; em português é um vírgula dois três
 * nove, e a newsletter escreve cotação assim ("o euro vale US$ 1,169"). Quem
 * decide é o prefixo: quem já escreveu "US$" ou "U$" está escrevendo em
 * português, e o número fica como decimal (`virgulaEhDecimal`); cifrão solto,
 * "USD" e "US $" são grafia americana, e a vírgula é milhar. "1.500" com ponto
 * é milhar nas duas convenções que importam aqui.
 *
 * Mesmo depois de "US$", três casas terminadas em zero são milhar: "US$
 * 250,000" ninguém escreve querendo dizer duzentos e cinquenta, e cotação com
 * três casas (a única razão para escrever três casas em português) não termina
 * em zero, porque aí seriam duas.
 */
function lerNumero(bruto: string, virgulaEhDecimal = false): NumeroLido | null {
  const temPonto = bruto.includes(".");
  const temVirgula = bruto.includes(",");

  if (temPonto && temVirgula) {
    const decimalEhVirgula = bruto.lastIndexOf(",") > bruto.lastIndexOf(".");
    const sepDecimal = decimalEhVirgula ? "," : ".";
    const sepMilhar = decimalEhVirgula ? "." : ",";
    const [parteInteira, decimal] = [bruto.slice(0, bruto.lastIndexOf(sepDecimal)), bruto.slice(bruto.lastIndexOf(sepDecimal) + 1)];
    if (!new RegExp(`^\\d{1,3}(\\${sepMilhar}\\d{3})*$`).test(parteInteira) || !/^\d+$/.test(decimal)) return null;
    return { inteiro: parteInteira.split(sepMilhar).join(""), decimal };
  }

  if (temPonto || temVirgula) {
    const sep = temPonto ? "." : ",";
    const decimalDeTresCasas =
      sep === "," && virgulaEhDecimal && /^\d{1,3},\d{2}[1-9]$/.test(bruto);
    if (!decimalDeTresCasas && new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(bruto)) {
      return { inteiro: bruto.split(sep).join(""), decimal: "" };
    }
    const partes = bruto.split(sep);
    if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
    return { inteiro: partes[0], decimal: partes[1] };
  }

  return { inteiro: bruto, decimal: "" };
}

function comMilhar(inteiro: string): string {
  return inteiro.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function escalaEmPortugues(bruta: string | undefined, n: NumeroLido): string {
  if (!bruta) return "";
  const escala = ESCALAS.find((e) => e.padrao.test(bruta));
  if (!escala) return ` ${bruta}`;
  // Em português, abaixo de dois é singular: "1,5 milhão", "1 bilhão"; dois ou mais, plural.
  const valor = Number(`${n.inteiro}.${n.decimal || "0"}`);
  return ` ${valor < 2 ? escala.singular : escala.plural}`;
}

function montar(numero: string, escala: string | undefined, prefixo?: string): string | null {
  const lido = lerNumero(numero, prefixo === "US$" || prefixo === "U$");
  if (!lido) return null;
  const corpo = lido.decimal ? `${comMilhar(lido.inteiro)},${lido.decimal}` : comMilhar(lido.inteiro);
  return `US$ ${corpo}${escalaEmPortugues(escala, lido)}`;
}

/** Trechos de URL, que ficam como estão. */
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

function foraDeUrl(texto: string, reescrever: (pedaco: string) => string): string {
  let saida = "";
  let ultimo = 0;
  for (const m of texto.matchAll(URL)) {
    const inicio = m.index ?? 0;
    saida += reescrever(texto.slice(ultimo, inicio)) + m[0];
    ultimo = inicio + m[0].length;
  }
  return saida + reescrever(texto.slice(ultimo));
}

/**
 * Reescreve todo valor em dólar do texto como `US$` com número brasileiro.
 *
 * Idempotente: "US$ 250.000" passa sem mudar, então rodar duas vezes (geração
 * e reparo, ou o laço da newsletter e a formatação de números) não estraga.
 */
export function dolarEmPortugues(texto: string): string {
  if (!texto || !/\$|USD/.test(texto)) return texto;

  const trocar = (...args: unknown[]): string => {
    const todo = args[0] as string;
    const grupos = args[args.length - 1] as { prefixo?: string; numero: string; palavra?: string; letra?: string };
    return montar(grupos.numero, grupos.palavra ?? grupos.letra, grupos.prefixo) ?? todo;
  };

  return foraDeUrl(texto, (pedaco) => pedaco.replace(COM_PREFIXO, trocar).replace(COM_SUFIXO, trocar));
}

/**
 * A instrução que vai nos prompts de redação.
 *
 * É a metade "pedido" da regra; a outra metade é `dolarEmPortugues`, que roda
 * depois da geração. Fica aqui para os prompts lerem o mesmo texto.
 */
export const REGRA_DO_DOLAR =
  'DÓLAR: valor em dólar se escreve "US$" com número brasileiro, ponto no milhar e vírgula no decimal: ' +
  '"US$ 250.000", "US$ 1,5 milhão", "US$ 19,99". Nunca "$250,000", "USD 3,000" nem "$1.5 million". ' +
  "Trocar a grafia não muda o valor: o número continua sendo o da fonte.";
