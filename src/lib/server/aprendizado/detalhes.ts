import type { Aprovacao, Etapa, PautaDoContexto } from "../aprovacao/contrato";
import { dominioDe } from "../editorial/url-canonica";
import type { ArteRecusada, DetalhesDaReprovacao, PautaRecusada } from "./contrato";

/**
 * O que a peça reprovada tinha, para a etapa certa aprender (06/10/2026).
 *
 * Lido na hora da reprovação, da linha da fila (a pauta e as fotos da
 * newsletter estão no `resumo.contexto`) e da peça (a foto de fundo e a arte do
 * post, a capa do artigo). Pura, para teste: quem lê a peça é o adaptador.
 */

/** O que o adaptador das peças sabe dizer além do texto. Ver `PecaLida`. */
export type ExtrasDaPeca = {
  /** A foto de fundo do post, a capa do artigo. Nunca a arte renderizada. */
  fotos?: string[];
  arte?: ArteRecusada | null;
};

function pautaRecusada(p: PautaDoContexto): PautaRecusada {
  return {
    storyId: p.storyId,
    titulo: p.titulo.slice(0, 200),
    fonte: dominioDe(p.url) || p.fonteNome.toLowerCase(),
    atores: (p.atores ?? []).slice(0, 6),
    eixo: p.eixo || p.categoria || "",
  };
}

function pautasDaPeca(a: Aprovacao, alvo: string | null): PautaDoContexto[] {
  const doContexto = a.resumo.contexto?.pautas ?? [];
  const o = a.resumo.origemDoArtigo;
  const daOrigem: PautaDoContexto[] = o
    ? [
        {
          storyId: o.storyId,
          titulo: o.titulo,
          url: o.fonteUrl,
          fonteNome: o.fonteNome,
          publicadoEm: "",
          resumo: "",
          categoria: o.eixo,
          eixo: o.eixo,
          pais: o.pais,
          atores: o.atores,
          lugares: o.lugares,
          acontecimento: o.acontecimento,
        },
      ]
    : [];
  const todas = doContexto.length > 0 ? doContexto : daOrigem;
  /*
   * Na newsletter a peça tem de duas a quatro pautas, e o editor aponta qual
   * saiu. Sem apontar, a reprovação de seleção é da edição inteira, e ensinar
   * as quatro como recusadas puniria três pautas que ninguém recusou.
   */
  if (a.ramo === "newsletter") return alvo ? todas.filter((p) => p.storyId === alvo) : [];
  return todas.slice(0, 1);
}

function fotosDaPeca(a: Aprovacao, extras: ExtrasDaPeca | null, alvo: string | null): string[] {
  if (a.ramo === "newsletter") {
    const imagens = a.resumo.contexto?.imagens ?? {};
    if (alvo) return imagens[alvo] ? [imagens[alvo]] : [];
    return Object.values(imagens).filter(Boolean);
  }
  if (extras?.fotos?.length) return extras.fotos.filter(Boolean);
  // O artigo guarda a capa no resumo; o post guarda a ARTE, que não é a foto, e por isso não entra.
  return a.ramo === "artigo" ? (a.resumo.imagens ?? []).filter(Boolean) : [];
}

export function detalhesDaReprovacao(
  a: Aprovacao,
  etapa: Etapa,
  extras: ExtrasDaPeca | null,
  alvo: string | null = null,
): DetalhesDaReprovacao {
  const detalhes: DetalhesDaReprovacao = {};
  const pautas = pautasDaPeca(a, alvo)
    .filter((p) => p && typeof p.storyId === "string" && typeof p.url === "string")
    .map(pautaRecusada);
  if (pautas.length > 0) detalhes.pautas = pautas;
  if (etapa === "imagem") {
    const fotos = fotosDaPeca(a, extras, alvo);
    if (fotos.length > 0) detalhes.fotos = fotos.slice(0, 4);
  }
  if (etapa === "arte" && a.ramo === "post" && extras?.arte) detalhes.arte = extras.arte;
  return detalhes;
}

/** O molde do feed que uma linha de `social_posts` desenhou, pelo que ela gravou em `content_json.arte`. */
export function arteDaLinhaDoPost(arte: Record<string, unknown> | null | undefined): ArteRecusada | null {
  if (!arte || typeof arte !== "object") return null;
  const gramatica = typeof arte.gramatica === "string" ? arte.gramatica : null;
  const variante = typeof arte.variante === "string" ? arte.variante : "";
  const bolha = typeof arte.bolha === "boolean" ? arte.bolha : null;
  const molde: ArteRecusada["molde"] =
    variante === "noticia_sem_foto"
      ? "sem_foto"
      : gramatica === "recorte" || variante === "recorte_post"
        ? "recorte"
        : bolha === true
          ? "jornal_bolha"
          : gramatica || variante
            ? "jornal"
            : null;
  return { molde, gramatica, bolha };
}
