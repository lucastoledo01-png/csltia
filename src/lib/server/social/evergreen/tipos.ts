import type { EditoriaId } from "../../../editorias";

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

/**
 * As famílias editoriais. O tipo de conteúdo sai da família.
 *
 * Até 05/10/2026 eram sete, e três só existiam para visto (`visa_explainer`,
 * `evidence_education`, `professional_education`). O catálogo novo explica
 * como as coisas funcionam nos EUA, e cinco formas bastam: explicar, definir,
 * responder, comparar e mostrar as etapas.
 */
export type FamiliaEvergreen =
  | "explainer"
  | "glossary"
  | "faq"
  | "comparison"
  | "process_explainer";

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
  /**
   * A editoria do portal a que o assunto pertence (06/10/2026).
   *
   * É dela que sai o eixo da pauta, e portanto o chapéu da arte, a gramática
   * e a diversidade do feed. Antes o eixo saía da família, e toda família era
   * de imigração.
   */
  editoria: EditoriaId;
  /**
   * De um a três temas da lista fechada de `src/lib/temas.ts`, pelo slug.
   *
   * Tema novo não nasce aqui: entra na lista por decisão editorial, e o teste
   * do catálogo recusa slug que não existe lá.
   */
  temas: string[];
  /**
   * O termo que identifica o assunto, escrito como nos EUA ("401(k)", "FOMC",
   * "sales tax"). Serve à diversidade do dia e à conferência de cobertura, e
   * NÃO vai para a busca de foto.
   */
  programa?: string;
  /**
   * A instituição nomeada que o assunto cita, quando há uma ("Federal
   * Reserve", "Internal Revenue Service"). É o que vai como ator da
   * classificação, e por isso o que a busca de foto procura.
   *
   * Separado de `programa` pela lição da sigla PERM (17/09/2026): o código do
   * programa ia como ator, virou busca de entidade e achou uma cidade russa.
   * Órgão tem fachada e acervo; termo técnico não tem.
   */
  entidade?: string;
  resumo: string;
  /**
   * Fontes oficiais que sustentam o assunto.
   *
   * Só os domínios de `DOMINIOS_CANONICOS`, em `grounding.ts`: órgãos federais
   * americanos, sites .gov de estado e, para o contraste com o Brasil, gov.br.
   * Notícia não ancora regra permanente: uma matéria de hoje descreve o estado
   * de hoje, e o evergreen afirma o que vale em geral.
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
