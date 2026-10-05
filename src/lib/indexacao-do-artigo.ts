/**
 * Assuntos e entidades da matéria, guardados em `articles.tags` (06/10/2026).
 *
 * A tabela não tem coluna de metadado em JSON, e o dono não quer DDL agora.
 * `tags` já carrega marcador com prefixo (`origem:edicao-...`, do desmonte das
 * edições), então os dois novos entram no mesmo jeito:
 *
 *   assunto:<texto>                      tema para `keywords` e para a fileira "Assuntos"
 *   sobre:<Tipo>:<nome>[|<sameAs>]       entidade central, vai para `about`
 *   menciona:<Tipo>:<nome>[|<sameAs>]    entidade citada, vai para `mentions`
 *
 * <Tipo> é Person, Organization ou Place (schema.org). `sameAs` só existe
 * quando o resolvedor do Wikidata do projeto devolveu um QID com confiança;
 * nunca é escrito à mão.
 *
 * Sem meta keywords: nenhum buscador lê, e o dono pediu para não ter.
 * Puro e sem servidor, porque a página e os scripts usam igual.
 */

export const TIPOS_DE_ENTIDADE = ["Person", "Organization", "Place"] as const;
export type TipoDeEntidade = (typeof TIPOS_DE_ENTIDADE)[number];

export type EntidadeDaMateria = {
  tipo: TipoDeEntidade;
  nome: string;
  sameAs?: string;
  papel: "sobre" | "menciona";
};

export type IndexacaoDaMateria = {
  assuntos: string[];
  entidades: EntidadeDaMateria[];
};

const LIMITE_DE_ASSUNTOS = 6;
const LIMITE_DE_MENCOES = 10;

function limpo(s: string): string {
  return s.replace(/[|\n\r]/g, " ").replace(/\s+/g, " ").trim();
}

function chave(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** As tags de indexação, prontas para juntar às outras de `tags`. */
export function tagsDeIndexacao(ix: IndexacaoDaMateria): string[] {
  const assuntos = ix.assuntos.map(limpo).filter(Boolean).slice(0, LIMITE_DE_ASSUNTOS).map((a) => `assunto:${a}`);
  const entidades = ix.entidades
    .filter((e) => TIPOS_DE_ENTIDADE.includes(e.tipo) && limpo(e.nome))
    .map((e) => `${e.papel}:${e.tipo}:${limpo(e.nome)}${e.sameAs ? `|${e.sameAs}` : ""}`);
  return [...assuntos, ...entidades];
}

/** Lê de volta o que `tagsDeIndexacao` gravou. Tag de outro tipo é ignorada. */
export function indexacaoDasTags(tags: readonly string[] | null | undefined): IndexacaoDaMateria {
  const assuntos: string[] = [];
  const entidades: EntidadeDaMateria[] = [];
  for (const tag of tags ?? []) {
    if (typeof tag !== "string") continue;
    if (tag.startsWith("assunto:")) {
      const a = tag.slice("assunto:".length).trim();
      if (a) assuntos.push(a);
      continue;
    }
    const m = tag.match(/^(sobre|menciona):(Person|Organization|Place):([^|]+)(?:\|(https?:\/\/\S+))?$/);
    if (m) entidades.push({ papel: m[1] as EntidadeDaMateria["papel"], tipo: m[2] as TipoDeEntidade, nome: m[3].trim(), ...(m[4] ? { sameAs: m[4] } : {}) });
  }
  return { assuntos, entidades };
}

/** Tira das tags as de indexação, para regravar sem duplicar. */
export function tagsSemIndexacao(tags: readonly string[] | null | undefined): string[] {
  return (tags ?? []).filter((t) => !/^(assunto|sobre|menciona):/.test(t));
}

/**
 * As entidades do pacote factual, com papel decidido pelo título: a que o
 * título nomeia é o assunto da matéria (`about`); as outras são citadas
 * (`mentions`). Repetida em duas listas do pacote, fica a primeira.
 */
export function entidadesDoPacote(
  pacote: { people?: string[]; organizations?: string[]; places?: string[] },
  titulo: string,
  /** Quem assina e o veículo: estão no pacote pela assinatura, e não são assunto da matéria. */
  excluir: string[] = [],
): EntidadeDaMateria[] {
  const vistos = new Set<string>(excluir.map(chave).filter(Boolean));
  const alvo = ` ${chave(titulo)} `;
  const saida: EntidadeDaMateria[] = [];
  const juntar = (nomes: string[] | undefined, tipo: TipoDeEntidade) => {
    for (const bruto of nomes ?? []) {
      const nome = limpo(bruto);
      const k = chave(nome);
      if (!k || vistos.has(k)) continue;
      vistos.add(k);
      saida.push({ tipo, nome, papel: alvo.includes(` ${k} `) ? "sobre" : "menciona" });
    }
  };
  // Organização e pessoa antes de lugar: uma lista de cidades citadas de
  // passagem não pode empurrar para fora do teto quem fez ou disse algo.
  juntar(pacote.organizations, "Organization");
  juntar(pacote.people, "Person");
  juntar(pacote.places, "Place");
  const sobre = saida.filter((e) => e.papel === "sobre");
  const mencoes = saida.filter((e) => e.papel === "menciona").slice(0, LIMITE_DE_MENCOES);
  return [...sobre, ...mencoes];
}

/** `keywords`, `about` e `mentions` do NewsArticle. Vazio quando não há nada. */
export function camposDeIndexacaoNoJsonLd(ix: IndexacaoDaMateria): Record<string, unknown> {
  const no = (e: EntidadeDaMateria) => ({ "@type": e.tipo, name: e.nome, ...(e.sameAs ? { sameAs: e.sameAs } : {}) });
  const sobre = ix.entidades.filter((e) => e.papel === "sobre").map(no);
  const mencoes = ix.entidades.filter((e) => e.papel === "menciona").map(no);
  return {
    ...(ix.assuntos.length ? { keywords: ix.assuntos } : {}),
    ...(sobre.length ? { about: sobre } : {}),
    ...(mencoes.length ? { mentions: mencoes } : {}),
  };
}
