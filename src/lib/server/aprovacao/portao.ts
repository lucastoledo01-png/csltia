import type { EstadoDaCapacidade } from "../capacidades";
import type { Aprovacao, Ramo } from "./contrato";

/**
 * O portão de publicação: UMA função decide se uma peça pode ir ao ar (RF-20).
 *
 * "Regra com dono único", decisão de 05/10/2026. Antes desta data três lugares
 * gravavam `scheduled` em `social_posts` por conta própria (o store do V2, o
 * agendador legado e o carrossel de campanha do Sistema PROMPT), e cada um era,
 * na prática, uma decisão de publicar. O incidente de 16/09 ("a mesma regra em
 * três cópias, e a linha gravada mentindo") é o motivo de a regra morar aqui e
 * os chamadores apenas perguntarem:
 *
 *   - o worker do Instagram, antes de reivindicar a vaga e de novo depois de
 *     conferir o hash dos arquivos baixados;
 *   - o disparo da newsletter no Listmonk;
 *   - a publicação do artigo no portal.
 *
 * Nenhum dos três decide sozinho. E quem grava `scheduled` também pergunta
 * aqui, por `statusDeEntradaDoPost` e por `tentarLiberar` (em `fila.ts`).
 *
 * A função é pura de propósito: recebe o modo, a aprovação lida do banco e o
 * hash do que está prestes a sair, e devolve a decisão com o motivo nomeado.
 * Ler o banco é trabalho de quem chama; decidir é trabalho só dela.
 */

export const MOTIVOS_DO_PORTAO = {
  /** Fila desligada no projeto: publica como antes de 05/10/2026. */
  FILA_DESLIGADA: "FILA_DESLIGADA",
  LIBERADA: "APROVACAO_CONFERIDA",
  SEM_APROVACAO: "APROVACAO_AUSENTE",
  AGUARDANDO: "APROVACAO_AGUARDANDO_DECISAO",
  REFAZENDO: "APROVACAO_EM_REFACAO",
  REPROVADA: "APROVACAO_REPROVADA",
  DESCARTADA: "APROVACAO_DESCARTADA",
  CANCELADA: "APROVACAO_CANCELADA",
  HASH_DIVERGENTE: "APROVACAO_HASH_DIVERGENTE",
  RAMO_DIVERGENTE: "APROVACAO_DE_OUTRO_RAMO",
  ANTES_DO_HORARIO: "APROVACAO_ANTES_DO_HORARIO",
  SEM_ARTEFATO: "APROVACAO_SEM_ARTEFATO",
} as const;

export type MotivoDoPortao = (typeof MOTIVOS_DO_PORTAO)[keyof typeof MOTIVOS_DO_PORTAO];

/**
 * Prefixo das mensagens em que o portão SEGURA uma peça.
 *
 * O worker procura este prefixo no `catch` para não chamar `markPostFailed`:
 * peça esperando aprovação não é falha (cenário 2 do PRD), e marcá-la `failed`
 * a tiraria da fila de um jeito que parece defeito técnico.
 */
export const PREFIXO_DO_PORTAO = "PORTAO_DE_PUBLICACAO";

export type EntradaDoPortao = {
  modo: EstadoDaCapacidade;
  ramo: Ramo;
  /** A aprovação desta peça, ou `null` quando não há linha na fila. */
  aprovacao: Pick<Aprovacao, "ramo" | "estado" | "hashArtefato" | "publicarEm"> | null;
  /** O hash do que está prestes a ir ao ar, calculado agora por quem vai publicar. */
  hashAtual: string;
  /** Instante da pergunta. Ausente, agora. */
  agoraMs?: number;
  /**
   * Se o horário planejado também segura a peça.
   *
   * O worker já só pega post vencido, então para ele a pergunta é só "está
   * aprovado?". O ciclo da newsletter é quem precisa da hora: aprovada às 05h,
   * ela espera as 06:07; aprovada às 07:30, sai às 07:30.
   */
  respeitarHorario?: boolean;
};

export type DecisaoDoPortao = {
  /** Se quem chama pode publicar. Em `off` e `dry_run` é sempre `true`. */
  libera: boolean;
  motivo: MotivoDoPortao;
  detalhe: string;
  /**
   * O que a fila decidiria em `enforce`. Em `dry_run` é o que vai para o log,
   * e é o que permite ver o dia real sendo barrado antes de barrar de verdade.
   */
  liberariaEmEnforce: boolean;
};

function avaliar(e: EntradaDoPortao): { libera: boolean; motivo: MotivoDoPortao; detalhe: string } {
  const a = e.aprovacao;
  if (!/^[0-9a-f]{64}$/.test(e.hashAtual)) {
    return {
      libera: false,
      motivo: MOTIVOS_DO_PORTAO.SEM_ARTEFATO,
      detalhe: "a peça não tem versão congelada para comparar com a aprovação",
    };
  }
  if (!a) {
    return {
      libera: false,
      motivo: MOTIVOS_DO_PORTAO.SEM_APROVACAO,
      detalhe: "nenhuma aprovação registrada para esta peça",
    };
  }
  if (a.ramo !== e.ramo) {
    return {
      libera: false,
      motivo: MOTIVOS_DO_PORTAO.RAMO_DIVERGENTE,
      detalhe: `a aprovação é do ramo ${a.ramo} e a peça é do ramo ${e.ramo}`,
    };
  }

  switch (a.estado) {
    case "aguardando":
      return { libera: false, motivo: MOTIVOS_DO_PORTAO.AGUARDANDO, detalhe: "na fila, sem decisão" };
    case "refazendo":
      return { libera: false, motivo: MOTIVOS_DO_PORTAO.REFAZENDO, detalhe: "reprovada, etapa em refação" };
    case "reprovada":
      return { libera: false, motivo: MOTIVOS_DO_PORTAO.REPROVADA, detalhe: "reprovada pelo editor" };
    case "descartada":
      return { libera: false, motivo: MOTIVOS_DO_PORTAO.DESCARTADA, detalhe: "descartada" };
    case "cancelada":
      return { libera: false, motivo: MOTIVOS_DO_PORTAO.CANCELADA, detalhe: "cancelada" };
    case "aprovada":
      break;
  }

  /*
   * A aprovação vale para UMA versão. Arquivo trocado depois de aprovado,
   * legenda editada por fora, arte recongelada: qualquer um muda o hash, e o
   * que vai ao ar deixa de ser o que alguém aprovou (cenário 3 do PRD).
   */
  if (a.hashArtefato !== e.hashAtual) {
    return {
      libera: false,
      motivo: MOTIVOS_DO_PORTAO.HASH_DIVERGENTE,
      detalhe:
        `a versão aprovada era ${a.hashArtefato.slice(0, 12)} e a que sairia agora é ` +
        `${e.hashAtual.slice(0, 12)}: a peça mudou depois da aprovação`,
    };
  }

  if (e.respeitarHorario && a.publicarEm) {
    const agora = e.agoraMs ?? Date.now();
    const quando = Date.parse(a.publicarEm);
    if (Number.isFinite(quando) && agora < quando) {
      return {
        libera: false,
        motivo: MOTIVOS_DO_PORTAO.ANTES_DO_HORARIO,
        detalhe: `aprovada, sai em ${a.publicarEm}`,
      };
    }
  }

  return { libera: true, motivo: MOTIVOS_DO_PORTAO.LIBERADA, detalhe: "aprovada, e a versão confere" };
}

export function decidirPublicacao(entrada: EntradaDoPortao): DecisaoDoPortao {
  if (entrada.modo === "off") {
    return {
      libera: true,
      motivo: MOTIVOS_DO_PORTAO.FILA_DESLIGADA,
      detalhe: "fila de aprovação desligada neste projeto",
      liberariaEmEnforce: true,
    };
  }

  const r = avaliar(entrada);

  if (entrada.modo === "dry_run") {
    return { libera: true, motivo: r.motivo, detalhe: `ensaio: ${r.detalhe}`, liberariaEmEnforce: r.libera };
  }

  return { ...r, liberariaEmEnforce: r.libera };
}

/** A mensagem de erro que o worker sobe quando o portão segura um post. */
export function mensagemDoPortao(decisao: Pick<DecisaoDoPortao, "motivo" | "detalhe">): string {
  return `${PREFIXO_DO_PORTAO}: ${decisao.motivo}: ${decisao.detalhe}`;
}

export function ehMensagemDoPortao(mensagem: string): boolean {
  return mensagem.startsWith(PREFIXO_DO_PORTAO);
}

/**
 * Com que status um post NOVO entra em `social_posts`.
 *
 * Fora de `enforce` é `scheduled`, que é o comportamento de antes, byte a byte.
 * Em `enforce` é `draft`: a peça existe, está congelada e está na fila, mas o
 * worker não a enxerga até `tentarLiberar` a promover. É por aqui que nenhum
 * escritor de post grava `scheduled` por conta própria.
 *
 * O carrossel de campanha do Sistema PROMPT está congelado e continua gravando
 * `scheduled` sozinho. Ele não passa por aqui, e é barrado no worker, que
 * pergunta ao portão antes de publicar qualquer linha. Há teste disso.
 */
export function statusDeEntradaDoPost(modo: EstadoDaCapacidade): "scheduled" | "draft" {
  return modo === "enforce" ? "draft" : "scheduled";
}

/**
 * Com que status o artigo do dia entra no portal.
 *
 * Fora de `enforce`, `published`, como sempre. Em `enforce`, `draft`: o portal
 * só lista `published`, e quem promove é a liberação da fila.
 */
export function statusDeEntradaDoArtigo(modo: EstadoDaCapacidade): "published" | "draft" {
  return modo === "enforce" ? "draft" : "published";
}

/**
 * Se a redação dispara a newsletter ela mesma, como fazia até 05/10/2026.
 *
 * Em `enforce` não: a campanha só nasce quando a fila libera, com o assunto e
 * o HTML aprovados. Em `dry_run` a redação dispara como antes e a fila só
 * registra, para comparar.
 */
export function redacaoDisparaNewsletter(modo: EstadoDaCapacidade): boolean {
  return modo !== "enforce";
}
