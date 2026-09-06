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

  const paragrafos = [...limpo.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => decodificar(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
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
