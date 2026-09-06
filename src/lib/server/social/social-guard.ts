import type { PacoteFactual } from "../editorial/pacote-factual";
import { validarAncoragem } from "../editorial/pacote-factual";
import type { PautaAvaliada } from "../editorial/guarda";
import type { CopyDoPost } from "./copy";
import { montarLegenda } from "./copy";
import { garantirLegendaSocial, validarLegendaSocial } from "./legenda";
import type { ContextoDaLegenda } from "./legenda";
import type { CandidataPersistida } from "../editorial/candidatos-store";
import { podePublicar } from "../editorial/candidatos-store";
import { escolherUrlPublicavel } from "../editorial/regras-duras";

/**
 * A última pergunta antes de um post existir.
 *
 * A guarda editorial decide se a PAUTA pode virar conteúdo. Esta decide se o
 * TEXTO que foi escrito sobre ela pode ir ao ar, e são coisas diferentes: uma
 * pauta impecável rende uma manchete que inverte a decisão judicial, e nenhum
 * filtro anterior olha para a manchete.
 *
 * O que ela confere está na ordem do dano. Manchete que afirma o que a fonte
 * não diz é o pior, porque é o que o leitor lê primeiro e o que ele
 * compartilha. Depois vem a legenda. Depois a forma.
 */

export const MOTIVOS_DO_SOCIAL_GUARD = {
  HEADLINE_SEM_ANCORAGEM: "SOCIAL_REJECT_HEADLINE",
  CAPTION_SEM_ANCORAGEM: "SOCIAL_REJECT_GROUNDING",
  EUA_NEGATIVO: "SOCIAL_REJECT_US_NEGATIVE",
  FONTE_NAO_RESOLVIDA: "SOCIAL_REJECT_SOURCE_UNRESOLVED",
  CTA_PROIBIDO: "SOCIAL_REJECT_CTA",
  HASHTAGS: "SOCIAL_REJECT_HASHTAGS",
  ASSINATURA_DE_NEWSLETTER: "REJECT_SOCIAL_CAPTION",
  NAO_VERIFICADA: "SOCIAL_REJECT_UNVERIFIED",
  HEADLINE_FORA_DA_FORMA: "SOCIAL_REJECT_HEADLINE_SHAPE",
} as const;

export type MotivoDoSocialGuard =
  (typeof MOTIVOS_DO_SOCIAL_GUARD)[keyof typeof MOTIVOS_DO_SOCIAL_GUARD];

export type ProblemaDoPost = {
  motivo: MotivoDoSocialGuard;
  detalhe: string;
  /** Dá para consertar reescrevendo, ou a pauta está perdida? */
  reparavel: boolean;
};

/**
 * Promessas que um post não faz.
 *
 * Nenhuma delas é sobre tom. Todas são sobre responsabilidade: prometer
 * aprovação, elegibilidade, prazo ou custo num post é o tipo de coisa que
 * gera reclamação e, pior, faz alguém tomar decisão de vida com base numa
 * frase de marketing.
 */
const PROMESSAS_PROIBIDAS = [
  "voce se qualifica",
  "voce e elegivel",
  "aprovacao garantida",
  "green card garantido",
  "visto garantido",
  "garantimos",
  "100% de aprovacao",
  "aprovado em ate",
  "sem burocracia",
  "sem advogado",
  "moradia legal garantida",
  "descubra se voce pode morar legalmente",
];

/** Urgência inventada é a outra família. */
const URGENCIA_FALSA = ["ultimas vagas", "ultima chance", "so ate hoje", "corra antes", "vagas limitadas"];

function normalizar(texto: string): string {
  return ` ${(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/**
 * A manchete cabe na arte e diz um fato?
 *
 * O teto de palavras é da arte: três linhas, e um título longo encolhe até
 * ficar ilegível no celular. O piso é editorial: manchete de duas palavras
 * quase nunca é fato, é rótulo.
 */
export function conferirFormaDaHeadline(headline: string): ProblemaDoPost | null {
  const palavras = headline.trim().split(/\s+/).filter(Boolean);

  if (palavras.length < 3) {
    return {
      motivo: MOTIVOS_DO_SOCIAL_GUARD.HEADLINE_FORA_DA_FORMA,
      detalhe: `${palavras.length} palavra(s); com menos de três não se afirma um fato`,
      reparavel: true,
    };
  }

  if (palavras.length > 12) {
    return {
      motivo: MOTIVOS_DO_SOCIAL_GUARD.HEADLINE_FORA_DA_FORMA,
      detalhe: `${palavras.length} palavras; acima de 12 o texto encolhe até ficar ilegível na arte`,
      reparavel: true,
    };
  }

  if (/\?$/.test(headline.trim())) {
    return {
      motivo: MOTIVOS_DO_SOCIAL_GUARD.HEADLINE_FORA_DA_FORMA,
      detalhe: "manchete em pergunta é teaser, e o post dá o fato",
      reparavel: true,
    };
  }

  return null;
}

export type ContextoDoPost = {
  pauta: PautaAvaliada;
  pacote: PacoteFactual | null;
  candidata?: Pick<CandidataPersistida, "status" | "verificacao"> | null;
  keyword: string;
  fechamentoDaNewsletter?: string;
  /** A candidata já passou pelo estágio de verificação nesta rodada? */
  verificacaoExigida?: boolean;
};

export type VeredictoDoPost = {
  aprovado: boolean;
  problemas: ProblemaDoPost[];
  /** Vale tentar reescrever, ou descartar a pauta e ir para a próxima? */
  reparavel: boolean;
  legendaFinal: string;
  hashtagsFinais: string[];
};

export function avaliarPostSocial(copy: CopyDoPost, contexto: ContextoDoPost): VeredictoDoPost {
  const problemas: ProblemaDoPost[] = [];
  const { pauta, pacote } = contexto;

  /*
   * A verificação vem primeiro porque ela não é sobre o texto.
   *
   * Se a candidata não foi confirmada, nenhuma reescrita resolve: o problema
   * é a pauta, não a copy. Reparar aqui seria polir um post que não deveria
   * existir.
   */
  if (contexto.verificacaoExigida !== false) {
    const autorizacao = podePublicar(
      contexto.candidata ?? { status: "approved", verificacao: null },
    );
    if (!autorizacao.pode) {
      problemas.push({
        motivo: MOTIVOS_DO_SOCIAL_GUARD.NAO_VERIFICADA,
        detalhe: autorizacao.motivo,
        reparavel: false,
      });
    }
  }

  // Negatividade sobre os EUA: regra da casa, e não do texto.
  if (pauta.classificacao.pais === "EUA" && pauta.classificacao.leitura === "desfavoravel") {
    problemas.push({
      motivo: MOTIVOS_DO_SOCIAL_GUARD.EUA_NEGATIVO,
      detalhe: "o fato foi lido como desfavorável aos EUA, e a linha editorial não publica isso",
      reparavel: false,
    });
  }

  // Fonte: o leitor precisa poder clicar em algo que não seja agregador.
  const url = escolherUrlPublicavel(pauta.grupo, pauta.enriquecimento);
  if (!url.ok) {
    problemas.push({
      motivo: MOTIVOS_DO_SOCIAL_GUARD.FONTE_NAO_RESOLVIDA,
      detalhe: url.motivo,
      reparavel: false,
    });
  }

  const forma = conferirFormaDaHeadline(copy.headline);
  if (forma) problemas.push(forma);

  /*
   * Ancoragem, e a manchete é conferida separada da legenda de propósito.
   *
   * Um post pode ter legenda impecável e manchete que inverte a decisão, e é a
   * manchete que vai no print que alguém compartilha.
   */
  if (pacote) {
    const naHeadline = validarAncoragem(copy.headline, pacote);
    const bloqueiosHeadline = naHeadline.naoSustentadas.filter((c) => c.severidade === "bloqueio");
    if (bloqueiosHeadline.length > 0) {
      problemas.push({
        motivo: MOTIVOS_DO_SOCIAL_GUARD.HEADLINE_SEM_ANCORAGEM,
        detalhe: `a manchete afirma o que a fonte não diz: ${bloqueiosHeadline.map((c) => `${c.tipo} "${c.valor}"`).join(", ")}`,
        reparavel: true,
      });
    }

    const corpo = montarLegenda(copy);
    const naLegenda = validarAncoragem(corpo, pacote);
    const bloqueiosLegenda = naLegenda.naoSustentadas.filter((c) => c.severidade === "bloqueio");
    if (bloqueiosLegenda.length > 0) {
      problemas.push({
        motivo: MOTIVOS_DO_SOCIAL_GUARD.CAPTION_SEM_ANCORAGEM,
        detalhe: `a legenda afirma o que a fonte não diz: ${bloqueiosLegenda.map((c) => `${c.tipo} "${c.valor}"`).join(", ")}`,
        reparavel: true,
      });
    }
  }

  // CTA: a ação é livre, a promessa não.
  const textoTodo = normalizar(`${copy.headline} ${montarLegenda(copy)} ${copy.cta}`);
  const promessa = PROMESSAS_PROIBIDAS.find((p) => textoTodo.includes(p));
  const urgencia = URGENCIA_FALSA.find((u) => textoTodo.includes(u));

  if (promessa) {
    problemas.push({
      motivo: MOTIVOS_DO_SOCIAL_GUARD.CTA_PROIBIDO,
      detalhe: `promete o que só um advogado diz depois de ver o caso: "${promessa}"`,
      reparavel: true,
    });
  }
  if (urgencia) {
    problemas.push({
      motivo: MOTIVOS_DO_SOCIAL_GUARD.CTA_PROIBIDO,
      detalhe: `urgência inventada: "${urgencia}"`,
      reparavel: true,
    });
  }

  /*
   * A legenda passa pelo guardião determinístico, que é a última camada.
   *
   * Ele remove despedida de e-mail, desduplica o CTA e monta as hashtags a
   * partir da pauta. O que ele encontrou vira problema aqui, para o relatório
   * dizer o que precisou ser consertado em vez de esconder.
   */
  const contextoDaLegenda: ContextoDaLegenda = {
    titulo: pauta.grupo.primary.title,
    resumo: pauta.enriquecimento?.texto ?? "",
    categoria: pauta.classificacao.eixo,
    pais: pauta.classificacao.pais === "Brasil" ? "BR" : "US",
    entidades: [...pauta.classificacao.atores, ...pauta.classificacao.lugares],
    keyword: contexto.keyword,
    fechamentoDaNewsletter: contexto.fechamentoDaNewsletter,
  };

  const bruta = [montarLegenda(copy), copy.cta, (copy.hashtags ?? []).join(" ")]
    .filter(Boolean)
    .join("\n\n");

  const daLegenda = validarLegendaSocial({ full_caption: bruta, cta_call: copy.cta }, contextoDaLegenda);
  for (const p of daLegenda) {
    if (p.motivo === "REJECT_SOCIAL_CAPTION") {
      problemas.push({
        motivo: MOTIVOS_DO_SOCIAL_GUARD.ASSINATURA_DE_NEWSLETTER,
        detalhe: p.detalhe,
        reparavel: true,
      });
    }
  }

  const auditada = garantirLegendaSocial(
    {
      title: pauta.grupo.primary.title,
      edition_date: new Date().toISOString().slice(0, 10),
      primary_topic: pauta.classificacao.eixo,
      target_audience_focus: "",
      format: "noticia",
      slides: [],
      caption: {
        headline: copy.gancho.slice(0, 100),
        intro_summary: copy.fato_principal.slice(0, 300),
        key_takeaways: [copy.fato_principal.slice(0, 60), (copy.contexto || copy.gancho).slice(0, 60)],
        cta_call: copy.cta || `Comente ${contexto.keyword}`,
        hashtags: copy.hashtags ?? [],
        full_caption: bruta,
      },
    } as never,
    contextoDaLegenda,
  );

  const hashtagsFinais = auditada.carousel.caption.hashtags;
  if (hashtagsFinais.length < 3) {
    problemas.push({
      motivo: MOTIVOS_DO_SOCIAL_GUARD.HASHTAGS,
      detalhe: `só ${hashtagsFinais.length} hashtag(s) com base na pauta`,
      reparavel: true,
    });
  }

  const bloqueiosDefinitivos = problemas.filter((p) => !p.reparavel);

  return {
    aprovado: problemas.length === 0,
    problemas,
    // Reparar só faz sentido quando nada é definitivo.
    reparavel: problemas.length > 0 && bloqueiosDefinitivos.length === 0,
    legendaFinal: auditada.carousel.caption.full_caption,
    hashtagsFinais,
  };
}
