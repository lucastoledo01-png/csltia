import type { DeduplicatedGroup } from "../newsroom/deduplicator";
import type { Classificacao } from "./classificador";
import { classificarPautas, decidirPauta, entidadesDaClassificacao } from "./classificador";
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
   * Tudo que passou na linha editorial, antes do corte de composição.
   *
   * `selecionadas` é o que coube na edição: `ordenarESelecionar` corta por
   * teto global, teto de Brasil, e dois tetos que não são configuráveis, 2 por
   * ator e 2 por domínio. O que esses tetos cortam não vai para `recusadas` e
   * não aparece em log nenhum, então até aqui a única forma de saber quantas
   * pautas o dia realmente sustenta era subtrair duas listas e torcer para a
   * invariante valer.
   *
   * Existe porque a pergunta do canal social é outra: a newsletter quer as
   * quatro melhores, o Instagram quer saber quantas há. Nada aqui muda a
   * decisão da newsletter, que continua lendo `selecionadas`.
   */
  aprovadas: PautaAvaliada[];
  recusadas: Recusa[];
  viavel: boolean;
  motivoDaInviabilidade: string;
  custoUsd: number;
  /** Volume medido. O custo em dólar depende do preço do modelo em uso. */
  tokens: { prompt: number; completion: number; total: number };
  vetoresGerados: number;
  linhasDeLog: string[];
};

export type OpcoesDaGuarda = {
  canal: Canal;
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
      aprovadas: [],
      recusadas: [],
      viavel: false,
      motivoDaInviabilidade: "nenhuma candidata coletada",
      custoUsd: 0,
      tokens: { prompt: 0, completion: 0, total: 0 },
      vetoresGerados: 0,
      linhasDeLog: ["[GUARDA] nenhuma candidata coletada"],
    };
  }

  const { classificacoes, custoUsd, tokens, lotesComFalha } = await classificarPautas(
    grupos.map((g) => ({
      id: g.primary.id,
      titulo: g.primary.title,
      descricao: g.primary.description || g.primary.content || "",
      fonte: g.primary.source_name,
      url: g.primary.url,
    })),
    env,
    fetcher
  );

  let custoTotal = custoUsd;
  const tokensTotais = { ...tokens };

  linhas.push(
    `[GUARDA] ${classificacoes.size} de ${grupos.length} candidatas classificadas (US$ ${custoUsd.toFixed(4)})`
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

    enriquecidas.push({ ...a, enriquecimento });
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

  const aprovadas = candidatas.map((c) => c.item);
  const selecionadas = ordenarESelecionar(candidatas, config).map((p) => p.item);
  const viabilidade = edicaoViavel(selecionadas.length, config);

  linhas.push(
    `[GUARDA] ${selecionadas.length} selecionadas de ${grupos.length} candidatas, ` +
      `${aprovadas.length} aprovadas na linha editorial, ${recusadas.length} recusadas`
  );
  if (aprovadas.length > selecionadas.length) {
    linhas.push(
      `[GUARDA] ${aprovadas.length - selecionadas.length} aprovada(s) fora por composição ` +
        `(teto ${config.maximoDePautas}, Brasil ${config.maximoDePautasBrasil}, 2 por ator, 2 por domínio)`
    );
  }
  for (const s of selecionadas) {
    linhas.push(`[GUARDA] entra: ${s.pontuacao.explicacao} :: ${s.grupo.primary.title.slice(0, 70)}`);
  }

  return {
    selecionadas,
    aprovadas,
    recusadas,
    viavel: viabilidade.viavel,
    motivoDaInviabilidade: viabilidade.viavel ? "" : viabilidade.motivo,
    custoUsd: custoTotal,
    tokens: tokensTotais,
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
