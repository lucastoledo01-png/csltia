import type { SupabaseClient } from "@supabase/supabase-js";
import type { PecaPronta } from "../ramos/peca";
import type { ConteudoDoArtigo } from "../ramos/portal";
import type { AvisoDaPeca, Ramo, ResumoDaPeca } from "./contrato";
import { enfileirar, type DepsDaFila, type PecaParaFila, type ProjetoDaFila } from "./fila";
import { modoDaFila } from "./modo";

/**
 * As peças dos três ramos entrando na fila de aprovação (integração de 05/10/2026).
 *
 * Os ramos entregam cada peça pronta por `RunNewsroomOptions.aoProduzirPeca`.
 * A fila identifica a peça pela linha da tabela dela (`articles.id`,
 * `social_posts.id`, `news_editions.id`), e o ramo pela referência do canal
 * (o slug, a chave de idempotência, o id da edição). Este módulo é a ponte.
 *
 * ## Uma peça, uma linha na fila
 *
 * Dois caminhos já enfileiravam sozinhos antes desta ligação:
 *
 *   post        o store do Social V2 (`opcoesDaFilaParaOStore`) enfileira cada
 *               post logo depois de gravá-lo;
 *   newsletter  a redação (`enfileirarDaRedacao`) enfileira a edição com o
 *               resumo completo, depois de gravá-la.
 *
 * A tabela já tem `(project_id, ramo, peca_id)` único, mas confiar só nela
 * não basta: `enfileirar` com um hash DIFERENTE do gravado devolveria a peça a
 * `aguardando` e apagaria uma aprovação. Então a regra aqui é: se a peça já
 * está na fila, não se toca nela. E o hash, quando é preciso enfileirar, sai
 * da linha da tabela pelo MESMO adaptador que o portão usa, nunca do
 * conteúdo que o ramo montou.
 *
 * A newsletter não é enfileirada por aqui, de propósito: a redação a
 * enfileira logo em seguida, com o resumo completo e o horário de envio, e
 * este caminho chegaria antes com um resumo mais pobre.
 */

export type LocalizadorDaPeca = (ramo: Ramo, referenciaId: string) => Promise<string | null>;

export type DepsDosRamosNaFila = Pick<DepsDaFila, "store" | "pecas"> &
  Partial<Pick<DepsDaFila, "ganchos" | "alertar" | "agora">> & {
    localizar: LocalizadorDaPeca;
  };

export type DesfechoDaEntrada =
  | { acao: "fila_desligada" }
  | { acao: "ignorada"; motivo: string }
  | { acao: "ja_na_fila"; pecaId: string }
  | { acao: "sem_linha"; motivo: string }
  | { acao: "enfileirada"; pecaId: string };

function avisosDoRamo(peca: PecaPronta): AvisoDaPeca[] {
  return peca.avisos.map((detalhe) => ({ codigo: "AVISO_DO_RAMO", detalhe }));
}

function resumoDoArtigo(peca: PecaPronta<ConteudoDoArtigo>): { resumo: ResumoDaPeca; publicarEm: string | null } {
  const c = peca.conteudo;
  return {
    publicarEm: c.publicarEm ?? null,
    resumo: {
      titulo: c.artigo.titulo,
      texto: c.artigo.titulo,
      slug: c.slug,
      imagens: c.capa ? [c.capa] : [],
      fonteUrl: c.fonte.url || null,
      pacoteFactual: (c.origem?.pacote.verified_facts ?? []).slice(0, 12),
      origemDoArtigo: c.origem ?? null,
    },
  };
}

export async function levarPecaDoRamoAFila(
  projeto: ProjetoDaFila,
  peca: PecaPronta,
  deps: DepsDosRamosNaFila,
): Promise<DesfechoDaEntrada> {
  if (modoDaFila(projeto) === "off") return { acao: "fila_desligada" };
  if (peca.ramo === "newsletter") {
    return { acao: "ignorada", motivo: "a redação enfileira a newsletter com o resumo completo" };
  }
  if (!peca.aprovadaPeloAuditor) {
    // A peça barrada pelo auditor não vira linha em tabela nenhuma: não há o que aprovar.
    return { acao: "ignorada", motivo: "barrada pelo auditor do ramo" };
  }

  const ramo: Ramo = peca.ramo;
  const pecaId = await deps.localizar(ramo, peca.referenciaId);
  if (!pecaId) return { acao: "sem_linha", motivo: `nenhuma linha gravada para ${peca.referenciaId}` };

  if (await deps.store.porPeca(projeto.id, ramo, pecaId)) return { acao: "ja_na_fila", pecaId };

  const lida = await deps.pecas.ler(ramo, pecaId);
  if (!lida) return { acao: "sem_linha", motivo: `a linha ${pecaId} sumiu antes de entrar na fila` };

  let resumo: ResumoDaPeca;
  let publicarEm: string | null = null;
  if (ramo === "artigo") {
    const r = resumoDoArtigo(peca as PecaPronta<ConteudoDoArtigo>);
    resumo = r.resumo;
    publicarEm = r.publicarEm;
  } else {
    const c = (peca.conteudo ?? {}) as { legenda?: string; imagem?: string | null; vaga?: { quandoIso?: string } };
    resumo = { titulo: peca.titulo, texto: c.legenda ?? lida.texto, imagens: c.imagem ? [c.imagem] : [] };
    publicarEm = typeof c.vaga?.quandoIso === "string" ? c.vaga.quandoIso : null;
  }

  const entrada: PecaParaFila = {
    ramo,
    pecaId,
    hash: lida.hashAtual,
    publicarEm,
    avisos: avisosDoRamo(peca),
    resumo,
  };
  await enfileirar(projeto, entrada, { ganchos: {}, ...deps });
  return { acao: "enfileirada", pecaId };
}

/** Acha a linha da peça pela referência que o ramo usa. */
export function localizadorSupabase(client: SupabaseClient, projectId: string): LocalizadorDaPeca {
  return async (ramo, referenciaId) => {
    const [tabela, coluna] =
      ramo === "artigo"
        ? ["articles", "slug"]
        : ramo === "post"
          ? ["social_posts", "idempotency_key"]
          : ["news_editions", "id"];
    const { data, error } = await client
      .from(tabela)
      .select("id")
      .eq("project_id", projectId)
      .eq(coluna, referenciaId)
      .maybeSingle();
    // "Não consegui olhar" sobe como erro, e não vira "não existe" (lição de 13/09/2026).
    if (error) throw new Error(`não consegui ler ${tabela} ${referenciaId}: ${error.message}`);
    return (data as { id?: string } | null)?.id ?? null;
  };
}
