import type { DeduplicatedGroup } from "../newsroom/deduplicator";
import type { ResultadoDoEnriquecimento } from "./enriquecimento";
import { ehAgregador } from "./enriquecimento";
import { dominioDe } from "./url-canonica";

/**
 * O que o código decide sozinho, antes de perguntar ao modelo.
 *
 * A medição de estabilidade separou dois tipos de campo. `pais` e `imigracao`
 * não variaram uma única vez em três classificações da mesma entrada; a
 * relevância variou em 64% e a decisão virou em 24%. Ou seja: o modelo é
 * confiável no que é categórico e instável no que é juízo.
 *
 * A conclusão prática não é desconfiar do modelo, é não perguntar a ele o que
 * já se sabe. Onde existe sinal objetivo, o sinal manda. O modelo fica com o
 * que exige interpretação.
 */

/**
 * A URL que pode sair publicada, ou nada.
 *
 * O caso real: uma ordem judicial sobre o Diversity Visa existia no feed
 * oficial da USCIS e no Google News. O deduplicador escolheu o link do
 * agregador como principal, o enriquecimento buscou o texto por outra via e
 * deu certo, e a pauta passou em todos os filtros com uma URL de
 * `news.google.com` como fonte a publicar.
 *
 * Nenhum filtro estava errado. Faltava esta pergunta, que não é sobre o texto
 * e sim sobre o link: o leitor vai clicar em quê.
 *
 * A ordem de preferência é a do projeto: fonte direta sempre vence agregador,
 * e agregador sozinho não publica.
 */
export type UrlPublicavel =
  | { ok: true; url: string; promovida: boolean; motivo: string }
  | { ok: false; motivo: string };

export function escolherUrlPublicavel(
  grupo: DeduplicatedGroup,
  enriquecimento?: Pick<ResultadoDoEnriquecimento, "enrichmentSources">,
): UrlPublicavel {
  const principal = grupo.primary.url;

  if (principal && !ehAgregador(principal)) {
    return { ok: true, url: principal, promovida: false, motivo: "a principal já é fonte direta" };
  }

  /*
   * A principal é agregador. A substituta sai primeiro do que o enriquecimento
   * realmente conseguiu abrir, porque ali existe prova de que o link leva à
   * matéria; e só depois das secundárias do grupo, que são plausíveis e não
   * verificadas.
   */
  const buscadas = (enriquecimento?.enrichmentSources ?? []).filter((u) => u && !ehAgregador(u));
  if (buscadas.length > 0) {
    return {
      ok: true,
      url: buscadas[0],
      promovida: true,
      motivo: `principal era ${dominioDe(principal)}, promovida a origem lida em ${dominioDe(buscadas[0])}`,
    };
  }

  const secundarias = grupo.secondary_urls.filter((u) => u && !ehAgregador(u));
  if (secundarias.length > 0) {
    return {
      ok: true,
      url: secundarias[0],
      promovida: true,
      motivo: `principal era ${dominioDe(principal)}, promovida a secundária ${dominioDe(secundarias[0])}`,
    };
  }

  return {
    ok: false,
    motivo: `só existe link de agregador (${dominioDe(principal)}) e nenhuma origem resolvida`,
  };
}

/**
 * O país que a FONTE já determina, quando determina.
 *
 * Um release do Federal Register é dos Estados Unidos e uma matéria do G1
 * Política é do Brasil, e nenhuma das duas coisas depende de leitura. Pedir ao
 * modelo para deduzir isso é criar oportunidade de erro sem ganho: ele acerta
 * quase sempre, e o quase é o problema.
 *
 * Devolve `null` quando a fonte de fato não determina, que é o caso de
 * agregador e de veículo internacional genérico. Aí o modelo decide.
 */
export type PaisDaClassificacao = "EUA" | "Brasil" | "outro";

const DOMINIOS_DOS_EUA = [
  ".gov",
  "uscis.gov",
  "federalregister.gov",
  "whitehouse.gov",
  "travel.state.gov",
  "trade.gov",
  "energy.gov",
  "census.gov",
  "bea.gov",
  "dallasfed.org",
  "atlantafed.org",
  "newyorkfed.org",
  "nsf.gov",
];

const DOMINIOS_DO_BRASIL = [".com.br", ".gov.br", ".org.br", "g1.globo.com", "globo.com"];

export function paisDaFonte(url: string, categoria?: string): PaisDaClassificacao | null {
  const dominio = dominioDe(url);
  if (!dominio || ehAgregador(url)) return null;

  if (categoria === "gov_us") return "EUA";
  if (categoria === "br_media") return "Brasil";

  if (DOMINIOS_DO_BRASIL.some((d) => dominio.endsWith(d) || dominio === d.replace(/^\./, ""))) {
    return "Brasil";
  }
  if (DOMINIOS_DOS_EUA.some((d) => dominio.endsWith(d) || dominio === d.replace(/^\./, ""))) {
    return "EUA";
  }

  return null;
}

/**
 * O programa migratório citado com todas as letras.
 *
 * Quando o título diz "EB-2 NIW", isso é dado, não interpretação. Guardar o
 * que está escrito evita duas coisas: o modelo trocar de programa entre
 * rodadas, e a camada de diversidade agrupar mal por não saber do que a pauta
 * trata.
 */
const PROGRAMAS: Array<{ padrao: RegExp; nome: string }> = [
  { padrao: /\bniw\b|\beb[\s-]?2\s*niw\b/i, nome: "eb2-niw" },
  { padrao: /\beb[\s-]?1[ab]?\b/i, nome: "eb1" },
  { padrao: /\beb[\s-]?2\b/i, nome: "eb2" },
  { padrao: /\beb[\s-]?3\b/i, nome: "eb3" },
  { padrao: /\beb[\s-]?5\b/i, nome: "eb5" },
  { padrao: /\bh[\s-]?1b\b/i, nome: "h1b" },
  { padrao: /\bl[\s-]?1[ab]?\b/i, nome: "l1" },
  { padrao: /\bo[\s-]?1\b/i, nome: "o1" },
  { padrao: /\bf[\s-]?1\b/i, nome: "f1" },
  { padrao: /\bgreen\s?card\b/i, nome: "green-card" },
  { padrao: /\bvisa bulletin\b|\bpriority date\b/i, nome: "visa-bulletin" },
  { padrao: /\bdiversity visa\b|\bloteria de vistos\b|\bdv[\s-]?20\d\d\b/i, nome: "diversity-visa" },
];

export function programasCitados(titulo: string, texto = ""): string[] {
  const alvo = `${titulo} ${texto}`;
  const achados: string[] = [];

  for (const p of PROGRAMAS) {
    if (!p.padrao.test(alvo)) continue;
    // EB-2 NIW já diz o que EB-2 diria; não vale registrar os dois.
    if (p.nome === "eb2" && achados.includes("eb2-niw")) continue;
    achados.push(p.nome);
  }

  return achados;
}

/** Todos os sinais objetivos de uma candidata, num objeto só. */
export type SinaisObjetivos = {
  urlPublicavel: string | null;
  urlPromovida: boolean;
  motivoDaUrl: string;
  pais: PaisDaClassificacao | null;
  programas: string[];
  dominio: string;
  ehAgregador: boolean;
};

export function lerSinaisObjetivos(
  grupo: DeduplicatedGroup,
  opcoes: {
    enriquecimento?: Pick<ResultadoDoEnriquecimento, "enrichmentSources">;
    categoriaDaFonte?: string;
    texto?: string;
  } = {},
): SinaisObjetivos {
  const url = escolherUrlPublicavel(grupo, opcoes.enriquecimento);
  const publicavel = url.ok ? url.url : null;

  return {
    urlPublicavel: publicavel,
    urlPromovida: url.ok ? url.promovida : false,
    motivoDaUrl: url.motivo,
    pais: publicavel ? paisDaFonte(publicavel, opcoes.categoriaDaFonte) : null,
    programas: programasCitados(grupo.primary.title, opcoes.texto ?? grupo.primary.description ?? ""),
    dominio: publicavel ? dominioDe(publicavel) : dominioDe(grupo.primary.url),
    ehAgregador: ehAgregador(grupo.primary.url),
  };
}
