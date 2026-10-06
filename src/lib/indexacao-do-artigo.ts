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

import { editoriaPeloId, editoriaPeloNome, type EditoriaId } from "./editorias";
import { temaPeloNome, temasNoTexto } from "./temas";

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

/** Teto da fileira "Assuntos" e de `keywords` (decisão do dono, 06/10/2026). */
export const LIMITE_DE_ASSUNTOS = 5;
/**
 * Piso da fileira "Assuntos" (auditoria de SEO, 05/10/2026), e piso que NÃO
 * inventa: a matéria que não chega a dois com o que o texto sustenta sai com o
 * que tem, e o ramo registra o aviso. Medido no banco nesta data: 61 das 62
 * matérias publicadas tinham zero assuntos, e uma fileira de um item só não
 * agrupa nada nem diz ao buscador de que a página trata.
 */
export const MINIMO_DE_ASSUNTOS = 2;
/** Entidades ocupam no máximo isto da fileira, para sobrar lugar a um tema. */
const LIMITE_DE_ENTIDADES_NOS_ASSUNTOS = 3;
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

/**
 * As tags de indexação, prontas para juntar às outras de `tags`.
 *
 * Os assuntos passam pelo validador AQUI TAMBÉM, contra as entidades que vão
 * junto: quem grava não consegue gravar "água" nem que esqueça de validar.
 */
export function tagsDeIndexacao(ix: IndexacaoDaMateria): string[] {
  const assuntos = validarAssuntos(ix.assuntos, { entidades: ix.entidades, incluirSobre: false }).assuntos.map((a) => `assunto:${limpo(a)}`);
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
  /**
   * O texto FINAL da matéria. Presente, só entra quem ele nomeia, e o filtro
   * vem antes do teto: citado que a poda tirou não ocupa lugar de quem ficou.
   */
  textoFinal?: string,
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
  const presentes = textoFinal === undefined ? saida : entidadesPresentesNoTexto(saida, textoFinal);
  const sobre = presentes.filter((e) => e.papel === "sobre");
  const mencoes = presentes.filter((e) => e.papel === "menciona").slice(0, LIMITE_DE_MENCOES);
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

/* ------------------------------------------------------------------ */
/* O validador de assuntos (06/10/2026)                                */
/* ------------------------------------------------------------------ */

/**
 * Palavras que já apareceram, ou apareceriam, como assunto e não dizem nada
 * sozinhas. A lista NÃO é a regra: a regra é "entidade ou tema da lista
 * fechada, e nada mais". A lista só dá ao descarte um motivo legível no log.
 */
export const ASSUNTOS_GENERICOS = new Set(
  [
    "água", "energia", "governo", "economia", "política", "tecnologia", "trabalho", "dinheiro", "mercado",
    "saúde", "educação", "segurança", "cidade", "cidades", "país", "estado", "estados", "empresa", "empresas",
    "negócios", "sociedade", "cultura", "meio ambiente", "ambiente", "clima", "notícia", "notícias", "pessoas",
    "preços", "preço", "custo", "custos", "lei", "leis", "justiça", "eleição", "emprego", "crise", "investimento",
    "investimentos", "imposto", "impostos", "inflação", "juros", "regras", "regulação", "proposta", "propostas",
    "moradores", "comunidade", "infraestrutura", "indústria", "setor", "consumo", "eletricidade", "ar", "contas",
    "brasil", "eua", "estados unidos", "américa", "mundo", "internacional", "local", "nacional", "futuro",
  ].map((t) => chave(t)),
);

export type AssuntoDescartado = { termo: string; motivo: "genérico" | "fora da lista" | "repetido" | "acima do teto" };

export type AssuntosValidados = {
  /** No máximo cinco: entidades primeiro, depois temas da lista, sem repetição. */
  assuntos: string[];
  /** O que o validador tirou, com o motivo, para quem chamou registrar. */
  descartados: AssuntoDescartado[];
  /** Menos que `MINIMO_DE_ASSUNTOS` mesmo depois de completar: vira aviso, nunca invenção. */
  abaixoDoMinimo: boolean;
};

export type ContextoDosAssuntos = {
  /** As entidades da matéria (do pacote e do resolvedor), JÁ filtradas pelo texto final. */
  entidades?: readonly Pick<EntidadeDaMateria, "nome" | "papel">[];
  /** Editoria da matéria: desempata os temas achados no texto. Id ou nome gravado. */
  editoria?: EditoriaId | string | null;
  /** Texto final da matéria: temas da lista que ele trata entram mesmo sem proposta. */
  texto?: string;
  /** A entidade central (`sobre`) entra sozinha na fileira. Padrão: sim. */
  incluirSobre?: boolean;
  /**
   * Abaixo do piso, completa com as entidades CITADAS (`menciona`) que o
   * texto final nomeia, na ordem do pacote, sem passar do teto de entidades.
   * Só quem escreve liga isto; a página não completa nada na leitura.
   */
  completarAteOMinimo?: boolean;
};

function idDaEditoria(e: ContextoDosAssuntos["editoria"]): EditoriaId | null {
  if (!e) return null;
  return (editoriaPeloId(e) ?? editoriaPeloNome(e))?.id ?? null;
}

/**
 * Quem decide os assuntos da matéria. O modelo PROPÕE; isto decide.
 *
 * Fica só o que é:
 *   - entidade nomeada da matéria (a forma gravada é o nome da entidade), ou
 *   - tema do vocabulário fechado de `temas.ts` (a forma gravada é o nome do tema).
 *
 * Todo o resto sai em silêncio para o leitor e com motivo para o log:
 * palavra genérica solta ("água", "energia", "governo"), termo fora da lista,
 * repetição e o que passa de cinco. A ordem é entidades primeiro (no máximo
 * três, a central antes), depois os temas propostos, depois os temas que o
 * texto trata.
 */
export function validarAssuntos(propostos: readonly string[] | null | undefined, ctx: ContextoDosAssuntos = {}): AssuntosValidados {
  const descartados: AssuntoDescartado[] = [];
  const nomesDeEntidade = new Map<string, string>();
  for (const e of ctx.entidades ?? []) {
    const k = chave(e.nome);
    if (k && !nomesDeEntidade.has(k)) nomesDeEntidade.set(k, limpo(e.nome));
  }

  const entidades: string[] = [];
  const temas: string[] = [];
  const vistos = new Set<string>();
  const juntar = (lista: string[], forma: string, termo: string): void => {
    const k = chave(forma);
    if (vistos.has(k)) {
      descartados.push({ termo, motivo: "repetido" });
      return;
    }
    vistos.add(k);
    lista.push(forma);
  };

  if (ctx.incluirSobre !== false) {
    for (const e of ctx.entidades ?? []) if (e.papel === "sobre" && !vistos.has(chave(e.nome))) juntar(entidades, limpo(e.nome), e.nome);
  }

  for (const bruto of propostos ?? []) {
    if (typeof bruto !== "string") continue;
    const termo = limpo(bruto);
    const k = chave(termo);
    if (!k) continue;
    const entidade = nomesDeEntidade.get(k);
    if (entidade) {
      if (!vistos.has(chave(entidade))) juntar(entidades, entidade, termo);
      continue;
    }
    const tema = temaPeloNome(termo);
    if (tema) {
      if (vistos.has(chave(tema.nome))) descartados.push({ termo, motivo: "repetido" });
      else juntar(temas, tema.nome, termo);
      continue;
    }
    descartados.push({ termo, motivo: ASSUNTOS_GENERICOS.has(k) ? "genérico" : "fora da lista" });
  }

  if (ctx.texto) {
    for (const tema of temasNoTexto(ctx.texto, { editoria: idDaEditoria(ctx.editoria) })) {
      if (!vistos.has(chave(tema.nome))) juntar(temas, tema.nome, tema.nome);
    }
  }

  const fileiraDeEntidades = entidades.slice(0, LIMITE_DE_ENTIDADES_NOS_ASSUNTOS);
  for (const e of entidades.slice(LIMITE_DE_ENTIDADES_NOS_ASSUNTOS)) descartados.push({ termo: e, motivo: "acima do teto" });

  // O piso (05/10/2026): completa com quem o texto cita, nunca com palavra nova.
  if (ctx.completarAteOMinimo) {
    for (const e of ctx.entidades ?? []) {
      if (fileiraDeEntidades.length + temas.length >= MINIMO_DE_ASSUNTOS) break;
      if (fileiraDeEntidades.length >= LIMITE_DE_ENTIDADES_NOS_ASSUNTOS) break;
      const forma = limpo(e.nome);
      const k = chave(forma);
      if (!k || vistos.has(k)) continue;
      vistos.add(k);
      fileiraDeEntidades.push(forma);
    }
  }

  const todos = [...fileiraDeEntidades, ...temas];
  for (const t of todos.slice(LIMITE_DE_ASSUNTOS)) descartados.push({ termo: t, motivo: "acima do teto" });
  const assuntos = todos.slice(0, LIMITE_DE_ASSUNTOS);
  return { assuntos, descartados, abaixoDoMinimo: assuntos.length < MINIMO_DE_ASSUNTOS };
}

/** Uma linha de log por descarte, no formato que os scripts e o ramo imprimem. */
export function descreverDescartes(descartados: readonly AssuntoDescartado[]): string[] {
  return descartados.map((d) => `ASSUNTO DESCARTADO "${d.termo}": ${d.motivo}`);
}

/** O texto de um HTML, sem marcação, para conferir presença de nome. */
export function textoDoHtml(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[e] ?? " ");
}

/**
 * Só as entidades que o TEXTO FINAL nomeia, sem acento nem caixa.
 *
 * O pacote factual lista quem a fonte cita, e a poda e o redator tiram
 * gente do texto: a matéria de Chicago marcava Trump em `mentions` sem
 * nenhuma linha sobre ele. `about` e `mentions` dizem ao buscador de quem a
 * página fala; quem a página não nomeia não entra.
 */
export function entidadesPresentesNoTexto<T extends Pick<EntidadeDaMateria, "nome">>(entidades: readonly T[], texto: string): T[] {
  const alvo = ` ${chave(texto)} `;
  return entidades.filter((e) => {
    const k = chave(e.nome);
    return k !== "" && alvo.includes(` ${k} `);
  });
}

/**
 * A indexação que a PÁGINA usa: a das tags, com as entidades filtradas pelo
 * texto do corpo e os assuntos passados de novo pelo validador. Linha antiga
 * com "água" gravado não mostra "água", mesmo antes de ser reescrita.
 *
 * É a única porta de leitura da fileira "Assuntos" e do JSON-LD; ler
 * `indexacaoDasTags` direto na página é contornar o validador.
 */
export function indexacaoValidadaDoArtigo(a: {
  title?: string | null;
  content_html?: string | null;
  /** O formato antigo, em seções, para a matéria sem HTML. */
  content?: ReadonlyArray<{ heading?: string; paragraphs?: readonly string[] }> | null;
  category?: string | null;
  tags?: readonly string[] | null;
}): IndexacaoDaMateria {
  const bruta = indexacaoDasTags(a.tags);
  // "Leia também" e "Fontes" nomeiam OUTRAS matérias e o veículo: não contam como menção desta.
  const corpo = (a.content_html ?? "").replace(/<section class="(?:leia-tambem|fontes)">[\s\S]*?<\/section>/g, " ");
  const secoes = (a.content_html?.trim() || !Array.isArray(a.content) ? [] : a.content).map((s) => `${s.heading ?? ""} ${(s.paragraphs ?? []).join(" ")}`);
  const texto = [a.title ?? "", textoDoHtml(corpo), ...secoes].join("\n");
  const entidades = entidadesPresentesNoTexto(bruta.entidades, texto);
  const { assuntos } = validarAssuntos(bruta.assuntos, { entidades, editoria: a.category ?? null, incluirSobre: false });
  return { assuntos, entidades };
}
