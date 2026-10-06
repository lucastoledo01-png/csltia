import { ehRamo, RAMOS, type Ramo } from "../aprovacao/contrato";
import type { EdicaoDoEditor, FilaStore } from "../aprovacao/fila-store";
import { ROTULO_DO_RAMO } from "./contrato";

/**
 * As edições à mão viram PROPOSTA de regra, uma vez por semana (06/10/2026).
 *
 * Quando o dono reescreve a legenda na fila, o antes e o depois vão para
 * `edicoes_do_editor` (`editarTexto`, em `fila.ts`). Toda segunda-feira, e
 * quando o dono aperta o botão no painel, UMA chamada de modelo lê as edições
 * da semana, separadas por canal, e devolve os padrões como regras propostas.
 *
 * Três travas, cada uma com o motivo:
 *
 *   - nada vira regra sozinho: a proposta nasce `proposta`, com origem
 *     `edicoes` e os exemplos que a sustentam, e só o dono a aprova no painel;
 *   - canal é canal: a proposta de um canal só pode citar edições DAQUELE
 *     canal, e a citação de outro canal é jogada fora na validação, não
 *     confiada ao modelo;
 *   - padrão é o que se repete: a proposta precisa de duas edições que a
 *     sustentem. Uma edição só é gosto do dia.
 */

/** Quantas edições por canal vão na chamada. A semana comum tem menos que isso. */
export const EDICOES_POR_CANAL = 15;
/** Quantas edições sustentam uma proposta, no mínimo. */
export const MINIMO_DE_EXEMPLOS_DA_EDICAO = 2;
/** Quantas propostas por canal uma rodada aceita: mais que isso vira lista de desejos. */
export const PROPOSTAS_POR_CANAL = 3;
/** A janela da rodada semanal. */
export const DIAS_DA_SEMANA_DAS_EDICOES = 7;

const TRAVESSAO = String.fromCharCode(0x2014);

function cortar(t: string, n: number): string {
  const limpo = t.replace(/\s+/g, " ").trim();
  return limpo.length <= n ? limpo : `${limpo.slice(0, n - 3)}...`;
}

export const SISTEMA_DAS_EDICOES = `Você lê as edições que o editor de uma publicação fez à mão nos textos que o sistema escreveu, e descobre o PADRÃO por trás delas.

Cada edição traz o texto ANTES (o que o sistema escreveu) e DEPOIS (o que o editor publicou), e é de um canal: newsletter, artigo (o portal) ou post (o Instagram). Os canais comunicam de jeitos diferentes, e por isso um padrão é sempre de UM canal.

Devolva só os padrões que se repetem em DUAS OU MAIS edições do mesmo canal. Para cada um, escreva a regra como instrução curta para o redator daquele canal, no imperativo, em português, em uma frase, sem travessão, e cite os ids das edições que a sustentam.

Não proponha regra sobre um fato específico de uma pauta (nome, número, data): a regra é sobre a forma, o tom, o tamanho, a ordem, o vocabulário. Na dúvida, não proponha: lista vazia é resposta válida.

Responda em JSON: {"regras": [{"ramo": "post", "regra": "...", "exemplos": ["id1", "id2"]}]}`;

export function montarEntradaDasEdicoes(grupos: Partial<Record<Ramo, EdicaoDoEditor[]>>): string {
  const canais = RAMOS.filter((r) => (grupos[r]?.length ?? 0) > 0).map((ramo) => ({
    ramo,
    canal: ROTULO_DO_RAMO[ramo],
    edicoes: (grupos[ramo] ?? []).map((e) => ({ id: e.id, antes: cortar(e.antes, 500), depois: cortar(e.depois, 500) })),
  }));
  return JSON.stringify({ canais });
}

export type PropostaDasEdicoes = { ramo: Ramo; regra: string; apoio: EdicaoDoEditor[] };

/**
 * O que volta do modelo, conferido. Pura, para teste.
 *
 * A citação de edição de outro canal é descartada, e a proposta que fica com
 * menos de `MINIMO_DE_EXEMPLOS_DA_EDICAO` cai inteira, com o motivo.
 */
export function validarPropostasDasEdicoes(
  bruto: unknown,
  grupos: Partial<Record<Ramo, EdicaoDoEditor[]>>,
): { propostas: PropostaDasEdicoes[]; descartadas: string[] } {
  const propostas: PropostaDasEdicoes[] = [];
  const descartadas: string[] = [];
  const lista = (bruto && typeof bruto === "object" ? (bruto as { regras?: unknown }).regras : null) ?? [];
  if (!Array.isArray(lista)) return { propostas, descartadas: ["resposta sem a lista de regras"] };
  const porCanal = new Map<Ramo, number>();

  for (const item of lista) {
    const o = (item ?? {}) as { ramo?: unknown; regra?: unknown; exemplos?: unknown };
    if (!ehRamo(o.ramo)) {
      descartadas.push(`canal desconhecido: ${String(o.ramo)}`);
      continue;
    }
    const ramo = o.ramo;
    const regra = cortar(String(o.regra ?? "").split(TRAVESSAO).join(","), 300);
    if (regra.length < 12) {
      descartadas.push(`${ramo}: regra vazia ou curta demais`);
      continue;
    }
    const doCanal = new Map((grupos[ramo] ?? []).map((e) => [e.id, e] as const));
    const citados = Array.isArray(o.exemplos) ? o.exemplos.map(String) : [];
    // Só as edições DESTE canal sustentam a regra dele: a citação cruzada é descartada aqui.
    const apoio = [...new Set(citados)].map((id) => doCanal.get(id)).filter((e): e is EdicaoDoEditor => Boolean(e));
    if (apoio.length < MINIMO_DE_EXEMPLOS_DA_EDICAO) {
      descartadas.push(`${ramo}: "${cortar(regra, 60)}" com ${apoio.length} edição(ões) do canal, mínimo ${MINIMO_DE_EXEMPLOS_DA_EDICAO}`);
      continue;
    }
    const n = porCanal.get(ramo) ?? 0;
    if (n >= PROPOSTAS_POR_CANAL) {
      descartadas.push(`${ramo}: passou de ${PROPOSTAS_POR_CANAL} propostas na rodada`);
      continue;
    }
    porCanal.set(ramo, n + 1);
    propostas.push({ ramo, regra, apoio });
  }
  return { propostas, descartadas };
}

/** A chave estável da proposta: a mesma regra em duas semanas atualiza, não duplica. */
export function chaveDaProposta(regra: string): string {
  const palavras = regra
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length >= 4);
  return `edicoes:${[...new Set(palavras)].sort().join("-").slice(0, 180)}`;
}

export function exemploDaEdicao(e: EdicaoDoEditor): string {
  return `Antes: ${cortar(e.antes, 180)} | Depois: ${cortar(e.depois, 180)}`;
}

export type ResultadoDoResumoDasEdicoes = {
  edicoesLidas: number;
  porCanal: Partial<Record<Ramo, number>>;
  chamouModelo: boolean;
  propostas: Array<{ ramo: Ramo; regra: string; exemplos: number; desfecho: "criada" | "atualizada" | "ja_decidida" }>;
  descartadas: string[];
  erro?: string;
};

export type ChamarModeloDasEdicoes = (sistema: string, entrada: string) => Promise<unknown>;

/**
 * A rodada semanal. Sem edição na semana, não chama o modelo.
 *
 * A proposta é gravada por `proporRegra`, que nunca ressuscita a recusada e
 * nunca grava aprovada: o estado de toda proposta nova é `proposta`.
 */
export async function resumirEdicoesDaSemana(
  projeto: { id: string },
  deps: {
    store: Pick<FilaStore, "edicoesDesde" | "proporRegra">;
    chamarModelo: ChamarModeloDasEdicoes;
    agora?: number;
  },
): Promise<ResultadoDoResumoDasEdicoes> {
  const agora = deps.agora ?? Date.now();
  const desde = new Date(agora - DIAS_DA_SEMANA_DAS_EDICOES * 24 * 60 * 60 * 1000).toISOString();
  const todas = await deps.store.edicoesDesde(projeto.id, desde, 500);
  const grupos: Partial<Record<Ramo, EdicaoDoEditor[]>> = {};
  for (const e of todas) {
    const lista = (grupos[e.ramo] ??= []);
    if (lista.length < EDICOES_POR_CANAL) lista.push(e);
  }
  const porCanal = Object.fromEntries(RAMOS.map((r) => [r, grupos[r]?.length ?? 0]).filter(([, n]) => n)) as Partial<
    Record<Ramo, number>
  >;
  const base: ResultadoDoResumoDasEdicoes = {
    edicoesLidas: todas.length,
    porCanal,
    chamouModelo: false,
    propostas: [],
    descartadas: [],
  };
  // Um canal com uma edição só não sustenta padrão nenhum: nem se pergunta.
  const comPadraoPossivel = RAMOS.filter((r) => (grupos[r]?.length ?? 0) >= MINIMO_DE_EXEMPLOS_DA_EDICAO);
  if (comPadraoPossivel.length === 0) return base;
  const doModelo = Object.fromEntries(comPadraoPossivel.map((r) => [r, grupos[r]!])) as Partial<Record<Ramo, EdicaoDoEditor[]>>;

  let bruto: unknown;
  try {
    bruto = await deps.chamarModelo(SISTEMA_DAS_EDICOES, montarEntradaDasEdicoes(doModelo));
  } catch (erro) {
    return { ...base, chamouModelo: true, erro: erro instanceof Error ? erro.message : String(erro) };
  }

  const { propostas, descartadas } = validarPropostasDasEdicoes(bruto, doModelo);
  const gravadas: ResultadoDoResumoDasEdicoes["propostas"] = [];
  for (const p of propostas) {
    const desfecho = await deps.store.proporRegra({
      projectId: projeto.id,
      ramo: p.ramo,
      etapa: "texto",
      chave: chaveDaProposta(p.regra),
      regra: p.regra,
      ocorrencias: p.apoio.length,
      exemplos: p.apoio.map(exemploDaEdicao),
      origem: "edicoes",
    });
    gravadas.push({ ramo: p.ramo, regra: p.regra, exemplos: p.apoio.length, desfecho });
  }
  return { ...base, chamouModelo: true, propostas: gravadas, descartadas };
}

/** O modelo de verdade: uma chamada JSON, no modelo de redação do projeto. */
export function chamarModeloDeProducao(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): ChamarModeloDasEdicoes {
  return async (sistema, entrada) => {
    const { callOpenAIJSON, getAIProviderConfig } = await import("../newsroom/ai-provider");
    const config = getAIProviderConfig(env);
    if (!config.isConfigured) throw new Error("sem credencial de modelo");
    const { data } = await callOpenAIJSON<unknown>(
      [
        { role: "system", content: sistema },
        { role: "user", content: entrada },
      ],
      config.editorModel,
      env,
      fetcher,
    );
    return data;
  };
}
