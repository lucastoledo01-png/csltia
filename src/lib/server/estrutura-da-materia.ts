import { indexacaoDasTags, indexacaoValidadaDoArtigo, MINIMO_DE_ASSUNTOS, validarAssuntos } from "@/lib/indexacao-do-artigo";
import { creditoDoCommons, enderecoLimpoDaImagem } from "@/lib/imagem-da-capa";
import { cobertura, corpoSemPerguntas, intertitulosDoCorpo, paragrafosDoCorpo, textoDeHtml, type ArtigoAuditavel } from "./auditoria-de-artigo";
import { perguntasVisiveisDoArtigo } from "./dados-estruturados-do-artigo";

/**
 * A estrutura da matéria pelas réguas das skills de SEO, AEO e GEO (auditoria
 * de 05/10/2026), medida no que o BANCO guarda.
 *
 * `auditoria-de-artigo.ts` dá nota de busca (título, descrição, JSON-LD). Isto
 * mede o que as skills `ai-seo` e `seo-aeo-best-practices` pedem para a
 * matéria ser citada: resposta primeiro, intertítulo em forma de pergunta,
 * parágrafo que se sustenta sozinho, fonte nomeada com link na abertura,
 * links internos, perguntas visíveis, legenda e crédito da capa, assuntos.
 * Onde a skill e o projeto divergem, vale o molde de 06/10/2026 do
 * `decisoes.md` ("A matéria completa"), que é o que está medido aqui.
 *
 * Sem modelo e sem rede: dá o mesmo resultado toda vez.
 */

export type EstruturaDaMateria = {
  slug: string;
  palavras: number;
  faixa: "até 299" | "300 a 499" | "500 a 900" | "acima de 900";
  intertitulos: number;
  intertitulosEmPergunta: number;
  respostaPrimeiro: boolean;
  fonteNaAbertura: boolean;
  essencial: boolean;
  leiaTambemNoCorpo: boolean;
  perguntasVisiveis: number;
  legendaDaCapa: boolean;
  creditoDaCapa: "gravado" | "link do Commons na página" | "sem crédito" | "sem capa";
  capaMalformada: boolean;
  /** Os assuntos que a página mostra hoje (tags pelo validador). */
  assuntos: number;
  /** Quantos o validador acharia só com o texto e as entidades gravadas, sem modelo. */
  assuntosQueOTextoSustenta: number;
  /** Parágrafos que abrem com referência solta ("Isso", "Ele"...) e não se sustentam fora da página. */
  paragrafosDependentes: number;
  paragrafos: number;
};

/** Abertura que remete ao parágrafo anterior: o trecho não se sustenta citado sozinho. */
const ABERTURA_DEPENDENTE = /^(isso|isto|ele|ela|eles|elas|esse|essa|esses|essas|este|esta|estes|estas|lá|aqui|também|além disso|por isso)\b/i;

export function faixaDePalavras(n: number): EstruturaDaMateria["faixa"] {
  if (n < 300) return "até 299";
  if (n < 500) return "300 a 499";
  if (n <= 900) return "500 a 900";
  return "acima de 900";
}

export function estruturaDaMateria(a: ArtigoAuditavel): EstruturaDaMateria {
  const html = a.content_html ?? "";
  const corpo = textoDeHtml(corpoSemPerguntas(html).replace(/<section[^>]*class="essencial"[^>]*>[\s\S]*?<\/section>/gi, " "));
  const palavras = corpo.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const intertitulos = intertitulosDoCorpo(html);
  const paragrafos = paragrafosDoCorpo(html.replace(/<section[^>]*class="essencial"[^>]*>[\s\S]*?<\/section>/gi, " "));
  const abertura = paragrafos.slice(0, 2).join(" ");
  const htmlDaAbertura = [...corpoSemPerguntas(html).matchAll(/<p\b(?![^>]*class="(?:fonte|credito-da-foto|legenda-da-capa|mais-da-editoria)")[^>]*>([\s\S]*?)<\/p>/gi)]
    .slice(0, 2)
    .map((m) => m[1])
    .join(" ");
  const capa = enderecoLimpoDaImagem(a.cover_image);
  const temCredito = /class="credito-da-foto"/.test(html);
  const ix = indexacaoValidadaDoArtigo(a);
  const brutas = indexacaoDasTags(a.tags);
  const sustentados = validarAssuntos([], {
    entidades: brutas.entidades,
    texto: `${a.title} ${corpo}`,
    editoria: a.category ?? null,
    completarAteOMinimo: true,
  }).assuntos.length;

  return {
    slug: a.slug,
    palavras,
    faixa: faixaDePalavras(palavras),
    intertitulos: intertitulos.length,
    intertitulosEmPergunta: intertitulos.filter((h) => h.trim().endsWith("?")).length,
    respostaPrimeiro: abertura ? cobertura(a.title, abertura) >= 0.5 : false,
    fonteNaAbertura: /<a\b[^>]*href="https?:\/\//i.test(htmlDaAbertura),
    essencial: /<section[^>]*class="essencial"/i.test(html),
    leiaTambemNoCorpo: /<section[^>]*class="leia-tambem"/i.test(html),
    perguntasVisiveis: perguntasVisiveisDoArtigo(a).length,
    legendaDaCapa: /class="legenda-da-capa"/.test(html),
    creditoDaCapa: !capa ? "sem capa" : temCredito ? "gravado" : creditoDoCommons(capa) ? "link do Commons na página" : "sem crédito",
    capaMalformada: (a.cover_image ?? "") !== "" && enderecoLimpoDaImagem(a.cover_image) !== (a.cover_image ?? "").trim(),
    assuntos: ix.assuntos.length,
    assuntosQueOTextoSustenta: sustentados,
    paragrafosDependentes: paragrafos.filter((p) => ABERTURA_DEPENDENTE.test(p.trim())).length,
    paragrafos: paragrafos.length,
  };
}

export type DistribuicaoDaEstrutura = {
  total: number;
  palavras: { minimo: number; mediana: number; maximo: number; porFaixa: Record<EstruturaDaMateria["faixa"], number> };
  comIntertituloEmPergunta: number;
  semIntertitulo: number;
  respostaPrimeiro: number;
  fonteNaAbertura: number;
  essencial: number;
  leiaTambemNoCorpo: number;
  comTresOuMaisPerguntas: number;
  semPerguntas: number;
  legendaDaCapa: number;
  creditoDaCapa: Record<EstruturaDaMateria["creditoDaCapa"], number>;
  capaMalformada: number;
  assuntosPorQuantidade: Record<string, number>;
  abaixoDoMinimoDeAssuntos: number;
  abaixoDoMinimoMesmoComOTexto: number;
  comParagrafoDependente: number;
};

export function distribuicaoDaEstrutura(lista: EstruturaDaMateria[]): DistribuicaoDaEstrutura {
  const palavras = lista.map((e) => e.palavras).sort((a, b) => a - b);
  const conta = (f: (e: EstruturaDaMateria) => boolean) => lista.filter(f).length;
  const porFaixa = { "até 299": 0, "300 a 499": 0, "500 a 900": 0, "acima de 900": 0 } as Record<EstruturaDaMateria["faixa"], number>;
  for (const e of lista) porFaixa[e.faixa] += 1;
  const creditoDaCapa = { gravado: 0, "link do Commons na página": 0, "sem crédito": 0, "sem capa": 0 } as Record<EstruturaDaMateria["creditoDaCapa"], number>;
  for (const e of lista) creditoDaCapa[e.creditoDaCapa] += 1;
  const assuntosPorQuantidade: Record<string, number> = {};
  for (const e of lista) assuntosPorQuantidade[String(e.assuntos)] = (assuntosPorQuantidade[String(e.assuntos)] ?? 0) + 1;
  return {
    total: lista.length,
    palavras: {
      minimo: palavras[0] ?? 0,
      mediana: palavras.length ? palavras[Math.floor(palavras.length / 2)] : 0,
      maximo: palavras[palavras.length - 1] ?? 0,
      porFaixa,
    },
    comIntertituloEmPergunta: conta((e) => e.intertitulosEmPergunta > 0),
    semIntertitulo: conta((e) => e.intertitulos === 0),
    respostaPrimeiro: conta((e) => e.respostaPrimeiro),
    fonteNaAbertura: conta((e) => e.fonteNaAbertura),
    essencial: conta((e) => e.essencial),
    leiaTambemNoCorpo: conta((e) => e.leiaTambemNoCorpo),
    comTresOuMaisPerguntas: conta((e) => e.perguntasVisiveis >= 3),
    semPerguntas: conta((e) => e.perguntasVisiveis === 0),
    legendaDaCapa: conta((e) => e.legendaDaCapa),
    creditoDaCapa,
    capaMalformada: conta((e) => e.capaMalformada),
    assuntosPorQuantidade,
    abaixoDoMinimoDeAssuntos: conta((e) => e.assuntos < MINIMO_DE_ASSUNTOS),
    abaixoDoMinimoMesmoComOTexto: conta((e) => e.assuntosQueOTextoSustenta < MINIMO_DE_ASSUNTOS),
    comParagrafoDependente: conta((e) => e.paragrafosDependentes > 0),
  };
}

/** A distribuição em Markdown, para o relatório. */
export function estruturaEmMarkdown(d: DistribuicaoDaEstrutura): string {
  const n = d.total;
  const pct = (x: number) => `${x} de ${n}`;
  const linhas = [
    "| Medida | Matérias |",
    "|---|---|",
    `| Palavras no corpo (mínimo, mediana, máximo) | ${d.palavras.minimo}, ${d.palavras.mediana}, ${d.palavras.maximo} |`,
    ...Object.entries(d.palavras.porFaixa).map(([f, q]) => `| Corpo com ${f} palavras | ${pct(q)} |`),
    `| Resposta primeiro (o lide diz o fato do título) | ${pct(d.respostaPrimeiro)} |`,
    `| Link da fonte na abertura | ${pct(d.fonteNaAbertura)} |`,
    `| Algum intertítulo em forma de pergunta | ${pct(d.comIntertituloEmPergunta)} |`,
    `| Sem intertítulo nenhum | ${pct(d.semIntertitulo)} |`,
    `| Bloco "O que você precisa saber" | ${pct(d.essencial)} |`,
    `| "Leia também" gravado no corpo | ${pct(d.leiaTambemNoCorpo)} |`,
    `| De 3 a 5 perguntas visíveis | ${pct(d.comTresOuMaisPerguntas)} |`,
    `| Sem pergunta nenhuma | ${pct(d.semPerguntas)} |`,
    `| Legenda da capa | ${pct(d.legendaDaCapa)} |`,
    ...Object.entries(d.creditoDaCapa).map(([c, q]) => `| Crédito da capa: ${c} | ${pct(q)} |`),
    `| Endereço da capa com \`&amp;\` torto | ${pct(d.capaMalformada)} |`,
    ...Object.entries(d.assuntosPorQuantidade)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([q, m]) => `| Com ${q} assunto(s) na página | ${pct(m)} |`),
    `| Abaixo do piso de ${MINIMO_DE_ASSUNTOS} assuntos hoje | ${pct(d.abaixoDoMinimoDeAssuntos)} |`,
    `| Abaixo do piso mesmo com o que o texto sustenta | ${pct(d.abaixoDoMinimoMesmoComOTexto)} |`,
    `| Com parágrafo que abre por referência solta | ${pct(d.comParagrafoDependente)} |`,
  ];
  return linhas.join("\n");
}
