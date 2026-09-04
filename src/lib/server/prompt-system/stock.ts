/**
 * Busca de foto em banco de imagens, para servir de base à transformação.
 *
 * Gerar do zero produz cena inventada; partir de uma foto real produz cena
 * crível. Para conceitos ancorados em lugar — uma rua brasileira, uma fachada,
 * um ponto turístico — a diferença aparece.
 *
 * **A licença dos dois bancos exige atribuição ao fotógrafo.** O crédito é
 * capturado no momento em que a foto é escolhida e gravado junto do asset, em
 * `prompt_assets.stock_credit` — mesmo princípio do `prompt_text`: o dado que
 * comprova a origem se registra no ato, nunca se reconstrói depois. Sem isso a
 * atribuição depende de alguém lembrar, e ninguém lembra.
 *
 * O Unsplash pede ainda um disparo no endpoint de download quando a foto é
 * efetivamente usada; é parte dos termos da API, não opcional, e está feito
 * abaixo.
 *
 * Desligado sem chave configurada. Nenhum dos dois provedores é obrigatório: a
 * geração do zero continua sendo o caminho padrão.
 */

export type CreditoDaFoto = {
  provedor: "pexels" | "unsplash";
  fotografo: string;
  fotografoUrl: string;
  fotoUrl: string;
  /** Texto pronto para publicar junto do material. */
  atribuicao: string;
};

export type FotoDeBanco = {
  imagemUrl: string;
  credito: CreditoDaFoto;
};

type Opts = {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
};

export function bancoConfigurado(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.PEXELS_API_KEY?.trim() || env.UNSPLASH_ACCESS_KEY?.trim());
}

async function buscarNoPexels(consulta: string, { env = process.env, fetcher = fetch }: Opts): Promise<FotoDeBanco | null> {
  const chave = env.PEXELS_API_KEY?.trim();
  if (!chave) return null;

  try {
    const url =
      `https://api.pexels.com/v1/search?per_page=1&orientation=portrait&query=` +
      encodeURIComponent(consulta);

    const res = await fetcher(url, { headers: { Authorization: chave } });
    if (!res.ok) {
      console.warn(`[BANCO] Pexels respondeu ${res.status}`);
      return null;
    }

    const json = await res.json();
    const foto = json?.photos?.[0];
    if (!foto?.src?.large2x) return null;

    const fotografo = String(foto.photographer ?? "Fotógrafo desconhecido");
    return {
      imagemUrl: String(foto.src.large2x),
      credito: {
        provedor: "pexels",
        fotografo,
        fotografoUrl: String(foto.photographer_url ?? ""),
        fotoUrl: String(foto.url ?? ""),
        atribuicao: `Foto de ${fotografo} no Pexels`,
      },
    };
  } catch (err) {
    console.warn("[BANCO] Exceção no Pexels:", err);
    return null;
  }
}

async function buscarNoUnsplash(consulta: string, { env = process.env, fetcher = fetch }: Opts): Promise<FotoDeBanco | null> {
  const chave = env.UNSPLASH_ACCESS_KEY?.trim();
  if (!chave) return null;

  try {
    const url =
      `https://api.unsplash.com/search/photos?per_page=1&orientation=portrait&query=` +
      encodeURIComponent(consulta);

    const res = await fetcher(url, { headers: { Authorization: `Client-ID ${chave}` } });
    if (!res.ok) {
      console.warn(`[BANCO] Unsplash respondeu ${res.status}`);
      return null;
    }

    const json = await res.json();
    const foto = json?.results?.[0];
    if (!foto?.urls?.regular) return null;

    // Parte dos termos da API do Unsplash: avisar que a foto foi usada. Falhar
    // aqui não impede o uso, mas é registrado.
    const downloadLocation = foto?.links?.download_location;
    if (downloadLocation) {
      void fetcher(String(downloadLocation), {
        headers: { Authorization: `Client-ID ${chave}` },
      }).catch(() => console.warn("[BANCO] Não consegui registrar o download no Unsplash."));
    }

    const fotografo = String(foto.user?.name ?? "Fotógrafo desconhecido");
    return {
      imagemUrl: String(foto.urls.regular),
      credito: {
        provedor: "unsplash",
        fotografo,
        fotografoUrl: String(foto.user?.links?.html ?? ""),
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
 * Consulta de busca a partir da aplicação.
 *
 * Curta e em inglês: os dois bancos indexam em inglês e devolvem quase nada
 * para frase longa em português. Palavras de instrução ("use uma foto sua",
 * "transforme") são ruído para busca de imagem e saem.
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

/** Busca no provedor configurado. Pexels primeiro por não exigir tracking. */
export async function buscarFotoDeBanco(
  consulta: string,
  opts: Opts = {},
): Promise<FotoDeBanco | null> {
  if (!consulta.trim()) return null;
  return (await buscarNoPexels(consulta, opts)) ?? (await buscarNoUnsplash(consulta, opts));
}
