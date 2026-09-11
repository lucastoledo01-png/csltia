/**
 * Conteúdo que não vence, como estoque editorial.
 *
 * O News V2 depende de quanta notícia útil o dia oferece, e a capacidade
 * medida foi de 0,9 post por dia contra um alvo de 10. O evergreen existe para
 * ocupar as vagas que sobram — nunca para empurrar o dia até 10.
 *
 * A distinção que organiza tudo aqui: TÓPICO é o assunto, ÂNGULO é a pergunta
 * que o post responde. "O que é o EB-2 NIW" e "Entenda o EB-2 NIW" são o mesmo
 * ângulo com dois títulos, e publicar os dois em dias diferentes é o defeito
 * que o catálogo existe para impedir. Já "o que é" e "que tipo de evidência
 * aparece" são ângulos de verdade: mudam o conteúdo, não a embalagem.
 */

/** As seis famílias editoriais. O tipo de conteúdo sai da família. */
export type FamiliaEvergreen =
  | "visa_explainer"
  | "glossary"
  | "faq"
  | "comparison"
  | "process_explainer"
  | "evidence_education"
  | "professional_education";

/** A quem o assunto interessa mais. Vazio quando é geral. */
export type Persona =
  | "medicos"
  | "engenheiros"
  | "pesquisadores"
  | "tecnologia"
  | "executivos"
  | "empreendedores"
  | "estudantes"
  | "familias";

export type AnguloEvergreen = {
  /** Estável: entra na identidade do post e na régua de repetição. */
  id: string;
  /** A pergunta que o post responde, como uma pessoa comum a faria. */
  pergunta: string;
  personas?: Persona[];
};

export type TopicoEvergreen = {
  id: string;
  nome: string;
  familia: FamiliaEvergreen;
  /** Sigla do visto ou programa, quando houver. Serve à diversidade do dia. */
  programa?: string;
  resumo: string;
  /**
   * Fontes oficiais que sustentam o assunto.
   *
   * Só uscis.gov, travel.state.gov, dol.gov, federalregister.gov, irs.gov,
   * state.gov, cbp.gov e ssa.gov. Notícia não ancora regra permanente: uma
   * matéria de hoje descreve o estado de hoje, e o evergreen afirma o que vale
   * em geral.
   */
  fontesCanonicas: string[];
  angulos: AnguloEvergreen[];
};

/** Uma combinação tópico + ângulo, que é a unidade publicável. */
export type ItemEvergreen = {
  topico: TopicoEvergreen;
  angulo: AnguloEvergreen;
};

/**
 * A identidade de um item, e é ela que a régua de repetição persegue.
 *
 * Vai para `story_id` em `social_posts`, o que faz a idempotência do dia e o
 * cooldown de 30 dias funcionarem com as colunas que já existem, sem migration.
 */
export function identidadeDoItem(item: ItemEvergreen): string {
  return `evg:${item.topico.id}:${item.angulo.id}`;
}

/** Vai para `topic_id`. Permite contar o tópico sem depender do ângulo. */
export function topicoDoItem(item: ItemEvergreen): string {
  return `evg:${item.topico.id}`;
}

/** Um uso passado, como o histórico o registra. */
export type UsoAnterior = {
  storyId: string;
  topicId: string;
  quandoIso: string;
};

export function todosOsItens(catalogo: TopicoEvergreen[]): ItemEvergreen[] {
  return catalogo.flatMap((topico) => topico.angulos.map((angulo) => ({ topico, angulo })));
}
