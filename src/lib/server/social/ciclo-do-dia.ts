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
import {
  decisorDeFormato,
  historicoDoEvergreen,
  pacotesDoEvergreen,
  prepararEvergreen,
  verificadorDeClaims,
} from "./evergreen/ciclo";
import { modoDoEvergreen } from "./evergreen/modo";
import type { UsoAnterior } from "./evergreen/tipos";
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
  /** O congelamento de N slides, injetável nos testes e no preview. */
  congelarCarrossel?: OpcoesDoCiclo["congelarCarrossel"];
  /**
   * A verificação semântica das claims, injetável nos testes.
   *
   * Sem isto, o ciclo monta o verificador de verdade e ele chama o modelo: um
   * teste de integração passaria a depender de rede, e o dublê de modelo
   * responderia copy no lugar de claims, o que derruba o post por auditoria
   * não realizada.
   */
  verificarClaims?: OpcoesDoCiclo["verificarClaims"];
  resolverKeyword?: OpcoesDoCiclo["resolverKeyword"];
  /**
   * Conteúdo permanente para as vagas que a notícia deixou.
   *
   * Estes são SUBSTITUIÇÕES para teste e para o preview, não o interruptor.
   *
   * Elas eram o interruptor, e foi assim que o canal inteiro ficou
   * inalcançável: `prepararEvergreen` só rodava quando alguém se lembrava de
   * passar este campo, e ninguém passava no caminho de produção. Com
   * `SOCIAL_EVERGREEN_V2=enforce` o dia continuaria sem um único post
   * permanente, sem erro nenhum para investigar.
   *
   * Agora quem decide é a flag, dentro de `prepararEvergreen`, e em `off` ela
   * volta antes de qualquer trabalho: nenhuma chamada de rede, nenhum custo.
   * Este campo só existe para o teste injetar lastro falso e para o preview
   * forçar o modo.
   */
  evergreen?: Omit<
    OpcoesDoEvergreen,
    "noticiasNoDia" | "maximoPorDia" | "agoraMs" | "projectId" | "historico"
  > & {
    agoraMs?: number;
    /**
     * O histórico de uso, quando quem chama quiser ditá-lo.
     *
     * Opcional porque o ciclo o lê do banco: era obrigatório e ninguém passava,
     * o que fazia o cooldown operar sobre lista vazia. Passar aqui é para teste
     * e para simulação de sete dias.
     */
    historico?: UsoAnterior[];
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
  /*
   * O histórico do evergreen vem do banco, e ninguém o lia.
   *
   * `prepararEvergreen` exige o histórico e o caminho de produção não passava
   * nenhum, o que fazia o cooldown de 30 dias e a janela de 7 dias operarem
   * sobre uma lista vazia: o mesmo par tópico e ângulo poderia voltar todo dia.
   * A leitura é feita aqui porque é aqui que existe o cliente do banco.
   *
   * E é feita SÓ quando o modo não é `off`: em `off` o dia não paga nem esta
   * consulta.
   */
  const modoEvergreen = opcoes.evergreen?.modoForcado ?? modoDoEvergreen(env);
  const desde = new Date(
    (opcoes.evergreen?.agoraMs ?? opcoes.agoraMs ?? Date.now()) - 45 * 24 * 60 * 60 * 1000,
  ).toISOString();

  /*
   * Histórico que não pôde ser lido DESLIGA o evergreen do dia.
   *
   * Rodar a régua de repetição sobre uma lista vazia é pior que não rodar o
   * canal: o cooldown de 30 dias e a janela de 7 dias passariam a permitir
   * exatamente o post de ontem. Um dia sem conteúdo permanente é uma perda
   * pequena; repetir o post de ontem é o defeito que o catálogo inteiro existe
   * para impedir.
   */
  let historicoEvergreen = opcoes.evergreen?.historico ?? null;
  let evergreenBloqueado = "";

  if (historicoEvergreen === null && modoEvergreen !== "off") {
    try {
      historicoEvergreen = await historicoDoEvergreen(opcoes.client, opcoes.projectId, desde);
    } catch (erro) {
      evergreenBloqueado = `histórico do evergreen ilegível: ${(erro as Error).message}`;
      console.warn(`[SOCIAL V2] evergreen desligado hoje: ${evergreenBloqueado}`);
    }
  }

  const evergreen = await prepararEvergreen({
    ...(opcoes.evergreen ?? {}),
    ...(evergreenBloqueado ? { modoForcado: "off" as const } : {}),
    historico: historicoEvergreen ?? [],
    projectId: opcoes.projectId,
    noticiasNoDia: conferencia.confirmadas.length,
    maximoPorDia: configSocial.maximoPorDia,
    programasDaNoticia: conferencia.confirmadas.flatMap((p) => p.classificacao.atores ?? []),
    agoraMs: opcoes.evergreen?.agoraMs ?? opcoes.agoraMs ?? Date.now(),
    env,
    fetcher,
  });

  /*
   * O diagnóstico do evergreen é anexado AQUI, e não no retorno final.
   *
   * No fim, ele não existia nos retornos antecipados: um dia sem notícia e sem
   * evergreen voltava com `diagnostico.evergreen` ausente, e ausente é
   * indistinguível de "o canal não rodou". É exatamente o tipo de silêncio que
   * fez este canal ficar sem chamador sem ninguém notar.
   */
  diagnostico.evergreen = evergreenBloqueado
    ? { ...evergreen.diagnostico, semLastro: [{ item: "-", motivo: evergreenBloqueado }] }
    : evergreen.diagnostico;

  for (const [chave, candidata] of evergreen.candidatas) candidatas.set(chave, candidata);
  for (const [chave, pacote] of pacotesDoEvergreen(evergreen.lastros)) pacotes.set(chave, pacote);

  /*
   * Nada de notícia e nada de permanente: o dia não tem o que publicar.
   *
   * Isto substitui o retorno antecipado que existia quando o verificador não
   * confirmava nada. Ele estava certo enquanto só a notícia alimentava o feed, e
   * passou a estar errado: um dia sem notícia é exatamente o dia em que o
   * evergreen tem mais valor, e o retorno antigo o impedia de rodar.
   */
  if (conferencia.confirmadas.length === 0 && evergreen.extras.length === 0) {
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
    ...(evergreen.extras.length ? { extras: evergreen.extras } : {}),
    /*
     * O decisor de formato só existe quando há evergreen no dia.
     *
     * Sem ele, `gerarPostDaPauta` não pergunta nada e todo post é peça única,
     * que é o comportamento da notícia. É por isso que o carrossel não precisa
     * de nenhuma condição do lado do gerador: ele nasce desligado.
     */
    ...(evergreen.extras.length
      ? {
          decidirCarrossel: decisorDeFormato(evergreen.lastros),
          /*
           * A verificação semântica entra junto com o evergreen, e sai junto.
           *
           * É o mesmo princípio do decisor de formato: sem conteúdo permanente
           * no dia, o gerador não pergunta nada e a notícia não paga nem chamada
           * nem mudança de comportamento.
           */
          verificarClaims: opcoes.verificarClaims ?? verificadorDeClaims({ env, fetcher }),
        }
      : {}),
    ...(opcoes.congelarArte ? { congelarArte: opcoes.congelarArte } : {}),
    ...(opcoes.congelarCarrossel ? { congelarCarrossel: opcoes.congelarCarrossel } : {}),
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

  return { diagnostico, ciclo, conferencia, evergreen };
}
