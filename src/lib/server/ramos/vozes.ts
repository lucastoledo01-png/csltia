import { LEITOR } from "../editorial/linha-editorial";
import { instrucaoDaEtapa } from "../instrucoes";
import type { ProjetoComCapacidades } from "../capacidades";
import { modoDaFila } from "../aprovacao/modo";
import { errosRecentesDaEtapa } from "../aprovacao/memoria-de-reprovacao";
import { RAMOS, type Ramo } from "../aprovacao/contrato";

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
Isto é uma matéria de busca, no molde de matéria completa. Quem chega aqui digitou um assunto no Google e quer a resposta, não recebe uma carta de manhã. Por isso:
- O título diz o assunto com as palavras que a pessoa digitaria, e diz de que país é. Nada de curiosidade incompleta, nada de caixa baixa de assunto de e-mail.
- A linha fina acrescenta o dado que não coube no título. Não repete o título com outras palavras.
- "O que você precisa saber" tem no máximo três tópicos curtos, e só existe em matéria com mais de 400 palavras de corpo. Cada tópico traz um fato que a abertura NÃO diz: um número, uma data, um prazo, o próximo passo ou quem decide. Nenhum tópico repete uma frase da abertura com outras palavras. O tópico que repete ou não traz fato próprio é apagado, e com menos de dois tópicos o bloco sai inteiro: melhor dois tópicos que acrescentam que quatro que resumem.
- Os assuntos são nomes próprios do pacote (pessoa, organização, lugar, programa) ou temas da lista fechada que vai no contrato. Nunca palavra solta como "água", "energia" ou "governo": ela é descartada.
- A abertura tem dois parágrafos: o que aconteceu, quem, quando e onde. Quem ler só ela sai informado. O veículo de origem aparece nela uma vez, e é ali que vai o link.
- Os intertítulos são as perguntas que o leitor faria, e só as que o pacote responde: "O que foi proposto?", "Por que agora?", "Quem é afetado?", "O que acontece agora?". A primeira frase embaixo de cada um já é a resposta.
- Número entra com a fonte nomeada na mesma frase, e a fonte é quem o pacote diz que deu o número (a cidade, o órgão, a empresa), nunca o veículo que publicou a reportagem. Tabela só quando há comparação de verdade, nunca para enfeitar uma lista.
- Proposta, projeto e plano ainda não aprovados ficam no condicional: "daria", "permitiria", "alcançaria". Nunca no futuro certo, e nunca com detalhe que o pacote não dá (quem criou, quando começa).
- Quando o pacote traz o outro lado (quem critica, quem se opõe, quem defende o contrário), ele entra, com o nome de quem disse.
- Órgão, comissão ou cargo com nome em inglês vira descrição em português e em minúscula: "a câmara municipal", "a força-tarefa do prefeito sobre data centers". O nome próprio de pessoa, empresa e entidade fica como está. Tratamento em inglês antes do nome (Ald., Gov., Sen.) vira o cargo em português: "o vereador Bill Conway".
- O bloco "O que isso significa para quem olha para os EUA" só existe quando o pacote diz o efeito. Sem isso, fica vazio, e vazio é o certo.
- O tamanho é o que o pacote rende, entre 500 e 900 palavras no total. Nunca encha: matéria curta e certa vence matéria longa e esticada.
- Sem saudação, sem "bom dia", sem despedida, sem convite a compartilhar. A matéria não é a edição de hoje: ela continua valendo amanhã.
- O tom continua sendo o da casa: fala, não relata. Frase curta, palavra comum primeiro, sigla depois e só se ajudar. Nada de repetir palavra-chave.
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
export function vozesComMemoria(vozes: VozesDosRamos, blocos: Partial<Record<Ramo, string>>): VozesDosRamos {
  const juntar = (voz: string, bloco: string | undefined) => {
    const b = (bloco ?? "").trim();
    if (!b) return voz;
    return voz ? `${voz}\n\n${b}` : b;
  };
  const saida = {
    newsletter: juntar(vozes.newsletter, blocos.newsletter),
    artigo: juntar(vozes.artigo, blocos.artigo),
    post: juntar(vozes.post, blocos.post),
  };
  return saida.newsletter === vozes.newsletter && saida.artigo === vozes.artigo && saida.post === vozes.post
    ? vozes
    : saida;
}

/**
 * As vozes do projeto, com a memória de reprovação só quando a fila existe.
 *
 * Fila em `off`: a memória nem é lida, e as vozes são as de `vozesDosRamos`,
 * byte a byte. Fora de `off` (inclusive `dry_run`, que já registra
 * reprovações), cada voz recebe no fim o bloco do SEU canal (06/10/2026):
 * os erros recentes da etapa "texto" e as regras fixas aprovadas daquele
 * canal, e os exemplos aprovados de primeira daquele canal. Até esta data o
 * bloco era um só para as três, e o erro da legenda do post entrava na voz da
 * newsletter. Falha de leitura já devolve vazio dentro de cada leitor.
 */
export async function vozesDosRamosComMemoria(
  projeto: ProjetoComCapacidades & { id: string },
  deps: {
    vozes?: (projetoId: string) => Promise<VozesDosRamos>;
    memoria?: (projetoId: string, ramo: Ramo, etapa: "texto") => Promise<string>;
    exemplos?: (projetoId: string, ramo: Ramo) => Promise<string>;
  } = {},
): Promise<VozesDosRamos> {
  const vozes = await (deps.vozes ?? vozesDosRamos)(projeto.id);
  if (modoDaFila(projeto) === "off") return vozes;
  const memoria = deps.memoria ?? ((id: string, ramo: Ramo, etapa: "texto") => errosRecentesDaEtapa(id, ramo, etapa));
  const exemplos =
    deps.exemplos ??
    (async (id: string, ramo: Ramo) => {
      const [{ exemplosAprovadosDoCanal }, { criarFilaStore }, { getSupabaseAdminClient }] = await Promise.all([
        import("../aprendizado/exemplos"),
        import("../aprovacao/fila-store"),
        import("../supabase-admin"),
      ]);
      return exemplosAprovadosDoCanal(criarFilaStore(getSupabaseAdminClient()), id, ramo);
    });
  const blocos: Partial<Record<Ramo, string>> = {};
  await Promise.all(
    RAMOS.map(async (ramo) => {
      const [naoRepetir, aprovados] = await Promise.all([memoria(projeto.id, ramo, "texto"), exemplos(projeto.id, ramo)]);
      // A correção antes do exemplo: o que não fazer pesa mais que o que imitar.
      blocos[ramo] = [naoRepetir, aprovados].map((b) => b.trim()).filter(Boolean).join("\n\n");
    }),
  );
  return vozesComMemoria(vozes, blocos);
}
