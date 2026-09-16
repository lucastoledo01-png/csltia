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
 */
export const REGRA_DA_MANCHETE = `A MANCHETE DA CAPA

Ela é o post inteiro para quem não deslizou. Manchete ampla não dá o que decidir: "Corte adia regra de prazo" serve para qualquer regra, qualquer prazo e qualquer pessoa, e quem lê passa reto.

A forma é de duas partes, quase sempre ligadas por dois-pontos:

  [o que é, com nome próprio ou citação]: [o que muda, com o detalhe que prova]

  "SUS PARA QUEM TRABALHA": NOVA REGRA CONDICIONA PARTE DO MEDICAID A 80 HORAS MENSAIS DE ATIVIDADE
  GILMAR MENDES EM SESSÃO SOBRE MORAES: "ATÉ A MÁFIA TEM ÉTICA"
  DECISÃO EM BOSTON ADIA A REGRA DE PRAZO FIXO: ESTUDANTE COM F-1 SEGUE NO STATUS ATUAL ATÉ 27 DE OUTUBRO

A primeira parte é o sujeito do fato, o nome do programa ou da regra, ou uma frase literal entre aspas. A segunda traz o número, o prazo, a data, o valor ou quem é afetado. Sem os dois-pontos também vale, desde que as duas informações estejam lá.

TAMANHO: de ${FORMA_DA_MANCHETE.minimoDePalavras} a ${FORMA_DA_MANCHETE.maximoDePalavras} palavras, de ${FORMA_DA_MANCHETE.minimoDeCaracteres} a ${FORMA_DA_MANCHETE.maximoDeCaracteres} caracteres. São três linhas na arte, e três linhas é o alvo, não o limite tolerado.

O DETALHE VEM DO PACOTE FACTUAL. Se não houver número, prazo nem citação, a segunda parte é o efeito concreto que a fonte descreve, com as palavras da fonte. Inventar o detalhe para caber na forma é pior do que a manchete curta: a forma é para organizar o que existe, nunca para pedir o que falta.

PROIBIDO na manchete: pergunta, "entenda", "veja o que muda", "tudo sobre", "saiba mais", promessa de resultado, e adjetivo no lugar do fato ("decisão histórica", "mudança enorme"). O que prende a atenção é o fato com o detalhe, não o adjetivo sobre ele.`;
