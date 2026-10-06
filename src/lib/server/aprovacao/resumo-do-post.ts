import type { AvisoDaPeca, ContextoDeProducao, ResumoDaPeca } from "./contrato";

/**
 * O que a fila guarda de um post, lido da linha de `social_posts`.
 *
 * Saiu de `integracao.ts` em 06/10/2026 porque a seleção refeita do post
 * também enfileira (a peça substituta), e as duas entradas precisam do MESMO
 * resumo e dos MESMOS avisos: duas cópias seriam a regra em dois lugares.
 */

type Linha = Record<string, unknown>;

/** Os avisos de um post do V2, lidos do veredito gravado pela guarda social. */
export function avisosDoPost(linha: Linha): AvisoDaPeca[] {
  const avisos: AvisoDaPeca[] = [];
  if (linha.social_guard_status && linha.social_guard_status !== "passed") {
    avisos.push({ codigo: "SOCIAL_GUARD", detalhe: `guarda social: ${String(linha.social_guard_status)}` });
  }
  const razoes = (linha.social_guard_reasons ?? {}) as { issues?: Array<{ motivo?: string; detalhe?: string }> };
  for (const i of razoes.issues ?? []) {
    avisos.push({ codigo: String(i.motivo ?? "SOCIAL_ISSUE"), detalhe: String(i.detalhe ?? "") });
  }
  return avisos;
}

/**
 * O resumo do post para o painel, mais o contexto da refação quando a linha o
 * traz (`content_json.contexto_da_refacao`, gravado pelo store desde
 * 06/10/2026). É o contexto que a refação do texto e a troca de pauta leem.
 */
export function resumoDoPostDaLinha(linha: Linha): ResumoDaPeca {
  const conteudo = (linha.content_json ?? {}) as Linha;
  const copy = (conteudo.copy ?? {}) as Linha;
  const manifesto = Array.isArray(linha.slides_manifest) ? (linha.slides_manifest as Array<{ url?: string }>) : [];
  const contexto = conteudo.contexto_da_refacao as ContextoDeProducao | undefined;
  return {
    titulo: String(linha.title ?? ""),
    texto: String(linha.caption ?? ""),
    imagens: manifesto.map((m) => String(m.url ?? "")).filter(Boolean),
    // `paragrafos` é o corpo da legenda desde 06/10/2026; os campos antigos ficam para linha antiga.
    pacoteFactual: [
      ...(Array.isArray(copy.paragrafos) ? (copy.paragrafos as unknown[]).map((p) => String(p ?? "")) : []),
      ...["fato_principal", "contexto", "informacao_util", "ressalva"].map((k) => String(copy[k] ?? "")),
    ].filter(Boolean),
    ...(contexto && Array.isArray(contexto.pautas) ? { contexto } : {}),
  };
}
