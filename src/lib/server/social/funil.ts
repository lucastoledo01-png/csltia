import type { NewsCandidate } from "../newsroom/collector";
import { deduplicateCandidates } from "../newsroom/deduplicator";
import { avaliarPautas } from "../editorial/guarda";
import type { ResultadoDosFinalistas } from "../editorial/finalistas";
import { criarCandidatosStore } from "../editorial/candidatos-store";
import { rodarSocialDoDia } from "./ciclo-do-dia";
import { diagnosticoSocialVazio } from "./modo";
import type { ResultadoDoCicloSocial } from "./pipeline-v2";
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

  /*
   * Lotes de classificação que falharam, e por quê.
   *
   * Uma pauta sem classificação é recusada por precaução e sai do relatório
   * como `REJECT_UNCLASSIFIED`, que parece decisão editorial e não é: é o
   * modelo tendo parado no meio, ou a API tendo recusado o lote. O motivo já
   * existia no log da guarda e não chegava aqui, então o relatório mostrava 42
   * pautas mortas sem dizer que 42 é um número de infraestrutura.
   */
  falhasDeClassificacao: string[];
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
  conferencia: ResultadoDosFinalistas;
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

  /*
   * Daqui para baixo é o MESMO caminho que o newsroom de produção executa.
   *
   * Enquanto eram duas implementações, esta função media um pipeline que não
   * era o que rodava no cron, e um ajuste num dos dois passava despercebido no
   * outro. O modo vem forçado porque esta função existe para diagnosticar, e
   * diagnóstico não vira publicação por descuido.
   */
  const social = await rodarSocialDoDia(guarda.approvedEditorialPool, {
    projectId: opcoes.projectId,
    projectSlug: opcoes.projectId,
    editionDate: opcoes.dia,
    marca: opcoes.marca,
    historico: opcoes.historico,
    config: opcoes.config,
    client: opcoes.client,
    persistenciaDegradada: guarda.reuso.erros.length > 0,
    env,
    fetcher,
    // A véspera da janela do dia simulado, para a grade sair no dia certo.
    agoraMs: new Date(`${opcoes.dia}T03:00:00Z`).getTime(),
    modoForcado: "dry_run",
  });

  /*
   * Pool vazio, ou nenhuma confirmada: o ciclo não roda e não há resultado.
   *
   * O relatório precisa de um dia inteiro mesmo assim — zero post é resultado,
   * não ausência de execução —, então os vazios são construídos aqui com os
   * tipos de verdade, e não com um `as unknown` que apagaria a conferência do
   * compilador justamente onde ela ajuda.
   */
  const conferencia: ResultadoDosFinalistas = social.conferencia ?? {
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

  const ciclo: ResultadoDoCicloSocial = social.ciclo ?? {
    modo: "dry_run",
    previews: [],
    descartados: [],
    composicao: null,
    diagnostico: diagnosticoSocialVazio("dry_run"),
    gravacao: null,
    linhasDeLog: [],
  };

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
    falhasDeClassificacao: guarda.linhasDeLog.filter((l) => l.includes("lote ")),
  };

  return { resumo, ciclo, recusadas, guarda, conferencia };
}
