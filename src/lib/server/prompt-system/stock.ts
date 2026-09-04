/**
 * Busca de foto em banco de imagens, para servir de base à transformação.
 *
 * Gerar do zero produz cena inventada; partir de uma foto real produz cena
 * crível. Para conceitos ancorados em lugar — uma rua brasileira, uma fachada,
 * um ponto turístico — a diferença aparece.
 *
 * **Só Pexels, e a razão é de termos de uso.** A licença do Pexels não exige
 * atribuição ao fotógrafo — é bem-vinda, não obrigatória. Já as API Guidelines
 * do Unsplash exigem atribuição visível de quem consome a API deles, o que
 * colide com a decisão editorial de não creditar no post. Manter o Unsplash
 * como fallback seria manter um caminho que só é legítimo se o crédito
 * aparecer — e ele não vai aparecer.
 *
 * A origem continua sendo gravada em `prompt_assets.stock_credit`, mas como
 * **registro interno de proveniência**, não como texto a publicar: saber de
 * onde veio cada imagem é o que permite responder a uma contestação depois. O
 * dado se grava no ato; não se reconstrói (a mesma busca amanhã devolve outra
 * foto).
 *
 * Desligado sem chave configurada. Nenhum provedor é obrigatório: a geração do
 * zero continua sendo o caminho padrão.
 */

export type CreditoDaFoto = {
  provedor: "pexels";
  fotografo: string;
  fotografoUrl: string;
  fotoUrl: string;
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
  return Boolean(env.PEXELS_API_KEY?.trim());
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

/** Busca a foto de base. `null` quando não há chave, resultado ou a API falha. */
export async function buscarFotoDeBanco(
  consulta: string,
  { env = process.env, fetcher = fetch }: Opts = {},
): Promise<FotoDeBanco | null> {
  const chave = env.PEXELS_API_KEY?.trim();
  if (!chave || !consulta.trim()) return null;

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

    return {
      imagemUrl: String(foto.src.large2x),
      credito: {
        provedor: "pexels",
        fotografo: String(foto.photographer ?? "desconhecido"),
        fotografoUrl: String(foto.photographer_url ?? ""),
        fotoUrl: String(foto.url ?? ""),
      },
    };
  } catch (err) {
    console.warn("[BANCO] Exceção no Pexels:", err);
    return null;
  }
}
