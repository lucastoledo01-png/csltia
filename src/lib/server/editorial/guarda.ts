import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeduplicatedGroup } from "../newsroom/deduplicator";
import type { Classificacao } from "./classificador";
import { classificarPautas, decidirPauta, entidadesDaClassificacao, montarSystemDoClassificador } from "./classificador";
import {
  assinaturaDoClassificador,
  classificacaoAindaVale,
  criarCandidatosStore,
  garantirStatusIntrinseco,
} from "./candidatos-store";
import type { CandidataParaGravar, CandidatosStore } from "./candidatos-store";
import { lerSinaisObjetivos,
  escolherUrlPublicavel,
} from "./regras-duras";
import { impressaoDoAcontecimento } from "./fingerprint";
import type { ConfigEditorial } from "./config";
import { MOTIVOS } from "./config";
import type { Motivo } from "./config";
import type { ProvedorDeEmbedding, Vetor } from "./embeddings";
import { textoParaVetor } from "./embeddings";
import type { Canal, RegistroHistorico } from "./history";
import { gerarStoryId } from "./history";
import type { Pontuacao } from "./pontuacao";
import { edicaoViavel, ordenarESelecionar, pontuarPauta } from "./pontuacao";
import { descreverSinais, verificarRepeticao } from "./repeticao";
import type { SinaisDeRepeticao, Veredito } from "./repeticao";
import { dominioDe } from "./url-canonica";
import type { ResultadoDoEnriquecimento } from "./enriquecimento";
import { enriquecerPauta, temFatosSuficientes } from "./enriquecimento";

/**
 * A guarda editorial: quem decide o que entra na edição.
 *
 * Ela existe para que a decisão seja um lugar só, com um relatório do que foi
 * recusado e por quê. Antes, a seleção era o ranker somando palavras de outra
 * vertical, e o motivo de uma pauta não ter entrado não ficava registrado em
 * lugar nenhum.
 *
 * Ordem: classificar, filtrar pela linha editorial, verificar repetição,
 * pontuar, selecionar. Classificação e filtro vêm antes da verificação de
 * repetição porque comparar vetor de pauta que já foi recusada é gastar por
 * nada.
 */

export type PautaAvaliada = {
  grupo: DeduplicatedGroup;
  storyId: string;
  classificacao: Classificacao;
  /** De onde veio o texto que sustenta esta pauta, e quanto texto é. */
  enriquecimento: ResultadoDoEnriquecimento;
  /** Por que a linha editorial aceitou esta pauta. Vai para o banco. */
  motivoDaAprovacao: Motivo;
  veredito: Veredito;
  pontuacao: Pontuacao;
  vetor: Vetor | null;
};

export type Recusa = {
  titulo: string;
  url: string;
  fonte: string;
  motivo: Motivo;
  explicacao: string;
  /** Só nas recusas por repetição, para separar certeza de palpite. */
  confianca?: "alta" | "media" | "baixa";
  /** Os sinais conferidos, quando a recusa foi por repetição. */
  sinais?: SinaisDeRepeticao;
};

export type ResultadoDaGuarda = {
  selecionadas: PautaAvaliada[];
  /**
   * O pool editorial aprovado: tudo que passou nos critérios DUROS.
   *
   * O nome é longo de propósito, porque a distinção é a que mais confunde
   * aqui. Passar neste pool significa ter sobrevivido a negatividade dos EUA,
   * relevância mínima, fonte resolvida, enriquecimento suficiente e
   * repetição. Nada que tenha sido recusado por qualquer um desses critérios
   * entra, em canal nenhum.
   *
   * `selecionadas` é outra coisa: é a COMPOSIÇÃO DA NEWSLETTER, aplicada
   * depois, sobre este pool. Ela corta por teto global, teto de Brasil, dois
   * por ator e dois por domínio, e esses cortes não vão para `recusadas` nem
   * para o log. Num dia medido com oito pautas no pool, seis sumiram ali.
   *
   * Um e-mail com quatro pautas e um feed com dez posts precisam de
   * composições diferentes sobre a MESMA matéria aprovada. Por isso o pool é
   * exposto, e por isso a newsletter continua lendo só `selecionadas`.
   */
  approvedEditorialPool: PautaAvaliada[];
  recusadas: Recusa[];
  viavel: boolean;
  motivoDaInviabilidade: string;
  custoUsd: number;
  /** Volume medido. O custo em dólar depende do preço do modelo em uso. */
  tokens: { prompt: number; completion: number; total: number };
  vetoresGerados: number;
  /** O que a camada persistida economizou nesta rodada. */
  reuso: {
    candidatasLidas: number;
    classificacoesReaproveitadas: number;
    classificadasAgora: number;
    persistidas: number;
    erros: string[];
  };
  linhasDeLog: string[];
};

export type OpcoesDaGuarda = {
  canal: Canal;
  /**
   * Camada de candidatas persistidas. Ausente, a guarda roda como sempre.
   *
   * Opcional de propósito: sem ela, nada muda para quem já chamava esta
   * função, e a newsletter continua com o mesmo comportamento de antes.
   */
  candidatos?: { store?: CandidatosStore; client?: SupabaseClient; projectId: string };
  /** Quantas páginas buscar por rodada. Protege a fonte e o relógio. */
  limiteDeEnriquecimento?: number;
  historico: RegistroHistorico[];
  config: ConfigEditorial;
  provedorDeVetor?: ProvedorDeEmbedding | null;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
};

export async function avaliarPautas(
  grupos: DeduplicatedGroup[],
  opcoes: OpcoesDaGuarda
): Promise<ResultadoDaGuarda> {
  const { canal, historico, config } = opcoes;
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;

  const recusadas: Recusa[] = [];
  const linhas: string[] = [];

  if (grupos.length === 0) {
    return {
      selecionadas: [],
      approvedEditorialPool: [],
      recusadas: [],
      viavel: false,
      motivoDaInviabilidade: "nenhuma candidata coletada",
      custoUsd: 0,
      tokens: { prompt: 0, completion: 0, total: 0 },
      vetoresGerados: 0,
      reuso: { candidatasLidas: 0, classificacoesReaproveitadas: 0, classificadasAgora: 0, persistidas: 0, erros: [] },
      linhasDeLog: ["[GUARDA] nenhuma candidata coletada"],
    };
  }

  /*
   * O que já foi classificado não se classifica de novo.
   *
   * A economia é o motivo menor. O maior está medido: a mesma candidata
   * classificada três vezes muda de relevância em 64% das vezes e de decisão
   * em 24%. Reler do banco não melhora o sorteio; faz ele valer para os dois
   * canais e para os dias seguintes, em vez de um novo a cada execução.
   *
   * A leitura vale enquanto a assinatura bater. Trocou o prompt, o modelo ou a
   * versão da régua, a candidata volta para a fila do classificador.
   */
  const store =
    opcoes.candidatos?.store ??
    (opcoes.candidatos?.client ? criarCandidatosStore(opcoes.candidatos.client) : null);
  const projectId = opcoes.candidatos?.projectId ?? "";
  const assinatura = assinaturaDoClassificador(montarSystemDoClassificador(), env);

  const reuso = {
    candidatasLidas: 0,
    classificacoesReaproveitadas: 0,
    classificadasAgora: 0,
    persistidas: 0,
    erros: [] as string[],
  };

  const reaproveitadas = new Map<string, Classificacao>();
  let paraClassificar = grupos;

  if (store && projectId) {
    try {
      /*
       * Janela, não lista de URLs.
       *
       * A leitura por lista montava cinquenta URLs de notícia na query string,
       * o que passa de dez mil caracteres. Funcionou no meu ambiente e morreu
       * no contêiner com "fetch failed", deixando a persistência degradada em
       * produção. A janela é uma query curta e constante.
       */
      const persistidas = await store.buscarDaJanela(projectId, config.janelaDeDias + 15);
      reuso.candidatasLidas = persistidas.size;

      paraClassificar = grupos.filter((g) => {
        const anterior = persistidas.get(g.primary.url);
        if (!anterior?.classificacao || !classificacaoAindaVale(anterior, assinatura)) return true;

        /*
         * O `id` da classificação persistida é o da linha do banco, e o resto
         * da guarda indexa pelo id da candidata desta rodada, que é gerado na
         * coleta. Sem esta troca, a classificação reaproveitada nunca casaria
         * com o grupo e a pauta cairia como não classificada.
         */
        reaproveitadas.set(g.primary.id, { ...anterior.classificacao, id: g.primary.id });
        return false;
      });

      reuso.classificacoesReaproveitadas = reaproveitadas.size;
      linhas.push(
        `[GUARDA] ${persistidas.size} candidata(s) já no banco, ` +
          `${reaproveitadas.size} classificação(ões) reaproveitada(s), ${paraClassificar.length} a classificar`,
      );
    } catch (erro) {
      // Banco indisponível não pode impedir a edição de sair. Classifica tudo.
      reuso.erros.push(`leitura de candidatas falhou: ${(erro as Error).message}`);
      linhas.push(`[GUARDA] camada persistida indisponível, classificando tudo: ${(erro as Error).message}`);
      paraClassificar = grupos;
    }
  }

  const { classificacoes, custoUsd, tokens, lotesComFalha } = await classificarPautas(
    paraClassificar.map((g) => ({
      id: g.primary.id,
      titulo: g.primary.title,
      descricao: g.primary.description || g.primary.content || "",
      fonte: g.primary.source_name,
      url: g.primary.url,
    })),
    env,
    fetcher
  );

  reuso.classificadasAgora = classificacoes.size;
  for (const [id, c] of reaproveitadas.entries()) classificacoes.set(id, c);

  let custoTotal = custoUsd;
  const tokensTotais = { ...tokens };

  linhas.push(
    `[GUARDA] ${classificacoes.size} de ${grupos.length} candidatas classificadas ` +
      `(${reuso.classificadasAgora} agora, ${reaproveitadas.size} do banco, US$ ${custoUsd.toFixed(4)})`
  );
  for (const falha of lotesComFalha) linhas.push(`[GUARDA] ${falha}`);

  const aprovadasNoFiltro: Array<{
    grupo: DeduplicatedGroup;
    classificacao: Classificacao;
    motivo: Motivo;
  }> = [];

  for (const grupo of grupos) {
    const c = classificacoes.get(grupo.primary.id);
    if (!c) {
      // Pauta que o classificador não devolveu não entra. Assumir aprovação
      // aqui seria publicar sem filtro exatamente no caso em que o filtro
      // falhou.
      recusadas.push({
        titulo: grupo.primary.title,
        url: grupo.primary.url,
        fonte: grupo.primary.source_name,
        motivo: MOTIVOS.REJEITADO_SEM_CLASSIFICACAO,
        explicacao: "classificador não devolveu esta pauta",
      });
      continue;
    }

    const decisao = decidirPauta(c, config);
    linhas.push(
      `[GUARDA] ${decisao.aprovada ? "ok " : "não"} ${decisao.motivo} :: ${grupo.primary.title.slice(0, 70)} :: ${decisao.explicacao}`
    );

    if (!decisao.aprovada) {
      recusadas.push({
        titulo: grupo.primary.title,
        url: grupo.primary.url,
        fonte: grupo.primary.source_name,
        motivo: decisao.motivo,
        explicacao: decisao.explicacao,
      });
      continue;
    }

    aprovadasNoFiltro.push({ grupo, classificacao: c, motivo: decisao.motivo });
  }

  /*
   * Enriquecimento.
   *
   * Roda só sobre o que passou pelo filtro editorial, e não sobre as duzentas
   * candidatas: buscar duzentas páginas por dia castiga os veículos e demora,
   * e a maioria delas ia ser recusada de qualquer jeito.
   *
   * Pauta que continua sem corpo depois da tentativa não vai para o redator.
   * Escrever a partir da manchete produz três parágrafos dizendo que a fonte
   * não informou, e a fonte informou: quem não leu foi o robô.
   */
  const limite = opcoes.limiteDeEnriquecimento ?? 40;
  const enriquecidas: Array<{
    grupo: DeduplicatedGroup;
    classificacao: Classificacao;
    motivo: Motivo;
    enriquecimento: ResultadoDoEnriquecimento;
  }> = [];

  let buscasFeitas = 0;
  for (const a of aprovadasNoFiltro) {
    const jaTemCorpo = (a.grupo.primary.description || "").length >= 400;

    const enriquecimento =
      jaTemCorpo || buscasFeitas < limite
        ? await enriquecerPauta(
            {
              titulo: a.grupo.primary.title,
              descricao: a.grupo.primary.description || "",
              url: a.grupo.primary.url,
              urlsSecundarias: a.grupo.secondary_urls,
            },
            fetcher
          )
        : {
            texto: a.grupo.primary.description || "",
            contentSource: "feed" as const,
            contentLength: (a.grupo.primary.description || "").length,
            enrichmentStatus: "origem_inacessivel" as const,
            enrichmentSources: [],
            notas: ["limite de buscas da rodada atingido"],
          };

    if (!jaTemCorpo && enriquecimento.enrichmentSources.length > 0) buscasFeitas += 1;

    linhas.push(
      `[GUARDA] conteúdo ${enriquecimento.enrichmentStatus} (${enriquecimento.contentLength} car., ` +
        `origem ${enriquecimento.contentSource}) :: ${a.grupo.primary.title.slice(0, 60)}` +
        (enriquecimento.notas.length > 0 ? ` :: ${enriquecimento.notas.join("; ")}` : "")
    );

    if (!temFatosSuficientes(enriquecimento)) {
      /*
       * Dois motivos diferentes, e a diferença importa no relatório.
       *
       * Agregador que não resolve é problema de FONTE: a notícia pode ser
       * ótima e o link é que não leva à matéria. Isso se resolve assinando o
       * feed do veículo, não mexendo no filtro.
       *
       * Página aberta e sem texto é problema de CONTEÚDO.
       */
      const daFonte = enriquecimento.enrichmentStatus === "agregador_sem_link_direto";
      recusadas.push({
        titulo: a.grupo.primary.title,
        url: a.grupo.primary.url,
        fonte: a.grupo.primary.source_name,
        motivo: daFonte ? MOTIVOS.REJEITADO_FONTE_NAO_RESOLVIDA : MOTIVOS.REJEITADO_SEM_FATOS,
        explicacao:
          `${enriquecimento.contentLength} caracteres depois da tentativa ` +
          `(${enriquecimento.enrichmentStatus}): ${enriquecimento.notas.join("; ")}`,
      });
      continue;
    }

    /*
     * O leitor vai clicar em quê.
     *
     * `escolherUrlPublicavel` existia, com teste, e não era chamada por
     * ninguém fora do próprio teste. O resultado apareceu publicado: quatro
     * matérias das edições de 04 e 05 de setembro de 2026 saíram com
     * `news.google.com/rss/articles/CBMi...` como link da fonte, um endereço
     * que leva a um interstitial do Google e, seguido de fora, a
     * `google.com/sorry`.
     *
     * Nenhum filtro estava errado. Faltava esta pergunta, que não é sobre o
     * texto e sim sobre o link. Google News é descoberta: o que ele descobre
     * tem endereço próprio, e sem esse endereço a pauta não publica.
     */
    const publicavel = escolherUrlPublicavel(a.grupo, enriquecimento);
    if (!publicavel.ok) {
      recusadas.push({
        titulo: a.grupo.primary.title,
        url: a.grupo.primary.url,
        fonte: a.grupo.primary.source_name,
        motivo: MOTIVOS.REJEITADO_FONTE_NAO_RESOLVIDA,
        explicacao: `sem URL publicável: ${publicavel.motivo}`,
      });
      continue;
    }

    if (publicavel.promovida) {
      linhas.push(`[GUARDA] URL publicável promovida :: ${publicavel.motivo}`);
    }

    enriquecidas.push({
      ...a,
      grupo: { ...a.grupo, primary: { ...a.grupo.primary, url: publicavel.url } },
      enriquecimento,
    });
  }

  linhas.push(
    `[GUARDA] ${enriquecidas.length} pautas com corpo suficiente, ${buscasFeitas} páginas buscadas`
  );

  /*
   * Segunda classificação, agora com a matéria na mão.
   *
   * A primeira leu manchete. Uma notícia cujo título é neutro pode ser
   * desfavorável no corpo, e é o corpo que o leitor vai receber. Reclassificar
   * o punhado que sobrou custa pouco e é o que faz o filtro editorial julgar o
   * texto que existe, e não o que o agregador resumiu.
   */
  const reclassificaveis = enriquecidas.filter((e) => e.enriquecimento.enrichmentStatus === "enriquecida");
  if (reclassificaveis.length > 0) {
    const segunda = await classificarPautas(
      reclassificaveis.map((e) => ({
        id: e.grupo.primary.id,
        titulo: e.grupo.primary.title,
        descricao: e.enriquecimento.texto.slice(0, 4000),
        fonte: e.grupo.primary.source_name,
        url: e.grupo.primary.url,
      })),
      env,
      fetcher
    );

    custoTotal += segunda.custoUsd;
    tokensTotais.prompt += segunda.tokens.prompt;
    tokensTotais.completion += segunda.tokens.completion;
    tokensTotais.total += segunda.tokens.total;

    for (const e of reclassificaveis) {
      const nova = segunda.classificacoes.get(e.grupo.primary.id);
      if (!nova) continue;

      const decisao = decidirPauta(nova, config);
      if (nova.leitura !== e.classificacao.leitura || nova.relevancia !== e.classificacao.relevancia) {
        linhas.push(
          `[GUARDA] releitura com a matéria: ${e.classificacao.leitura}/${e.classificacao.relevancia} ` +
            `virou ${nova.leitura}/${nova.relevancia} :: ${e.grupo.primary.title.slice(0, 60)}`
        );
      }

      e.classificacao = nova;
      e.motivo = decisao.motivo;

      if (!decisao.aprovada) {
        recusadas.push({
          titulo: e.grupo.primary.title,
          url: e.grupo.primary.url,
          fonte: e.grupo.primary.source_name,
          motivo: decisao.motivo,
          explicacao: `na releitura com a matéria: ${decisao.explicacao}`,
        });
      }
    }
  }

  const paraAvaliar = enriquecidas.filter((e) => {
    const decisao = decidirPauta(e.classificacao, config);
    return decisao.aprovada;
  });

  // Um vetor por pauta, numa chamada só, e sobre o texto que de fato existe.
  // Falha de embedding não derruba a edição: as outras camadas continuam
  // valendo, e o relatório registra que a semântica ficou de fora.
  let vetores: Vetor[] = [];
  if (opcoes.provedorDeVetor && paraAvaliar.length > 0) {
    try {
      vetores = await opcoes.provedorDeVetor.gerar(
        paraAvaliar.map((a) => textoParaVetor(a.grupo.primary.title, a.enriquecimento.texto))
      );
    } catch (erro) {
      linhas.push(`[GUARDA] vetores indisponíveis, camada semântica desligada: ${(erro as Error).message}`);
      vetores = [];
    }
  }

  const candidatas: Array<{
    item: PautaAvaliada;
    classificacao: Classificacao;
    dominio: string;
    pontuacao: Pontuacao;
  }> = [];

  paraAvaliar.forEach((a, i) => {
    const vetor = vetores[i] ?? null;
    const entidades = entidadesDaClassificacao(a.classificacao);

    const veredito = verificarRepeticao(
      {
        titulo: a.grupo.primary.title,
        url: a.grupo.primary.url,
        resumo: a.enriquecimento.texto,
        publicadoEm: a.grupo.primary.published_at,
        entidades,
        vetor,
      },
      historico,
      canal,
      config
    );

    linhas.push(
      `[GUARDA] repetição ${veredito.repetida ? "SIM" : "não"} (${veredito.camada} ${veredito.score.toFixed(2)}, confiança ${veredito.confianca}) ` +
        `:: ${a.grupo.primary.title.slice(0, 70)} :: ${veredito.explicacao}` +
        ` :: ${descreverSinais(veredito.sinais)}`
    );

    if (veredito.repetida && veredito.motivo) {
      recusadas.push({
        titulo: a.grupo.primary.title,
        url: a.grupo.primary.url,
        fonte: a.grupo.primary.source_name,
        motivo: veredito.motivo,
        explicacao: `${veredito.explicacao} :: ${descreverSinais(veredito.sinais)}`,
        confianca: veredito.confianca,
        sinais: veredito.sinais,
      });
      return;
    }

    const pontuacao = pontuarPauta({
      classificacao: a.classificacao,
      prioridadeDaFonte: a.grupo.primary.priority,
      quantasFontesConfirmam: a.grupo.secondary_sources.length,
      publicadoEm: a.grupo.primary.published_at,
      semelhancaComHistorico: veredito.score,
      temCorpoFactual: a.enriquecimento.contentLength >= 400,
    });

    candidatas.push({
      item: {
        grupo: a.grupo,
        storyId: gerarStoryId({
          url: a.grupo.primary.url,
          entidades,
          titulo: a.grupo.primary.title,
        }),
        classificacao: a.classificacao,
        enriquecimento: a.enriquecimento,
        motivoDaAprovacao: a.motivo,
        veredito,
        pontuacao,
        vetor,
      },
      classificacao: a.classificacao,
      dominio: dominioDe(a.grupo.primary.url),
      pontuacao,
    });
  });

  /*
   * Persistir TODAS as classificadas, antes da composição.
   *
   * A ordem importa e é a razão de este bloco estar aqui e não no fim. Se só o
   * pool aprovado fosse gravado, a candidata rejeitada sumiria do banco e a
   * execução seguinte a classificaria de novo, mantendo custo e instabilidade
   * exatamente onde eles não compram nada. E gravar depois da composição faria
   * a decisão de arrumação de um canal virar estado da notícia.
   *
   * O status aqui é o intrínseco: `approved` para quem passou nos critérios
   * duros, `rejected` para quem não passou, com o motivo junto. Nada de
   * `selected` nem `capped`: aquilo é decisão de canal e mora em
   * `editorial_history` e `social_posts`.
   */
  if (store && projectId) {
    const paraGravar: CandidataParaGravar[] = [];

    for (const c of candidatas) {
      const sinais = lerSinaisObjetivos(c.item.grupo, {
        enriquecimento: c.item.enriquecimento,
        texto: c.item.enriquecimento.texto,
      });

      paraGravar.push({
        storyId: c.item.storyId,
        url: c.item.grupo.primary.url,
        canonicalUrl: sinais.urlPublicavel ?? undefined,
        sourceDomain: sinais.dominio,
        title: c.item.grupo.primary.title,
        summary: c.item.enriquecimento.texto.slice(0, 4000),
        publishedAt: c.item.grupo.primary.published_at,
        status: garantirStatusIntrinseco("approved"),
        classificacao: c.classificacao,
        eventFingerprint: impressaoDoAcontecimento(entidadesDaClassificacao(c.classificacao)) || null,
        editorialScore: c.pontuacao.total,
        decisionReason: c.item.motivoDaAprovacao,
        sourceResolved: Boolean(sinais.urlPublicavel),
        enrichmentStatus: c.item.enriquecimento.enrichmentStatus,
        enrichedChars: c.item.enriquecimento.contentLength,
        embedding: c.item.vetor ?? null,
        assinatura,
        metadata: { programas: sinais.programas },
      });
    }

    const porUrl = new Map(grupos.map((g) => [g.primary.url, g]));
    for (const r of recusadas) {
      const grupo = porUrl.get(r.url);
      if (!grupo) continue;

      paraGravar.push({
        storyId: gerarStoryId({ url: r.url, titulo: r.titulo }),
        url: r.url,
        sourceDomain: dominioDe(r.url),
        title: r.titulo,
        publishedAt: grupo.primary.published_at,
        status: garantirStatusIntrinseco("rejected"),
        classificacao: classificacoes.get(grupo.primary.id) ?? null,
        decisionReason: r.motivo,
        assinatura,
        metadata: { explicacao: r.explicacao },
      });
    }

    try {
      const gravacao = await store.gravarNovas(projectId, paraGravar);
      reuso.persistidas = gravacao.gravadas;
      reuso.erros.push(...gravacao.erros);
      linhas.push(
        `[GUARDA] ${gravacao.gravadas} candidata(s) gravada(s), ` +
          `${gravacao.reaproveitadas} já existiam e não foram tocadas`,
      );
    } catch (erro) {
      // Falhar ao gravar não pode custar a edição do dia.
      reuso.erros.push(`gravação de candidatas falhou: ${(erro as Error).message}`);
      linhas.push(`[GUARDA] candidatas não gravadas: ${(erro as Error).message}`);
    }
  }

  const approvedEditorialPool = candidatas.map((c) => c.item);
  const selecionadas = ordenarESelecionar(candidatas, config).map((p) => p.item);
  const viabilidade = edicaoViavel(selecionadas.length, config);

  linhas.push(
    `[GUARDA] ${selecionadas.length} selecionadas de ${grupos.length} candidatas, ` +
      `${approvedEditorialPool.length} no pool editorial aprovado, ${recusadas.length} recusadas`
  );
  if (approvedEditorialPool.length > selecionadas.length) {
    linhas.push(
      `[GUARDA] ${approvedEditorialPool.length - selecionadas.length} do pool fora por composição da newsletter ` +
        `(teto ${config.maximoDePautas}, Brasil ${config.maximoDePautasBrasil}, 2 por ator, 2 por domínio)`
    );
  }
  for (const s of selecionadas) {
    linhas.push(`[GUARDA] entra: ${s.pontuacao.explicacao} :: ${s.grupo.primary.title.slice(0, 70)}`);
  }

  return {
    selecionadas,
    approvedEditorialPool,
    recusadas,
    viavel: viabilidade.viavel,
    motivoDaInviabilidade: viabilidade.viavel ? "" : viabilidade.motivo,
    custoUsd: custoTotal,
    tokens: tokensTotais,
    reuso,
    vetoresGerados: vetores.length,
    linhasDeLog: linhas,
  };
}

/** Vira registro de histórico depois que a pauta realmente foi publicada. */
export function registroDaPauta(
  pauta: PautaAvaliada,
  dados: {
    projectId: string;
    canal: Canal;
    originStoryId?: string | null;
    newsletterId?: string | null;
    instagramPostId?: string | null;
    imagemUrl?: string | null;
    publicadoEm?: string;
  }
): RegistroHistorico {
  const c = pauta.classificacao;
  return {
    projectId: dados.projectId,
    storyId: pauta.storyId,
    originStoryId: dados.originStoryId ?? null,
    canal: dados.canal,
    titulo: pauta.grupo.primary.title,
    resumo: pauta.grupo.primary.description ?? "",
    url: pauta.grupo.primary.url,
    entidades: entidadesDaClassificacao(c),
    categoria: c.eixo,
    pais: c.pais,
    sentimento: c.leitura === "oportunidade" ? "positive" : c.leitura === "desfavoravel" ? "negative" : "neutral",
    vetor: pauta.vetor,
    imagemUrl: dados.imagemUrl ?? null,
    newsletterId: dados.newsletterId ?? null,
    instagramPostId: dados.instagramPostId ?? null,
    procedencia: "pipeline",
    motivo: pauta.motivoDaAprovacao,
    publicadoEm: dados.publicadoEm ?? new Date().toISOString(),
  };
}
