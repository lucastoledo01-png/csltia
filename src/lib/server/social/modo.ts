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

export type ModoSocial = "off" | "dry_run" | "enforce";

export function modoDoPipelineSocial(
  env: Record<string, string | undefined> = process.env
): ModoSocial {
  const bruto = (env.SOCIAL_PIPELINE_V2 || "").trim().toLowerCase();
  if (bruto === "enforce") return "enforce";
  if (bruto === "dry_run") return "dry_run";
  return "off";
}

export function descreverModoSocial(modo: ModoSocial): string {
  if (modo === "enforce") return "no comando, alimenta o perfil";
  if (modo === "dry_run") return "em observação, calcula tudo e não publica nada";
  return "desligado, o caminho social atual segue inteiro";
}

/**
 * `enforce` existe no código e ainda não é permitido rodar.
 *
 * Duas pendências o bloqueiam, e as duas são da imagem: a relevância temporal
 * e a centralidade semântica do resolvedor visual. Enquanto elas estiverem
 * abertas, um post factual pode sair com foto de 1937 ou com retrato do chefe
 * de Estado de uma pauta que não é sobre ele.
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
