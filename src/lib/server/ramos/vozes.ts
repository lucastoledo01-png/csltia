import { LEITOR } from "../editorial/linha-editorial";
import { instrucaoDaEtapa } from "../instrucoes";

/**
 * A voz de cada canal, escrita separada.
 *
 * Até 05/10/2026 havia uma voz e três destinos: a newsletter escrevia, o
 * portal publicava o mesmo HTML, e o post herdava o assunto. O dono decidiu
 * que são três peças, e peça diferente pede voz diferente:
 *
 *   newsletter  e-mail de manhã, referência "The News": conversa curta,
 *               autossuficiente, para quem já assinou.
 *   artigo      matéria de busca: quem chega pelo Google procura um assunto,
 *               não recebe uma carta. Título que diz o assunto, primeiro
 *               parágrafo que responde, intertítulos que dão para escanear.
 *   post        feed, referências Not Journal e Brazil Journal: ator
 *               reconhecível com verbo no presente, frase curta, sem
 *               despedida (ver `docs/modelo-de-titulo.md`).
 *
 * O que as três dividem é a LINHA EDITORIAL, que vem de
 * `editorial/linha-editorial.ts`, e o briefing do projeto, que vem do banco.
 * Cada texto abaixo começa pela linha, de propósito: já houve a versão em que
 * a régua mudou num prompt e não no outro, e custou quatro dias sem post.
 *
 * Cada voz passa por `instrucaoDaEtapa`, que hoje devolve o padrão e amanhã
 * vai ler a versão editável do banco.
 */

export const ETAPA_REDACAO_NEWSLETTER = "redacao_newsletter";
export const ETAPA_REDACAO_ARTIGO = "redacao_artigo";
export const ETAPA_REDACAO_POST = "redacao_post";

export const VOZ_PADRAO_DA_NEWSLETTER = `
LINHA EDITORIAL (vale para os três canais):
${LEITOR}

VOZ DESTE CANAL, A NEWSLETTER:
Isto é um e-mail que chega de manhã, no formato do "The News". Quem abre já assinou e quer terminar informado sem clicar em nada. Conversa de duas pessoas informadas, parágrafo de duas a quatro linhas, frase curta alternada com uma que respira. A edição é uma seleção própria deste canal: não escreva como se as matérias fossem sair também no site ou no Instagram, e não remeta a eles.
`.trim();

export const VOZ_PADRAO_DO_ARTIGO = `
LINHA EDITORIAL (vale para os três canais):
${LEITOR}

VOZ DESTE CANAL, A MATÉRIA DO PORTAL:
Isto é uma matéria de busca. Quem chega aqui digitou um assunto no Google e quer a resposta, não recebe uma carta de manhã. Por isso:
- O título diz o assunto com as palavras que a pessoa digitaria, e diz de que país é. Nada de curiosidade incompleta, nada de caixa baixa de assunto de e-mail.
- O primeiro parágrafo responde a pergunta inteira em duas ou três frases: o que aconteceu, onde, quando. Quem ler só ele sai informado.
- Os intertítulos permitem escanear: cada um diz o que o bloco abaixo traz, em frase afirmativa curta.
- Sem saudação, sem "bom dia", sem despedida, sem convite a compartilhar. A matéria não é a edição de hoje: ela continua valendo amanhã.
- O tom continua sendo o da casa: fala, não relata. Frase curta, palavra comum primeiro, sigla depois e só se ajudar.
`.trim();

export const VOZ_PADRAO_DO_POST = `
LINHA EDITORIAL (vale para os três canais):
${LEITOR}

VOZ DESTE CANAL, O POST:
Referências de voz: Not Journal e Brazil Journal. A manchete abre com ator reconhecível e verbo no presente, e quando a notícia é dos EUA o efeito aqui entra no próprio título. A legenda abre pelo fato, nunca por saudação. Este post é uma peça própria do Instagram: não é resumo de newsletter e não remete à edição do dia.
`.trim();

export type VozesDosRamos = { newsletter: string; artigo: string; post: string };

export async function vozesDosRamos(projetoId: string): Promise<VozesDosRamos> {
  const [newsletter, artigo, post] = await Promise.all([
    instrucaoDaEtapa(projetoId, ETAPA_REDACAO_NEWSLETTER, VOZ_PADRAO_DA_NEWSLETTER),
    instrucaoDaEtapa(projetoId, ETAPA_REDACAO_ARTIGO, VOZ_PADRAO_DO_ARTIGO),
    instrucaoDaEtapa(projetoId, ETAPA_REDACAO_POST, VOZ_PADRAO_DO_POST),
  ]);
  return { newsletter, artigo, post };
}
