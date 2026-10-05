import type { OrigemDoArtigo } from "../ramos/portal";

/**
 * O contrato da fila de aprovação (RF-20 a RF-29), decidido em 05/10/2026.
 *
 * Até esta data o eua.journal publicava sozinho: não havia revisão humana entre
 * a pauta aprovada pela linha editorial e o ar. A fila é a peça que põe uma
 * pessoa nesse meio, e o contrato é UMA linha por peça e por projeto, em
 * `aprovacoes`, com o hash da versão exata que foi aprovada.
 *
 * O hash é o coração da regra. Aprovar "o post das 12h" não diz nada se o
 * arquivo puder mudar depois: o que se aprova é ESTE artefato, e quem publica
 * confere que o que vai ao ar ainda é ele. Ver `portao.ts`.
 */

export const RAMOS = ["newsletter", "artigo", "post"] as const;
export type Ramo = (typeof RAMOS)[number];

export const ESTADOS_DA_APROVACAO = [
  "aguardando",
  "aprovada",
  "reprovada",
  "refazendo",
  "descartada",
  "cancelada",
] as const;
export type EstadoDaAprovacao = (typeof ESTADOS_DA_APROVACAO)[number];

/**
 * As etapas que uma reprovação pode culpar (RF-22).
 *
 * A etapa é o que permite refazer SÓ o que estava errado: reprovar a imagem não
 * chama o redator, e reprovar o texto não troca a foto.
 */
export const ETAPAS = ["selecao", "texto", "imagem", "arte"] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ROTULO_DA_ETAPA: Record<Etapa, string> = {
  selecao: "Seleção da pauta",
  texto: "Texto",
  imagem: "Imagem",
  arte: "Arte",
};

/**
 * Quais etapas existem em cada ramo.
 *
 * A newsletter e o artigo não têm "arte": não há peça desenhada, o e-mail é
 * HTML montado de template. Culpar a arte de um e-mail seria registrar um erro
 * que nenhuma etapa consegue refazer.
 */
export const ETAPAS_DO_RAMO: Record<Ramo, readonly Etapa[]> = {
  post: ["selecao", "texto", "imagem", "arte"],
  newsletter: ["selecao", "texto", "imagem"],
  artigo: ["selecao", "texto", "imagem"],
};

/**
 * Duas refações, e a terceira reprovação descarta.
 *
 * O número é do PRD validado (RF-22). Mais que isso é o editor reescrevendo a
 * peça por procuração, um prompt de cada vez, e o custo passa do que a peça vale.
 */
export const LIMITE_DE_REFAZIMENTOS = 2;

/** Quantas repetições do mesmo erro viram proposta de regra fixa (RF-29). */
export const REPETICOES_PARA_PROPOR_REGRA = 3;

/** Um aviso de QA que acompanha a peça até a fila. Nunca é escondido por um lote (RF-21). */
export type AvisoDaPeca = {
  codigo: string;
  detalhe: string;
};

/** A linha de `aprovacoes`, como o código a enxerga. */
export type Aprovacao = {
  id: string;
  projectId: string;
  ramo: Ramo;
  pecaId: string;
  hashArtefato: string;
  publicarEm: string | null;
  estado: EstadoDaAprovacao;
  automatica: boolean;
  decididoPor: string | null;
  decididoEm: string | null;
  motivo: string | null;
  etapaCulpada: Etapa | null;
  refazimentos: number;
  avisos: AvisoDaPeca[];
  resumo: ResumoDaPeca;
  avisadoEm: string | null;
  liberadoEm: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * O que o painel precisa para decidir sem abrir outra tela (RF-24).
 *
 * Fica gravado na linha, e não montado na hora, porque a decisão é sobre ESTA
 * versão: se a peça for refeita, o resumo é regravado junto com o hash.
 */
export type ResumoDaPeca = {
  titulo?: string;
  texto?: string;
  /** URLs das imagens da peça, na ordem de publicação. */
  imagens?: string[];
  /** O pacote factual em linhas curtas, para conferir sem sair do celular. */
  pacoteFactual?: string[];
  fonteUrl?: string | null;
  /** Ramo newsletter: a campanha no Listmonk que será disparada. */
  campanhaListmonk?: number | null;
  /** Ramo artigo: o endereço no portal. */
  slug?: string | null;
  /** Quando a refação não pôde rodar sozinha, o motivo vai aqui para o painel. */
  refacaoPendente?: string | null;
  /**
   * Ramo artigo: a pauta e o pacote factual de onde a matéria saiu.
   *
   * Entrou na integração de 05/10/2026 para a refação de texto e de imagem do
   * artigo poder rodar sem a pauta avaliada inteira, que não sobrevive ao
   * ciclo. Ver `ganchos-de-producao.ts`.
   */
  origemDoArtigo?: OrigemDoArtigo | null;
};

export function ehRamo(valor: unknown): valor is Ramo {
  return typeof valor === "string" && (RAMOS as readonly string[]).includes(valor);
}

export function ehEtapa(valor: unknown): valor is Etapa {
  return typeof valor === "string" && (ETAPAS as readonly string[]).includes(valor);
}

export function ehEstado(valor: unknown): valor is EstadoDaAprovacao {
  return typeof valor === "string" && (ESTADOS_DA_APROVACAO as readonly string[]).includes(valor);
}

/** Quem decide quando a decisão é da máquina (RF-25). O registro diz isso com todas as letras. */
export const DECISOR_AUTOMATICO = "sistema:aprovacao-automatica";
