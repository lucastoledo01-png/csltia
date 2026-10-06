import type { Reprovacao } from "../aprovacao/fila-store";
import { MOLDES_DO_FEED, type MoldeDoFeed, type MoldesLigados } from "../social/moldes-do-feed";
import { RECUSAS_PARA_BLOQUEAR } from "./contrato";

/**
 * A arte do post aprende com as artes recusadas (06/10/2026). Só o post tem
 * arte: a newsletter e a matéria são HTML de template.
 *
 * Duas decisões de arte existem de verdade na esteira: o molde (jornal,
 * jornal com bolha, recorte, sem foto) e a bolha. São elas que aprendem:
 *
 *   - O molde recusado `RECUSAS_PARA_BLOQUEAR` vezes em trinta dias sai da
 *     escolha do feed, como se o dono o tivesse desligado no painel, e o log
 *     do ciclo diz por quê. O jornal nunca sai: é o molde de base, e sem ele
 *     não sobra peça para desenhar.
 *   - A refação da arte troca a decisão recusada em vez de recongelar a mesma
 *     peça: recorte vira jornal, bolha sai, e jornal tenta o recorte quando o
 *     recorte está ligado e não foi recusado. O motivo do editor e a troca
 *     ficam gravados em `content_json.arte.aprendizado`.
 */

export type AprendizadoDaArte = {
  recusasPorMolde: Partial<Record<MoldeDoFeed, number>>;
  /** Os moldes com recusas suficientes para sair da escolha. Nunca inclui `jornal`. */
  moldesEvitados: MoldeDoFeed[];
  motivos: string[];
};

export function aprendizadoDaArteVazio(): AprendizadoDaArte {
  return { recusasPorMolde: {}, moldesEvitados: [], motivos: [] };
}

export function aprendizadoDaArte(reprovacoes: Pick<Reprovacao, "etapa" | "motivo" | "detalhes">[]): AprendizadoDaArte {
  const ap = aprendizadoDaArteVazio();
  for (const r of reprovacoes) {
    if (r.etapa !== "arte") continue;
    const molde = r.detalhes?.arte?.molde;
    if (molde && (MOLDES_DO_FEED as readonly string[]).includes(molde)) {
      ap.recusasPorMolde[molde] = (ap.recusasPorMolde[molde] ?? 0) + 1;
    }
    const m = r.motivo.replace(/\s+/g, " ").trim();
    if (m && ap.motivos.length < 5) ap.motivos.push(m.slice(0, 160));
  }
  ap.moldesEvitados = MOLDES_DO_FEED.filter(
    (m) => m !== "jornal" && (ap.recusasPorMolde[m] ?? 0) >= RECUSAS_PARA_BLOQUEAR,
  );
  return ap;
}

/** Os moldes do projeto com o aprendizado: só desliga, nunca liga o que o dono desligou. */
export function moldesComAprendizado(
  ligados: MoldesLigados,
  ap: AprendizadoDaArte,
): { moldes: MoldesLigados; desligados: Array<{ molde: MoldeDoFeed; recusas: number }>; linhas: string[] } {
  const desligados = ap.moldesEvitados
    .filter((m) => ligados[m])
    .map((m) => ({ molde: m, recusas: ap.recusasPorMolde[m] ?? 0 }));
  if (desligados.length === 0) return { moldes: ligados, desligados, linhas: [] };
  const moldes = { ...ligados };
  for (const d of desligados) moldes[d.molde] = false;
  return {
    moldes,
    desligados,
    linhas: desligados.map(
      (d) => `[APRENDIZADO post] molde ${d.molde} fora da escolha: recusado ${d.recusas} vezes pelo editor em 30 dias`,
    ),
  };
}

export type DecisaoDaArteNaRefacao = {
  gramatica: "jornal" | "recorte";
  /** A bolha nunca volta numa refação de arte: é o primeiro suspeito, e a peça sem bolha é publicável. */
  bolha: false;
  razao: string;
};

/**
 * O que a refação da arte desenha, dada a arte recusada.
 *
 * A refação de antes recongelava a MESMA decisão (mesma gramática), e a peça
 * voltava à fila com hash novo e a cara de antes. Trocar a decisão recusada é
 * o mínimo para a refação ser refação.
 */
export function arteNaRefacao(
  atual: { gramatica: "jornal" | "recorte"; bolha: boolean },
  ap: AprendizadoDaArte,
  ligados: MoldesLigados,
): DecisaoDaArteNaRefacao {
  if (atual.gramatica === "recorte") {
    return { gramatica: "jornal", bolha: false, razao: "o recorte foi recusado: a refação desenha na gramática de jornal" };
  }
  if (atual.bolha) {
    return { gramatica: "jornal", bolha: false, razao: "a capa com bolha foi recusada: a refação tira a bolha" };
  }
  if (ligados.recorte && !ap.moldesEvitados.includes("recorte")) {
    return {
      gramatica: "recorte",
      bolha: false,
      razao: "a capa de jornal foi recusada: a refação tenta o recorte (cai para jornal se o texto não couber)",
    };
  }
  return {
    gramatica: "jornal",
    bolha: false,
    razao: "a capa de jornal foi recusada e o recorte está desligado ou foi recusado: a refação redesenha no jornal",
  };
}
