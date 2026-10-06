import { arquivoDeLogotipoValido, baixarLogotipo, comporCartaoDaMarca } from "@/lib/server/visual/cartao-da-marca";

/**
 * O cartão do logotipo (06/10/2026, "imagem certeira"), servido como imagem.
 *
 * A capa de uma pauta sobre uma empresa sem foto com a marca legível é o
 * logotipo oficial (P154 do Wikidata) num cartão neutro. O cartão é composto
 * aqui, na hora, a partir do arquivo do Commons, e não gravado no Storage: o
 * endereço depende só do nome do arquivo, então a mesma capa é o mesmo
 * endereço, e o resolvedor não escreve nada para propor uma foto.
 *
 * A rota só aceita nome de arquivo do Commons (o host é fixo): não é um proxy
 * de imagem para qualquer endereço.
 */
export const runtime = "nodejs";

export async function GET(request: Request) {
  const arquivo = new URL(request.url).searchParams.get("arquivo") ?? "";
  if (!arquivoDeLogotipoValido(arquivo)) {
    return new Response("arquivo inválido", { status: 400 });
  }
  try {
    const logotipo = await baixarLogotipo(arquivo);
    const { png } = await comporCartaoDaMarca(logotipo);
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        // O logotipo de um arquivo do Commons não muda de endereço; um dia de cache no navegador e uma semana na CDN.
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch (erro) {
    return new Response(`logotipo indisponível: ${(erro as Error).message}`, { status: 502 });
  }
}
