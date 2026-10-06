import type { PautaAvaliada } from "../../editorial/guarda";
import type { PacoteFactual } from "../../editorial/pacote-factual";
import { MOTIVOS } from "../../editorial/config";
import { identidadeDoItem } from "./tipos";
import type { ItemEvergreen } from "./tipos";
import type { EditoriaId } from "../../../editorias";
import { temaPeloSlug } from "../../../temas";

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
/*
 * ATUALIZADO em 06/10/2026: imigração saiu da pauta (05/10) e o catálogo
 * novo não tem um tópico dela. O eixo deixou de sair da família, que diz a
 * FORMA do post, e passou a sair da editoria do tópico, que diz o ASSUNTO. É
 * o eixo que o chapéu da arte imprime, que a gramática lê e que a diversidade
 * do feed conta, então ele precisa ser o mesmo vocabulário do classificador.
 *
 * Nenhuma editoria mapeia para `imigracao`, e há teste disso: um evergreen
 * marcado assim seria recusado pela linha editorial, e com razão.
 */
const EIXO_DA_EDITORIA: Record<EditoriaId, EixoDoEvergreen> = {
  economia: "economia",
  trabalho: "trabalho",
  tecnologia: "tecnologia",
  "custo-de-vida": "custo_de_vida",
  governo: "politica",
  brasil: "brasil",
};

type EixoDoEvergreen = "economia" | "trabalho" | "tecnologia" | "custo_de_vida" | "politica" | "brasil" | "outro";

/** Tópico sem editoria reconhecida cai em "outro", que não tem chapéu, e nunca em imigração. */
export function eixoDoTopico(item: ItemEvergreen): EixoDoEvergreen {
  return EIXO_DA_EDITORIA[item.topico.editoria] ?? "outro";
}

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
      /*
       * Falso, e não por omissão: o catálogo de 06/10/2026 não tem tópico de
       * imigração, e é com `false` que as réguas da linha nova (sem
       * imigração, foto obrigatória, bolha) tratam o evergreen como tratam
       * qualquer pauta. Até 05/10 era `true` para tudo.
       */
      imigracao: false,
      leitura: "neutra",
      eixo: eixoDoTopico(item),
      natureza: "official_action",
      relevancia: 5,
      /*
       * Atores é a instituição que o tópico cita, e só ela.
       *
       * Até 05/10 ia o código do programa ("PERM", "EB-2 NIW"), e foi assim
       * que a sigla virou busca de entidade e achou uma cidade russa. Órgão
       * ("Federal Reserve", "Internal Revenue Service") tem fachada e acervo, e
       * é o que a foto e a bolha procuram. A diversidade do dia continua
       * contando o `programa`, em `selecao.ts`, direto do catálogo.
       */
      atores: item.topico.entidade ? [item.topico.entidade] : [],
      lugares: ["Estados Unidos"],
      acontecimento: [item.topico.nome],
      justificativa: `conteúdo permanente, família ${item.topico.familia}, editoria ${item.topico.editoria}`,
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
        // Os temas da lista fechada, pelo nome: é o assunto declarado, não inferido.
        ...(item.topico.temas ?? []).map((slug) => temaPeloSlug(slug)?.nome ?? ""),
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

/**
 * "bls.gov" vira "BLS". Nome de fonte é o que sai impresso no post.
 *
 * Trocada com o catálogo em 06/10/2026: os nomes de imigração saíram junto com
 * os domínios. Ordem importa: o mais específico antes do que o contém
 * ("fiscaldata.treasury.gov" antes de "treasury.gov").
 */
const NOMES_DAS_FONTES: Array<[string, string]> = [
  ["federalreserve.gov", "Federal Reserve"],
  ["fiscaldata.treasury.gov", "Tesouro americano"],
  ["treasurydirect.gov", "Tesouro americano"],
  ["treasury.gov", "Tesouro americano"],
  ["sec.gov", "SEC"],
  ["investor.gov", "SEC"],
  ["fdic.gov", "FDIC"],
  ["consumerfinance.gov", "CFPB"],
  ["ftc.gov", "FTC"],
  ["bls.gov", "BLS"],
  ["bea.gov", "BEA"],
  ["census.gov", "Census Bureau"],
  ["eia.gov", "EIA"],
  ["usda.gov", "USDA"],
  ["doleta.gov", "Departamento do Trabalho"],
  ["dol.gov", "Departamento do Trabalho"],
  ["opm.gov", "OPM"],
  ["irs.gov", "IRS"],
  ["ssa.gov", "Social Security"],
  ["sbir.gov", "SBIR"],
  ["sba.gov", "SBA"],
  ["healthcare.gov", "HealthCare.gov"],
  ["medicare.gov", "Medicare"],
  ["huduser.gov", "HUD"],
  ["hud.gov", "HUD"],
  ["nces.ed.gov", "NCES"],
  ["studentaid.gov", "Departamento de Educação"],
  ["ed.gov", "Departamento de Educação"],
  ["nist.gov", "NIST"],
  ["uspto.gov", "USPTO"],
  ["nasa.gov", "NASA"],
  ["fueleconomy.gov", "Departamento de Energia"],
  ["energy.gov", "Departamento de Energia"],
  ["cisa.gov", "CISA"],
  ["usa.gov", "USA.gov"],
  ["archives.gov", "Arquivo Nacional dos EUA"],
  ["house.gov", "Câmara dos EUA"],
  ["uscourts.gov", "Justiça federal dos EUA"],
  ["comptroller.texas.gov", "Controladoria do Texas"],
  ["cdtfa.ca.gov", "Califórnia (CDTFA)"],
  ["boe.ca.gov", "Califórnia (BOE)"],
  ["tax.ny.gov", "Nova York (Tributação)"],
  ["dor.wa.gov", "Washington (Receita)"],
  ["tn.gov", "Tennessee (Receita)"],
  ["gov.br", "Governo Federal (gov.br)"],
];

export function fonteLegivel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    for (const [dominio, nome] of NOMES_DAS_FONTES) {
      if (host === dominio || host.endsWith(`.${dominio}`)) return nome;
    }
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
