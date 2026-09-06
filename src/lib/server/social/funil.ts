import type { NewsCandidate } from "../newsroom/collector";
import { deduplicateCandidates } from "../newsroom/deduplicator";
import { avaliarPautas } from "../editorial/guarda";
import { conferirFinalistas } from "../editorial/finalistas";
import { montarPacotesDasPautas } from "../editorial/pacote-factual";
import type { PacoteFactual } from "../editorial/pacote-factual";
import { criarCandidatosStore } from "../editorial/candidatos-store";
import { resolveVisualAsset } from "../visual/resolver";
import { rodarCicloSocial } from "./pipeline-v2";
import type { ResultadoDoCicloSocial } from "./pipeline-v2";
import { carregarConfigSocial } from "./selecao";
import type { MarcaSocial } from "./copy";
import type { ConfigSocial } from "./selecao";
import type { ConfigEditorial } from "../editorial/config";
import type { RegistroHistorico } from "../editorial/history";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Um dia inteiro do feed, do candidato bruto ao post final, contado etapa a
 * etapa.
 *
 * Existe porque a pergunta "por que saíram 1 post e não dez" não se responde
 * olhando o resultado: ela se responde olhando ONDE cada pauta morreu. Um dia
 * com 130 candidatas e 1 post pode ser oferta ruim, filtro apertado demais,
 * verificador instável ou copy quebrando; os quatro produzem o mesmo número
 * final e pedem quatro correções diferentes.
 *
 * O dry-run de um dia e a medição de sete dias chamam esta mesma função. Se
 * fossem duas implementações, a medição mediria um pipeline que não é o que
 * roda.
 */

export type FunilDoDia = {
  dia: string;

  // Coleta
  coletadas: number;
  gruposUnicos: number;

  // Classificação e linha editorial
  classificadasAgora: number;
  reaproveitadasDaClassificacao: number;
  recusadasNaLinhaEditorial: number;
  motivosEditoriais: Record<string, number>;
  approvedEditorialPool: number;
  newsletterLevaria: number;

  // Verificação
  finalistasConferidos: number;
  reaproveitadasDeOutroCanal: number;
  confirmadas: number;
  recusadasNaVerificacao: number;
  emConflito: number;
  camposEmConflito: Record<string, number>;

  // Composição social
  cortadasPorDiversidade: number;
  motivosDeDiversidade: Record<string, number>;

  // Copy
  descartadasNaCopy: number;
  motivosDeCopy: Record<string, number>;

  // Visual
  semImagem: number;
  motivosSemImagem: Record<string, number>;

  postsFinais: number;

  // Custo
  tokensDaClassificacao: number;
  tokensDaVerificacao: number;
  ms: number;

  /** Falhas de persistência, que mudam a leitura de tudo acima. */
  persistenciaDegradada: string[];
};

export type ResultadoDoFunil = {
  resumo: FunilDoDia;
  ciclo: ResultadoDoCicloSocial;
  /** Recusas nominais, para quem quiser listar pauta a pauta. */
  recusadas: Array<{ etapa: string; motivo: string; titulo: string; detalhe?: string }>;
  /*
   * Os dois resultados brutos, para quem precisa de detalhe que o resumo não
   * carrega: a comparação com a newsletter, os campos que divergiram numa
   * pauta específica, o texto de cada recusa.
   */
  guarda: Awaited<ReturnType<typeof avaliarPautas>>;
  conferencia: Awaited<ReturnType<typeof conferirFinalistas>>;
};

export type OpcoesDoFunil = {
  dia: string;
  projectId: string;
  marca: MarcaSocial;
  historico: RegistroHistorico[];
  config: ConfigEditorial;
  configSocial?: ConfigSocial;
  client: SupabaseClient;
  provedorDeVetor?: Parameters<typeof avaliarPautas>[1]["provedorDeVetor"];
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
};

function contarPor<T>(itens: T[], chave: (x: T) => string): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const item of itens) {
    const k = chave(item) || "(sem motivo)";
    mapa[k] = (mapa[k] ?? 0) + 1;
  }
  return mapa;
}

export async function rodarFunilDoDia(
  candidatasDoDia: NewsCandidate[],
  opcoes: OpcoesDoFunil,
): Promise<ResultadoDoFunil> {
  const inicio = Date.now();
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const configSocial = opcoes.configSocial ?? carregarConfigSocial(env);
  const candidatosStore = criarCandidatosStore(opcoes.client);
  const recusadas: ResultadoDoFunil["recusadas"] = [];

  const { uniqueGroups } = deduplicateCandidates(candidatasDoDia);

  const guarda = await avaliarPautas(uniqueGroups, {
    canal: "instagram",
    historico: opcoes.historico,
    config: opcoes.config,
    provedorDeVetor: opcoes.provedorDeVetor,
    env,
    fetcher,
    candidatos: { store: candidatosStore, projectId: opcoes.projectId },
  });

  for (const r of guarda.recusadas) {
    recusadas.push({ etapa: "linha editorial", motivo: r.motivo, titulo: r.titulo, detalhe: r.explicacao });
  }

  const conferencia = await conferirFinalistas(guarda.approvedEditorialPool, {
    canal: "instagram",
    vagas: configSocial.maximoPorDia,
    config: opcoes.config,
    store: candidatosStore,
    projectId: opcoes.projectId,
    env,
    fetcher,
  });

  /*
   * O motivo nominal e o motivo escrito são coisas diferentes.
   *
   * "VERIFIED_REJECT" agrupa; o texto do verificador é o que diz se a recusa
   * foi acerto ou perda. Sem ele, "o verificador matou 11" não distingue matar
   * ruído de política brasileira de matar pauta oficial de imigração.
   */
  for (const r of conferencia.recusadas) {
    recusadas.push({
      etapa: "verificação",
      motivo: "VERIFIED_REJECT",
      detalhe: r.motivo,
      titulo: r.pauta.grupo.primary.title,
    });
  }
  for (const c of conferencia.emConflito) {
    recusadas.push({
      etapa: "verificação",
      motivo: "EDITORIAL_CLASSIFICATION_CONFLICT",
      detalhe: c.divergencias
        .map((d) => `${d.campo}: primária ${d.primaria} x verificação ${d.verificacao}${d.material ? " (material)" : ""}`)
        .join("; "),
      titulo: c.pauta.grupo.primary.title,
    });
  }

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

  const candidatasPorStory = await candidatosStore.buscarPorStoryIds(
    opcoes.projectId,
    conferencia.confirmadas.map((p) => p.storyId),
  );

  const ciclo = await rodarCicloSocial(conferencia.confirmadas, {
    projectId: opcoes.projectId,
    editionDate: opcoes.dia,
    marca: opcoes.marca,
    historico: opcoes.historico,
    pacotes,
    candidatas: candidatasPorStory,
    persistenciaDegradada: guarda.reuso.erros.length > 0,
    config: configSocial,
    // O modo vem forçado: esta função existe para diagnosticar, e diagnóstico
    // não vira publicação por descuido.
    env: { ...env, SOCIAL_PIPELINE_V2: "dry_run" },
    fetcher,
    // A véspera da janela do dia simulado, para a grade sair no dia certo.
    agoraMs: new Date(`${opcoes.dia}T03:00:00Z`).getTime(),
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

  for (const d of ciclo.descartados) {
    recusadas.push({
      etapa: d.etapa === "composicao" ? "diversidade social" : "copy",
      motivo: d.motivo.split(":")[0],
      titulo: d.titulo,
    });
  }

  const cortesDeDiversidade = ciclo.composicao?.cortadas ?? [];
  const descartesDeCopy = ciclo.descartados.filter((d) => d.etapa === "copy");
  const camposEmConflito: Record<string, number> = {};
  for (const c of conferencia.emConflito) {
    for (const div of c.divergencias) {
      camposEmConflito[div.campo] = (camposEmConflito[div.campo] ?? 0) + 1;
    }
  }

  const resumo: FunilDoDia = {
    dia: opcoes.dia,
    coletadas: candidatasDoDia.length,
    gruposUnicos: uniqueGroups.length,
    classificadasAgora: guarda.reuso.classificadasAgora,
    reaproveitadasDaClassificacao: guarda.reuso.classificacoesReaproveitadas,
    recusadasNaLinhaEditorial: guarda.recusadas.length,
    motivosEditoriais: contarPor(guarda.recusadas, (r) => r.motivo),
    approvedEditorialPool: guarda.approvedEditorialPool.length,
    newsletterLevaria: guarda.selecionadas.length,
    finalistasConferidos: conferencia.diagnostico.finalistas,
    reaproveitadasDeOutroCanal: conferencia.diagnostico.reaproveitadasDoBanco,
    confirmadas: conferencia.confirmadas.length,
    recusadasNaVerificacao: conferencia.recusadas.length,
    emConflito: conferencia.emConflito.length,
    camposEmConflito,
    cortadasPorDiversidade: cortesDeDiversidade.length,
    motivosDeDiversidade: contarPor(cortesDeDiversidade, (c) => c.motivo),
    descartadasNaCopy: descartesDeCopy.length,
    motivosDeCopy: contarPor(descartesDeCopy, (d) => d.motivo.split(":")[0]),
    semImagem: ciclo.diagnostico.semImagem,
    motivosSemImagem: contarPor(
      ciclo.previews.filter((p) => !p.visual?.asset),
      (p) => p.visual?.motivo ?? "resolvedor não executou",
    ),
    postsFinais: ciclo.previews.length,
    tokensDaClassificacao: guarda.tokens.total,
    tokensDaVerificacao: conferencia.diagnostico.tokens,
    ms: Date.now() - inicio,
    persistenciaDegradada: guarda.reuso.erros,
  };

  return { resumo, ciclo, recusadas, guarda, conferencia };
}
