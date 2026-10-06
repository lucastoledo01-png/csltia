import { instrucaoVigente, preencherMarcadores } from "../instrucoes";

/**
 * A forma da manchete de capa. Uma regra, num lugar só.
 *
 * ## O que estava errado
 *
 * O prompt pedia "de 3 a 10 palavras" e a guarda recusava acima de 12. A
 * referência que o produto persegue não cabe nessa faixa, e não por gosto: as
 * três capas medidas em 15/09/2026 têm 11, 15 e 16 palavras, de 61 a 116
 * caracteres, ocupando de duas a cinco linhas.
 *
 *   "SUS PARA QUEM TRABALHA": NOVA REGRA DE TRUMP CONDICIONA PARTE DO
 *   MEDICAID A 80 HORAS MENSAIS DE ATIVIDADE                      (105 car.)
 *
 *   AS FAMÍLIAS MAIS FORTES NÃO DEIXAM APENAS PATRIMÔNIO: TRANSMITEM
 *   HÁBITOS, RESPONSABILIDADE E PENSAMENTO INDEPENDENTE            (116 car.)
 *
 *   GILMAR MENDES EM SESSÃO SOBRE MORAES: "ATÉ A MÁFIA TEM ÉTICA"   (61 car.)
 *
 * Com o teto em 10 palavras, o que sai é "Corte adia regra de prazo": cabe na
 * tela, e não diz qual regra, de quem, nem a partir de quando. A faixa não era
 * um detalhe de prompt, era o produto.
 *
 * ## Por que o teto antigo existia, e por que ele não vale mais
 *
 * O comentário da guarda dizia que 12 palavras era limite DA ARTE, porque
 * acima disso o texto encolhe até ficar ilegível. Isso era verdade do desenho
 * anterior. Na gramática de jornal a faixa da manchete tem topo e base fixos
 * (de 58% a 90,5% da altura, 82% da largura) e o corpo do tipo é decidido pelo
 * navegador, entre 74px e 40px. Medindo: 130 caracteres em caixa alta cabem em
 * cinco linhas a 56px, com folga para a base da faixa.
 *
 * Então o teto continua existindo, e continua sendo da arte. Ele só está onde
 * a arte de verdade está, e não onde a arte antiga estava.
 *
 * ## Um lugar só
 *
 * Os números e o texto da regra moram aqui e são lidos por três consumidores:
 * o prompt do post de imagem única, o prompt do carrossel e a guarda que
 * confere o resultado. Já aconteceu de uma regra viver em três cópias neste
 * repositório e as cópias envelhecerem separadas; o custo foi uma peça
 * publicada certa e um diagnóstico mentindo sobre ela.
 */

export const FORMA_DA_MANCHETE = {
  /** Abaixo disto é rótulo, não manchete: cabe na tela e não decide nada. */
  minimoDePalavras: 6,
  /** Medido: acima disto nem a faixa da arte segura em corpo legível. */
  maximoDePalavras: 18,
  minimoDeCaracteres: 45,
  maximoDeCaracteres: 130,
} as const;

/**
 * A regra escrita para o modelo, igual nos dois prompts.
 *
 * Ela ensina a FORMA, e a forma é a única coisa aqui que não depende do fato.
 * O que preenche a forma continua vindo do pacote factual, e é por isso que o
 * bloco termina onde termina: pedir "gancho" sem lastro é como o hedge entrou
 * na redação, e a régua de alucinação recusa do mesmo jeito.
 *
 * Desde 05/10/2026 o TEXTO é editável no painel (etapa `manchete`), e os
 * NÚMEROS não: eles são o contrato que `social-guard.ts` confere. Por isso o
 * modelo escreve os tetos como marcadores, e quem os preenche é o código, com
 * os valores de `FORMA_DA_MANCHETE`. Uma versão do painel que apague o
 * marcador perde a frase do tamanho no prompt, e a guarda continua barrando.
 */
export const MODELO_DA_REGRA_DA_MANCHETE = `A MANCHETE DA CAPA

Ela é o post inteiro para quem não deslizou. Manchete ampla não dá o que decidir: "Fed mexe nos juros" (construção ilustrativa) serve para qualquer decisão, qualquer taxa e qualquer pessoa, e quem lê passa reto.

DE QUEM É ESTA NOTÍCIA. Antes da forma, responda isto: quem, entre as pessoas que leem, sente a mudança? Esse grupo TEM QUE APARECER na manchete, com as palavras que a própria fonte usa: quem investe em dólar, quem trabalha com tecnologia, quem paga aluguel, empresa que contrata, profissional de saúde. Medido nas nossas primeiras 79 manchetes: em 25 o sujeito era uma instituição ou um ato jurídico, e em 25 o leitor não aparecia de jeito nenhum.

NACIONALIDADE DE TERCEIRO PAÍS NUNCA ENTRA. Se a pessoa da história não é brasileira, a nacionalidade dela sai da manchete e é substituída pela profissão, pela área ou pelo cargo. O leitor está no Brasil e olha para os Estados Unidos; a nacionalidade de um terceiro não diz nada a ele.
  Errado (construção ilustrativa): "Engenheira argentina assume a divisão de chips de uma big tech nos EUA"
  Certo (construção ilustrativa): "Engenheira de chips assume a divisão de processadores de uma big tech nos EUA"

  Um país que não é o Brasil nem os Estados Unidos só fica na manchete quando ele é o OBJETO da notícia, como em "Coreia do Sul planeja investir US$ 200 bilhões nos EUA, com GNL no Alasca", e mesmo aí a outra metade precisa dizer o que aquilo muda para quem lê.

ÓRGÃO E ATO JURÍDICO NÃO ABREM. Corte, tribunal, juiz, liminar, decisão, regra, agência e departamento entram depois, como fiança do fato. Abre a manchete o que passou a valer ou deixou de valer, e para quem.
  Certo, e real (post de 04/10/2026): "Motorista tem direitos violados em busca sem mandado no Flock, decide juiz federal em Oklahoma"

JURISDIÇÃO NO FIM. Estado, cidade, corte ou distrito vão para a última posição. O leitor precisa saber se aquilo o alcança antes de saber onde foi decidido.
  Errado (construção ilustrativa): "Na Califórnia, lei estadual obriga empresas a informar a faixa salarial nas vagas"
  Certo (construção ilustrativa): "Quem procura emprego passa a ver a faixa salarial no anúncio da vaga, na Califórnia"

SIGLA NUNCA SOZINHA. Ou ela vem com três a cinco palavras que dizem o que é ("o CPI, o índice de preços ao consumidor"; "a Selic, a taxa básica de juros do Brasil"), ou sai. Fed, CPI, PCE e Selic crus não são manchete, são anotação de mesa de operação. O mesmo vale para termo técnico em inglês: "Profissionais de tecnologia veem agent orchestration crescer 1.721% nas vagas de bancos" (post real de 03/10/2026) deixa o leitor sem saber o que cresceu.

A FORMA. De duas partes, e os dois-pontos são UMA opção, não o padrão: nas 25 manchetes de referência medidas, só 2 usam dois-pontos. Vírgula, "e" e a frase corrida funcionam igual.

  [o que muda, e para quem] + [o detalhe que prova: número, prazo, data, quem decidiu]

  "Quem tem status de elite na Delta ou American recebe 90 dias na United" (post real de 05/10/2026)
  "Emprego nos EUA muda pouco e taxa de desemprego fica em 4,2% em setembro" (post real de 05/10/2026)
  "Gilmar Mendes em sessão sobre Moraes: 'até a máfia tem ética'"

TAMANHO: de {{minimo_de_palavras}} a {{maximo_de_palavras}} palavras, de {{minimo_de_caracteres}} a {{maximo_de_caracteres}} caracteres. São três linhas na arte, e três linhas é o alvo.

O DETALHE VEM DO PACOTE FACTUAL. Se não houver número, prazo nem citação, a segunda parte é o efeito concreto que a fonte descreve, com as palavras dela. E nomear o leitor é obrigação de FORMA, nunca licença para inventar alcance: o grupo afetado sai da fonte. Continua proibido escrever que algo "muda o cenário para brasileiros" quando o pacote não diz isso.

RETOMADA. Quando a mesma história volta, a manchete carrega o dado NOVO: a data, a etapa, quem fica de fora, o que passa a valer. Trocar "Fed" por "banco central americano" e "juros" por "taxa básica" não é manchete nova, é a mesma repetida.

PROIBIDO na manchete: pergunta, "entenda", "veja o que muda", "tudo sobre", "saiba mais", promessa de resultado, e adjetivo no lugar do fato ("decisão histórica", "mudança enorme"). O que prende a atenção é o fato com o detalhe, não o adjetivo sobre ele.`;


const TETOS_DA_MANCHETE = {
  minimo_de_palavras: FORMA_DA_MANCHETE.minimoDePalavras,
  maximo_de_palavras: FORMA_DA_MANCHETE.maximoDePalavras,
  minimo_de_caracteres: FORMA_DA_MANCHETE.minimoDeCaracteres,
  maximo_de_caracteres: FORMA_DA_MANCHETE.maximoDeCaracteres,
};

/** A regra do código, já com os números. É o texto que valia antes de 05/10/2026. */
export const REGRA_DA_MANCHETE = preencherMarcadores(MODELO_DA_REGRA_DA_MANCHETE, TETOS_DA_MANCHETE);

/** A regra que vale no ciclo em curso: a versão do painel, se ligada, com os números do código. */
export function regraDaMancheteVigente(): string {
  return preencherMarcadores(instrucaoVigente("manchete", MODELO_DA_REGRA_DA_MANCHETE), TETOS_DA_MANCHETE);
}
