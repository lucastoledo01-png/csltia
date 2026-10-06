import { dominioDe } from "./url-canonica";

/**
 * Buscar o texto da matéria antes de escrever sobre ela.
 *
 * A edição de validação saiu com duas pautas em que o parágrafo dizia "a fonte
 * não informa qual é a regra, quem é afetado ou quando começa". A fonte
 * informava. O que chegou ao redator é que era só a manchete, porque
 * agregador entrega manchete e link, e o link não é o da matéria.
 *
 * Escrever notícia a partir de manchete é inventar o meio. Este módulo tenta
 * buscar o corpo; quando não consegue, diz que não conseguiu, e a pauta é
 * recusada em vez de virar três parágrafos de ressalva.
 */

/** Domínios que entregam manchete e link, não matéria. */
const AGREGADORES = new Set(["news.google.com", "news.yahoo.com", "flipboard.com"]);

/** Abaixo disto não dá para responder o que aconteceu. */
export const MINIMO_DE_CORPO = 400;

const TEMPO_LIMITE_MS = 12_000;
const MAXIMO_DE_HTML = 1_500_000;

/**
 * Identifica o robô e diz de onde vem.
 *
 * Um agente que se disfarça de navegador é um agente que sabe que não deveria
 * estar ali. Se um site recusar isto, a resposta certa é não insistir.
 */
const AGENTE = "imigra-us-newsroom/1.0 (+https://casaloti.ia.br; leitor de pauta)";

export type StatusDeEnriquecimento =
  | "nao_precisou"
  | "enriquecida"
  | "sem_corpo_na_origem"
  | "origem_inacessivel"
  | "agregador_sem_link_direto";

export type ResultadoDoEnriquecimento = {
  texto: string;
  /**
   * O assunto da pauta em poucas linhas, quando o texto de origem não serve.
   *
   * A hashtag é inferida do texto, e a régua é "o assunto precisa aparecer no
   * título, no resumo, nas entidades ou na categoria". Uma matéria cumpre isso:
   * ela trata de um assunto. Uma página de manual oficial não, porque enumera o
   * sistema inteiro, e a inferência larga acaba descrevendo o site da origem em
   * vez do post. Quem tem um resumo curado do assunto declara aqui; quem não
   * tem deixa vazio e segue usando `texto`.
   */
  assuntoParaHashtags?: string;
  /** De onde veio o texto que será usado. */
  contentSource: "feed" | "pagina_original" | "fonte_secundaria" | "nenhuma";
  contentLength: number;
  enrichmentStatus: StatusDeEnriquecimento;
  /** URLs efetivamente buscadas, em ordem de tentativa. */
  enrichmentSources: string[];
  /** O que aconteceu em cada tentativa, para o relatório. */
  notas: string[];
};

export function ehAgregador(url: string): boolean {
  return AGREGADORES.has(dominioDe(url));
}

/**
 * O que veio no feed responde "o que aconteceu"?
 *
 * Não é só tamanho. Descrição que repete o título, que traz só o nome do
 * veículo, ou que não tem uma frase inteira, tem tamanho e não tem conteúdo.
 */
export function precisaEnriquecer(titulo: string, descricao: string): boolean {
  const texto = (descricao || "").trim();
  if (texto.length < MINIMO_DE_CORPO) return true;

  const normalizar = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const semTitulo = normalizar(texto).replace(normalizar(titulo), "").trim();
  if (semTitulo.split(" ").filter(Boolean).length < 20) return true;

  // Sem ponto final em lugar nenhum, o que existe é rótulo, não texto.
  if (!/[.!?]/.test(texto)) return true;

  return false;
}

/**
 * Texto da matéria a partir do HTML.
 *
 * Sem biblioteca de leitura: tira o que nunca é matéria (script, estilo,
 * navegação, rodapé, formulário), pega os parágrafos e descarta os curtos, que
 * são legenda de foto, crédito e chamada de newsletter.
 */
export function extrairTextoDeHtml(html: string): string {
  const limpo = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header\b[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form\b[\s\S]*?<\/form>/gi, " ")
    .replace(/<figcaption\b[\s\S]*?<\/figcaption>/gi, " ");

  /*
   * Parágrafo E item de lista, na ordem do documento (06/10/2026). A matéria
   * da Axios põe o dado central num `<li>` ("There are 39 active data centers
   * in Chicago"), e só com `<p>` o número sumia do texto que vira pacote. Item
   * de menu continua de fora: `<nav>` já saiu acima, e o piso de 60
   * caracteres derruba o item curto que sobrar.
   */
  const paragrafos = [...limpo.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    // Item de lista que é só link (a barra de compartilhar: "facebook (opens
    // in new window) twitter ...") não é texto da matéria.
    .filter((m) => m[1].toLowerCase() !== "li" || m[2].replace(/<a\b[\s\S]*?<\/a>/gi, " ").replace(/<[^>]+>/g, " ").trim().length >= 20)
    .map((m) => decodificar(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 60);

  if (paragrafos.length > 0) return paragrafos.join("\n\n");

  // Página sem <p> utilizável: cai para o texto corrido, que é pior mas ainda
  // é o texto da matéria.
  const corrido = decodificar(limpo.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return corrido;
}

function decodificar(texto: string): string {
  const uma = (t: string) =>
    t
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;|&#8217;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&amp;/g, "&");
  return uma(uma(texto));
}

export type PautaParaEnriquecer = {
  titulo: string;
  descricao: string;
  url: string;
  /** Outras URLs do mesmo acontecimento, vindas da deduplicação do dia. */
  urlsSecundarias?: string[];
};

/**
 * O identificador do documento dentro da URL do Federal Register.
 *
 * As URLs têm a forma `/documents/2026/09/04/2026-18099/titulo-do-ato`, e o
 * penúltimo segmento no formato `AAAA-NNNNN` é o id que a API entende.
 */
export function idDoFederalRegister(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)federalregister\.gov$/.test(u.hostname)) return null;
    const achado = u.pathname.match(/\/(\d{4}-\d{4,6})(\/|$)/);
    return achado ? achado[1] : null;
  } catch {
    return null;
  }
}

/**
 * O texto do ato, pela API.
 *
 * Tenta primeiro o texto integral (`raw_text_url`), que vem em texto puro do
 * GPO; se ele não vier, fica com o abstract, que já é material oficial e
 * costuma bastar para a classificação. Devolve `null` quando a URL não é do
 * Federal Register ou quando a API não responde, e aí o caminho normal segue.
 */
/**
 * O texto do GPO vem dentro de um `<pre>`, não em texto puro.
 *
 * O campo se chama `raw_text_url` e a resposta é um documento HTML com o ato
 * inteiro dentro de um único `<pre>`. Passar isso adiante entregaria a tag e o
 * título da página ao classificador; e `extrairTextoDeHtml` também não serve,
 * porque ele procura parágrafos e ali não existe nenhum.
 */
export function desembrulharTextoDoGPO(bruto: string): string {
  const dentro = bruto.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const corpo = dentro ? dentro[1] : bruto.replace(/<[^>]+>/g, " ");
  return corpo
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function textoDoFederalRegister(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  const id = idDoFederalRegister(url);
  if (!id) return null;

  try {
    const meta = await fetcher(
      `https://www.federalregister.gov/api/v1/documents/${id}.json?fields[]=abstract&fields[]=raw_text_url`,
      { signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json" } },
    );
    if (!meta.ok) return null;

    const dados = (await meta.json()) as { abstract?: string | null; raw_text_url?: string | null };
    const abstract = (dados.abstract ?? "").trim();

    if (dados.raw_text_url) {
      try {
        const bruto = await fetcher(dados.raw_text_url, { signal: AbortSignal.timeout(20_000) });
        if (bruto.ok) {
          const texto = desembrulharTextoDoGPO(await bruto.text());
          // O texto integral só vale se for maior que o abstract; um ato curto
          // às vezes devolve só o cabeçalho do documento.
          if (texto.length > abstract.length && texto.length >= MINIMO_DE_CORPO) return texto;
        }
      } catch {
        // Segue com o abstract.
      }
    }

    return abstract.length >= MINIMO_DE_CORPO ? abstract : null;
  } catch {
    return null;
  }
}

export async function enriquecerPauta(
  pauta: PautaParaEnriquecer,
  fetcher: typeof fetch = fetch
): Promise<ResultadoDoEnriquecimento> {
  const notas: string[] = [];
  const buscadas: string[] = [];

  /*
   * O Federal Register tem porta documentada, e a página HTML não é ela.
   *
   * Toda requisição a federalregister.gov devolve a mesma página de bloqueio,
   * que manda usar a API. E a API é a MESMA fonte primária: devolve o abstract
   * oficial e um `raw_text_url` com o texto integral do ato. Ir por ela não é
   * rebaixar a qualidade da fonte, é parar de raspar quem pede para não ser
   * raspado.
   *
   * Isto vem antes até do atalho de "o feed já trouxe corpo suficiente". O
   * abstract do RSS às vezes passa do mínimo e o pipeline nem tentaria buscar
   * mais; só que o ato inteiro tem escopo, data de vigência e liminar, e são
   * esses parágrafos que decidem se a pauta vale. O Federal Register é fonte
   * de núcleo da vertical: em sete dias entregou 12 pautas e nenhuma
   * sobreviveu.
   */
  const doRegistro = await textoDoFederalRegister(pauta.url, fetcher);
  if (doRegistro) {
    notas.push(`federalregister.gov: ${doRegistro.length} caracteres pela API`);
    return {
      texto: doRegistro,
      contentSource: "pagina_original",
      contentLength: doRegistro.length,
      enrichmentStatus: "enriquecida",
      enrichmentSources: [pauta.url],
      notas,
    };
  }

  if (!precisaEnriquecer(pauta.titulo, pauta.descricao)) {
    return {
      texto: pauta.descricao,
      contentSource: "feed",
      contentLength: pauta.descricao.length,
      enrichmentStatus: "nao_precisou",
      enrichmentSources: [],
      notas: ["o feed já trouxe corpo suficiente"],
    };
  }

  // Ordem: a página da própria matéria primeiro; depois outra fonte que a
  // deduplicação disse cobrir o mesmo acontecimento.
  const candidatas = [pauta.url, ...(pauta.urlsSecundarias ?? [])].filter(Boolean);
  let primeiroErro = "";

  for (const [i, url] of candidatas.entries()) {
    if (ehAgregador(url)) {
      notas.push(`${dominioDe(url)}: agregador, o link não é o da matéria`);
      continue;
    }

    buscadas.push(url);
    try {
      const html = await buscarPagina(url, fetcher);
      const texto = extrairTextoDeHtml(html);

      /*
       * Enriquecer não pode piorar o texto.
       *
       * `Agency Information Collection Activities` tinha um abstract oficial de
       * 364 caracteres, abaixo do mínimo, então o pipeline foi buscar a página
       * e voltou com 861 caracteres de aviso de robô. Maior, e pior: a segunda
       * classificação e o verificador passaram a julgar o CAPTCHA em vez do
       * ato. Trocar material oficial por página de bloqueio é a única troca que
       * o enriquecimento nunca pode fazer.
       */
      const leitura = conteudoInsuficiente(texto);
      if (leitura.insuficiente) {
        notas.push(`${dominioDe(url)}: ${leitura.motivo}, descartado`);
        if (!primeiroErro) primeiroErro = leitura.motivo;
        continue;
      }

      if (texto.length >= MINIMO_DE_CORPO) {
        notas.push(`${dominioDe(url)}: ${texto.length} caracteres`);
        return {
          texto,
          contentSource: i === 0 ? "pagina_original" : "fonte_secundaria",
          contentLength: texto.length,
          enrichmentStatus: "enriquecida",
          enrichmentSources: buscadas,
          notas,
        };
      }

      notas.push(`${dominioDe(url)}: página aberta, só ${texto.length} caracteres de texto`);
      if (!primeiroErro) primeiroErro = "sem_corpo_na_origem";
    } catch (erro) {
      notas.push(`${dominioDe(url)}: ${(erro as Error).message}`);
      if (!primeiroErro) primeiroErro = "origem_inacessivel";
    }
  }

  const status: StatusDeEnriquecimento =
    buscadas.length === 0
      ? "agregador_sem_link_direto"
      : primeiroErro === "sem_corpo_na_origem"
        ? "sem_corpo_na_origem"
        : "origem_inacessivel";

  return {
    texto: pauta.descricao,
    contentSource: pauta.descricao.length > 0 ? "feed" : "nenhuma",
    contentLength: pauta.descricao.length,
    enrichmentStatus: status,
    enrichmentSources: buscadas,
    notas,
  };
}

async function buscarPagina(url: string, fetcher: typeof fetch): Promise<string> {
  const resposta = await fetcher(url, {
    headers: { "User-Agent": AGENTE, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });

  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

  const tipo = resposta.headers.get("content-type") ?? "";
  if (tipo && !tipo.includes("html") && !tipo.includes("xml")) {
    throw new Error(`resposta não é página (${tipo.split(";")[0]})`);
  }

  const html = await resposta.text();
  return html.slice(0, MAXIMO_DE_HTML);
}

/** Tem matéria suficiente para escrever? */
/**
 * Sinais de que a página respondeu, e não entregou a matéria.
 *
 * O caso que motivou: uma candidata do Federal Register foi APROVADA pela
 * classificação primária, e o verificador de finalista percebeu que o texto
 * "só exibe um bloqueio de acesso e um CAPTCHA". O comprimento estava lá; a
 * matéria não.
 *
 * Nenhum destes termos decide sozinho. Uma matéria sobre segurança digital
 * pode citar CAPTCHA, e um artigo sobre Cloudflare menciona Cloudflare. O que
 * decide é a combinação: marcador de bloqueio somado à ausência de texto
 * corrido. Página de bloqueio tem aviso e botão; matéria tem parágrafo.
 */
const MARCADORES_DE_BLOQUEIO = [
  "captcha",
  "are you a robot",
  "verify you are human",
  "verifique se voce e humano",
  "access denied",
  "acesso negado",
  "403 forbidden",
  "cloudflare",
  "checking your browser",
  "enable javascript",
  "ative o javascript",
  "please enable cookies",
  "sign in to continue",
  "subscribe to read",
  "assine para continuar",
  "faca login para continuar",
  "this page is not available",
  "unusual traffic",
  /*
   * A página de bloqueio do Federal Register, palavra por palavra.
   *
   * Ela passava por todas as três portas daqui, e essa guarda nasceu por causa
   * dela: o comentário lá em cima cita o caso. O motivo é que o aviso é escrito
   * em prosa. Tem um marcador só ("captcha") e nove frases bem formadas com
   * ponto final, então nem a regra de dois marcadores nem a de marcador com
   * pouco corpo o alcançavam. O pipeline trocava um abstract oficial por 861
   * caracteres de aviso de robô e mandava o classificador julgar isso.
   */
  "programmatic access",
  "flagged as potentially automated",
  "bot test",
  "aggressive automated scraping",
];

function normalizarParaBusca(texto: string): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Frases de verdade: com sujeito, tamanho e ponto final. */
function frasesDeMateria(texto: string): number {
  return (texto.match(/[^.!?\n]{40,}[.!?]/g) ?? []).length;
}

export type LeituraDeConteudo = { insuficiente: boolean; motivo: string };

export function conteudoInsuficiente(texto: string): LeituraDeConteudo {
  const bruto = (texto || "").trim();
  if (bruto.length < MINIMO_DE_CORPO) {
    return { insuficiente: true, motivo: `só ${bruto.length} caracteres, mínimo ${MINIMO_DE_CORPO}` };
  }

  const alvo = normalizarParaBusca(bruto);
  const marcadores = MARCADORES_DE_BLOQUEIO.filter((m) => alvo.includes(m));
  const frases = frasesDeMateria(bruto);

  /*
   * Dois marcadores é bloqueio, não coincidência. Um marcador só condena
   * quando o texto também não tem corpo de matéria, que é o caso da página que
   * enche de aviso e não tem parágrafo.
   */
  if (marcadores.length >= 2) {
    return { insuficiente: true, motivo: `página de bloqueio: ${marcadores.slice(0, 3).join(", ")}` };
  }

  if (marcadores.length === 1 && frases < 3) {
    return {
      insuficiente: true,
      motivo: `"${marcadores[0]}" com apenas ${frases} frase(s) de corpo; parece aviso, não matéria`,
    };
  }

  if (frases < 2) {
    return { insuficiente: true, motivo: `${frases} frase(s) de corpo; sem texto corrido que sustente uma pauta` };
  }

  return { insuficiente: false, motivo: "" };
}

/**
 * O enriquecimento trouxe o que aconteceu?
 *
 * Era só comprimento. Comprimento sozinho aprova página de CAPTCHA, que é
 * longa e não diz nada.
 */
export function temFatosSuficientes(resultado: ResultadoDoEnriquecimento): boolean {
  return !conteudoInsuficiente(resultado.texto).insuficiente;
}

/* ------------------------------------------------------------------ */
/* A fonte de uma matéria já publicada, de novo (06/10/2026)           */
/* ------------------------------------------------------------------ */

export type MetadadosDaPagina = {
  titulo: string;
  descricao: string;
  autores: string[];
  publicadaEm: string;
  veiculo: string;
};

/**
 * Título, linha fina, autor, data e veículo, lidos do JSON-LD da página.
 *
 * O texto de `extrairTextoDeHtml` é só o corpo. A matéria reescrita cita o
 * veículo, a data e quem assina, e cada um desses tem que estar no material,
 * senão a ancoragem acusa (com razão) um nome e uma data que ninguém leu.
 */
export function metadadosDaPagina(html: string): MetadadosDaPagina {
  const vazio: MetadadosDaPagina = { titulo: "", descricao: "", autores: [], publicadaEm: "", veiculo: "" };
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let dados: unknown;
    try {
      dados = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const nos = (Array.isArray(dados) ? dados : [dados]).flatMap((d) =>
      d && typeof d === "object" && Array.isArray((d as { "@graph"?: unknown[] })["@graph"]) ? (d as { "@graph": unknown[] })["@graph"] : [d],
    ) as Array<Record<string, unknown>>;
    const materia = nos.find((n) => /Article/.test(String(n?.["@type"] ?? "")));
    if (!materia) continue;
    const autores = (Array.isArray(materia.author) ? materia.author : materia.author ? [materia.author] : [])
      .map((a) => (typeof a === "string" ? a : String((a as { name?: unknown })?.name ?? "")))
      .map((a) => decodificar(a).trim())
      .filter(Boolean);
    const publicador = materia.publisher as { name?: unknown } | undefined;
    return {
      titulo: decodificar(String(materia.headline ?? "")).trim(),
      descricao: decodificar(String(materia.description ?? "")).trim(),
      autores,
      publicadaEm: String(materia.datePublished ?? "").trim(),
      veiculo: decodificar(String(publicador?.name ?? "")).trim(),
    };
  }
  return vazio;
}

export type TextoDaFonte = {
  /** Cabeçalho (título, linha fina, assinatura, data) mais o corpo. */
  texto: string;
  /**
   * Os links de fonte primária citados no CORPO da matéria (06/10/2026):
   * órgão de governo, tribunal, parlamento. É de onde a matéria do portal tira
   * fonte além do veículo (`fontes-da-materia.ts`). Ausente nas leituras
   * antigas.
   */
  linksOficiais?: string[];
  metadados: MetadadosDaPagina;
  /** "original": a página do veículo; "arquivo": a cópia do Internet Archive. */
  via: "original" | "arquivo";
  /** O endereço efetivamente lido. */
  urlLida: string;
  notas: string[];
};

/**
 * A captura mais recente da página no Internet Archive que respondeu 200.
 *
 * Usada só quando o veículo recusa o robô. A cópia é da MESMA matéria, no
 * mesmo endereço, arquivada no dia: não é fonte secundária. O sufixo `id_`
 * pede o HTML original, sem a barra do arquivo injetada.
 */
export async function capturaNoArquivo(url: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const cdx = new URL("https://web.archive.org/cdx/search/cdx");
  cdx.searchParams.set("url", url.replace(/^https?:\/\//, ""));
  cdx.searchParams.set("output", "json");
  cdx.searchParams.set("filter", "statuscode:200");
  cdx.searchParams.set("limit", "-1");
  // O índice do arquivo é lento e às vezes não responde na primeira: uma segunda tentativa.
  let r: Response | null = null;
  for (let tentativa = 0; tentativa < 2 && !r; tentativa++) {
    try {
      const resposta = await fetcher(cdx, { headers: { "User-Agent": AGENTE }, signal: AbortSignal.timeout(45_000) });
      if (resposta.ok) r = resposta;
    } catch (erro) {
      if (tentativa === 1) throw erro;
    }
  }
  if (!r) return null;
  const linhas = (await r.json()) as string[][];
  const ultima = linhas.length > 1 ? linhas[linhas.length - 1] : null;
  return ultima ? `https://web.archive.org/web/${ultima[1]}id_/${ultima[2]}` : null;
}

/*
 * Domínio de fonte primária: governo, Justiça, parlamento e forças armadas,
 * dos EUA e do Brasil. Lista de SUFIXO, porque é o registro do domínio que
 * prova a origem: `.gov` só é vendido a órgão público americano.
 */
const SUFIXOS_OFICIAIS = [".gov", ".mil", ".gov.br", ".jus.br", ".leg.br", ".mil.br"];

function ehDominioOficial(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return SUFIXOS_OFICIAIS.some((s) => h.endsWith(s));
}

/**
 * Os links para fonte primária que o CORPO da matéria cita (06/10/2026).
 *
 * Só o corpo: menu, cabeçalho e rodapé saem antes, como em
 * `extrairTextoDeHtml`, porque o rodapé de jornal americano costuma ter link
 * para usa.gov e nada a ver com a pauta. E só página de dentro: a home do
 * órgão não é fonte de fato nenhum. PDF fica de fora, porque o leitor de
 * página não lê PDF.
 */
export function linksOficiaisDoHtml(html: string, base: string, limite = 6): string[] {
  const corpo = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header\b[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ");
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const bloco of corpo.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    for (const m of bloco[2].matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
      let u: URL;
      try {
        u = new URL(decodificar(m[1]), base);
      } catch {
        continue;
      }
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      if (!ehDominioOficial(u.hostname)) continue;
      if (u.pathname.replace(/\/+$/, "") === "" || /\.pdf$/i.test(u.pathname)) continue;
      u.hash = "";
      const limpo = u.toString();
      if (vistos.has(limpo)) continue;
      vistos.add(limpo);
      saida.push(limpo);
      if (saida.length >= limite) return saida;
    }
  }
  return saida;
}

function montarTextoDaFonte(html: string): { texto: string; metadados: MetadadosDaPagina } {
  const metadados = metadadosDaPagina(html);
  const corpo = extrairTextoDeHtml(html);
  const assinatura = [
    metadados.autores.length ? `By ${metadados.autores.join(", ")}` : "",
    metadados.veiculo,
    metadados.publicadaEm ? `published ${metadados.publicadaEm.slice(0, 10)}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const cabecalho = [metadados.titulo, metadados.descricao, assinatura].filter(Boolean).join("\n");
  return { texto: cabecalho ? `${cabecalho}\n\n${corpo}` : corpo, metadados };
}

/**
 * O texto de uma fonte, para reescrever a matéria a partir dela.
 *
 * Primeiro a página do veículo, com o mesmo agente honesto de
 * `enriquecerPauta`. Se o veículo recusar (a Axios responde 403 com desafio do
 * Cloudflare a qualquer robô) ou entregar página de bloqueio, a cópia
 * arquivada da mesma página. Não se disfarça de navegador em nenhum dos dois:
 * a regra do `AGENTE` continua valendo.
 */
export async function buscarTextoDaFonte(
  url: string,
  fetcher: typeof fetch = fetch,
  /** Recebe o que aconteceu em cada tentativa, inclusive quando nada serviu. */
  notas: string[] = [],
): Promise<TextoDaFonte | null> {
  const tentar = async (endereco: string, via: TextoDaFonte["via"]): Promise<TextoDaFonte | null> => {
    try {
      const html = await buscarPagina(endereco, fetcher);
      const { texto, metadados } = montarTextoDaFonte(html);
      const leitura = conteudoInsuficiente(extrairTextoDeHtml(html));
      if (leitura.insuficiente) {
        notas.push(`${via}: ${leitura.motivo}`);
        return null;
      }
      notas.push(`${via}: ${texto.length} caracteres`);
      // A base é o endereço ORIGINAL: na cópia do arquivo (`id_`) os links não são reescritos.
      return { texto, metadados, via, urlLida: endereco, notas, linksOficiais: linksOficiaisDoHtml(html, url) };
    } catch (erro) {
      notas.push(`${via}: ${(erro as Error).message}`);
      return null;
    }
  };

  const original = await tentar(url, "original");
  if (original) return original;

  let captura: string | null = null;
  try {
    captura = await capturaNoArquivo(url, fetcher);
  } catch (erro) {
    notas.push(`arquivo: consulta falhou, ${(erro as Error).message}`);
  }
  if (!captura) {
    notas.push("arquivo: nenhuma captura com status 200");
    return null;
  }
  const arquivada = await tentar(captura, "arquivo");
  return arquivada ?? null;
}
