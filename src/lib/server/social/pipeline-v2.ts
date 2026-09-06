import type { PautaAvaliada } from "../editorial/guarda";
import type { RegistroHistorico } from "../editorial/history";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { CandidataPersistida } from "../editorial/candidatos-store";
import type { ResultadoVisual } from "../visual/tipos";
import { comporFeedSocial, carregarConfigSocial, topicoDaPauta } from "./selecao";
import type { ComposicaoSocial, ConfigSocial } from "./selecao";
import { carregarConfigDaAgenda, distribuirVagas } from "./agenda";
import type { Vaga } from "./agenda";
import { gerarPostsDoDia } from "./gerador";
import type { MarcaSocial } from "./copy";
import type { PostGerado } from "./gerador";
import { modoDoPipelineSocial, permiteEnforce, diagnosticoSocialVazio } from "./modo";
import type { DiagnosticoSocial, ModoSocial } from "./modo";
import { chaveDeIdempotencia, resolverOrigem } from "./social-posts-store";
import type { PostParaGravar, SocialPostsStore } from "./social-posts-store";
import { impressaoDoAcontecimento } from "../editorial/fingerprint";
import { entidadesDaClassificacao } from "../editorial/classificador";

/**
 * O ciclo social, do pool verificado ao objeto do post.
 *
 * O modo decide o que acontece com o resultado, e só isso. O cálculo é o mesmo
 * nos três: seleção, copy, guarda, reparo, imagem e agenda rodam igual, porque
 * um dry-run que executa um caminho diferente do de produção não diagnostica o
 * de produção.
 *
 *   off       nem entra. O caminho social atual segue inteiro.
 *   dry_run   calcula tudo e NÃO grava nada.
 *   enforce   grava, e está bloqueado por `permiteEnforce`.
 *
 * A escolha de não gravar em dry-run é deliberada e vale a explicação. A
 * tabela `social_posts` é a fila do worker antigo, e ele seleciona por
 * `platform`, `status` e `scheduled_at`, sem olhar a coluna `dry_run`. Uma
 * linha de diagnóstico com status `scheduled` seria publicada por ele no
 * horário. Ou se acrescenta um filtro no worker, que é mexer em produção, ou
 * o dry-run não escreve. Ele não escreve.
 */

export type PreviewDoPost = {
  posicao: number;
  vaga: Vaga;
  post: PostGerado;
  visual: ResultadoVisual | null;
  origem: ReturnType<typeof resolverOrigem>;
  candidateId: string | null;
  topicId: string;
  eventFingerprint: string;
  /** A chave que a gravação usaria. Exposta para o dry-run ser auditável. */
  chaveDeIdempotencia: string;
};

export type DescartePorEtapa = {
  titulo: string;
  storyId: string;
  etapa: "composicao" | "copy" | "visual";
  motivo: string;
};

export type ResultadoDoCicloSocial = {
  modo: ModoSocial;
  previews: PreviewDoPost[];
  descartados: DescartePorEtapa[];
  composicao: ComposicaoSocial | null;
  diagnostico: DiagnosticoSocial;
  /** Preenchido só em enforce liberado. */
  gravacao: { gravados: number; bloqueados: number; erros: string[] } | null;
  linhasDeLog: string[];
};

export type OpcoesDoCiclo = {
  projectId: string;
  editionDate: string;
  marca: MarcaSocial;
  historico: RegistroHistorico[];
  pacotes?: Map<string, PacoteFactual>;
  candidatas?: Map<string, CandidataPersistida>;
  /** Resolve a imagem de uma pauta. Ausente, o ciclo roda sem imagem. */
  resolverVisual?: (pauta: PautaAvaliada) => Promise<ResultadoVisual | null>;
  store?: SocialPostsStore | null;
  persistenciaDegradada?: boolean;
  config?: ConfigSocial;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
};

export async function rodarCicloSocial(
  poolVerificado: PautaAvaliada[],
  opcoes: OpcoesDoCiclo,
): Promise<ResultadoDoCicloSocial> {
  const env = opcoes.env ?? process.env;
  const modo = modoDoPipelineSocial(env);
  const linhas: string[] = [];
  const diagnostico = diagnosticoSocialVazio(modo);

  if (modo === "off") {
    linhas.push("[SOCIAL V2] desligado, o caminho social atual segue inteiro");
    return { modo, previews: [], descartados: [], composicao: null, diagnostico, gravacao: null, linhasDeLog: linhas };
  }

  const liberacao = permiteEnforce(env);
  diagnostico.enforcePermitido = liberacao.permitido;
  diagnostico.motivoDoBloqueio = liberacao.motivo;

  const config = opcoes.config ?? carregarConfigSocial(env);
  const descartados: DescartePorEtapa[] = [];

  // 1. Composição própria do feed.
  const composicao = comporFeedSocial(poolVerificado, config, {
    persistenciaDegradada: opcoes.persistenciaDegradada,
    paraPublicar: modo === "enforce",
  });
  linhas.push(...composicao.linhasDeLog);
  diagnostico.candidatasNaFila = poolVerificado.length;
  diagnostico.bloqueio = composicao.bloqueio;

  for (const c of composicao.cortadas) {
    descartados.push({ titulo: c.titulo, storyId: "", etapa: "composicao", motivo: `${c.motivo}: ${c.detalhe}` });
  }

  if (composicao.bloqueio) {
    linhas.push(`[SOCIAL V2] ciclo bloqueado: ${composicao.bloqueio}`);
    return { modo, previews: [], descartados, composicao, diagnostico, gravacao: null, linhasDeLog: linhas };
  }

  // 2. Copy, guarda e reparo.
  const geracao = await gerarPostsDoDia(
    composicao.escolhidas.map((e) => e.pauta),
    config.maximoPorDia,
    { marca: opcoes.marca, pacotes: opcoes.pacotes, candidatas: opcoes.candidatas, env, fetcher: opcoes.fetcher },
  );
  linhas.push(...geracao.linhasDeLog);
  diagnostico.reparos = geracao.diagnostico.reparosFeitos;

  for (const d of geracao.descartadas) {
    descartados.push({
      titulo: d.pauta.grupo.primary.title,
      storyId: d.pauta.storyId,
      etapa: "copy",
      motivo: d.motivo,
    });
  }

  // 3. Imagem, e sem imagem válida o post continua existindo.
  const comVisual: Array<{ post: PostGerado; visual: ResultadoVisual | null }> = [];
  for (const post of geracao.posts) {
    let visual: ResultadoVisual | null = null;
    if (opcoes.resolverVisual) {
      try {
        visual = await opcoes.resolverVisual(post.pauta);
      } catch (erro) {
        linhas.push(`[SOCIAL V2] imagem falhou em ${post.pauta.storyId}: ${(erro as Error).message}`);
      }
    }
    if (!visual?.asset) diagnostico.semImagem += 1;
    comVisual.push({ post, visual });
  }

  // 4. Agenda: recebe a quantidade, não a impõe.
  const vagas = distribuirVagas(comVisual.length, opcoes.editionDate, carregarConfigDaAgenda(env));

  const previews: PreviewDoPost[] = comVisual.map(({ post, visual }, i) => {
    const fingerprint =
      impressaoDoAcontecimento(entidadesDaClassificacao(post.pauta.classificacao)) || post.pauta.storyId;

    return {
      posicao: i + 1,
      vaga: vagas[i],
      post,
      visual,
      origem: resolverOrigem(post.pauta.storyId, opcoes.historico),
      candidateId: opcoes.candidatas?.get(post.pauta.storyId)?.id ?? null,
      topicId: topicoDaPauta(post.pauta),
      eventFingerprint: fingerprint,
      chaveDeIdempotencia: chaveDeIdempotencia(opcoes.editionDate, post.pauta.storyId),
    };
  });

  diagnostico.postsGerados = previews.length;
  diagnostico.descartados = descartados.length;

  /*
   * A gravação é o ÚNICO ponto em que os modos divergem.
   *
   * Em dry_run não se escreve nada, nem com `dry_run: true`: a fila do worker
   * antigo não olha essa coluna, e uma linha `scheduled` seria publicada no
   * horário. Diagnóstico não pode virar publicação por descuido.
   */
  if (modo !== "enforce") {
    linhas.push(`[SOCIAL V2] dry-run: ${previews.length} preview(s), nada gravado em social_posts`);
    return { modo, previews, descartados, composicao, diagnostico, gravacao: null, linhasDeLog: linhas };
  }

  if (!liberacao.permitido) {
    linhas.push(`[SOCIAL V2] enforce pedido e recusado: ${liberacao.motivo}`);
    return { modo, previews, descartados, composicao, diagnostico, gravacao: null, linhasDeLog: linhas };
  }

  if (!opcoes.store) {
    linhas.push("[SOCIAL V2] enforce sem store: nada gravado");
    return { modo, previews, descartados, composicao, diagnostico, gravacao: null, linhasDeLog: linhas };
  }

  const paraGravar: PostParaGravar[] = previews.map((p) => ({
    projectId: opcoes.projectId,
    editionDate: opcoes.editionDate,
    post: p.post,
    vaga: p.vaga,
    visual: p.visual,
    candidateId: p.candidateId,
    topicId: p.topicId,
    eventFingerprint: p.eventFingerprint,
    origem: p.origem,
  }));

  const r = await opcoes.store.gravar(paraGravar);
  linhas.push(`[SOCIAL V2] ${r.gravados} post(s) gravado(s), ${r.bloqueadosPorIdempotencia.length} bloqueado(s)`);

  return {
    modo,
    previews,
    descartados,
    composicao,
    diagnostico,
    gravacao: { gravados: r.gravados, bloqueados: r.bloqueadosPorIdempotencia.length, erros: r.erros },
    linhasDeLog: linhas,
  };
}
