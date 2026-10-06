import { cosseno } from "../editorial/embeddings";
import { buscarTextoDaFonte, ehAgregador, type TextoDaFonte } from "../editorial/enriquecimento";
import { montarPacoteFactual, type FonteDoPacote, type PacoteFactual } from "../editorial/pacote-factual";
import { dominioDe } from "../editorial/url-canonica";
import { enderecoLimpoDaImagem } from "@/lib/imagem-da-capa";
import type { LivroDeCustos } from "./custos";

/**
 * A matéria do portal com mais de uma fonte (06/10/2026).
 *
 * A auditoria de estrutura mediu as duas matérias publicadas com 359 e 411
 * palavras de corpo, contra o molde de 500 a 900. A causa não é o redator: a
 * poda apaga tudo o que o pacote factual não sustenta, e o pacote vinha de UMA
 * fonte. Fonte magra, matéria magra. A poda NÃO afrouxa (decisão do dono):
 * o que muda é o que o pacote sustenta.
 *
 * Antes de escrever, juntam-se outras fontes do MESMO fato:
 *
 *   1. as URLs que a deduplicação já agrupou com a pauta (mesmo dia, título
 *      parecido);
 *   2. as candidatas de `news_candidates` dos últimos dias cujo vetor dá
 *      cosseno de 0.70 ou mais com o da pauta, que é o limiar medido de
 *      "mesmo acontecimento" (`limiarDeAgrupamento`);
 *   3. a fonte primária que a matéria principal cita com link no corpo
 *      (órgão de governo, tribunal, parlamento).
 *
 * Cada fonte é lida com o agente honesto e, se recusar o robô, pela cópia do
 * Internet Archive (`buscarTextoDaFonte`), e vira o SEU pacote factual. O
 * pacote da matéria é a união, e cada fonte continua no campo `fontes` com os
 * fatos que deu: "segundo X" tem que ser o X que deu o número
 * (`atribuicoesSemLastro`, no auditor do artigo).
 *
 * O que fica de fora: agregador, pauta de imigração (fora da linha desde
 * 05/10/2026), a mesma URL ou o mesmo domínio de uma fonte já escolhida, e
 * fonte que não rendeu fato nenhum. O teto é de quatro fontes, contando a
 * principal, e de seis leituras tentadas, para o custo e o tempo terem fim.
 * Nenhuma falha aqui impede a matéria: sem fonte extra, ela sai com a
 * principal, como saía antes.
 */

export const MAXIMO_DE_FONTES = 4;
export const MAXIMO_DE_LEITURAS = 6;
/** O tamanho de texto de cada fonte que vai ao extrator e à ancoragem, o mesmo corte do extrator. */
const TEXTO_POR_FONTE = 8000;

export type CandidataIrma = {
  url: string;
  titulo: string;
  /** Nome do veículo, ou o domínio quando não há nome. */
  nome?: string;
  vetor: number[] | null;
  imigracao?: boolean;
};

export type EntradaDasFontes = {
  principal: {
    url: string;
    titulo: string;
    nome: string;
    vetor: number[] | null;
    pacote: PacoteFactual;
  };
  /** As URLs que a deduplicação agrupou com a pauta. */
  urlsDoGrupo?: string[];
  /** As candidatas recentes do projeto, com vetor. */
  candidatas?: CandidataIrma[];
  /** Os links de fonte primária da matéria principal; ausente, a principal é lida de novo para achá-los. */
  linksOficiais?: string[];
  limiar?: number;
  maximoDeFontes?: number;
  maximoDeLeituras?: number;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  livro?: LivroDeCustos;
  /** Trocados em teste. */
  buscarTexto?: (url: string) => Promise<TextoDaFonte | null>;
  extrair?: typeof montarPacoteFactual;
};

export type ResultadoDasFontes = {
  pacote: PacoteFactual;
  /** As fontes que entraram, a principal primeiro. */
  fontes: FonteDoPacote[];
  linhasDeLog: string[];
  custoUsd: number;
};

/** "axios.com" vira "Axios"; o nome que a página declara vence sempre que existe. */
export function nomeDoDominio(url: string): string {
  const d = dominioDe(url);
  if (!d) return url;
  const base = d.replace(/\.(com|org|net|gov|edu|co|io|news)(\.[a-z]{2})?$/i, "").split(".").pop() ?? d;
  return base.length <= 4 ? base.toUpperCase() : base.charAt(0).toUpperCase() + base.slice(1);
}

function semDuplicatas(xs: string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const x of xs) {
    const t = x.trim();
    const chave = t.toLowerCase();
    if (!t || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(t);
  }
  return saida;
}

/** O pacote de cada fonte vira um pacote só, e cada fonte continua em `fontes`. */
export function fundirPacotes(fontes: FonteDoPacote[]): PacoteFactual {
  const juntar = (campo: "verified_facts" | "people" | "organizations" | "places" | "dates" | "numbers") =>
    semDuplicatas(fontes.flatMap((f) => f[campo]));
  return {
    verified_facts: juntar("verified_facts"),
    people: juntar("people"),
    organizations: juntar("organizations"),
    places: juntar("places"),
    dates: juntar("dates"),
    numbers: juntar("numbers"),
    /*
     * A lacuna de uma fonte pode ser respondida por outra. Por isso cada uma
     * vai com o dono ("The Hill não informa: ..."): o auditor semântico lê
     * "gaps" como o que a matéria não pode afirmar, e a lacuna crua da
     * principal apagaria o fato que a segunda fonte deu.
     */
    gaps: semDuplicatas(fontes.flatMap((f) => f.gaps.map((g) => `${f.nome} não informa: ${g}`))),
    source_urls: semDuplicatas(fontes.map((f) => f.url)),
    // O separador leva o nome e não o id: "F2" no material sustentaria um "2" inventado no texto.
    texto_de_origem: fontes.map((f) => `Fonte: ${f.nome}\n${f.texto_de_origem}`).join("\n\n"),
    fontes,
  };
}

type Alvo = { url: string; nome?: string; origem: "grupo" | "mesmo fato" | "fonte primária"; cosseno?: number };

/** A ordem das tentativas: o grupo, as irmãs pelo cosseno, e a fonte primária citada. */
export function alvosDasFontes(e: EntradaDasFontes, linksOficiais: string[]): Alvo[] {
  const limiar = e.limiar ?? 0.7;
  const principal = enderecoLimpoDaImagem(e.principal.url);
  const alvos: Alvo[] = [];
  for (const u of e.urlsDoGrupo ?? []) alvos.push({ url: enderecoLimpoDaImagem(u), origem: "grupo" });
  const vetor = e.principal.vetor;
  if (vetor?.length) {
    const irmas = (e.candidatas ?? [])
      .filter((c) => !c.imigracao && c.vetor?.length)
      .map((c) => ({ c, s: cosseno(vetor, c.vetor as number[]) }))
      .filter((x) => x.s >= limiar)
      .sort((a, b) => b.s - a.s);
    for (const { c, s } of irmas) alvos.push({ url: enderecoLimpoDaImagem(c.url), nome: c.nome, origem: "mesmo fato", cosseno: s });
  }
  for (const u of linksOficiais) alvos.push({ url: u, origem: "fonte primária" });

  const dominios = new Set([dominioDe(principal)]);
  const urls = new Set([principal]);
  return alvos.filter((a) => {
    if (!a.url || urls.has(a.url) || ehAgregador(a.url)) return false;
    const d = dominioDe(a.url);
    // O mesmo veículo duas vezes não é segunda fonte; a fonte primária é de outro domínio por definição.
    if (!d || dominios.has(d)) return false;
    urls.add(a.url);
    dominios.add(d);
    return true;
  });
}

/**
 * Junta as fontes do mesmo fato e devolve o pacote da matéria. Nunca lança:
 * no pior caso devolve o pacote da principal, sozinho, como era.
 */
export async function reunirFontesDaMateria(e: EntradaDasFontes): Promise<ResultadoDasFontes> {
  const linhas: string[] = [];
  const fetcher = e.fetcher ?? fetch;
  const buscar = e.buscarTexto ?? ((url: string) => buscarTextoDaFonte(url, fetcher));
  const extrair = e.extrair ?? montarPacoteFactual;
  const maximoDeFontes = e.maximoDeFontes ?? MAXIMO_DE_FONTES;
  const maximoDeLeituras = e.maximoDeLeituras ?? MAXIMO_DE_LEITURAS;
  let custoUsd = 0;

  const principal: FonteDoPacote = {
    id: "F1",
    nome: e.principal.nome || nomeDoDominio(e.principal.url),
    url: enderecoLimpoDaImagem(e.principal.url),
    principal: true,
    verified_facts: e.principal.pacote.verified_facts,
    people: e.principal.pacote.people,
    organizations: e.principal.pacote.organizations,
    places: e.principal.pacote.places,
    dates: e.principal.pacote.dates,
    numbers: e.principal.pacote.numbers,
    gaps: e.principal.pacote.gaps,
    texto_de_origem: e.principal.pacote.texto_de_origem.slice(0, TEXTO_POR_FONTE),
  };
  const fontes: FonteDoPacote[] = [principal];

  let linksOficiais = e.linksOficiais;
  let leituras = 0;
  if (!linksOficiais) {
    try {
      leituras += 1;
      linksOficiais = (await buscar(principal.url))?.linksOficiais ?? [];
    } catch {
      linksOficiais = [];
    }
  }

  for (const alvo of alvosDasFontes(e, linksOficiais)) {
    if (fontes.length >= maximoDeFontes || leituras >= maximoDeLeituras) break;
    leituras += 1;
    let lida: TextoDaFonte | null = null;
    try {
      lida = await buscar(alvo.url);
    } catch (erro) {
      linhas.push(`[FONTES] ${alvo.origem} não lida (${(erro as Error).message}): ${alvo.url}`);
      continue;
    }
    if (!lida) {
      linhas.push(`[FONTES] ${alvo.origem} não lida (recusou o robô e o arquivo não tem cópia): ${alvo.url}`);
      continue;
    }
    const texto = lida.texto.slice(0, TEXTO_POR_FONTE);
    try {
      const r = await extrair({ titulo: lida.metadados.titulo || alvo.url, texto, urls: [alvo.url] }, e.env ?? process.env, fetcher);
      custoUsd += r.custoUsd;
      e.livro?.lancar("pacote_factual_fonte_extra", "artigo", r.custoUsd, r.tokens);
      const id = `F${fontes.length + 1}`;
      fontes.push({
        id,
        nome: (lida.metadados.veiculo || alvo.nome || nomeDoDominio(alvo.url)).trim(),
        url: alvo.url,
        principal: false,
        verified_facts: r.pacote.verified_facts,
        people: r.pacote.people,
        organizations: r.pacote.organizations,
        places: r.pacote.places,
        dates: r.pacote.dates,
        numbers: r.pacote.numbers,
        gaps: r.pacote.gaps,
        texto_de_origem: texto,
      });
      linhas.push(
        `[FONTES] ${id} ${alvo.origem}${alvo.cosseno ? ` (cosseno ${alvo.cosseno.toFixed(2)})` : ""}, ${r.pacote.verified_facts.length} fato(s), via ${lida.via}: ${alvo.url}`,
      );
    } catch (erro) {
      linhas.push(`[FONTES] ${alvo.origem} sem fato aproveitável (${(erro as Error).message}): ${alvo.url}`);
    }
  }

  if (fontes.length === 1) {
    linhas.push("[FONTES] só a principal: nenhuma outra fonte do mesmo fato foi lida");
    return { pacote: e.principal.pacote, fontes, linhasDeLog: linhas, custoUsd };
  }
  return { pacote: fundirPacotes(fontes), fontes, linhasDeLog: linhas, custoUsd };
}
