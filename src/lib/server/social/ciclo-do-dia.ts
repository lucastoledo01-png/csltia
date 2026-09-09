import type { SupabaseClient } from "@supabase/supabase-js";
import type { PautaAvaliada } from "../editorial/guarda";
import type { RegistroHistorico } from "../editorial/history";
import type { ConfigEditorial } from "../editorial/config";
import type { PacoteFactual } from "../editorial/pacote-factual";
import { montarPacotesDasPautas } from "../editorial/pacote-factual";
import { conferirFinalistas } from "../editorial/finalistas";
import type { ResultadoDosFinalistas } from "../editorial/finalistas";
import { criarCandidatosStore } from "../editorial/candidatos-store";
import { resolveVisualAsset } from "../visual/resolver";
import { carregarConfigSocial } from "./selecao";
import { criarSocialPostsStore } from "./social-posts-store";
import { modoDoPipelineSocial } from "./modo";
import type { ModoSocial } from "./modo";
import { rodarCicloSocial } from "./pipeline-v2";
import { pacotesDoEvergreen, prepararEvergreen } from "./evergreen/ciclo";
import type { DiagnosticoDoEvergreen, OpcoesDoEvergreen, ResultadoDoEvergreen } from "./evergreen/ciclo";
import type { MarcaSocial } from "./copy";
import type { OpcoesDoCiclo, ResultadoDoCicloSocial } from "./pipeline-v2";

/**
 * O dia do Instagram, a partir do trabalho editorial que a newsletter também usa.
 *
 * Este módulo existe por causa de uma regra de produto: o Instagram NÃO depende
 * de a newsletter fechar edição. São dois consumidores do mesmo upstream, e não
 * um dentro do outro.
 *
 * A consequência prática está no ponto onde ele é chamado: logo depois da
 * guarda editorial, com o `approvedEditorialPool` na mão, e ANTES da composição
 * da newsletter e do mínimo de duas pautas. Um dia com três pautas aprovadas em
 * que a newsletter leva só uma e cancela por mínimo é um dia normal para o
 * feed — e era justamente o dia que o Instagram perdia se dependesse da edição.
 *
 * O que ele NÃO faz, e é deliberado: não fala com a Meta, não chama o worker,
 * não mexe em `news_editions`, e não decide nada sobre a newsletter. Em
 * `enforce` ele grava linhas `scheduled` em `social_posts`, e quem publica é o
 * worker, no horário da vaga.
 */

/** O que o newsroom devolve sobre o social, para amanhã se saber se rodou. */
export type DiagnosticoSocialDoDia = {
  mode: ModoSocial;
  /** Se o ciclo chegou a rodar. Em `off` é sempre false. */
  executed: boolean;
  /** Pautas aprovadas na linha editorial que foram oferecidas ao social. */
  candidates: number;
  /** Quantas o verificador confirmou. */
  verified: number;
  /** Quantas sobreviveram à composição do feed e viraram post. */
  selected: number;
  /** Linhas gravadas em `social_posts`. Sempre 0 fora de `enforce`. */
  scheduled: number;
  /** Descartadas em qualquer etapa, com o motivo agrupado. */
  skipped: number;
  skippedReasons: Record<string, number>;
  /** Falha técnica. Nunca derruba a newsletter. */
  errors: string[];
  /** O que o conteúdo permanente fez hoje. Ausente quando a flag está off. */
  evergreen?: DiagnosticoDoEvergreen;
};

export function diagnosticoSocialAusente(mode: ModoSocial = "off"): DiagnosticoSocialDoDia {
  return {
    mode,
    executed: false,
    candidates: 0,
    verified: 0,
    selected: 0,
    scheduled: 0,
    skipped: 0,
    skippedReasons: {},
    errors: [],
  };
}

export type OpcoesDoSocialDoDia = {
  projectId: string;
  projectSlug: string;
  editionDate: string;
  marca: MarcaSocial;
  historico: RegistroHistorico[];
  config: ConfigEditorial;
  client: SupabaseClient;
  /** Se a persistência de candidatas veio degradada: o social fecha em cima disso. */
  persistenciaDegradada?: boolean;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
  /** Relógio, só para simulação de dia passado. Ausente em produção. */
  agoraMs?: number;
  /** Força o modo. Usado pelo dry-run de linha de comando, que nunca publica. */
  modoForcado?: ModoSocial;
  /*
   * Injetados só em teste, pelas mesmas razões de sempre: um abre navegador e
   * escreve no Storage, o outro lê `prompt_campaigns` no banco. Em produção os
   * dois ficam ausentes e o ciclo usa os de verdade.
   */
  congelarArte?: OpcoesDoCiclo["congelarArte"];
  resolverKeyword?: OpcoesDoCiclo["resolverKeyword"];
  /**
   * Conteúdo permanente para as vagas que a notícia deixou.
   *
   * Ausente, o dia é exatamente o que era: só notícia. Presente, ele é
   * calculado DEPOIS da verificação dos finalistas, porque é o número de
   * notícias confirmadas que define quantas vagas sobram.
   */
  evergreen?: Omit<OpcoesDoEvergreen, "noticiasNoDia" | "maximoPorDia" | "agoraMs" | "projectId"> & {
    agoraMs?: number;
  };
};

export type ResultadoDoSocialDoDia = {
  diagnostico: DiagnosticoSocialDoDia;
  ciclo: ResultadoDoCicloSocial | null;
  conferencia: Awaited<ReturnType<typeof conferirFinalistas>> | null;
  evergreen?: ResultadoDoEvergreen | null;
};

/**
 * Roda o ciclo social do dia sobre o pool já aprovado.
 *
 * Em `off` ele sai na primeira linha: nenhuma chamada ao verificador, nenhum
 * token gasto, nenhum navegador aberto. É o que torna a integração inócua
 * enquanto a flag não for ligada.
 */
export async function rodarSocialDoDia(
  approvedEditorialPool: PautaAvaliada[],
  opcoes: OpcoesDoSocialDoDia,
): Promise<ResultadoDoSocialDoDia> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const modo = opcoes.modoForcado ?? modoDoPipelineSocial(env);
  const diagnostico = diagnosticoSocialAusente(modo);
  diagnostico.candidates = approvedEditorialPool.length;

  if (modo === "off") return { diagnostico, ciclo: null, conferencia: null };

  const configSocial = carregarConfigSocial(env);
  const candidatosStore = criarCandidatosStore(opcoes.client);

  /*
   * A verificação de finalistas, que é do social e não da newsletter.
   *
   * Ela reaproveita a classificação já persistida: o `store` é o mesmo que a
   * guarda usou, então pauta verificada por um canal não é paga de novo pelo
   * outro. É o que faz "compartilhar upstream" ser literal e não retórico.
   */
  /*
   * Sem pool aprovado não se chama o verificador: não há o que verificar, e a
   * chamada custaria tokens para devolver listas vazias. O dia continua, porque
   * o evergreen pode sustentá-lo sozinho.
   */
  const conferencia: ResultadoDosFinalistas =
    approvedEditorialPool.length > 0
      ? await conferirFinalistas(approvedEditorialPool, {
          canal: "instagram",
          vagas: configSocial.maximoPorDia,
          config: opcoes.config,
          store: candidatosStore,
          projectId: opcoes.projectId,
          env,
          fetcher,
        })
      : {
          confirmadas: [],
          recusadas: [],
          emConflito: [],
          naoConferidas: [],
          diagnostico: {
            finalistas: 0,
            verificadasAgora: 0,
            reaproveitadasDoBanco: 0,
            chamadasAoVerificador: 0,
            tokens: 0,
            custoUsd: 0,
          },
          linhasDeLog: [],
        };

  diagnostico.verified = conferencia.confirmadas.length;
  diagnostico.executed = true;
  diagnostico.skipped = conferencia.recusadas.length + conferencia.emConflito.length;
  diagnostico.skippedReasons = {
    VERIFIED_REJECT: conferencia.recusadas.length,
    EDITORIAL_CLASSIFICATION_CONFLICT: conferencia.emConflito.length,
  };

  /*
   * O pacote factual é o que ancora a copy. Sem ele o gerador escreve sobre o
   * título, e escrever sobre o título é como se inventa detalhe.
   */
  const pacotes = new Map<string, PacoteFactual>();
  if (conferencia.confirmadas.length > 0) {
    const construcao = await montarPacotesDasPautas(
      conferencia.confirmadas.map((p) => ({
        url: p.grupo.primary.url,
        titulo: p.grupo.primary.title,
        texto: p.enriquecimento?.texto ?? "",
        urls: [p.grupo.primary.url],
      })),
      env,
      fetcher,
    );
    const porUrl = new Map(conferencia.confirmadas.map((p) => [p.grupo.primary.url, p.storyId]));
    for (const [url, pacote] of construcao.pacotes.entries()) {
      const storyId = porUrl.get(url);
      if (storyId) pacotes.set(storyId, pacote);
    }
  }

  const candidatas = await candidatosStore.buscarPorStoryIds(
    opcoes.projectId,
    conferencia.confirmadas.map((p) => p.storyId),
  );

  /*
   * O evergreen entra aqui, e a posição não é arbitrária.
   *
   * Só agora se sabe quantas notícias o dia tem de verdade — depois da linha
   * editorial e do verificador —, e é esse número que define as vagas
   * restantes. Calcular antes usaria o pool aprovado, que é maior que o que
   * vira post, e o dia estouraria o teto.
   */
  const evergreen = opcoes.evergreen
    ? await prepararEvergreen({
        ...opcoes.evergreen,
        projectId: opcoes.projectId,
        noticiasNoDia: conferencia.confirmadas.length,
        maximoPorDia: configSocial.maximoPorDia,
        programasDaNoticia: conferencia.confirmadas.flatMap((p) => p.classificacao.atores ?? []),
        agoraMs: opcoes.evergreen.agoraMs ?? opcoes.agoraMs ?? Date.now(),
        env,
        fetcher,
      })
    : null;

  if (evergreen) {
    for (const [chave, candidata] of evergreen.candidatas) candidatas.set(chave, candidata);
    for (const [chave, pacote] of pacotesDoEvergreen(evergreen.lastros)) pacotes.set(chave, pacote);
  }

  /*
   * Nada de notícia e nada de permanente: o dia não tem o que publicar.
   *
   * Isto substitui o retorno antecipado que existia quando o verificador não
   * confirmava nada. Ele estava certo enquanto só a notícia alimentava o feed, e
   * passou a estar errado: um dia sem notícia é exatamente o dia em que o
   * evergreen tem mais valor, e o retorno antigo o impedia de rodar.
   */
  if (conferencia.confirmadas.length === 0 && (evergreen?.extras.length ?? 0) === 0) {
    return { diagnostico, ciclo: null, conferencia, evergreen };
  }

  const ciclo = await rodarCicloSocial(conferencia.confirmadas, {
    projectId: opcoes.projectId,
    slugDoProjeto: opcoes.projectSlug,
    editionDate: opcoes.editionDate,
    marca: opcoes.marca,
    historico: opcoes.historico,
    pacotes,
    candidatas,
    persistenciaDegradada: opcoes.persistenciaDegradada,
    /*
     * O store só é passado em `enforce`, e isso é cinto sobre suspensório: o
     * ciclo já se recusa a gravar fora de enforce. Não entregar o store faz a
     * gravação ser impossível, e não apenas proibida.
     */
    store: modo === "enforce" ? criarSocialPostsStore(opcoes.client) : null,
    config: configSocial,
    env: opcoes.modoForcado ? { ...env, SOCIAL_PIPELINE_V2: opcoes.modoForcado } : env,
    fetcher,
    agoraMs: opcoes.agoraMs,
    ...(evergreen?.extras.length ? { extras: evergreen.extras } : {}),
    ...(opcoes.congelarArte ? { congelarArte: opcoes.congelarArte } : {}),
    ...(opcoes.resolverKeyword ? { resolverKeyword: opcoes.resolverKeyword } : {}),
    resolverVisual: async (pauta) =>
      resolveVisualAsset(
        {
          storyId: pauta.storyId,
          titulo: pauta.grupo.primary.title,
          resumo: pauta.enriquecimento?.texto ?? "",
          categoria: pauta.classificacao.eixo,
          classificacao: {
            atores: pauta.classificacao.atores,
            lugares: pauta.classificacao.lugares,
            acontecimento: pauta.classificacao.acontecimento,
            pais: pauta.classificacao.pais,
          },
        },
        { env, fetcher, somenteLeitura: true },
      ),
  });

  diagnostico.selected = ciclo.previews.length;
  diagnostico.scheduled = ciclo.gravacao?.gravados ?? 0;
  diagnostico.skipped =
    conferencia.recusadas.length + conferencia.emConflito.length + ciclo.descartados.length;
  diagnostico.skippedReasons = {
    VERIFIED_REJECT: conferencia.recusadas.length,
    EDITORIAL_CLASSIFICATION_CONFLICT: conferencia.emConflito.length,
  };
  for (const d of ciclo.descartados) {
    const chave = d.motivo.split(":")[0].trim();
    diagnostico.skippedReasons[chave] = (diagnostico.skippedReasons[chave] ?? 0) + 1;
  }
  diagnostico.errors = ciclo.gravacao?.erros ?? [];
  if (evergreen) diagnostico.evergreen = evergreen.diagnostico;

  return { diagnostico, ciclo, conferencia, evergreen };
}
