import { LEITOR } from "../editorial/linha-editorial";
import { instrucaoDaEtapa } from "../instrucoes";
import type { ProjetoComCapacidades } from "../capacidades";
import { modoDaFila } from "../aprovacao/modo";
import { errosRecentesDaEtapa } from "../aprovacao/memoria-de-reprovacao";

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

/**
 * As vozes com o bloco "não repetir" da fila de aprovação no fim de cada uma.
 *
 * Integração de 05/10/2026 (RF-29). O bloco vem de `errosRecentesDaEtapa`, que
 * já junta os erros recentes da etapa e as regras fixas aprovadas pelo dono, e
 * devolve vazio quando não há nada a dizer. Vazio, as vozes voltam idênticas:
 * um bloco vazio no prompt é instrução sem conteúdo.
 *
 * Fica DEPOIS da voz porque é correção, não identidade: a voz diz como o canal
 * fala, e o bloco diz o que o editor já recusou falando assim.
 */
export function vozesComMemoria(vozes: VozesDosRamos, naoRepetir: string): VozesDosRamos {
  const bloco = naoRepetir.trim();
  if (!bloco) return vozes;
  const juntar = (voz: string) => (voz ? `${voz}\n\n${bloco}` : bloco);
  return { newsletter: juntar(vozes.newsletter), artigo: juntar(vozes.artigo), post: juntar(vozes.post) };
}

/**
 * As vozes do projeto, com a memória de reprovação só quando a fila existe.
 *
 * Fila em `off`: a memória nem é lida, e as vozes são as de `vozesDosRamos`,
 * byte a byte. Fora de `off` (inclusive `dry_run`, que já registra
 * reprovações), o bloco da etapa "texto" entra no fim de cada voz. Falha de
 * leitura da memória já devolve vazio dentro de `errosRecentesDaEtapa`.
 */
export async function vozesDosRamosComMemoria(
  projeto: ProjetoComCapacidades & { id: string },
  deps: {
    vozes?: (projetoId: string) => Promise<VozesDosRamos>;
    memoria?: (projetoId: string, etapa: "texto") => Promise<string>;
  } = {},
): Promise<VozesDosRamos> {
  const vozes = await (deps.vozes ?? vozesDosRamos)(projeto.id);
  if (modoDaFila(projeto) === "off") return vozes;
  const memoria = deps.memoria ?? ((id: string, etapa: "texto") => errosRecentesDaEtapa(id, etapa));
  return vozesComMemoria(vozes, await memoria(projeto.id, "texto"));
}
