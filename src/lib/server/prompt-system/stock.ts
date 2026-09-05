/**
 * Busca de foto em banco de imagens, para servir de base à transformação.
 *
 * Gerar do zero produz cena inventada; partir de uma foto real produz cena
 * crível. Para conceitos ancorados em lugar — uma rua brasileira, uma fachada,
 * um ponto turístico — a diferença aparece.
 *
 * ## Onde o crédito aparece, e por quê
 *
 * A decisão editorial é **não creditar no post**. Os dois provedores cabem
 * nisso, por razões diferentes:
 *
 * - **Pexels**: a licença não exige atribuição. Nada a fazer.
 * - **Unsplash**: a licença também não exige, mas as *API Guidelines* — que
 *   valem para quem consome a API, e é o nosso caso — exigem crédito ao
 *   fotógrafo com link de volta ao perfil, com UTM. Isso não é opcional; é
 *   condição de uso da API.
 *
 * A saída não é escolher entre a decisão e os termos: é o lugar. O crédito do
 * Unsplash sai na **página de entrega do material**, que não é post — e é onde
 * a foto de base é de fato relevante para quem vai reproduzir. O post continua
 * sem crédito nenhum.
 *
 * O `atribuicao` é montado aqui, no ato da escolha, e gravado em
 * `prompt_assets.stock_credit`: a mesma busca amanhã devolve outra foto, então
 * o dado não se reconstrói. Mesmo princípio do `prompt_text`.
 *
 * ## Chaves
 *
 * `PEXELS_API_KEY` e `UNSPLASH_ACCESS_KEY` (a *Access Key* da aplicação, usada
 * como `Client-ID`). A *Secret Key* do Unsplash **não** entra: ela serve ao
 * fluxo OAuth de agir em nome de um usuário, que não fazemos.
 *
 * Desligado sem chave. Nenhum provedor é obrigatório: a geração do zero
 * continua sendo o caminho padrão.
 */

export type CreditoDaFoto = {
  provedor: "pexels" | "unsplash";
  fotografo: string;
  /** Perfil do fotógrafo. No Unsplash já vem com o UTM que as guidelines pedem. */
  fotografoUrl: string;
  fotoUrl: string;
  /**
   * Texto de crédito, ou `null` quando o provedor não exige nenhum.
   *
   * Nulo é o sinal que a página de entrega usa para não mostrar nada — e é o
   * que mantém o Pexels sem crédito sem precisar de um `if` por provedor
   * espalhado pela renderização.
   */
  atribuicao: string | null;
};

export type FotoDeBanco = {
  imagemUrl: string;
  credito: CreditoDaFoto;
};

type Opts = {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
};

/**
 * Toda chamada ao banco de imagem tem prazo.
 *
 * Estas eram as únicas chamadas de rede do pipeline sem `AbortSignal`. Uma
 * conexão que abre e não responde deixaria a redação inteira pendurada sem
 * consumir CPU e sem erro, e a única pista seria a requisição que nunca
 * termina. Foto é o item mais dispensável da edição: se o banco demorar, a
 * pauta sai sem imagem.
 */
const TEMPO_LIMITE_MS = 15_000;

export function bancoConfigurado(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.PEXELS_API_KEY?.trim() || env.UNSPLASH_ACCESS_KEY?.trim());
}

/**
 * UTM que as API Guidelines do Unsplash exigem nos links de volta.
 *
 * `utm_source` tem que ser o nome da aplicação registrada no Unsplash — é
 * assim que eles atribuem o tráfego à app. Configurável porque o nome
 * registrado pode não ser o slug que eu escolheria.
 */
function utmDoUnsplash(env: Record<string, string | undefined>): string {
  const app = (env.UNSPLASH_APP_NAME ?? "imigra-us").trim() || "imigra-us";
  return `?utm_source=${encodeURIComponent(app)}&utm_medium=referral`;
}

/**
 * Consulta de busca a partir da aplicação.
 *
 * Curta e em inglês: o banco indexa em inglês e devolve quase nada para frase
 * longa em português. Palavras de instrução ("use uma foto sua", "transforme")
 * são ruído para busca de imagem e saem.
 */
export function consultaDeBusca(aplicacao: string, conceito = ""): string {
  const RUIDO = new Set([
    "use","uma","foto","sua","seu","minha","do","da","de","com","para","em","transforme",
    "crie","criar","fotografe","coloque","insira","como","que","e","o","a","os","as","no","na",
    "pessoa","comum","casal","pet","profissao","profissão",
  ]);

  const palavras = `${aplicacao} ${conceito}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 2 && !RUIDO.has(p));

  return [...new Set(palavras)].slice(0, 5).join(" ");
}

async function buscarNoPexels(
  consulta: string,
  { env = process.env, fetcher = fetch }: Opts,
): Promise<FotoDeBanco | null> {
  const chave = env.PEXELS_API_KEY?.trim();
  if (!chave) return null;

  try {
    const url =
      `https://api.pexels.com/v1/search?per_page=1&orientation=portrait&query=` +
      encodeURIComponent(consulta);

    const res = await fetcher(url, {
      headers: { Authorization: chave },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!res.ok) {
      console.warn(`[BANCO] Pexels respondeu ${res.status}`);
      return null;
    }

    const json = await res.json();
    const foto = json?.photos?.[0];
    if (!foto?.src?.large2x) return null;

    return {
      imagemUrl: String(foto.src.large2x),
      credito: {
        provedor: "pexels",
        fotografo: String(foto.photographer ?? "desconhecido"),
        fotografoUrl: String(foto.photographer_url ?? ""),
        fotoUrl: String(foto.url ?? ""),
        // A licença do Pexels não pede crédito, e a decisão é não creditar.
        atribuicao: null,
      },
    };
  } catch (err) {
    console.warn("[BANCO] Exceção no Pexels:", err);
    return null;
  }
}

async function buscarNoUnsplash(
  consulta: string,
  { env = process.env, fetcher = fetch }: Opts,
): Promise<FotoDeBanco | null> {
  const chave = env.UNSPLASH_ACCESS_KEY?.trim();
  if (!chave) return null;

  try {
    const url =
      `https://api.unsplash.com/search/photos?per_page=1&orientation=portrait&query=` +
      encodeURIComponent(consulta);

    const res = await fetcher(url, {
      headers: { Authorization: `Client-ID ${chave}` },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!res.ok) {
      console.warn(`[BANCO] Unsplash respondeu ${res.status}`);
      return null;
    }

    const json = await res.json();
    const foto = json?.results?.[0];
    if (!foto?.urls?.regular) return null;

    // Exigido pelas API Guidelines: avisar que a foto foi usada. Não bloqueia
    // o uso se falhar, mas fica registrado — é termo de uso, não telemetria.
    const downloadLocation = foto?.links?.download_location;
    if (downloadLocation) {
      void Promise.resolve(
        fetcher(String(downloadLocation), {
          headers: { Authorization: `Client-ID ${chave}` },
          signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        }),
      ).catch(() => console.warn("[BANCO] Não consegui registrar o download no Unsplash."));
    }

    const utm = utmDoUnsplash(env);
    const fotografo = String(foto.user?.name ?? "desconhecido");
    const perfil = String(foto.user?.links?.html ?? "");

    return {
      imagemUrl: String(foto.urls.regular),
      credito: {
        provedor: "unsplash",
        fotografo,
        fotografoUrl: perfil ? `${perfil}${utm}` : "",
        fotoUrl: String(foto.links?.html ?? ""),
        atribuicao: `Foto de ${fotografo} no Unsplash`,
      },
    };
  } catch (err) {
    console.warn("[BANCO] Exceção no Unsplash:", err);
    return null;
  }
}

/**
 * Consulta a partir do prompt de capa que a IA escreveu.
 *
 * Esse prompt já vem em inglês e descrevendo a cena — que é exatamente o que
 * banco de imagem indexa. O que atrapalha é a direção fotográfica
 * ("editorial", "natural light", "shallow depth of field"): são adjetivos que
 * cabem em qualquer foto do acervo e diluem a busca até devolver qualquer
 * coisa.
 */
export function consultaDaCapa(promptDaCapa: string, titulo = ""): string {
  const RUIDO = new Set([
    "editorial", "photojournalism", "photograph", "photography", "photo", "realistic",
    "documentary", "natural", "available", "light", "lighting", "muted", "colors", "color",
    "shallow", "depth", "field", "shot", "full", "frame", "camera", "lens", "candid",
    "unstaged", "vertical", "portrait", "framing", "image", "scene", "context", "background",
    "high", "quality", "cinematic", "render", "daytime", "daylight", "overcast",
    "the", "and", "with", "for", "from", "not", "text", "words", "logos", "watermarks",
    "typography", "lettering", "numbers", "brand", "marks", "absolutely", "anywhere",
  ]);

  const base = `${promptDaCapa || ""} ${titulo}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 2 && !RUIDO.has(p));

  return [...new Set(base)].slice(0, 4).join(" ");
}

/**
 * Consulta para a foto de uma pauta da newsletter.
 *
 * O título da notícia é português e banco de imagem indexa em inglês — buscar
 * "fila do green card chega a 179 anos" devolve praticamente nada, e o pouco
 * que devolve não tem relação. Daí o mapa de conceito: o que importa para
 * achar a foto não é a frase, é o assunto.
 *
 * A lista é curta de propósito. Termo genérico demais ("news", "government")
 * traz a mesma foto para pautas diferentes, que é o problema que este mapa
 * existe para resolver.
 */
const CONCEITOS: Array<{ termos: string[]; consulta: string }> = [
  { termos: ["green card", "residencia permanente", "residente permanente"], consulta: "green card application documents" },
  { termos: ["visto de trabalho", "h-1b", "h1b", "eb-2", "eb-3", "eb2", "eb3"], consulta: "office worker professional american" },
  { termos: ["visto de estudante", "f-1", "intercambio", "universidade"], consulta: "university campus students america" },
  { termos: ["ice", "deporta", "detid", "custodia", "fiscaliza"], consulta: "law enforcement officer uniform" },
  { termos: ["fronteira", "border"], consulta: "border fence desert landscape" },
  { termos: ["asilo", "refugiad"], consulta: "family suitcase airport waiting" },
  { termos: ["cidadania", "naturaliza", "juramento"], consulta: "american flag ceremony people" },
  { termos: ["uscis", "formulario", "peticao", "taxa", "processamento"], consulta: "paperwork forms desk office" },
  { termos: ["consulad", "embaixad", "entrevista", "passaporte"], consulta: "passport travel documents" },
  { termos: ["corte", "tribunal", "juiz", "decisao", "decreto", "lei", "regra"], consulta: "courthouse columns architecture" },
  { termos: ["fila", "espera", "prazo", "boletim"], consulta: "waiting room chairs people" },
  { termos: ["trump", "casa branca", "governo", "congresso", "senado"], consulta: "washington capitol building" },
  { termos: ["dolar", "cambio", "custo", "economia", "salario"], consulta: "us dollars money finance" },
];

/** Foto padrão quando nada casa. Genérica, mas sempre do tema. */
const CONSULTA_PADRAO = "american flag city skyline";

export function consultaDaNoticia(titulo: string, categoria = ""): string {
  const texto = `${titulo} ${categoria}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  for (const c of CONCEITOS) {
    if (c.termos.some((t) => texto.includes(t))) return c.consulta;
  }
  return CONSULTA_PADRAO;
}

/**
 * Busca a foto de base. `null` quando não há chave, resultado ou a API falha.
 *
 * Pexels primeiro: é o provedor que não exige crédito nenhum, então a ordem
 * faz a maioria das imagens não gerar obrigação de atribuição. O Unsplash
 * entra quando o Pexels não tem a cena — melhor uma foto creditada na página
 * de entrega que uma cena inventada.
 */
export async function buscarFotoDeBanco(
  consulta: string,
  opts: Opts = {},
): Promise<FotoDeBanco | null> {
  if (!consulta.trim()) return null;
  return (await buscarNoPexels(consulta, opts)) ?? (await buscarNoUnsplash(consulta, opts));
}
