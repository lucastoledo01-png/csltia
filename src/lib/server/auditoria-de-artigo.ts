import { editoriaPeloNome } from "@/lib/editorias";
import { identidadeDaImagem } from "@/lib/imagem-da-capa";
import { contencao, gentilicoDeTerceiroPais, paisNaoIdentificavel } from "./newsroom/leitor";
import { validarAncoragem, type PacoteFactual } from "./editorial/pacote-factual";
import { palavrasChave } from "./editorial/fingerprint";
import {
  dadosEstruturadosDoArtigo,
  perguntasVisiveisDoArtigo,
  urlDoArtigo,
  type ArtigoParaBusca,
} from "./dados-estruturados-do-artigo";

/**
 * A auditoria de uma matéria publicada, determinística (05/10/2026).
 *
 * Nenhuma chamada de modelo: cada conferência é uma régua que dá o mesmo
 * resultado toda vez, diz O QUE está errado e custa zero. É o mesmo motivo de
 * `leitor.ts`. As réguas vêm do projeto, não das skills de SEO, e onde as
 * duas divergem vale o projeto (`.claude/skills/PROCEDENCIA.md`, "Terceira
 * leva"):
 *
 * - título de busca até 60 caracteres, com o país identificável e sem sigla
 *   solta (`modelo-de-titulo.md`, regras 5 e 8); NÃO se exige palavra-chave
 *   no começo, que é o conselho das skills que o modelo de título recusa;
 * - descrição de 120 a 155, única, e que não repete o título (a contenção de
 *   `leitor.ts`, a mesma régua do "cada linha acrescenta");
 * - o lide diz o fato do título nas duas primeiras frases;
 * - intertítulo que descreve, e não rótulo de gaveta ("Contexto");
 * - parágrafo curto, crédito da fonte com link;
 * - de 3 a 5 perguntas, cada resposta sustentada pelo próprio corpo, com a
 *   ancoragem de número, data e nome de `pacote-factual.ts`;
 * - JSON-LD e canônico da página; capa presente, fora do corpo e exclusiva.
 *
 * O peso de cada conferência soma 100. A nota é o que ela dá; a lista de
 * problemas é o que importa.
 */

export type ArtigoAuditavel = ArtigoParaBusca & {
  source_urls?: string[] | null;
};

/** O que a página publicou, quando a auditoria leu a página de verdade. */
export type PaginaLida = {
  jsonLd: unknown[];
  canonical: string | null;
  /** O HTML do corpo como a página serviu, para conferir a foto repetida. */
  html: string;
};

export type ContextoDaAuditoria = {
  /** Quantas matérias usam cada descrição, normalizada. */
  descricoes: Map<string, number>;
  /** Quantas matérias usam cada foto como capa, por identidade. */
  usoDasCapas: Map<string, number>;
  /** A página lida ao vivo. Sem ela, a auditoria usa o que o código desta versão monta. */
  pagina?: PaginaLida | null;
};

export type Checagem = {
  id: string;
  rotulo: string;
  peso: number;
  pontos: number;
  passou: boolean;
  detalhe: string;
};

export type ResultadoDaAuditoria = {
  slug: string;
  titulo: string;
  nota: number;
  checagens: Checagem[];
  problemas: string[];
};

export const TITULO_SEO_MAXIMO = 60;
export const DESCRICAO_MINIMA = 120;
export const DESCRICAO_MAXIMA = 155;
export const PALAVRAS_POR_PARAGRAFO = 80;
export const LIMIAR_DE_REPETICAO = 0.6;
export const LIMIAR_DO_LIDE = 0.5;

/**
 * Siglas que o leitor brasileiro lê sem tropeçar. Fora delas, sigla no título
 * é apontada (regra 5, "sigla nunca sozinha"). A lista é curta de propósito.
 */
const SIGLAS_CONHECIDAS = new Set(["EUA", "US", "IA", "PIB", "CEO", "CEOS", "ONU", "FBI", "TV", "NBA", "NFL", "PIX", "STF", "BC"]);

/** Intertítulo que é rótulo de gaveta, e não diz o que vem embaixo. */
const INTERTITULOS_GENERICOS = new Set([
  "contexto",
  "por que importa",
  "na pratica",
  "visao geral",
  "conclusao",
  "resumo",
  "introducao",
  "saiba mais",
  "entenda",
  "o que muda",
  "o que se sabe",
]);

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

export function textoDeHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z#0-9]+);/gi, (m, nome: string) => ENTIDADES[nome.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function semAcento(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** O corpo sem a seção de perguntas e sem o crédito da fonte: o que sustenta as respostas. */
export function corpoSemPerguntas(html: string): string {
  return html
    .replace(/<section[^>]*>\s*<h2[^>]*>\s*Perguntas e respostas\s*<\/h2>[\s\S]*?<\/section>/gi, "")
    .replace(/<p[^>]*class="(?:fonte|credito-da-foto|legenda-da-capa)"[^>]*>[\s\S]*?<\/p>/gi, "")
    // As seções de serviço do molde de 06/10/2026: lista de links, não texto.
    .replace(/<section[^>]*class="(?:leia-tambem|fontes)"[^>]*>[\s\S]*?<\/section>/gi, "");
}

/** Os parágrafos de texto corrido do corpo, sem crédito e sem linha curta de cromo. */
export function paragrafosDoCorpo(html: string): string[] {
  return [...corpoSemPerguntas(html).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => textoDeHtml(m[1]))
    .filter((t) => t.length >= 40);
}

/**
 * Rótulos fixos do molde de matéria (06/10/2026). São cabeçalho de caixa, não
 * intertítulo de conteúdo: "Fontes" tem uma palavra e seria apontado como
 * rótulo de gaveta, que é exatamente o que ele é, de propósito.
 */
const ROTULOS_DO_MOLDE = new Set(["o que voce precisa saber", "o que isso significa para quem olha para os eua", "leia tambem", "fontes"]);

export function intertitulosDoCorpo(html: string): string[] {
  return [...corpoSemPerguntas(html).matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((m) => textoDeHtml(m[1]))
    .filter((h) => h && !ROTULOS_DO_MOLDE.has(semAcento(h).replace(/[^a-z ]/g, "").trim()));
}

function frases(t: string): string[] {
  return t.split(/(?<=[.!?])\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ"“0-9])/).filter(Boolean);
}

/** Radical de cinco letras: "privado" e "privados" contam como a mesma palavra. */
function radicais(t: string): Set<string> {
  return new Set(palavrasChave(t).map((p) => p.slice(0, 5)));
}

/** Quanto das palavras de `de` aparece em `em`, por radical. */
export function cobertura(de: string, em: string): number {
  const a = radicais(de);
  if (a.size === 0) return 0;
  const b = radicais(em);
  let dentro = 0;
  for (const p of a) if (b.has(p)) dentro += 1;
  return dentro / a.size;
}

export function siglasSoltas(titulo: string): string[] {
  const achadas = new Set<string>();
  for (const m of titulo.matchAll(/\b(?:[A-Z]{1,3}-\d{1,4}[A-Z]?\d?|[A-Z][A-Z&]{1,5})\b/g)) {
    const s = m[0];
    if (!SIGLAS_CONHECIDAS.has(s.toUpperCase())) achadas.add(s);
  }
  return [...achadas];
}

/**
 * O título situa o leitor? A régua de `leitor.ts`, mais a MOEDA, que a regra 8
 * do modelo de título aceita e que a régua de lá não enxerga porque a
 * normalização tira o cifrão ("US$ 8,20 bilhões" situa; "US" sozinho não).
 */
export function paisIdentificavel(titulo: string): boolean {
  return !paisNaoIdentificavel(titulo) || /\b(?:US|R)\$/.test(titulo);
}

export function normalizarDescricao(d: string | null | undefined): string {
  return semAcento((d ?? "").replace(/\s+/g, " ").trim());
}

/** O corpo como pacote factual, para a ancoragem de número, data e nome valer contra ele. */
export function pacoteDoCorpo(corpo: string): PacoteFactual {
  return {
    texto_de_origem: corpo,
    verified_facts: [],
    people: [],
    organizations: [],
    places: [],
    dates: [],
    numbers: [],
    gaps: [],
    source_urls: [],
  };
}

/**
 * A resposta está no corpo? Número, data e nome conferidos pela ancoragem do
 * projeto, e as palavras da resposta cobertas pelo corpo em pelo menos 80%.
 * Devolve o motivo da recusa, ou `null` quando sustenta.
 */
export function motivoDeRespostaSemLastro(resposta: string, corpo: string): string | null {
  const anc = validarAncoragem(resposta, pacoteDoCorpo(corpo));
  const duros = anc.naoSustentadas.filter((c) => c.severidade === "bloqueio");
  if (duros.length > 0) return `sem lastro: ${duros.map((c) => `${c.tipo} "${c.valor}"`).join(", ")}`;
  const avisos = anc.naoSustentadas.filter((c) => c.tipo === "nome");
  if (avisos.length > 0) return `nome fora do corpo: ${avisos.map((c) => `"${c.valor}"`).join(", ")}`;
  const c = cobertura(resposta, corpo);
  if (c < 0.8) return `só ${Math.round(c * 100)}% das palavras da resposta estão no corpo`;
  return null;
}

type NoDoGrafo = Record<string, unknown>;

function nosDoJsonLd(blocos: unknown[]): NoDoGrafo[] {
  const nos: NoDoGrafo[] = [];
  const visitar = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visitar);
    else if (v && typeof v === "object") {
      const o = v as NoDoGrafo;
      if (Array.isArray(o["@graph"])) visitar(o["@graph"]);
      if (o["@type"]) nos.push(o);
    }
  };
  visitar(blocos);
  return nos;
}

function temTipo(n: NoDoGrafo, tipo: string): boolean {
  const t = n["@type"];
  return Array.isArray(t) ? t.includes(tipo) : t === tipo;
}

/** O que falta no JSON-LD da página, item por item. Lista vazia é completo. */
export function faltasNoJsonLd(blocos: unknown[]): string[] {
  const nos = nosDoJsonLd(blocos);
  const materia = nos.find((n) => temTipo(n, "NewsArticle"));
  if (!materia) return ["NewsArticle"];
  const faltas: string[] = [];
  for (const campo of ["headline", "datePublished", "dateModified", "image", "articleSection", "publisher"]) {
    const v = materia[campo];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) faltas.push(campo);
  }
  const autor = materia.author as NoDoGrafo | NoDoGrafo[] | undefined;
  const autores = Array.isArray(autor) ? autor : autor ? [autor] : [];
  // Person desde 06/10/2026: a matéria atribuída a um autor cadastrado sai com ele; sem autor, a Redação (Organization).
  if (!autores.some((a) => (temTipo(a, "Organization") || temTipo(a, "Person")) && typeof a.name === "string")) {
    faltas.push("author Organization ou Person");
  }
  if (!nos.some((n) => temTipo(n, "BreadcrumbList"))) faltas.push("BreadcrumbList");
  return faltas;
}

function checagem(id: string, rotulo: string, peso: number, passou: boolean, detalhe: string, fracao?: number): Checagem {
  const f = fracao ?? (passou ? 1 : 0);
  return { id, rotulo, peso, pontos: Math.round(peso * f * 10) / 10, passou, detalhe };
}

export function auditarMateria(a: ArtigoAuditavel, ctx: ContextoDaAuditoria): ResultadoDaAuditoria {
  const html = a.content_html ?? "";
  const tituloSeo = (a.seo_title || a.title || "").trim();
  const descricao = (a.seo_description || "").trim();
  const corpo = textoDeHtml(corpoSemPerguntas(html));
  const paragrafos = paragrafosDoCorpo(html);
  const c: Checagem[] = [];

  // Título de busca.
  c.push(
    checagem(
      "titulo_seo_tamanho",
      "Título de busca até 60 caracteres",
      8,
      tituloSeo.length >= 20 && tituloSeo.length <= TITULO_SEO_MAXIMO,
      `${tituloSeo.length} caracteres${a.seo_title ? "" : " (sem seo_title, vale o título)"}: "${tituloSeo}"`,
    ),
  );
  c.push(
    checagem(
      "titulo_seo_pais",
      "País identificável no título",
      6,
      paisIdentificavel(tituloSeo),
      paisIdentificavel(tituloSeo) ? "situa o leitor" : "nenhuma marca de país, cidade, órgão ou moeda",
    ),
  );
  const siglas = siglasSoltas(tituloSeo);
  c.push(checagem("titulo_seo_sigla", "Sem sigla solta no título", 3, siglas.length === 0, siglas.length ? `sigla sem explicação: ${siglas.join(", ")}` : "nenhuma"));
  const gentilico = gentilicoDeTerceiroPais(tituloSeo);
  c.push(checagem("titulo_seo_gentilico", "Sem nacionalidade de terceiro país", 3, !gentilico, gentilico ? `"${gentilico}"` : "nenhuma"));

  // Descrição de busca.
  c.push(
    checagem(
      "descricao_tamanho",
      "Descrição de 120 a 155 caracteres",
      6,
      descricao.length >= DESCRICAO_MINIMA && descricao.length <= DESCRICAO_MAXIMA,
      descricao ? `${descricao.length} caracteres` : "sem seo_description",
    ),
  );
  const usos = ctx.descricoes.get(normalizarDescricao(descricao)) ?? 0;
  c.push(checagem("descricao_unica", "Descrição única no site", 4, Boolean(descricao) && usos <= 1, descricao ? `usada em ${usos} matéria(s)` : "sem descrição"));
  const repete = descricao ? contencao(a.title, frases(descricao)[0] ?? descricao) : 1;
  c.push(
    checagem(
      "descricao_nao_repete",
      "Descrição não reescreve o título",
      4,
      Boolean(descricao) && repete < LIMIAR_DE_REPETICAO,
      `${Math.round(repete * 100)}% das palavras do título reaparecem na primeira frase`,
    ),
  );

  // Lide.
  const lide = frases(paragrafos[0] ?? "").slice(0, 2).join(" ");
  const noLide = lide ? cobertura(a.title, lide) : 0;
  c.push(
    checagem(
      "lide_fato",
      "O lide diz o fato do título",
      8,
      noLide >= LIMIAR_DO_LIDE,
      lide ? `${Math.round(noLide * 100)}% das palavras do título nas duas primeiras frases` : "sem parágrafo de abertura",
    ),
  );

  // Intertítulos.
  const intertitulos = intertitulosDoCorpo(html);
  c.push(checagem("intertitulos_presentes", "Intertítulos presentes", 4, intertitulos.length >= 2, `${intertitulos.length} intertítulo(s)`));
  const genericos = intertitulos.filter((h) => INTERTITULOS_GENERICOS.has(semAcento(h).replace(/[^a-z ]/g, "").trim()) || h.split(/\s+/).length < 3);
  c.push(
    checagem(
      "intertitulos_descritivos",
      "Intertítulos descrevem o que vem embaixo",
      4,
      intertitulos.length >= 2 && genericos.length === 0,
      genericos.length ? `rótulo de gaveta: ${genericos.map((g) => `"${g}"`).join(", ")}` : intertitulos.length ? "descritivos" : "sem intertítulo",
    ),
  );

  // Parágrafos.
  const longos = paragrafos.filter((p) => p.split(/\s+/).length > PALAVRAS_POR_PARAGRAFO);
  c.push(
    checagem(
      "paragrafos_curtos",
      `Parágrafos até ${PALAVRAS_POR_PARAGRAFO} palavras`,
      3,
      paragrafos.length > 0 && longos.length === 0,
      longos.length ? `${longos.length} parágrafo(s) longo(s), o maior com ${Math.max(...longos.map((p) => p.split(/\s+/).length))} palavras` : `${paragrafos.length} parágrafo(s)`,
    ),
  );

  // Crédito da fonte.
  const fontes = (a.source_urls ?? []).filter(Boolean);
  const creditoMarcado =
    /<p[^>]*class="fonte"[^>]*>[\s\S]*?<a\b[^>]*href="https?:\/\/[^"]+"/i.test(html) ||
    /<section[^>]*class="fontes"[^>]*>[\s\S]*?<a\b[^>]*href="https?:\/\/[^"]+"/i.test(html);
  const linkParaFonte = fontes.some((u) => html.includes(`href="${u}"`));
  c.push(
    checagem(
      "fonte_com_link",
      "Crédito da fonte com link",
      6,
      creditoMarcado || linkParaFonte,
      creditoMarcado ? "crédito com link" : linkParaFonte ? "link para a fonte no corpo" : fontes.length ? "a fonte está gravada e não aparece com link" : "sem fonte gravada",
    ),
  );

  // Perguntas e respostas.
  const perguntas = perguntasVisiveisDoArtigo(a);
  c.push(checagem("perguntas_presentes", "De 3 a 5 perguntas visíveis", 6, perguntas.length >= 3 && perguntas.length <= 5, `${perguntas.length} pergunta(s)`));
  const semLastro = perguntas
    .map((p) => ({ p, motivo: motivoDeRespostaSemLastro(p.resposta, corpo) }))
    .filter((x) => x.motivo !== null);
  c.push(
    checagem(
      "perguntas_sustentadas",
      "Cada resposta sustentada pelo corpo",
      8,
      perguntas.length > 0 && semLastro.length === 0,
      perguntas.length === 0
        ? "sem perguntas para conferir"
        : semLastro.length
          ? semLastro.map((x) => `"${x.p.pergunta}": ${x.motivo}`).join("; ")
          : `${perguntas.length} de ${perguntas.length} sustentadas`,
    ),
  );

  // Página: JSON-LD e canônico.
  const jsonLd = ctx.pagina ? ctx.pagina.jsonLd : [dadosEstruturadosDoArtigo(a, { perguntasVisiveis: perguntas })];
  const faltas = faltasNoJsonLd(jsonLd);
  const itensDoJsonLd = 8;
  c.push(
    checagem(
      "jsonld_completo",
      "JSON-LD completo (NewsArticle e BreadcrumbList)",
      9,
      faltas.length === 0,
      faltas.length ? `falta: ${faltas.join(", ")}` : "completo",
      faltas.includes("NewsArticle") ? 0 : Math.max(0, (itensDoJsonLd - faltas.length) / itensDoJsonLd),
    ),
  );
  const canonico = ctx.pagina ? ctx.pagina.canonical : urlDoArtigo(a.slug);
  c.push(checagem("canonico", "Canônico aponta para a própria matéria", 3, canonico === urlDoArtigo(a.slug), canonico ?? "sem canônico"));

  // Capa.
  const capa = identidadeDaImagem(a.cover_image);
  c.push(checagem("capa_presente", "Capa presente", 3, Boolean(capa), capa ? "tem capa" : "sem capa: a peça tipográfica aparece"));
  const htmlDaPagina = ctx.pagina ? ctx.pagina.html : "";
  const repetidaNoCorpo =
    Boolean(capa) &&
    [...htmlDaPagina.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].filter((m) => identidadeDaImagem(m[1]) === capa).length > 1;
  c.push(
    checagem(
      "capa_fora_do_corpo",
      "A capa não se repete no corpo",
      4,
      !repetidaNoCorpo,
      ctx.pagina ? (repetidaNoCorpo ? "a mesma foto aparece na capa e no corpo" : "aparece uma vez") : "o molde tira a foto da capa do corpo",
    ),
  );
  const uso = capa ? (ctx.usoDasCapas.get(capa) ?? 1) : 0;
  c.push(
    checagem(
      "capa_exclusiva",
      "A capa não é usada por outra matéria",
      6,
      Boolean(capa) && uso <= 1,
      capa ? (uso <= 1 ? "exclusiva" : `a mesma foto está em ${uso} matérias`) : "sem capa",
    ),
  );

  c.push(
    checagem(
      "editoria_valida",
      "Editoria é uma das do portal",
      2,
      editoriaPeloNome(a.category) !== null,
      `"${a.category ?? ""}"`,
    ),
  );

  const nota = Math.round(c.reduce((s, x) => s + x.pontos, 0));
  return {
    slug: a.slug,
    titulo: a.title,
    nota,
    checagens: c,
    problemas: c.filter((x) => !x.passou).map((x) => `${x.rotulo}: ${x.detalhe}`),
  };
}

/** O contexto do conjunto: descrições repetidas e capas repetidas, contadas uma vez. */
export function contextoDoConjunto(artigos: ArtigoAuditavel[]): Omit<ContextoDaAuditoria, "pagina"> {
  const descricoes = new Map<string, number>();
  const usoDasCapas = new Map<string, number>();
  for (const a of artigos) {
    const d = normalizarDescricao(a.seo_description);
    if (d) descricoes.set(d, (descricoes.get(d) ?? 0) + 1);
    const capa = identidadeDaImagem(a.cover_image);
    if (capa) usoDasCapas.set(capa, (usoDasCapas.get(capa) ?? 0) + 1);
  }
  return { descricoes, usoDasCapas };
}

export type ResumoDaAuditoria = {
  auditadas: number;
  notaMedia: number;
  falhasPorChecagem: Array<{ id: string; rotulo: string; falhas: number }>;
  compartilhamCapa: number;
  fotosRepetidas: Array<{ identidade: string; usos: number }>;
};

export function resumirAuditoria(resultados: ResultadoDaAuditoria[], usoDasCapas: Map<string, number>): ResumoDaAuditoria {
  const falhas = new Map<string, { rotulo: string; falhas: number }>();
  for (const r of resultados) {
    for (const ch of r.checagens) {
      const atual = falhas.get(ch.id) ?? { rotulo: ch.rotulo, falhas: 0 };
      if (!ch.passou) atual.falhas += 1;
      falhas.set(ch.id, atual);
    }
  }
  const fotosRepetidas = [...usoDasCapas.entries()].filter(([, n]) => n > 1).map(([identidade, usos]) => ({ identidade, usos })).sort((a, b) => b.usos - a.usos);
  return {
    auditadas: resultados.length,
    notaMedia: resultados.length ? Math.round((resultados.reduce((s, r) => s + r.nota, 0) / resultados.length) * 10) / 10 : 0,
    falhasPorChecagem: [...falhas.entries()].map(([id, v]) => ({ id, ...v })).filter((x) => x.falhas > 0).sort((a, b) => b.falhas - a.falhas),
    compartilhamCapa: fotosRepetidas.reduce((s, f) => s + f.usos, 0),
    fotosRepetidas,
  };
}

function celula(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Um bloco do relatório em Markdown: resumo, tabela de notas e os problemas de cada matéria. */
export function relatorioEmMarkdown(titulo: string, explicacao: string, resultados: ResultadoDaAuditoria[], resumo: ResumoDaAuditoria): string {
  const linhas: string[] = [];
  linhas.push(`## ${titulo}`, "", explicacao, "");
  linhas.push(`- Matérias auditadas: **${resumo.auditadas}**`);
  linhas.push(`- Nota média: **${resumo.notaMedia}** de 100`);
  linhas.push(
    `- Matérias que dividem a capa com outra: **${resumo.compartilhamCapa}**${
      resumo.fotosRepetidas.length ? ` (${resumo.fotosRepetidas.length} foto(s) repetida(s); a mais usada aparece em ${resumo.fotosRepetidas[0].usos})` : ""
    }`,
  );
  linhas.push("", "Problemas mais comuns:", "");
  linhas.push("| Conferência | Matérias reprovadas |", "|---|---|");
  for (const f of resumo.falhasPorChecagem) linhas.push(`| ${celula(f.rotulo)} | ${f.falhas} |`);
  linhas.push("", "| Nota | Matéria | Problemas |", "|---|---|---|");
  for (const r of [...resultados].sort((a, b) => a.nota - b.nota)) {
    linhas.push(`| ${r.nota} | \`${r.slug}\` | ${r.problemas.length} |`);
  }
  linhas.push("", "### Problemas por matéria", "");
  for (const r of [...resultados].sort((a, b) => a.nota - b.nota)) {
    linhas.push(`**${celula(r.titulo)}** (\`${r.slug}\`), nota ${r.nota}`, "");
    if (r.problemas.length === 0) linhas.push("- nenhum problema");
    for (const p of r.problemas) linhas.push(`- ${p}`);
    linhas.push("");
  }
  return linhas.join("\n");
}

/** A mesma auditoria em CSV, uma linha por matéria e uma coluna por conferência. */
export function relatorioEmCsv(resultados: ResultadoDaAuditoria[]): string {
  if (resultados.length === 0) return "";
  const ids = resultados[0].checagens.map((c) => c.id);
  const aspas = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const cab = ["slug", "nota", ...ids, "problemas"].join(",");
  const linhas = resultados.map((r) =>
    [aspas(r.slug), r.nota, ...ids.map((id) => (r.checagens.find((c) => c.id === id)?.passou ? "ok" : "falha")), aspas(r.problemas.join(" | "))].join(","),
  );
  return [cab, ...linhas].join("\n");
}
