/**
 * Em que estado o pipeline social da fase 3 roda.
 *
 * Mesma disciplina da guarda editorial e do resolvedor de imagem, e pelo mesmo
 * motivo: subir código não pode trocar o comportamento do perfil. A troca é
 * uma decisão declarada numa variável, e valor irreconhecível cai no modo que
 * não muda nada.
 *
 * A lição custou caro nesta semana: `VISUAL_RESOLVER_V2` ficou duplicado em
 * dois serviços, o painel mostrava `off` e o processo lia `enforce`. Por isso
 * o modo efetivo entra na resposta da rota: o que vale é o que o processo leu,
 * não o que o painel mostra.
 *
 *   off       nada muda. O caminho social atual segue inteiro.
 *   dry_run   seleciona, verifica, escreve, audita, agenda e resolve imagem,
 *             e não cria publicação nenhuma nem mexe na fila real
 *   enforce   implementado e não ativado. Ver `permiteEnforce`.
 */

import { resolverCapacidade } from "../capacidades";
import type { ProjetoComCapacidades } from "../capacidades";

export type ModoSocial = "off" | "dry_run" | "enforce";

export function modoDoPipelineSocial(
  env: Record<string, string | undefined> = process.env,
  projeto?: ProjetoComCapacidades | null,
): ModoSocial {
  /*
   * O projeto manda, o ambiente é o padrão.
   *
   * Enquanto nenhum projeto declarar a capacidade, isto devolve exatamente o
   * que devolvia antes. É o que permitiu subir a plataforma multi-projeto sem
   * mexer no comportamento do ciclo que já roda.
   */
  return resolverCapacidade(
    "social",
    () => {
      const bruto = (env.SOCIAL_PIPELINE_V2 || "").trim().toLowerCase();
      if (bruto === "enforce") return "enforce";
      if (bruto === "dry_run") return "dry_run";
      return "off";
    },
    projeto,
  );
}

export function descreverModoSocial(modo: ModoSocial): string {
  if (modo === "enforce") return "no comando, alimenta o perfil";
  if (modo === "dry_run") return "em observação, calcula tudo e não publica nada";
  return "desligado, o caminho social atual segue inteiro";
}

/**
 * `enforce` existe no código e ainda não é permitido rodar.
 *
 * O bloqueio original era da imagem: relevância temporal e centralidade
 * semântica do resolvedor visual. As duas estão implementadas e testadas
 * (`temporalidade.ts`, `figura-nao-central.test.ts`), e a bifurcação do worker
 * — que era o último bloqueio técnico, porque o worker antigo regeneraria a
 * copy de um post V2 — também está fechada (`carga-v2.ts`, `worker-v2.ts`).
 *
 * Então por que a trava continua? Porque estar implementado não é a mesma
 * coisa que estar decidido. Quem liga o perfil é o dono do produto, olhando a
 * capacidade medida e a qualidade das peças, e não o commit que fechou o
 * último item. As duas variáveis abaixo são essa decisão, escrita.
 *
 * Deixar isso como comentário num README seria a mesma coisa que não ter: a
 * função devolve o motivo, e quem chamar decide o que fazer com ele.
 */
export function permiteEnforce(env: Record<string, string | undefined> = process.env): {
  permitido: boolean;
  motivo: string;
} {
  const visual = (env.VISUAL_RESOLVER_V2 || "").trim().toLowerCase();

  if (visual !== "enforce") {
    return {
      permitido: false,
      motivo:
        "o resolvedor visual da fase 2 não está aprovado para produção " +
        "(VISUAL_RESOLVER_V2 precisa estar em enforce, e antes disso a correção " +
        "temporal e de centralidade precisa estar fechada)",
    };
  }

  if ((env.SOCIAL_V2_ENFORCE_LIBERADO || "").trim().toLowerCase() !== "true") {
    return {
      permitido: false,
      motivo: "enforce do social ainda não foi liberado explicitamente (SOCIAL_V2_ENFORCE_LIBERADO)",
    };
  }

  return { permitido: true, motivo: "" };
}

/**
 * O que o resolvedor de imagem fez no dia.
 *
 * Existia só `semImagem`, um número. Número sozinho não diz se a foto faltou
 * porque a fonte não tinha nada, porque a guarda recusou o que havia, ou porque
 * a chave do banco conceitual não está configurada: são três problemas com três
 * ações diferentes, e a diferença estava num log de contêiner inalcançável.
 *
 * `notaDaPrimeiraSemFoto` guarda as fontes consultadas da primeira peça que
 * ficou sem imagem. É uma linha, e é ela que nomeia a causa.
 */
export type ResumoVisualDoDia = {
  comFoto: number;
  semFoto: number;
  /** Motivo da recusa, agrupado. */
  porMotivo: Record<string, number>;
  /** De onde veio a foto que entrou. */
  porFonte: Record<string, number>;
  notaDaPrimeiraSemFoto: string;
};

/** Resumo não sensível, para a resposta da rota admin. */
export type DiagnosticoSocial = {
  mode: ModoSocial;
  enforcePermitido: boolean;
  motivoDoBloqueio: string;
  candidatasNaFila: number;
  postsGerados: number;
  descartados: number;
  reparos: number;
  semImagem: number;
  /** Detalhe do resolvedor de imagem. Ausente quando o ciclo não rodou. */
  visual?: ResumoVisualDoDia;
  bloqueio: string | null;
};

export function diagnosticoSocialVazio(modo: ModoSocial = "off"): DiagnosticoSocial {
  return {
    mode: modo,
    enforcePermitido: false,
    motivoDoBloqueio: "",
    candidatasNaFila: 0,
    postsGerados: 0,
    descartados: 0,
    reparos: 0,
    semImagem: 0,
    bloqueio: null,
  };
}
