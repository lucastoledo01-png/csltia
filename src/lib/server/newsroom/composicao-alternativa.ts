import type { NewsSourceConfig } from "./news-sources";

/**
 * A composição de fontes que o benchmark testa, sem tocar o banco.
 *
 * O benchmark tem que acontecer antes de mexer em produção, então a troca
 * mora aqui e é aplicada em memória: nada é gravado, nada é desativado, e a
 * produção segue com as fontes de hoje até a configuração ser aprovada.
 *
 * A medida que motiva tudo: em 7 dias, 675 das 987 candidatas classificadas
 * vieram do Google News, 68% da coleta, e NENHUMA foi aprovada. Dessas, 177
 * foram marcadas como imigração pelo classificador, ou seja, material da
 * vertical identificado e inutilizável, porque o `<link>` do item é um blob
 * base64 resolvido por JavaScript e seguir isso cai em `google.com/sorry`.
 *
 * O agregador não deixa de ter valor: é ele que revela QUEM assinar. Os cinco
 * feeds diretos abaixo saíram do campo `<source url>` dos próprios itens do
 * Google News, e cada um foi testado com o user agent do coletor.
 */

export type DecisaoDeFonte = {
  id: string;
  nome: string;
  motivo: string;
};

/**
 * Consultas do Google News a desativar, com a função editorial de cada uma e
 * o que passa a cobri-la.
 *
 * Fica de fora desta lista, e continua ativa, a consulta de asilo e refúgio:
 * status migratório é assunto de núcleo e nenhum dos cinco feeds diretos cobre
 * o ângulo humanitário. Desativá-la seria perder cobertura sem substituto, que
 * é o oposto do que esta troca quer.
 */
const GNEWS_A_DESATIVAR: Array<{ contem: string; motivo: string }> = [
  {
    contem: "site%3Auscis.gov",
    motivo:
      "77 de 100 itens são uscis.gov, que já assinamos direto no feed 22984. " +
      "Descobrir USCIS pelo agregador para depois tentar resolver USCIS é trabalho circular.",
  },
  {
    contem: "%22visa+bulletin%22+OR+%22priority+date%22+OR+%22EB-2%22",
    motivo:
      "função: visa bulletin e fila de prioridade. Publishers dominantes: natlawreview (16) e " +
      "wolfsdorf (8), os dois agora diretos.",
  },
  {
    contem: "%22visa+bulletin%22+OR+%22priority+date%22+OR+%22green+card+backlog%22",
    motivo: "duplicata quase idêntica da consulta acima, mesma cobertura, mesmos publishers.",
  },
  {
    contem: "%22EB-1%22+OR+%22EB-2%22+OR+%22EB-3%22",
    motivo:
      "função: categorias de emprego e NIW. Publishers: bloomberglaw, rnlawgroup (4) e fragomen (3). " +
      "rnlawgroup entra direto; bloomberg e fragomen ficam sem cobertura direta e é a perda aceita.",
  },
  {
    contem: "%22EB-5%22+OR+%22O-1+visa%22",
    motivo:
      "função: investidor e habilidade extraordinária. Wolfsdorf domina com 21 de 100 e passa a ser direto.",
  },
  {
    contem: "USCIS+%28policy+OR+fee",
    motivo:
      "função: política, taxa e prazo do USCIS. Coberto por USCIS direto, Ogletree e JD Supra, " +
      "que publicam a análise do ato com corpo legível.",
  },
  {
    contem: "USCIS+OR+%22green+card%22+OR+%22H-1B%22",
    motivo:
      "consulta guarda-chuva sem publisher dominante (newsweek 5, americanbazaar 5): a cauda longa " +
      "não é resolvível e é ela que enche o lote do classificador.",
  },
  {
    contem: "STF+OR+%22Supremo+Tribunal+Federal%22",
    motivo:
      "1 de 100 itens tem termo de imigração ou EUA. Produziu 5 das 13 mortes na verificação: é " +
      "disputa política brasileira, que a linha editorial recusa por teto de declaração.",
  },
  {
    contem: "%22reforma+tribut%C3%A1ria%22",
    motivo:
      "ZERO de 100 itens com termo de imigração ou EUA. ISS, ICMS e passagem aérea não mudam o " +
      "plano de quem quer sair.",
  },
  {
    contem: "%22new+plant%22+OR+%22new+factory%22",
    motivo:
      "função: anúncio de fábrica e vaga. É a consulta que fabrica a pauta que as agências estaduais " +
      "já não convertiam: fiercepharma, purina, bizjournals. Zero aprovadas.",
  },
  {
    contem: "%22job+openings%22+OR+hiring",
    motivo:
      "função: mercado de trabalho americano. 30 de 100 são bls.gov, cujo dado chega pelo Dallas Fed " +
      "e pelo Census que já assinamos, com corpo real.",
  },
];

/**
 * As duas consultas de brasileiros nos EUA são o caso mais delicado.
 *
 * Elas trazem g1, CNN Brasil, BBC e Folha falando de brasileiro nos EUA, que é
 * exatamente o público. Mas o link é do agregador e o corpo vem vazio, então
 * nada dali é publicável hoje. São duplicatas entre si, com consultas quase
 * iguais.
 *
 * Desativo UMA e mantenho a outra: a cobertura do ângulo comunitário continua
 * existindo, e o volume duplicado cai. Preferir isso a zerar um ângulo que
 * nenhum dos cinco feeds diretos cobre.
 */
const GNEWS_DUPLICATA_BRASILEIROS = "brasileiros+%22Estados+Unidos%22+%28trabalho";

/** O feed de avisos de viagem, que nunca serviu a esta vertical. */
const FEED_ERRADO_DO_STATE_DEPT = "TAsTWs.xml";

/**
 * Fontes fora da vertical, sem imigração e sem aprovação em 8 dias de medição.
 *
 * Critério: volume coletado razoável, zero pautas marcadas como imigração,
 * zero aprovadas, e nenhuma função estratégica que justifique manter. Não
 * entram aqui as institucionais de volume baixo (White House, BAL, Murthy,
 * travel.state.gov como domínio), que são núcleo publicando devagar.
 */
const FORA_DA_VERTICAL: Array<{ dominio: string; motivo: string }> = [
  { dominio: "areadevelopment.com", motivo: "21 itens, 0 imigração: anúncio de projeto industrial." },
  { dominio: "news.mit.edu", motivo: "15 itens, 0 imigração: pesquisa acadêmica, herança da vertical de IA." },
  { dominio: "ncses.nsf.gov", motivo: "10 itens, 0 imigração: estatística de ciência e engenharia." },
  { dominio: "siteselection.com", motivo: "10 itens, 0 imigração: escolha de sítio industrial." },
  { dominio: "manufacturingdive.com", motivo: "7 itens, 0 imigração: indústria." },
  { dominio: "constructiondive.com", motivo: "6 itens, 0 imigração: construção." },
  { dominio: "news.gatech.edu", motivo: "4 itens, 0 imigração: notícia de campus." },
  { dominio: "edpnc.com", motivo: "4 itens, 0 imigração: agência estadual, público é empresa." },
  { dominio: "utilitydive.com", motivo: "3 itens, 0 imigração: setor elétrico." },
  { dominio: "hiringlab.org", motivo: "3 itens, 0 imigração: pesquisa de mercado de trabalho." },
  { dominio: "tnecd.com", motivo: "2 itens, 0 imigração: agência estadual." },
  { dominio: "berkeley.edu", motivo: "notícia de campus, herança da vertical de IA." },
  { dominio: "atlantafed.org", motivo: "GDPNow e wage tracker: indicador macro sem efeito no caminho migratório." },
  { dominio: "bea.gov", motivo: "PIB e renda: macro sem efeito no caminho migratório." },
  { dominio: "businessintexas.com", motivo: "agência estadual, público é empresa." },
  { dominio: "nsf.gov", motivo: "pesquisa financiada, fora da vertical." },
  { dominio: "business.utah.gov", motivo: "agência estadual." },
  { dominio: "wedc.org", motivo: "agência estadual." },
  { dominio: "missouripartnership.com", motivo: "agência estadual." },
  { dominio: "selectflorida.org", motivo: "agência estadual." },
  { dominio: "business.ca.gov", motivo: "agência estadual." },
  { dominio: "libertystreeteconomics.newyorkfed.org", motivo: "blog de pesquisa macro." },
  { dominio: "spectrum.ieee.org", motivo: "tecnologia, herança da vertical de IA." },
  { dominio: "energy.gov", motivo: "sala de imprensa de energia." },
  { dominio: "news.harvard.edu", motivo: "notícia de campus." },
  { dominio: "trade.gov", motivo: "comércio internacional, público é exportador." },
];

/**
 * Os cinco feeds diretos aprovados para teste.
 *
 * Todos vieram do `<source url>` dos itens do Google News, e todos foram
 * buscados com o user agent do coletor antes de entrar aqui. Prioridade 2
 * porque análise de escritório não é ato oficial: ela explica o ato, e a
 * promoção por prioridade deve continuar preferindo a fonte primária.
 */
export const FEEDS_DIRETOS: NewsSourceConfig[] = [
  {
    id: "wolfsdorf-imigracao",
    name: "Wolfsdorf Rosenthal, imigração",
    type: "rss",
    url: "https://www.wolfsdorf.com/feed/",
    enabled: true,
    priority: 2,
    category: "us_media",
    region: "global",
    keywords: [],
  },
  {
    id: "natlawreview-imigracao",
    name: "National Law Review",
    type: "rss",
    url: "https://www.natlawreview.com/feed",
    enabled: true,
    priority: 2,
    category: "us_media",
    region: "global",
    keywords: [],
  },
  {
    id: "jdsupra-imigracao",
    name: "JD Supra, canal Immigration Law",
    type: "rss",
    url: "https://www.jdsupra.com/resources/syndication/docsRSSfeed.aspx?ftype=ImmigrationLaw&premium=1",
    enabled: true,
    priority: 2,
    category: "us_media",
    region: "global",
    keywords: [],
  },
  {
    id: "ogletree-imigracao",
    name: "Ogletree Deakins, imigração",
    type: "rss",
    url: "https://ogletree.com/insights-resources/blog-posts/feed/",
    enabled: true,
    priority: 2,
    category: "us_media",
    region: "global",
    keywords: [],
  },
  {
    id: "rnlawgroup-imigracao",
    name: "RN Law Group",
    type: "rss",
    url: "https://www.rnlawgroup.com/feed/",
    enabled: true,
    priority: 2,
    category: "us_media",
    region: "global",
    keywords: [],
  },
];

function dominioDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Por que esta fonte sai da composição, ou `null` se ela fica. */
export function motivoDaDesativacao(fonte: NewsSourceConfig): string | null {
  const url = fonte.url;

  if (url.includes(FEED_ERRADO_DO_STATE_DEPT)) {
    return (
      "feed errado do State Department: TAsTWs.xml são avisos dos EUA sobre TERCEIROS países " +
      "(Marrocos, Peru, Tajiquistão), 225 itens de ruído. O domínio travel.state.gov continua útil."
    );
  }

  if (url.includes("news.google.com")) {
    if (url.includes(GNEWS_DUPLICATA_BRASILEIROS)) {
      return "duplicata da outra consulta de brasileiros nos EUA; a irmã fica, para não zerar o ângulo comunitário.";
    }
    const achado = GNEWS_A_DESATIVAR.find((g) => url.includes(g.contem));
    return achado ? achado.motivo : null;
  }

  const dominio = dominioDe(url);
  const fora = FORA_DA_VERTICAL.find((f) => dominio === f.dominio || dominio.endsWith(`.${f.dominio}`));
  return fora ? fora.motivo : null;
}

export function composicaoAlternativa(doBanco: NewsSourceConfig[]): {
  fontes: NewsSourceConfig[];
  desativadas: DecisaoDeFonte[];
  acrescentadas: DecisaoDeFonte[];
} {
  const desativadas: DecisaoDeFonte[] = [];
  const mantidas: NewsSourceConfig[] = [];

  for (const f of doBanco) {
    const motivo = motivoDaDesativacao(f);
    if (motivo) {
      desativadas.push({ id: String(f.id), nome: f.name, motivo });
    } else {
      mantidas.push(f);
    }
  }

  const jaExistem = new Set(doBanco.map((f) => f.url));
  const novas = FEEDS_DIRETOS.filter((f) => !jaExistem.has(f.url));

  return {
    fontes: [...mantidas, ...novas],
    desativadas,
    acrescentadas: novas.map((f) => ({
      id: f.id,
      nome: f.name,
      motivo: "feed direto do publisher que o Google News estava intermediando, testado com o UA do coletor.",
    })),
  };
}
