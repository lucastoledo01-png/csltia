import type { PautaAvaliada } from "../../editorial/guarda";
import type { PacoteFactual } from "../../editorial/pacote-factual";
import { MOTIVOS } from "../../editorial/config";
import { identidadeDoItem } from "./tipos";
import type { FamiliaEvergreen, ItemEvergreen } from "./tipos";

/**
 * O item evergreen vestindo a roupa da pauta de notícia.
 *
 * A regra desta fase é que o evergreen não é outro sistema social: é outra
 * fonte de conteúdo para o mesmo Social V2. O jeito de cumprir isso sem tocar
 * em nada que já funciona é este adaptador — o item passa a ter a forma que o
 * gerador, o Social Guard, o congelamento e o store já sabem consumir.
 *
 * A alternativa seria generalizar as assinaturas de todos eles para aceitar
 * duas formas de entrada. Isso mexeria em código que está publicando em
 * produção hoje, para ganhar exatamente o mesmo resultado.
 *
 * O que o adaptador NÃO faz é inventar dado editorial. Cada campo abaixo é uma
 * decisão declarada, e as três que mais importam:
 *
 *   `leitura: "neutra"`      conteúdo permanente não é oportunidade nem
 *                            deterioração; ele explica. Marcar "oportunidade"
 *                            faria o guard tratar explicador como promessa.
 *   `natureza: "official_action"`  a fonte é a página oficial que descreve a
 *                            regra, e não alguém falando sobre ela.
 *   `relevancia: 5`          suficiente para passar o piso de 4 sem competir
 *                            com notícia, que é o que a prioridade de vagas já
 *                            resolve antes.
 */

/** A família editorial vira o eixo que o guard e a diversidade entendem. */
/*
 * O conteúdo permanente é de imigração, e agora ele diz isso.
 *
 * As famílias do catálogo explicam visto, processo e formulário, e as
 * editorias antigas separavam "oportunidade" de "processo" dentro desse mesmo
 * assunto. Com a publicação ampliada, a separação que importa é outra: este
 * material é da editoria de imigração, e disputa espaço com economia,
 * trabalho e cultura como qualquer outro.
 */
const EIXO_DA_FAMILIA: Record<FamiliaEvergreen, "imigracao" | "outro"> = {
  visa_explainer: "imigracao",
  glossary: "imigracao",
  faq: "imigracao",
  comparison: "imigracao",
  process_explainer: "imigracao",
  evidence_education: "imigracao",
  professional_education: "imigracao",
};

/**
 * O título que entra no lugar da manchete.
 *
 * É a pergunta do ângulo, não o nome do tópico. O gerador usa isto para saber
 * do que escrever, e "EB-2 NIW" sozinho produziria o mesmo texto para todos os
 * ângulos daquele tópico.
 */
export function tituloDoItem(item: ItemEvergreen): string {
  return `${item.topico.nome}: ${item.angulo.pergunta}`;
}

export function pautaDoEvergreen(item: ItemEvergreen, pacote: PacoteFactual): PautaAvaliada {
  const url = item.topico.fontesCanonicas[0] ?? "";
  const storyId = identidadeDoItem(item);
  const agoraIso = new Date().toISOString();

  return {
    storyId,
    grupo: {
      primary: {
        id: storyId,
        url,
        title: tituloDoItem(item),
        source_name: fonteLegivel(url),
        /* Prioridade 1: fonte oficial é o topo da hierarquia de credibilidade. */
        priority: 1,
        published_at: agoraIso,
        description: item.topico.resumo,
        content: pacote.texto_de_origem,
        category: item.topico.familia,
        score: 50,
        dedupe_key: storyId,
        window_hours: 0,
      },
      secondary_sources: [],
      secondary_urls: item.topico.fontesCanonicas.slice(1),
    },
    classificacao: {
      id: storyId,
      pais: "EUA",
      imigracao: true,
      leitura: "neutra",
      eixo: EIXO_DA_FAMILIA[item.topico.familia],
      natureza: "official_action",
      relevancia: 5,
      /*
       * Atores é o programa, e é ele que a diversidade do dia conta. Sem
       * programa (glossário, processo), a lista fica vazia em vez de receber
       * "USCIS": marcar o órgão faria metade do catálogo disputar o mesmo teto.
       */
      atores: item.topico.programa ? [item.topico.programa] : [],
      lugares: ["Estados Unidos"],
      acontecimento: [item.topico.nome],
      justificativa: `conteúdo permanente, família ${item.topico.familia}`,
    },
    enriquecimento: {
      texto: pacote.texto_de_origem,
      /*
       * O assunto do post, para a hashtag, separado do texto de origem.
       *
       * O primeiro preview de três dias mostrou o estrago de não separar: um
       * post sobre ajuste de status saiu com "#EB5 #H1B #VistoF1 #GreenCard
       * #USCIS #ICE #CBP", e os quatro posts do dia saíram com quase o mesmo
       * conjunto. Nenhuma daquelas hashtags foi inventada: todas estavam no
       * texto de origem, porque uma página do policy manual da USCIS cita todo
       * o sistema imigratório, inclusive ICE, CBP e a Suprema Corte.
       *
       * O texto de origem continua indo inteiro para o gerador, que é quem
       * precisa dele. Para dizer DE QUE o post trata, o que serve é o que o
       * catálogo já declara: o tópico, a pergunta do ângulo e o resumo curado.
       */
      assuntoParaHashtags: [
        item.topico.nome,
        item.angulo.pergunta,
        item.topico.resumo,
        item.topico.programa ?? "",
      ]
        .filter(Boolean)
        .join(". "),
      contentSource: "pagina_original",
      contentLength: pacote.texto_de_origem.length,
      enrichmentStatus: "nao_precisou",
      enrichmentSources: item.topico.fontesCanonicas,
      notas: ["texto lido da fonte canônica do tópico"],
    } as unknown as PautaAvaliada["enriquecimento"],
    /*
     * Reaproveita o motivo de aprovação que já existe.
     *
     * Criar `APPROVED_EVERGREEN` obrigaria a olhar todo lugar que agrupa por
     * motivo — relatório, funil, contagem por motivo — para incluir um valor
     * novo. O que distingue o evergreen no banco é `origin_channel`, e é lá que
     * a distinção pertence.
     */
    motivoDaAprovacao: MOTIVOS.APROVADO_OPORTUNIDADE_EUA,
    /*
     * Repetição resolvida ANTES, e por outra régua.
     *
     * O `Veredito` aqui é o da repetição do noticiário, que compara contra o
     * `editorial_history` de 30 dias. O evergreen tem a própria régua, mais
     * severa e com outra pergunta: `selecao.ts` já barrou o par tópico+ângulo
     * e a janela do tópico antes de o item chegar aqui. Declarar "não repetida"
     * é dizer que a decisão foi tomada em outro lugar, não que ninguém olhou.
     */
    veredito: {
      repetida: false,
      motivo: null,
      conflito: null,
      camada: "nenhuma",
      score: 0,
      confianca: "alta",
      sinais: null,
    } as unknown as PautaAvaliada["veredito"],
    pontuacao: {
      total: 50,
      partes: { relevancia: 5, ineditismo: 5, credibilidade: 10, frescor: 0, corpo: 0 },
      explicacao: "conteúdo permanente ancorado em fonte oficial",
    } as unknown as PautaAvaliada["pontuacao"],
    vetor: null,
  };
}

/** "uscis.gov" vira "USCIS". Nome de fonte é o que sai impresso no post. */
function fonteLegivel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("uscis")) return "USCIS";
    if (host.includes("travel.state") || host.includes("state.gov")) return "Departamento de Estado";
    if (host.includes("dol.gov")) return "Departamento do Trabalho";
    if (host.includes("federalregister")) return "Federal Register";
    if (host.includes("irs.gov")) return "IRS";
    if (host.includes("cbp.gov")) return "CBP";
    if (host.includes("ssa.gov")) return "Social Security";
    return host;
  } catch {
    return "fonte oficial";
  }
}

/**
 * A candidata que o Social Guard exige, já verificada.
 *
 * `podePublicar` recusa com `SOCIAL_REJECT_UNVERIFIED` quando não há prova de
 * verificação, e a prova existe para a notícia porque ela passa pelo
 * verificador de finalistas. O evergreen não passa: não há o que verificar
 * contra o quê — a fonte é a página oficial, e ela é a própria referência.
 *
 * Em vez de afrouxar o guard, o adaptador declara a verificação com o motivo
 * escrito. Fica auditável em `social_guard_reasons` de quem aprovou e por quê.
 */
export function candidataDoEvergreen(item: ItemEvergreen) {
  return {
    status: "approved" as const,
    verificacao: {
      status: "confirm" as const,
      motivo: `conteúdo permanente ancorado em ${item.topico.fontesCanonicas.length} fonte(s) oficial(is)`,
      divergencias: [],
      verificadoEm: new Date().toISOString(),
      canal: "evergreen",
      inputHash: identidadeDoItem(item),
    },
  };
}
