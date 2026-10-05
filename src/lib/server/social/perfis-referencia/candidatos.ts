/**
 * Perfis de referência do Instagram, do post viral à pauta com fonte primária.
 *
 * RF-16 e RF-17, de 05/10/2026. O caminho inteiro:
 *
 *   1. lê os posts recentes de cada perfil ativo (Business Discovery)
 *   2. acha o que rendeu acima do normal DAQUELE perfil (`engajamento.ts`)
 *   3. extrai o assunto e uma consulta de busca, numa chamada barata
 *   4. a consulta vira fonte de busca, a MESMA que a tendência usa
 *      (`fonteDeBusca`), e atravessa a coleta normal
 *   5. o que volta passa pela trava de sinal (`sinal-nao-e-fonte.ts`),
 *      pela deduplicação e pela guarda editorial inteira (`avaliarPautas`),
 *      que é onde imigração é recusada e a linha editorial vale
 *   6. cada leitura é gravada, com o que foi lido, quando, o resultado e o
 *      custo com etapa e ramo
 *
 * Por que reaproveitar a busca da tendência e não ler a matéria a partir do
 * post: porque o post não tem a matéria. Ele tem uma arte e uma legenda de
 * terceiro, e as duas são exatamente o que não pode ir ao ar. A busca devolve
 * o veículo que publicou o fato, com URL própria, e só isso é fonte.
 *
 * Nada aqui publica. O que sai é pool, na forma que `comporFeedSocial` já lê
 * (`PautaAvaliada`), para quem monta o feed do Instagram decidir.
 */

import type { PautaAvaliada, ResultadoDaGuarda } from "../../editorial/guarda";
import type { NewsCandidate } from "../../newsroom/collector";
import type { DeduplicatedGroup } from "../../newsroom/deduplicator";
import type { NewsSourceConfig } from "../../newsroom/news-sources";
import { deduplicateCandidates } from "../../newsroom/deduplicator";
import { fonteDeBusca } from "../../editorial/busca-dinamica";
import { modoDosPerfisDeReferencia, type ModoDosPerfis } from "./modo";
import type { LeituraDoPerfil } from "./graph";
import { sinaisVirais, CONFIG_PADRAO_DO_ENGAJAMENTO, type ConfigDoEngajamento, type SinalViral } from "./engajamento";
import { ETAPA_DO_TOPICO, RAMO, type ResultadoDaExtracao, type TopicoExtraido } from "./topico";
import { urlPodeSerFontePrimaria } from "./sinal-nao-e-fonte";
import type { LeituraParaGravar, PerfilDeReferencia, PerfisStore } from "./store";

export const ETAPA_DA_CLASSIFICACAO = "perfis_referencia.classificacao";
export const EVENTO_DA_RODADA = "perfis_referencia_rodada";

export type ProjetoDosPerfis = {
  id: string;
  settings?: Record<string, unknown> | null;
};

export type LimitesDosPerfis = {
  /** Perfis lidos por rodada. Protege o limite de chamadas da Meta. */
  maximoDePerfis: number;
  /**
   * Buscas extras por rodada, somando todos os perfis.
   *
   * O mesmo raciocínio do teto da tendência em `busca-dinamica.ts`: cada busca
   * traz até uma dezena de itens, e cada item é uma classificação paga.
   */
  maximoDeBuscas: number;
  /**
   * Itens de cada busca que seguem para a classificação.
   *
   * Medido no ensaio de 05/10/2026: UMA busca em português no Google News
   * devolveu 52 itens, e classificar os 52 custou US$ 0,12 no modelo de
   * produção, contra US$ 0,0002 da extração de assunto. Sem teto, quatro
   * buscas custariam meio dólar por rodada para achar, no fim, uma ou duas
   * pautas. Os primeiros itens do feed são os mais recentes, que é o que se
   * quer de um assunto em alta.
   */
  maximoDeItensPorBusca: number;
};

export const LIMITES_PADRAO_DOS_PERFIS: LimitesDosPerfis = {
  maximoDePerfis: 15,
  maximoDeBuscas: 4,
  maximoDeItensPorBusca: 8,
};

export type DependenciasDosPerfis = {
  store: PerfisStore;
  credencial: () => Promise<{ accountId?: string; accessToken?: string }>;
  lerPerfil: (handle: string, credencial: { accountId?: string; accessToken?: string }) => Promise<LeituraDoPerfil>;
  extrair: (handle: string, sinais: SinalViral[]) => Promise<ResultadoDaExtracao>;
  coletar: (fontes: NewsSourceConfig[]) => Promise<NewsCandidate[]>;
  avaliar: (
    grupos: DeduplicatedGroup[],
    modo: ModoDosPerfis,
  ) => Promise<Pick<ResultadoDaGuarda, "approvedEditorialPool" | "recusadas" | "custoUsd">>;
  registrarRodada?: (projectId: string, payload: Record<string, unknown>) => Promise<void>;
  agora?: () => Date;
};

export type OrigemDaPauta = { handle: string; postId: string; permalink: string; consulta: string };

export type ResultadoDosPerfis = {
  modo: ModoDosPerfis;
  /** O pool aprovado. Em `dry_run` é calculado e NÃO é entregue por `candidatosDosPerfisDeReferencia`. */
  pautas: PautaAvaliada[];
  /** De qual perfil e de qual post veio cada pauta, pelo `storyId`. */
  origem: Record<string, OrigemDaPauta>;
  leituras: LeituraParaGravar[];
  buscas: number;
  candidatasColetadas: number;
  recusadasPorSerRedeSocial: number;
  recusadasPelaGuarda: number;
  /** Quantas recusas por motivo, para o diagnóstico dizer POR QUE nada passou. */
  motivosDaGuarda: Record<string, number>;
  custos: Array<{ etapa: string; ramo: string; usd: number }>;
  avisos: string[];
};

function resultadoVazio(modo: ModoDosPerfis): ResultadoDosPerfis {
  return {
    modo,
    pautas: [],
    origem: {},
    leituras: [],
    buscas: 0,
    candidatasColetadas: 0,
    recusadasPorSerRedeSocial: 0,
    recusadasPelaGuarda: 0,
    motivosDaGuarda: {},
    custos: [],
    avisos: [],
  };
}

type TrabalhoDoPerfil = {
  perfil: PerfilDeReferencia;
  leitura: LeituraDoPerfil;
  linhaDeBase: number | null;
  sinais: SinalViral[];
  extracao: ResultadoDaExtracao | null;
  observacao: string;
};

/**
 * A rodada completa, com o diagnóstico. Quem monta o feed chama
 * `candidatosDosPerfisDeReferencia`; esta é para o painel, o teste e o ensaio.
 */
export async function lerPerfisDeReferencia(
  projeto: ProjetoDosPerfis,
  deps: DependenciasDosPerfis,
  opcoes: { limites?: LimitesDosPerfis; engajamento?: ConfigDoEngajamento } = {},
): Promise<ResultadoDosPerfis> {
  const modo = modoDosPerfisDeReferencia(projeto);
  const r = resultadoVazio(modo);

  // Desligado é desligado: nenhuma leitura, nenhuma chamada, nenhuma linha.
  if (modo === "off") return r;

  const limites = opcoes.limites ?? LIMITES_PADRAO_DOS_PERFIS;
  const configDoEngajamento = opcoes.engajamento ?? CONFIG_PADRAO_DO_ENGAJAMENTO;
  const agora = deps.agora?.() ?? new Date();

  const perfis = (await deps.store.listar(projeto.id, true)).slice(0, limites.maximoDePerfis);
  if (perfis.length === 0) {
    r.avisos.push("nenhum perfil de referência ativo");
    return r;
  }

  const credencial = await deps.credencial();
  const trabalhos: TrabalhoDoPerfil[] = [];

  // Em série, de propósito: são poucos perfis, e paralelo é o jeito mais
  // rápido de bater no limite de chamadas da Meta numa conta que também
  // publica.
  for (const perfil of perfis) {
    const leitura = await deps.lerPerfil(perfil.handle, credencial);
    if (leitura.status !== "ok") {
      trabalhos.push({ perfil, leitura, linhaDeBase: null, sinais: [], extracao: null, observacao: "" });
      continue;
    }
    const { linhaDeBase, sinais, motivo } = sinaisVirais(leitura.posts, agora, configDoEngajamento);
    const extracao = sinais.length > 0 ? await deps.extrair(perfil.handle, sinais) : null;
    if (extracao?.erro) r.avisos.push(`@${perfil.handle}: extração de assunto falhou: ${extracao.erro}`);
    trabalhos.push({ perfil, leitura, linhaDeBase, sinais, extracao, observacao: motivo });
  }

  /*
   * As buscas da rodada, das mais virais para as menos.
   *
   * A razão sobre a mediana é o único número comparável entre perfis de
   * tamanhos diferentes, então é ela que ordena quem ganha as vagas de busca.
   * Consulta repetida entre dois perfis vira uma busca só: os dois estão
   * apontando para o mesmo assunto, e buscar duas vezes duplicaria a coleta.
   */
  type Busca = { handle: string; sinal: SinalViral; topico: TopicoExtraido };
  const todas: Busca[] = [];
  for (const t of trabalhos) {
    for (const topico of t.extracao?.topicos ?? []) {
      if (topico.descartado) continue;
      const sinal = t.sinais.find((s) => s.postId === topico.postId);
      if (sinal) todas.push({ handle: t.perfil.handle, sinal, topico });
    }
  }
  todas.sort((a, b) => b.sinal.razao - a.sinal.razao);

  const vistas = new Set<string>();
  const escolhidas: Busca[] = [];
  for (const b of todas) {
    // Sem o idioma na chave: o nome da fonte de busca sai só da consulta, e é
    // por ele que a candidata volta a ser atribuída ao perfil.
    const chave = b.topico.consulta.toLowerCase();
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    escolhidas.push(b);
    if (escolhidas.length >= limites.maximoDeBuscas) break;
  }

  const fontes: NewsSourceConfig[] = [];
  const buscaPorFonte = new Map<string, Busca>();
  for (const b of escolhidas) {
    /*
     * Origem "tendencia", e não uma origem nova.
     *
     * Para a coleta isto É uma tendência: um assunto em alta que vira busca.
     * O identificador carrega o perfil, para a atribuição abaixo, e manter o
     * tipo de `busca-dinamica.ts` intacto evita mexer num arquivo que o ciclo
     * da newsletter usa todo dia.
     */
    const fonte = fonteDeBusca(
      b.topico.consulta,
      b.topico.idioma,
      "tendencia",
      `perfil-${b.handle}-${b.sinal.postId.slice(-8)}`.replace(/[^a-z0-9-]+/gi, "-").slice(0, 60),
    );
    fontes.push(fonte);
    buscaPorFonte.set(fonte.name, b);
  }
  r.buscas = fontes.length;

  const candidatasPorHandle = new Map<string, number>();
  const aprovadasPorHandle = new Map<string, number>();
  const permalinks = trabalhos.flatMap((t) => t.sinais.map((s) => s.permalink));
  let custoDaClassificacao = 0;

  try {
    if (fontes.length > 0) {
      const coletadas = await deps.coletar(fontes);
      r.candidatasColetadas = coletadas.length;

      const primarias = coletadas.filter((c) => urlPodeSerFontePrimaria(c.url, permalinks));
      r.recusadasPorSerRedeSocial = coletadas.length - primarias.length;

      // O teto por busca vem DEPOIS da trava de rede social, para um post do
      // Instagram no topo da busca não ocupar a vaga de uma matéria.
      const porFonte = new Map<string, number>();
      const dentroDoTeto = primarias.filter((c) => {
        const n = (porFonte.get(c.source_name) ?? 0) + 1;
        porFonte.set(c.source_name, n);
        return n <= limites.maximoDeItensPorBusca;
      });

      for (const c of dentroDoTeto) {
        const b = buscaPorFonte.get(c.source_name);
        if (b) candidatasPorHandle.set(b.handle, (candidatasPorHandle.get(b.handle) ?? 0) + 1);
      }

      const { uniqueGroups } = deduplicateCandidates(dentroDoTeto);
      if (uniqueGroups.length > 0) {
        const avaliacao = await deps.avaliar(uniqueGroups, modo);
        custoDaClassificacao = avaliacao.custoUsd;
        r.recusadasPelaGuarda = avaliacao.recusadas.length;
        for (const rec of avaliacao.recusadas) {
          r.motivosDaGuarda[rec.motivo] = (r.motivosDaGuarda[rec.motivo] ?? 0) + 1;
        }

        /*
         * A trava de sinal roda de novo sobre o que a guarda aprovou.
         *
         * A guarda pode trocar a URL do primário por uma secundária
         * (`escolherUrlPublicavel`, quando o primário é agregador). A trava de
         * cima viu a URL de antes; esta vê a que vai ser publicada.
         */
        r.pautas = avaliacao.approvedEditorialPool.filter((p) =>
          urlPodeSerFontePrimaria(p.grupo.primary.url, permalinks),
        );
        for (const p of r.pautas) {
          const b = buscaPorFonte.get(p.grupo.primary.source_name);
          if (!b) continue;
          aprovadasPorHandle.set(b.handle, (aprovadasPorHandle.get(b.handle) ?? 0) + 1);
          r.origem[p.storyId] = {
            handle: b.handle,
            postId: b.sinal.postId,
            permalink: b.sinal.permalink,
            consulta: b.topico.consulta,
          };
        }
      }
    }
  } catch (e) {
    // A busca e a guarda falharem não apaga as leituras: elas ainda são
    // gravadas abaixo, com o aviso.
    r.avisos.push(`busca ou classificação falhou: ${(e as Error).message.slice(0, 300)}`);
    r.pautas = [];
  }

  const custoDosTopicos = trabalhos.reduce((s, t) => s + (t.extracao?.custoUsd ?? 0), 0);
  r.custos = [
    { etapa: ETAPA_DO_TOPICO, ramo: RAMO, usd: custoDosTopicos },
    { etapa: ETAPA_DA_CLASSIFICACAO, ramo: RAMO, usd: custoDaClassificacao },
  ];

  r.leituras = trabalhos.map((t) => ({
    projectId: projeto.id,
    profileId: t.perfil.id,
    handle: t.perfil.handle,
    modo: modo === "enforce" ? "enforce" : "dry_run",
    status: t.leitura.status,
    httpStatus: t.leitura.httpStatus,
    codigoDeErro: t.leitura.codigoDeErro,
    subcodigoDeErro: t.leitura.subcodigoDeErro,
    mensagemDeErro: t.leitura.mensagemDeErro,
    seguidores: t.leitura.seguidores,
    postsLidos: t.leitura.posts.length,
    linhaDeBase: t.linhaDeBase,
    sinais: t.sinais,
    topicos: t.extracao?.topicos ?? [],
    candidatas: candidatasPorHandle.get(t.perfil.handle) ?? 0,
    aprovadas: aprovadasPorHandle.get(t.perfil.handle) ?? 0,
    custoUsd: t.extracao?.custoUsd ?? 0,
    tokens: t.extracao?.tokens ?? 0,
    etapa: ETAPA_DO_TOPICO,
    ramo: RAMO,
    observacao: t.observacao || null,
  }));

  try {
    await deps.store.gravarLeituras(r.leituras);
  } catch (e) {
    r.avisos.push(`gravação das leituras falhou: ${(e as Error).message.slice(0, 300)}`);
  }

  if (deps.registrarRodada) {
    try {
      await deps.registrarRodada(projeto.id, {
        modo,
        perfis: trabalhos.length,
        buscas: r.buscas,
        candidatasColetadas: r.candidatasColetadas,
        recusadasPorSerRedeSocial: r.recusadasPorSerRedeSocial,
        recusadasPelaGuarda: r.recusadasPelaGuarda,
        motivosDaGuarda: r.motivosDaGuarda,
        aprovadas: r.pautas.length,
        entregues: modo === "enforce" ? r.pautas.length : 0,
        custos: r.custos,
        avisos: r.avisos,
      });
    } catch (e) {
      r.avisos.push(`registro da rodada falhou: ${(e as Error).message.slice(0, 300)}`);
    }
  }

  return r;
}

/**
 * O que o Instagram pode somar ao pool hoje, vindo dos perfis de referência.
 *
 * O contrato com quem monta o feed (RF-15) é deliberadamente estreito:
 *
 *   - devolve `PautaAvaliada[]`, a mesma forma do `approvedEditorialPool`, já
 *     classificada e aprovada pela guarda com canal `instagram`;
 *   - só devolve algo em `enforce`. Em `dry_run` a rodada roda e grava, e a
 *     resposta é vazia;
 *   - NUNCA lança. Qualquer falha vira lista vazia, porque uma fonte de sinal
 *     não pode custar o ciclo do dia. O motivo fica gravado na leitura.
 *
 * Quem chama pode concatenar ao pool sem condicional nenhuma.
 */
export async function candidatosDosPerfisDeReferencia(
  projeto: ProjetoDosPerfis,
  opcoes: {
    env?: Record<string, string | undefined>;
    fetcher?: typeof fetch;
    deps?: Partial<DependenciasDosPerfis>;
    limites?: LimitesDosPerfis;
  } = {},
): Promise<PautaAvaliada[]> {
  if (modoDosPerfisDeReferencia(projeto) === "off") return [];
  try {
    const dadas = opcoes.deps ?? {};
    const completas = (["store", "credencial", "lerPerfil", "extrair", "coletar", "avaliar"] as const).every(
      (k) => typeof dadas[k] !== "undefined",
    );
    // As dependências reais só carregam quando falta alguma: o teste injeta
    // todas e não precisa de banco nem de chave.
    const deps: DependenciasDosPerfis = completas
      ? (dadas as DependenciasDosPerfis)
      : {
          ...(await (await import("./producao")).dependenciasDeProducao(projeto, opcoes.env, opcoes.fetcher)),
          ...dadas,
        };
    const r = await lerPerfisDeReferencia(projeto, deps, { limites: opcoes.limites });
    for (const aviso of r.avisos) console.warn(`[PERFIS REFERENCIA] ${aviso}`);
    return r.modo === "enforce" ? r.pautas : [];
  } catch (e) {
    console.error(`[PERFIS REFERENCIA] rodada não rodou: ${(e as Error).message}`);
    return [];
  }
}
