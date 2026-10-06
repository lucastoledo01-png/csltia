import { ETAPAS_DO_RAMO, RAMOS, type Etapa, type Ramo } from "../aprovacao/contrato";
import type { EdicaoDoEditor, FilaStore, RegraProposta } from "../aprovacao/fila-store";
import { errosRepetidos } from "../aprovacao/memoria-de-reprovacao";

/**
 * O painel de aprendizado, sem HTTP no meio (06/10/2026).
 *
 * Responde quatro perguntas, por canal e sem misturar canais: o editor está
 * aprovando mais de primeira com o passar das semanas? Que regras valem hoje?
 * O que está proposto e espera decisão? E o que ele mais recusa, e mais
 * reescreve à mão?
 */

/** Quantas semanas a série mostra. Dois meses é o que cabe no celular e diz a tendência. */
export const SEMANAS_DO_PAINEL = 8;

export type SemanaDoCanal = {
  /** A segunda-feira da semana, AAAA-MM-DD, no fuso do projeto. */
  semana: string;
  decididas: number;
  /** Aprovadas sem refação e sem edição à mão. */
  dePrimeira: number;
  taxa: number | null;
};

export type MotivoRepetido = { ramo: Ramo; etapa: Etapa; motivo: string; ocorrencias: number; exemplos: string[] };

export type VisaoDoAprendizado = {
  semanas: Record<Ramo, SemanaDoCanal[]>;
  regrasAtivas: RegraProposta[];
  propostas: RegraProposta[];
  motivos: MotivoRepetido[];
  edicoes: EdicaoDoEditor[];
};

/** A data local AAAA-MM-DD de um instante, no fuso dado. */
function dataLocal(ms: number, timezone: string): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: timezone });
}

/** A segunda-feira da semana de uma data AAAA-MM-DD. Pura, sem fuso: a data já é local. */
export function segundaDaSemana(data: string): string {
  const [a, m, d] = data.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d));
  const desde = (dia.getUTCDay() + 6) % 7; // segunda = 0
  dia.setUTCDate(dia.getUTCDate() - desde);
  return dia.toISOString().slice(0, 10);
}

/** As segundas das últimas N semanas, da mais antiga para a atual. */
export function semanasAte(agora: number, timezone: string, n = SEMANAS_DO_PAINEL): string[] {
  const atual = segundaDaSemana(dataLocal(agora, timezone));
  const [a, m, d] = atual.split("-").map(Number);
  const saida: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    saida.push(new Date(Date.UTC(a, m - 1, d - 7 * i)).toISOString().slice(0, 10));
  }
  return saida;
}

export async function visaoDoAprendizado(
  projeto: { id: string; timezone: string },
  store: Pick<FilaStore, "decididasDesde" | "regras" | "reprovacoesDesde" | "edicoesDesde">,
  agora: number = Date.now(),
): Promise<VisaoDoAprendizado> {
  const semanas = semanasAte(agora, projeto.timezone);
  const desdeDaSerie = new Date(Date.parse(`${semanas[0]}T00:00:00Z`) - 24 * 60 * 60 * 1000).toISOString();
  const trintaDias = new Date(agora - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [decididas, regras, reprovacoes, edicoesDaSerie] = await Promise.all([
    store.decididasDesde(projeto.id, desdeDaSerie),
    store.regras(projeto.id),
    store.reprovacoesDesde(projeto.id, trintaDias, 1000),
    // Sem a tabela (migration não rodada), o painel abre sem as edições, e não quebra.
    store.edicoesDesde(projeto.id, desdeDaSerie, 1000).catch(() => [] as EdicaoDoEditor[]),
  ]);

  // Peça editada à mão não foi aprovada de primeira, mesmo sem refação.
  const editadas = new Set(edicoesDaSerie.map((e) => `${e.ramo}:${e.pecaId}`));
  const serie = Object.fromEntries(
    RAMOS.map((ramo) => {
      const doCanal = decididas.filter((d) => d.ramo === ramo && d.decididoEm);
      return [
        ramo,
        semanas.map((semana) => {
          const daSemana = doCanal.filter((d) => segundaDaSemana(dataLocal(Date.parse(d.decididoEm!), projeto.timezone)) === semana);
          const dePrimeira = daSemana.filter(
            (d) => d.estado === "aprovada" && d.refazimentos === 0 && !editadas.has(`${ramo}:${d.pecaId}`),
          ).length;
          return {
            semana,
            decididas: daSemana.length,
            dePrimeira,
            taxa: daSemana.length > 0 ? dePrimeira / daSemana.length : null,
          };
        }),
      ];
    }),
  ) as Record<Ramo, SemanaDoCanal[]>;

  // Os motivos mais repetidos, por canal e por etapa, nunca somados entre canais.
  const motivos: MotivoRepetido[] = [];
  for (const ramo of RAMOS) {
    for (const etapa of ETAPAS_DO_RAMO[ramo]) {
      const daEtapa = reprovacoes.filter((r) => r.ramo === ramo && r.etapa === etapa);
      for (const g of errosRepetidos(daEtapa, 1).slice(0, 5)) {
        motivos.push({
          ramo,
          etapa,
          motivo: g.regra.replace(/^Não repetir: /, ""),
          ocorrencias: g.ocorrencias,
          exemplos: g.exemplos,
        });
      }
    }
  }
  motivos.sort((a, b) => b.ocorrencias - a.ocorrencias);

  const doCanal = (r: RegraProposta) => RAMOS.includes(r.ramo);
  return {
    semanas: serie,
    regrasAtivas: regras.filter((r) => r.estado === "aprovada" && doCanal(r)),
    propostas: regras.filter((r) => r.estado === "proposta" && doCanal(r)),
    motivos: motivos.slice(0, 30),
    edicoes: edicoesDaSerie.filter((e) => e.criadoEm >= trintaDias).slice(0, 20),
  };
}
