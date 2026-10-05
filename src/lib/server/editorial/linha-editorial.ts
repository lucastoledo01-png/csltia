/**
 * A linha editorial, escrita UMA vez, para as duas leituras de uma pauta.
 *
 * Em 16/09/2026 a publicação deixou de ser sobre imigração e passou a ser
 * sobre os Estados Unidos para brasileiros. O pivô reescreveu o eixo e a
 * régua de relevância do classificador, e parou ali:
 *
 *   - a abertura do classificador continuou dizendo "publicação sobre
 *     imigração, o leitor quer se mudar legalmente", e a `leitura` continuou
 *     medindo "o projeto de mudança do leitor";
 *   - o verificador de finalistas, que é a segunda leitura e só roda no
 *     Instagram, ganhou a lista nova de eixos e manteve todo o resto: leitor
 *     que planeja se mudar, relevância como "o quanto muda a vida de quem
 *     planeja a mudança", e `eua_desfavoravel` do ponto de vista da mudança;
 *   - `seguranca` entrou no schema em 16/09 e nunca entrou em prompt nenhum.
 *
 * Medido em 29/09: em 23, 24, 26 e 28/09 o verificador recusou TODAS as
 * pautas que avaliou ("notícia de tecnologia sem conexão com a decisão de
 * imigrar", "trata de juros e Bolsa, não de imigração"), com 41 e 30 pautas
 * aprovadas pelo classificador nos dois primeiros dias. Zero post nos quatro.
 * A newsletter não sentia porque não passa pelo verificador.
 *
 * É o mesmo defeito da variante da capa em três cópias: a regra existia em
 * dois prompts, mudou em um, e a conferência entre eles passou a comparar a
 * régua nova com a velha. Daqui em diante, quem muda a linha muda aqui, e as
 * duas leituras mudam juntas. O teste `linha-editorial.test.ts` falha se um
 * dos dois prompts voltar a escrever a própria versão.
 *
 * Em 05/10/2026 o dono tirou imigração da pauta e fechou o leitor: é o
 * brasileiro que sonha com os EUA, e não quem já mora lá. A linha é notícia
 * positiva dos EUA e notícia ruim do Brasil, aproveitando o que está em alta.
 * O eixo `imigracao` continua existindo para o classificador ROTULAR a pauta,
 * porque é o rótulo que permite recusá-la em `decidirPauta`; sem ele, uma
 * notícia de visto cairia em "politica" e passaria.
 */

import { instrucaoVigente } from "../instrucoes";

export const LEITOR = `
A publicação é brasileira e é sobre os ESTADOS UNIDOS: economia, trabalho, custo de vida, política, tecnologia, cultura, segurança e cidades. Imigração NÃO é assunto da publicação: visto, green card, processo migratório, deportação e fronteira ficam fora.
O leitor é o brasileiro que SONHA com os EUA: pensa em morar, trabalhar ou investir lá. Não é quem já mora nos EUA. A linha é notícia positiva dos EUA e notícia ruim do Brasil, aproveitando o que está em alta.
`.trim();

export const REGRA_PAIS = `
pais: "EUA" se o fato acontece nos Estados Unidos ou é decidido por autoridade americana. "Brasil" se acontece no Brasil ou é decidido por autoridade brasileira. "outro" nos demais casos.
`.trim();

export const REGRA_LEITURA = `
leitura: como o FATO chega à vida, ao bolso, ao trabalho ou ao plano do leitor, não o tom do texto.
- "oportunidade": abre, amplia, acelera, barateia ou protege algo. Exemplos: prazo estendido, juros menores, emprego em alta, preço que cai, produto que chega.
- "neutra": informa sem mudar nada em nenhuma direção, ou muda algo sem lado claro. Consulta pública, nomeação, dado estatístico, lançamento, mudança de formulário, resultado de empresa.
- "desfavoravel": fecha, encarece, atrasa ou ameaça algo, ou retrata os EUA como lugar hostil, perigoso ou arbitrário. Exemplos: taxa maior, prazo maior, batida policial, agente acusado de crime, corte de benefício.
Dado econômico comum não é desfavorável por ter subido ou descido: preço de imóvel que sobe 0,25% é "neutra", não retrato hostil do país.
`.trim();

export const REGRA_EIXO = `
eixo: a editoria da pauta.
- "economia": juros, inflação, emprego, mercado, câmbio, empresa que contrata ou demite em massa, decisão do Fed.
- "trabalho": salário, carreira, profissão em alta, jornada, sindicato, o que muda para quem trabalha.
- "custo_de_vida": o que muda o bolso. Moradia, aluguel, energia, combustível, mercado, plano de saúde, imposto sobre renda ou consumo. NÃO entra preço de commodity nem balanço de empresa: só entra se a matéria disser o efeito no preço que a pessoa paga.
- "politica": governo, Congresso, eleição, decisão de corte com efeito prático, medida do Executivo. O fato, nunca a disputa partidária pela disputa.
- "tecnologia": produto, empresa de tecnologia, inteligência artificial, plataforma, o que muda no que a pessoa usa.
- "cultura": comportamento, sociedade, cidade, educação, esporte, o que a vida americana tem de diferente.
- "seguranca": crime, violência, policiamento, segurança pública, dado de criminalidade, nos EUA ou no Brasil.
- "imigracao": visto, green card, status, processo migratório, deportação, fronteira, cidadania. Rotule assim sempre que o assunto for esse: a pauta fica FORA da linha e é recusada.
- "brasil": fato brasileiro com efeito prático sobre patrimônio, empresa, carreira ou segurança, que pesa na comparação com os EUA.
- "outro": o que não couber acima.
`.trim();

export const REGRA_RELEVANCIA = `
relevancia: 0 a 10, e a régua depende do país.

Para notícia dos EUA: quanto o fato interessa a um brasileiro que sonha em morar, trabalhar ou investir nos Estados Unidos, e quanto mostra o país como lugar onde a vida anda.
Nomeação de cargo sem efeito prático é 1. Nota de rodapé de mercado é 2. Decisão do Fed sobre juros é 7, porque mexe no câmbio e no preço aqui. Assunto em alta entre brasileiros sobe um ponto. Lei que muda o que se paga de imposto, empresa grande demitindo em massa, cidade que virou destino de brasileiros, tecnologia que troca o jeito de trabalhar: 7 a 9.

Para notícia do Brasil: quanto existe ali um PROBLEMA FACTUAL CONCRETO que afeta quem tem patrimônio, empresa ou carreira, e que pesa na decisão de ficar ou sair. Notícia setorial, disputa comercial, safra, exportação e balanço de empresa não pesam nessa decisão: valem 1 a 3, por maior que seja o número envolvido. Vale de 6 a 9 quando há fato verificável com alcance: mudança de alíquota, decisão que muda regra do jogo, número de inflação, câmbio, juros, dado de violência, decisão institucional com efeito prático. Fofoca de bastidor, disputa de cargo, declaração de político e pesquisa eleitoral isolada valem 1 a 3.

Para notícia de terceiro país: só interessa se afetar brasileiro que quer viver ou investir nos EUA. Caso contrário, 0.
`.trim();

/*
 * O leitor e a régua de relevância são JULGAMENTO editorial e o dono pode
 * reescrevê-los no painel (RF-26, 05/10/2026). País, leitura e eixo NÃO: os
 * três nomeiam os valores que o schema da classificação aceita, e um valor
 * renomeado no painel viraria classificação inválida sem erro de compilação.
 *
 * Os dois prompts chamam ESTAS funções, nunca `instrucaoVigente` direto: é o
 * que mantém a régua num lugar só, que é a razão de este arquivo existir.
 */
export function leitorVigente(): string {
  return instrucaoVigente("linha_editorial_leitor", LEITOR);
}

export function relevanciaVigente(): string {
  return instrucaoVigente("linha_editorial_relevancia", REGRA_RELEVANCIA);
}
