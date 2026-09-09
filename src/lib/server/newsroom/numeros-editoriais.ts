import type { EditionContent } from "./schemas";

/**
 * Precisão de fonte não é precisão de leitura.
 *
 * O Banco Central publica o dólar com quatro casas, e a redação repassou:
 * "Dólar fecha a R$ 5,0857". Quem lê a newsletter no ônibus quer saber se o
 * dólar está em cinco reais e nove centavos. As outras duas casas são exatidão
 * que não muda decisão nenhuma e faz o texto parecer terminal de mercado.
 *
 * Esta camada é de APRESENTAÇÃO. O pacote factual e o que está gravado no banco
 * continuam com o valor da fonte, intactos: se amanhã alguém contestar o
 * número, o que se confere é o dado original, não o texto do e-mail. O que
 * muda é só a forma como ele aparece para o leitor.
 *
 * Por que é um passo sobre o TEXTO e não uma formatação no ponto de
 * interpolação: os números não são interpolados por código. Eles chegam dentro
 * de frases escritas pelo modelo, que os copia do pacote factual porque o
 * prompt proíbe inventar. Não existe um lugar onde o número passa sozinho.
 */

/** Casas decimais que sobrevivem, por tipo de grandeza. */
const CASAS_DE_MOEDA = 2;
const CASAS_DE_PERCENTUAL = 2;

/**
 * Arredonda para `casas`, e devolve mais precisão quando arredondar apagaria o
 * valor.
 *
 * `0,0004` com duas casas viraria `0,00`, que não é imprecisão: é dizer que o
 * número é zero quando ele não é. Nesses casos a apresentação cede e mantém a
 * primeira casa significativa.
 */
function arredondar(valor: number, casas: number): string {
  const arredondado = Number(valor.toFixed(casas));

  if (arredondado === 0 && valor !== 0) {
    /*
     * `ceil(-log10(x))` é a casa em que aparece o primeiro dígito
     * significativo: 0,0004 dá 4, e `toFixed(4)` devolve "0,0004". Uma casa a
     * mais acrescentaria um zero à direita sem informação.
     */
    const significativas = Math.min(8, Math.ceil(-Math.log10(Math.abs(valor))));
    return valor.toFixed(significativas).replace(".", ",");
  }

  /*
   * Casa decimal que não acrescenta nada também sai.
   *
   * "R$ 5,00" é o preço; "R$ 5" é a mesma informação com menos ruído. Mas isso
   * vale só quando a parte decimal é exatamente zero — "R$ 5,10" mantém o
   * centavo, senão o valor muda.
   */
  const inteiro = Number.isInteger(arredondado);
  return (inteiro ? String(arredondado) : arredondado.toFixed(casas)).replace(".", ",");
}

/** Lê um número escrito em português: milhar com ponto, decimal com vírgula. */
function lerNumeroPtBr(bruto: string): number | null {
  const limpo = bruto.replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reescreve o milhar de volta, porque arredondar perde o separador.
 *
 * Sem isto, "R$ 1.234,5678" viraria "R$ 1234,57": tecnicamente certo e pior de
 * ler que o original, que é o oposto do objetivo.
 */
function comMilhar(texto: string): string {
  const [inteira, decimal] = texto.split(",");
  const agrupada = inteira.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimal ? `${agrupada},${decimal}` : agrupada;
}

function formatar(bruto: string, casas: number): string {
  const valor = lerNumeroPtBr(bruto);
  if (valor === null) return bruto;
  return comMilhar(arredondar(valor, casas));
}

/**
 * Moeda: prefixo de moeda seguido de número.
 *
 * O prefixo é capturado e devolvido igual, porque "R$", "US$" e "€" carregam
 * significado e espaçamento próprios.
 */
const MOEDA = /(R\$|US\$|U\$|BRL|USD|EUR|€|\$)(\s*)(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)/g;

/** Percentual: número seguido de % ou da palavra "por cento". */
const PERCENTUAL = /(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)(\s*)(%|por cento)/g;

/**
 * Formata os números de um texto para leitura humana.
 *
 * Só mexe em moeda e percentual. Número solto fica como está de propósito:
 * "45 dias", "1.200 vagas" e "Formulário I-765" não são grandezas contínuas, e
 * arredondar qualquer dígito solto quebraria número de formulário, ano e
 * contagem.
 */
export function formatarNumerosDoTexto(texto: string): string {
  if (!texto) return texto;

  return texto
    .replace(MOEDA, (_todo, moeda: string, espaco: string, numero: string) => {
      return `${moeda}${espaco || " "}${formatar(numero, CASAS_DE_MOEDA)}`;
    })
    .replace(PERCENTUAL, (_todo, numero: string, espaco: string, sufixo: string) => {
      return `${formatar(numero, CASAS_DE_PERCENTUAL)}${espaco}${sufixo}`;
    });
}

/**
 * Os campos de texto que o leitor lê.
 *
 * `source_url` e `source_name` ficam fora: URL com número não é grandeza, e
 * mexer nela quebraria o link.
 */
export function formatarNumerosDaEdicao(edition: EditionContent): EditionContent {
  const f = formatarNumerosDoTexto;

  return {
    ...edition,
    subject: f(edition.subject),
    subject_options: edition.subject_options.map(f),
    preheader: f(edition.preheader),
    headline: f(edition.headline),
    intro: f(edition.intro),
    stories: edition.stories.map((s) => ({
      ...s,
      title: f(s.title),
      summary: f(s.summary),
      context: f(s.context),
      why_it_matters: f(s.why_it_matters),
      practical_impact: f(s.practical_impact),
      ...(s.humor_line ? { humor_line: f(s.humor_line) } : {}),
    })),
    quick_bits: edition.quick_bits.map((q) => ({ ...q, title: f(q.title), text: f(q.text) })),
    closing: f(edition.closing),
    final_line: f(edition.final_line),
  };
}
