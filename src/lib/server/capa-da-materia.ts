import { arquivoDoCommonsNoEndereco, creditoPorEndereco, type CreditoDaFoto } from "@/lib/credito-da-capa";
import { avaliarLicenca } from "./visual/licencas";
import { arquivoDoCommons } from "./visual/wikimedia";

/**
 * O crédito da capa resolvido na ORIGEM, para a linha que não gravou crédito
 * (06/10/2026).
 *
 * A capa do Commons tinha só o link genérico para a página do arquivo, e a do
 * Pexels nada. Aqui o crédito sai de quem sabe: a página do arquivo no Commons
 * (autor, licença e medida, pela API) e a API do Pexels (fotógrafo e página,
 * quando há `PEXELS_API_KEY`). A página da matéria chama isto com um `fetch`
 * de cache longo, e o script de conserto das capas grava o resultado no corpo,
 * para a página parar de perguntar.
 *
 * Nunca lança: falha de rede ou de formato devolve o crédito que o endereço
 * permite saber (`creditoPorEndereco`), que já tem a origem e o link.
 */
export async function resolverCreditoDaCapa(
  capa: string | null | undefined,
  opcoes: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; tempoLimiteMs?: number } = {},
): Promise<CreditoDaFoto | null> {
  const piso = creditoPorEndereco(capa);
  if (!piso) return null;
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const tempoLimiteMs = opcoes.tempoLimiteMs ?? 4000;

  const arquivo = arquivoDoCommonsNoEndereco(capa);
  if (arquivo) {
    try {
      let nome = arquivo;
      try {
        nome = decodeURIComponent(arquivo);
      } catch {
        // Nome com `%` solto: vai como está.
      }
      const c = await arquivoDoCommons(nome, { env, fetcher, tempoLimiteMs });
      if (!c) return piso;
      // O nome curto da licença ("CC BY-SA 4.0") é o que a página do arquivo declara; a régua só o normaliza.
      const veredicto = avaliarLicenca(c.licenca, env);
      return {
        autor: c.autor,
        licenca: c.licenca || veredicto.nome,
        origem: "Wikimedia Commons",
        href: c.paginaUrl || piso.href,
        ...(c.largura > 0 && c.altura > 0 ? { largura: c.largura, altura: c.altura } : {}),
      };
    } catch {
      return piso;
    }
  }

  const idDoPexels = piso.origem === "Pexels" ? piso.href.match(/\/photo\/(\d+)\//)?.[1] : undefined;
  const chave = env.PEXELS_API_KEY?.trim();
  if (idDoPexels && chave) {
    try {
      const r = await fetcher(`https://api.pexels.com/v1/photos/${idDoPexels}`, {
        headers: { Authorization: chave },
        signal: AbortSignal.timeout(tempoLimiteMs),
      });
      if (!r.ok) return piso;
      const foto = (await r.json()) as { photographer?: unknown; url?: unknown; width?: unknown; height?: unknown };
      return {
        ...piso,
        autor: typeof foto.photographer === "string" ? foto.photographer : "",
        href: typeof foto.url === "string" && foto.url ? foto.url : piso.href,
        ...(Number(foto.width) > 0 && Number(foto.height) > 0 ? { largura: Number(foto.width), altura: Number(foto.height) } : {}),
      };
    } catch {
      return piso;
    }
  }
  return piso;
}

/**
 * O `fetch` que a página da matéria passa: a resposta do Commons e do Pexels
 * fica no cache de dados do Next por um dia. A matéria revalida a cada cinco
 * minutos, e o autor de uma foto não muda de um dia para o outro.
 */
export const fetchComCacheDeUmDia: typeof fetch = (entrada, init) =>
  fetch(entrada, { ...init, next: { revalidate: 86_400 } } as RequestInit);
