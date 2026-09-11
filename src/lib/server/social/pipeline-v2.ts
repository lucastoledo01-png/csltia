import type { PautaAvaliada } from "../editorial/guarda";
import type { RegistroHistorico } from "../editorial/history";
import type { PacoteFactual } from "../editorial/pacote-factual";
import type { CandidataPersistida } from "../editorial/candidatos-store";
import type { ResultadoVisual } from "../visual/tipos";
import { comporFeedSocial, carregarConfigSocial, topicoDaPauta } from "./selecao";
import type { ComposicaoSocial, ConfigSocial } from "./selecao";
import { carregarConfigDaAgenda, distribuirVagas } from "./agenda";
import type { Vaga } from "./agenda";
import { gerarPostsDoDia , type OpcoesDoGerador } from "./gerador";
import type { MarcaSocial } from "./copy";
import type { PostGerado } from "./gerador";
import { modoDoPipelineSocial, permiteEnforce, diagnosticoSocialVazio } from "./modo";
import type { DiagnosticoSocial, ModoSocial } from "./modo";
import { chaveDeIdempotencia, resolverOrigem } from "./social-posts-store";
import type { PostParaGravar, SocialPostsStore } from "./social-posts-store";
import { mesmaKeyword, resolverKeywordCanonica } from "./keyword-canonica";
import type { ResolucaoDaKeyword } from "./keyword-canonica";
import { congelarArtefato, congelarCarrossel } from "./artefato";
import type { EntradaDoCarrossel, ResultadoDoCarrossel } from "./artefato";
import { entradasDoCarrossel } from "./carrossel/arte";
import { alternarFormatos } from "./carrossel/formato";
import { comporFeedDoDia } from "./evergreen/compositor";
import type { DecisaoDeFormato } from "./carrossel/formato";
import type { EntradaDoCongelamento, ResultadoDoCongelamento } from "./artefato";
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
  etapa: "composicao" | "copy" | "visual" | "artefato";
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
  /*
   * O relógio, para simulação de um dia que já passou.
   *
   * `distribuirVagas` nunca agenda no passado, e com razão. Rodando à noite um
   * dry-run de ontem, esse piso empurra a grade inteira para a madrugada
   * seguinte e esconde justamente o que se quer ver. Em produção fica
   * ausente, e o relógio é o de agora.
   */
  agoraMs?: number;
  config?: ConfigSocial;
  /**
   * Resolve a keyword canônica do CTA. Trocado só em teste.
   *
   * Ela entra aqui, e não em quem chama, porque o ciclo é o gargalo por onde
   * TODA copy do V2 passa. Deixar a decisão em cada chamador é como o valor se
   * espalhou por três lugares na primeira vez.
   */
  resolverKeyword?: (projectId: string) => Promise<ResolucaoDaKeyword>;
  /**
   * Congela a arte aprovada num arquivo, e devolve o hash dele.
   *
   * Só é chamado em `enforce`: em dry-run não existe post para publicar, e
   * subir arquivo para o Storage a cada simulação encheria o bucket de peças
   * que nunca vão ao ar.
   */
  congelarArte?: (entrada: EntradaDoCongelamento) => Promise<ResultadoDoCongelamento>;
  /**
   * O congelamento de N slides, injetável pela mesma razão que o de um.
   *
   * Separado do de peça única de propósito: o nome do arquivo é diferente
   * (`social-v2-01.png` contra `social-v2.png`), e passar o caminho da peça
   * única por uma função que indexa mudaria o nome dos artefatos da notícia sem
   * nenhum ganho.
   */
  congelarCarrossel?: (entrada: EntradaDoCarrossel) => Promise<ResultadoDoCarrossel>;
  /** Verificação semântica das claims. Ausente significa não rodar. */
  verificarClaims?: OpcoesDoGerador["verificarClaims"];
  /** Decide static ou carousel por pauta. Ausente significa tudo static. */
  decidirCarrossel?: (
    pauta: PautaAvaliada,
    pacote: PacoteFactual | null,
    comCta: boolean,
  ) => DecisaoDeFormato | null;
  /** Prefixo do caminho no bucket. Sem ele, o ciclo não congela e não grava. */
  slugDoProjeto?: string;
  /**
   * Pautas que entram DEPOIS da composição da notícia, sem passar por ela.
   *
   * É por aqui que o evergreen entra, e a escolha de não jogá-lo no `pool` tem
   * uma razão só: `comporFeedSocial` aplica as réguas de diversidade do
   * noticiário sobre tudo o que recebe, e um evergreen com nota menor poderia
   * fazer uma notícia válida perder vaga por teto de eixo. Notícia nunca perde
   * vaga para conteúdo permanente.
   *
   * Quem decide quantos cabem é quem chama: o compositor do dia calcula as
   * vagas restantes e só manda o que couber. Ausente, o ciclo é exatamente o
   * que era.
   */
  extras?: PautaAvaliada[];
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

  /*
   * 2. A keyword do CTA, resolvida de uma fonte só.
   *
   * O que vai impresso no post tem que ser exatamente o que o listener escuta.
   * Quem escuta é a automação do OpenReply, criada com a keyword da campanha
   * evergreen; a `settings.instagram_keyword` do projeto não é consumida por
   * ninguém do lado do listener.
   *
   * Sem palavra escutando, a copy sai sem CTA. É perda pequena perto de
   * publicar "Comente X" e deixar quem comentou sem resposta.
   */
  const resolver = opcoes.resolverKeyword ?? resolverKeywordCanonica;
  const canonica = await resolver(opcoes.projectId);
  const marca: MarcaSocial = {
    ...opcoes.marca,
    keyword: canonica.ok ? canonica.keyword : "",
  };

  if (!canonica.ok) {
    linhas.push(`[SOCIAL V2] sem CTA: ${canonica.motivo}`);
  } else if (!mesmaKeyword(canonica.keyword, opcoes.marca.keyword)) {
    linhas.push(
      `[SOCIAL V2] keyword do CTA vem do funil permanente ("${canonica.keyword}"), ` +
        `e não da configuração do projeto ("${opcoes.marca.keyword}"). Quem escuta é a automação ${canonica.automacao}.`,
    );
  }

  /*
   * A notícia composta, mais o que veio por fora.
   *
   * A ordem importa e é a da prioridade: a notícia primeiro, o extra depois. A
   * agenda distribui os horários do dia numa passada só sobre esta lista, o que
   * é o único jeito de os dois canais não receberem o mesmo horário.
   */
  /*
   * O COMPOSITOR ÚNICO. Aqui, e em nenhum outro lugar, os dois canais se juntam.
   *
   * Isto era uma concatenação solta, e `comporFeedDoDia` existia ao lado com
   * teste próprio e nenhum chamador. Duas implementações da mesma aritmética,
   * uma testada e outra em produção, é exatamente o padrão do incidente do
   * `escolherUrlPublicavel`: os testes provavam uma coisa que não acontecia.
   *
   * O que o compositor garante, e a concatenação não garantia:
   *
   *   - a notícia entra primeiro e nunca perde vaga para conteúdo permanente;
   *   - o evergreen ocupa SÓ o que sobrou do teto global;
   *   - o total nunca passa do teto, mesmo que os dois lados cheguem cheios.
   *
   * O teto do evergreen já foi aplicado antes, em `prepararEvergreen`, e por um
   * motivo diferente: lá ele evita BUSCAR fonte oficial para item que não teria
   * vaga. Aqui ele decide o FEED. Os dois usam `calcularVagas`, então não têm
   * como divergir na conta.
   */
  const feed = comporFeedDoDia(
    composicao.escolhidas.map((e) => e.pauta),
    opcoes.extras ?? [],
    config.maximoPorDia,
  );

  const paraGerar = [...feed.noticias, ...feed.evergreen];

  if (opcoes.extras?.length) {
    linhas.push(
      `[SOCIAL V2] compositor: ${feed.noticias.length} de notícia + ${feed.evergreen.length} de conteúdo ` +
        `permanente = ${feed.total} de ${feed.vagas.maximo} vaga(s)` +
        (feed.evergreen.length < opcoes.extras.length
          ? `; ${opcoes.extras.length - feed.evergreen.length} permanente(s) cortado(s) pelo teto global`
          : ""),
    );
  }

  // 3. Copy, guarda e reparo.
  const geracao = await gerarPostsDoDia(
    paraGerar,
    config.maximoPorDia,
    {
      marca,
      pacotes: opcoes.pacotes,
      candidatas: opcoes.candidatas,
      env,
      fetcher: opcoes.fetcher,
      decidirCarrossel: opcoes.decidirCarrossel,
      verificarClaims: opcoes.verificarClaims,
    },
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

  // 4. Imagem, e sem imagem válida o post continua existindo.
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

  /*
   * 5. Diversidade de formato, e só entre o que veio DEPOIS da notícia.
   *
   * A notícia é sempre estática nesta fase e sempre vem primeiro, e é por isso
   * que a intercalação só pode agir na cauda: reordenar a lista inteira daria à
   * cauda a chance de ocupar um horário da notícia, e a prioridade da notícia
   * não é desempate, é regra.
   *
   * Aqui já se sabe o formato de cada post, o que antes da geração era
   * impossível: o formato depende de quantos fatos o pacote sustentou.
   */
  const idsDaCauda = new Set((opcoes.extras ?? []).map((p) => p.storyId));
  const daNoticia = comVisual.filter((c) => !idsDaCauda.has(c.post.pauta.storyId));
  const daCauda = comVisual.filter((c) => idsDaCauda.has(c.post.pauta.storyId));
  const ordenados = [
    ...daNoticia,
    ...alternarFormatos(daCauda, (c) => (c.post.carrossel ? "carousel" : "static")),
  ];

  if (daCauda.length > 1) {
    linhas.push(
      `[SOCIAL V2] formatos na cauda: ${ordenados
        .slice(daNoticia.length)
        .map((c) => (c.post.carrossel ? `C${c.post.carrossel.papeis.length}` : "S"))
        .join(" ")}`,
    );
  }

  // 6. Agenda: recebe a quantidade, não a impõe.
  const vagas = distribuirVagas(ordenados.length, opcoes.editionDate, carregarConfigDaAgenda(env), opcoes.agoraMs);

  const previews: PreviewDoPost[] = ordenados.map(({ post, visual }, i) => {
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

  /*
   * 7. Congelar a arte ANTES de gravar, e não gravar o que não congelou.
   *
   * Uma linha `scheduled` é um compromisso: o worker vai publicá-la. Gravar
   * primeiro e descobrir na hora da publicação que a peça não fecha deixaria o
   * post parado num estado que ninguém pediu.
   *
   * Por isso a ordem é esta, e por isso o post que falha aqui é DESCARTADO em
   * vez de gravado com defeito. O motivo entra em `descartados` e aparece no
   * relatório do dia.
   */
  const congelar = opcoes.congelarArte ?? congelarArtefato;
  const congelarSlides = opcoes.congelarCarrossel ?? congelarCarrossel;
  const paraGravar: PostParaGravar[] = [];

  for (const p of previews) {
    const path = `${opcoes.slugDoProjeto ?? opcoes.projectId}/${opcoes.editionDate}/${p.chaveDeIdempotencia}`;
    const carrossel = p.post.carrossel;

    /*
     * Um caminho por formato, e o mesmo tratamento de falha nos dois.
     *
     * O que muda é quantos arquivos são congelados. O que NÃO muda é a regra:
     * artefato que não fecha vira descarte, não vira linha `scheduled` com
     * defeito, porque linha `scheduled` é compromisso de publicar.
     */
    const resultado = carrossel
      ? await congelarSlides({
          slides: entradasDoCarrossel(
            { ...p.post.copy, slides: carrossel.slides },
            carrossel.papeis,
            {
              eixo: p.post.pauta.classificacao.eixo ?? "",
              asset: p.visual?.asset ?? null,
              motivoSemFoto: p.visual?.motivo ?? "NO_VALID_VISUAL_ASSET",
            },
          ).entradas,
          path,
          fetcher: opcoes.fetcher,
        })
      : await congelar({
          capa: {
            headline: p.post.copy.headline,
            eixo: p.post.pauta.classificacao.eixo,
            asset: p.visual?.asset ?? null,
            motivoSemFoto: p.visual?.motivo ?? "NO_VALID_VISUAL_ASSET",
          },
          path,
          fetcher: opcoes.fetcher,
        });

    if (!resultado.ok) {
      linhas.push(`[SOCIAL V2] ${p.post.pauta.storyId} não vira post: ${resultado.motivo}`);
      descartados.push({
        titulo: p.post.copy.headline,
        storyId: p.post.pauta.storyId,
        etapa: "artefato",
        motivo: resultado.motivo,
      });
      continue;
    }

    const artefatos = "artefatos" in resultado ? resultado.artefatos : [{ ...resultado.artefato, index: 1 }];

    linhas.push(
      `[SOCIAL V2] ${carrossel ? `carrossel de ${artefatos.length} slides congelado` : "arte congelada"}: ` +
        artefatos
          .map((a) => `${a.filename} ${(a.bytes / 1024).toFixed(0)}KB sha ${a.sha256.slice(0, 8)}`)
          .join(" | ") +
        (artefatos.some((a) => a.otimizado) ? " (otimizado para caber no limite)" : ""),
    );

    paraGravar.push({
      projectId: opcoes.projectId,
      editionDate: opcoes.editionDate,
      post: p.post,
      vaga: p.vaga,
      visual: p.visual,
      candidateId: p.candidateId,
      topicId: p.topicId,
      eventFingerprint: p.eventFingerprint,
      origem: p.origem,
      formato: carrossel ? "carousel" : "static",
      artefatos,
    });
  }

  diagnostico.descartados = descartados.length;

  if (paraGravar.length === 0) {
    linhas.push("[SOCIAL V2] nenhuma arte congelou: nada gravado");
    return { modo, previews, descartados, composicao, diagnostico, gravacao: null, linhasDeLog: linhas };
  }

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
