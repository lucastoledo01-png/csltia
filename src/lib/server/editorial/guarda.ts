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
import { verificarRepeticao } from "./repeticao";
import type { Veredito } from "./repeticao";
import { dominioDe } from "./url-canonica";

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
  /** Por que a linha editorial aceitou esta pauta. Vai para o banco. */
  motivoDaAprovacao: Motivo;
  veredito: Veredito;
  pontuacao: Pontuacao;
  vetor: Vetor | null;
};

export type Recusa = {
  titulo: string;
  url: string;
  motivo: Motivo;
  explicacao: string;
};

export type ResultadoDaGuarda = {
  selecionadas: PautaAvaliada[];
  recusadas: Recusa[];
  viavel: boolean;
  motivoDaInviabilidade: string;
  custoUsd: number;
  linhasDeLog: string[];
};

export type OpcoesDaGuarda = {
  canal: Canal;
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
      recusadas: [],
      viavel: false,
      motivoDaInviabilidade: "nenhuma candidata coletada",
      custoUsd: 0,
      linhasDeLog: ["[GUARDA] nenhuma candidata coletada"],
    };
  }

  const { classificacoes, custoUsd, lotesComFalha } = await classificarPautas(
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
        motivo: decisao.motivo,
        explicacao: decisao.explicacao,
      });
      continue;
    }

    aprovadasNoFiltro.push({ grupo, classificacao: c, motivo: decisao.motivo });
  }

  // Um vetor por pauta aprovada, numa chamada só. Falha de embedding não
  // derruba a edição: as outras três camadas continuam valendo, e o relatório
  // registra que a semântica ficou de fora.
  let vetores: Vetor[] = [];
  if (opcoes.provedorDeVetor && aprovadasNoFiltro.length > 0) {
    try {
      vetores = await opcoes.provedorDeVetor.gerar(
        aprovadasNoFiltro.map((a) =>
          textoParaVetor(a.grupo.primary.title, a.grupo.primary.description || "")
        )
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

  aprovadasNoFiltro.forEach((a, i) => {
    const vetor = vetores[i] ?? null;
    const entidades = entidadesDaClassificacao(a.classificacao);

    const veredito = verificarRepeticao(
      { titulo: a.grupo.primary.title, url: a.grupo.primary.url, entidades, vetor },
      historico,
      canal,
      config
    );

    linhas.push(
      `[GUARDA] repetição ${veredito.repetida ? "SIM" : "não"} (${veredito.camada} ${veredito.score.toFixed(2)}) :: ${a.grupo.primary.title.slice(0, 70)} :: ${veredito.explicacao}`
    );

    if (veredito.repetida && veredito.motivo) {
      recusadas.push({
        titulo: a.grupo.primary.title,
        url: a.grupo.primary.url,
        motivo: veredito.motivo,
        explicacao: veredito.explicacao,
      });
      return;
    }

    const pontuacao = pontuarPauta({
      classificacao: a.classificacao,
      prioridadeDaFonte: a.grupo.primary.priority,
      quantasFontesConfirmam: a.grupo.secondary_sources.length,
      publicadoEm: a.grupo.primary.published_at,
      semelhancaComHistorico: veredito.score,
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

  const selecionadas = ordenarESelecionar(candidatas, config).map((p) => p.item);
  const viabilidade = edicaoViavel(selecionadas.length, config);

  linhas.push(
    `[GUARDA] ${selecionadas.length} selecionadas de ${grupos.length} candidatas, ${recusadas.length} recusadas`
  );
  for (const s of selecionadas) {
    linhas.push(`[GUARDA] entra: ${s.pontuacao.explicacao} :: ${s.grupo.primary.title.slice(0, 70)}`);
  }

  return {
    selecionadas,
    recusadas,
    viavel: viabilidade.viavel,
    motivoDaInviabilidade: viabilidade.viavel ? "" : viabilidade.motivo,
    custoUsd,
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
