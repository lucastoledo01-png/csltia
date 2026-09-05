import type { ConfigEditorial } from "./config";
import { MOTIVOS } from "./config";
import type { Motivo } from "./config";
import type { Entidades } from "./fingerprint";
import { mesmoAcontecimento, mesmoTipoDeAcontecimento, semelhancaDeTitulo } from "./fingerprint";
import { dominioDe, urlCanonica } from "./url-canonica";
import type { Vetor } from "./embeddings";
import { cosseno } from "./embeddings";
import type { Canal, RegistroHistorico } from "./history";

/**
 * Já publicamos isto?
 *
 * Quatro camadas, da mais barata e mais certeira para a mais cara e mais
 * discutível. A ordem importa: a URL resolve o caso trivial sem gastar nada, e
 * só o que sobrevive chega ao vetor.
 *
 *   1. URL canônica. Mesma matéria, rastreio diferente.
 *   2. Título. Manchete reescrita com as mesmas palavras.
 *   3. Ator mais acontecimento. Manchete reescrita com outras palavras.
 *   4. Mesma fonte contando o mesmo tipo de evento.
 *   5. Vetor, com os outros sinais desempatando na faixa de dúvida.
 *
 * As três primeiras são soberanas: quando batem, a entidade não é consultada e
 * a ausência dela não muda nada. Entidade serve para desempatar a faixa
 * semântica de suspeita, não para invalidar sinal mais forte.
 *
 * ## Canal
 *
 * A comparação acontece dentro do canal. Levar a pauta da newsletter para o
 * Instagram é o fluxo desejado e não pode ser barrado. O que não pode é a
 * mesma pauta voltar ao mesmo canal em outro dia.
 *
 * ## Score sempre no retorno
 *
 * Mesmo quando aprova. Sem o número, calibrar o limiar vira palpite: não dá
 * para saber se uma pauta passou com folga ou raspando.
 */

export type PautaParaVerificar = {
  titulo: string;
  url?: string;
  /** Resumo factual, um sinal a mais quando o título não decide. */
  resumo?: string;
  /** Quando o fato aconteceu, se a fonte informou. */
  publicadoEm?: string;
  entidades?: Entidades;
  vetor?: Vetor | null;
};

export type Confianca = "alta" | "media" | "baixa";

/**
 * Os sinais conferidos, com nome fixo.
 *
 * Nome fixo porque estes valores vão para o log e para o relatório, e um
 * relatório em que o mesmo sinal aparece escrito de três jeitos não dá para
 * ler em série. `null` quer dizer "não deu para conferir", que é diferente de
 * `false`: um registro sem entidade não é um registro com entidade diferente.
 */
export type SinaisDeRepeticao = {
  semantic_similarity: number | null;
  title_similarity: number | null;
  same_source: boolean | null;
  same_event_type: boolean | null;
  shared_entities: boolean | null;
  same_location: boolean | null;
  /** Dias entre o que saiu e o que chegou. */
  time_distance: number | null;
  canonical_match: boolean;
};

export function sinaisVazios(): SinaisDeRepeticao {
  return {
    semantic_similarity: null,
    title_similarity: null,
    same_source: null,
    same_event_type: null,
    shared_entities: null,
    same_location: null,
    time_distance: null,
    canonical_match: false,
  };
}

/** Linha legível a partir dos sinais, para o log e o relatório. */
export function descreverSinais(s: SinaisDeRepeticao): string {
  const partes: string[] = [];
  const num = (v: number | null, casas = 2) => (v === null ? "n/d" : v.toFixed(casas));
  const bool = (v: boolean | null) => (v === null ? "n/d" : v ? "sim" : "não");

  partes.push(`semantic_similarity=${num(s.semantic_similarity, 3)}`);
  partes.push(`title_similarity=${num(s.title_similarity)}`);
  partes.push(`same_source=${bool(s.same_source)}`);
  partes.push(`same_event_type=${bool(s.same_event_type)}`);
  partes.push(`shared_entities=${bool(s.shared_entities)}`);
  partes.push(`same_location=${bool(s.same_location)}`);
  partes.push(`time_distance=${s.time_distance === null ? "n/d" : `${s.time_distance}d`}`);
  partes.push(`canonical_match=${s.canonical_match ? "sim" : "não"}`);
  return partes.join(" ");
}

export type Veredito = {
  repetida: boolean;
  motivo: Motivo | null;
  /** Registro que causou a rejeição, quando houve. */
  conflito: RegistroHistorico | null;
  /** Camada que decidiu, ou a que chegou mais perto quando aprovou. */
  camada: "url" | "titulo" | "entidade" | "fonte" | "semantica" | "nenhuma";
  score: number;
  /**
   * O quanto se sabe sobre esta decisão.
   *
   * URL igual é certeza. Vetor na faixa de dúvida com o registro antigo sem
   * entidade nenhuma é palpite informado. Os dois bloqueiam, mas só um deles
   * merece confiança, e o relatório precisa saber a diferença para calibrar.
   */
  confianca: Confianca;
  /** Nome do campo em `duplicate_confidence`, para o log e o relatório. */
  duplicate_confidence: Confianca;
  /** Sinais conferidos, um a um. */
  sinais: SinaisDeRepeticao;
  /** Linha pronta para o log, com o número que interessa. */
  explicacao: string;
};

function aprovado(
  camada: Veredito["camada"],
  score: number,
  explicacao: string,
  sinais: SinaisDeRepeticao = sinaisVazios()
): Veredito {
  return {
    repetida: false,
    motivo: null,
    conflito: null,
    camada,
    score,
    confianca: "alta",
    duplicate_confidence: "alta",
    sinais,
    explicacao,
  };
}

export function verificarRepeticao(
  pauta: PautaParaVerificar,
  historico: RegistroHistorico[],
  canal: Canal,
  config: ConfigEditorial
): Veredito {
  const doCanal = historico.filter((h) => h.canal === canal);
  if (doCanal.length === 0) {
    return aprovado("nenhuma", 0, "histórico vazio para este canal, nada a comparar");
  }

  const canonica = pauta.url ? urlCanonica(pauta.url) : "";
  if (canonica) {
    const conflito = doCanal.find((h) => h.urlCanonica && h.urlCanonica === canonica);
    if (conflito) {
      return {
        repetida: true,
        motivo: MOTIVOS.REJEITADO_URL_DUPLICADA,
        conflito,
        camada: "url",
        score: 1,
        confianca: "alta",
        duplicate_confidence: "alta",
        sinais: { ...sinaisVazios(), canonical_match: true, time_distance: diasAtras(conflito) },
        explicacao: `mesma URL canônica de "${conflito.titulo}" (${diasAtras(conflito)}d)`,
      };
    }
  }

  let melhorTitulo = 0;
  let candidatoTitulo: RegistroHistorico | null = null;
  for (const h of doCanal) {
    const score = semelhancaDeTitulo(pauta.titulo, h.titulo);
    if (score > melhorTitulo) {
      melhorTitulo = score;
      candidatoTitulo = h;
    }
  }
  if (candidatoTitulo && melhorTitulo >= config.limiarDeTitulo) {
    return {
      repetida: true,
      motivo: MOTIVOS.REJEITADO_TITULO_DUPLICADO,
      conflito: candidatoTitulo,
      camada: "titulo",
      score: melhorTitulo,
      confianca: "alta",
      duplicate_confidence: "alta",
      sinais: {
        ...sinaisVazios(),
        title_similarity: melhorTitulo,
        time_distance: diasAtras(candidatoTitulo),
      },
      explicacao: `título ${melhorTitulo.toFixed(2)} contra "${candidatoTitulo.titulo}" (${diasAtras(candidatoTitulo)}d)`,
    };
  }

  const dominioDaPauta = pauta.url ? dominioDe(pauta.url) : "";

  if (pauta.entidades) {
    for (const h of doCanal) {
      const dele = entidadesDoRegistro(h);
      // Registro sem entidade não participa DESTA camada. Não é o mesmo que
      // dizer que a pauta é nova: as camadas de URL e título já rodaram, e a
      // semântica ainda vai rodar. Aqui só não há o que comparar.
      if (!dele) continue;

      // Mesma fonte contando o mesmo tipo de evento. Mais estreito que a
      // camada de ator porque o veículo já é a metade da identidade: o mesmo
      // site, sobre o mesmo tipo de acontecimento, em trinta dias, é
      // acompanhamento do mesmo caso na esmagadora maioria das vezes.
      if (
        dominioDaPauta &&
        h.dominio &&
        h.dominio === dominioDaPauta &&
        mesmoTipoDeAcontecimento(pauta.entidades, dele)
      ) {
        return {
          repetida: true,
          motivo: MOTIVOS.REJEITADO_ENTIDADE_DUPLICADA,
          conflito: h,
          camada: "fonte",
          score: 1,
          confianca: "alta",
          duplicate_confidence: "alta",
          sinais: {
            ...sinaisVazios(),
            same_source: true,
            same_event_type: true,
            shared_entities: true,
            title_similarity: semelhancaDeTitulo(pauta.titulo, h.titulo),
            time_distance: diasAtras(h),
          },
          explicacao: `mesma fonte e mesmo tipo de acontecimento de "${h.titulo}" (${diasAtras(h)}d)`,
        };
      }

      if (mesmoAcontecimento(pauta.entidades, dele)) {
        return {
          repetida: true,
          motivo: MOTIVOS.REJEITADO_ENTIDADE_DUPLICADA,
          conflito: h,
          camada: "entidade",
          score: 1,
          confianca: "alta",
          duplicate_confidence: "alta",
          sinais: {
            ...sinaisVazios(),
            shared_entities: true,
            same_event_type: true,
            same_location: cruzaLugar(pauta.entidades, dele),
            title_similarity: semelhancaDeTitulo(pauta.titulo, h.titulo),
            time_distance: diasAtras(h),
          },
          explicacao: `mesmo ator e acontecimento de "${h.titulo}" (${diasAtras(h)}d)`,
        };
      }
    }
  }

  if (pauta.vetor && pauta.vetor.length > 0) {
    // Começa abaixo de zero para que o primeiro registro comparável vire
    // candidato mesmo com score 0. Começando em 0, um dia sem nenhuma
    // semelhança não reportava número nenhum, que é justamente o dia em que
    // saber a distância ajuda a calibrar.
    let melhorVetor = -1;
    let candidatoVetor: RegistroHistorico | null = null;
    for (const h of doCanal) {
      if (!Array.isArray(h.vetor) || h.vetor.length === 0) continue;
      const score = cosseno(pauta.vetor, h.vetor);
      if (score > melhorVetor) {
        melhorVetor = score;
        candidatoVetor = h;
      }
    }
    if (candidatoVetor && melhorVetor >= config.limiarSemanticoCerto) {
      return {
        repetida: true,
        motivo: MOTIVOS.REJEITADO_SEMANTICO,
        conflito: candidatoVetor,
        camada: "semantica",
        score: melhorVetor,
        confianca: "alta",
        duplicate_confidence: "alta",
        sinais: {
          ...sinaisVazios(),
          semantic_similarity: melhorVetor,
          title_similarity: semelhancaDeTitulo(pauta.titulo, candidatoVetor.titulo),
          time_distance: diasAtras(candidatoVetor),
        },
        explicacao: `semelhança ${melhorVetor.toFixed(3)} com "${candidatoVetor.titulo}" (${diasAtras(candidatoVetor)}d)`,
      };
    }

    /*
     * Faixa do meio, onde os dois erros moram.
     *
     * Os pares do histórico mostram a mesma matéria voltando no dia seguinte a
     * 0.729, e duas matérias diferentes do mesmo ator a 0.760. As faixas se
     * sobrepõem, então nenhum número único acerta os dois casos: baixar a
     * régua bloqueia pauta nova, subir deixa passar repetição.
     *
     * Aqui não decide um sinal só. Conferem-se todos os que existirem: tipo de
     * acontecimento, lugar, título normalizado, resumo, fonte e distância no
     * tempo. Só uma evidência CONTRÁRIA explícita libera a pauta, e ela é o
     * acontecimento diferente com entidade dos dois lados.
     *
     * Entidade ausente não libera nada. Ela reduz a confiança da decisão, que
     * volta registrada no veredito, e é por isso que existe `confianca`: um
     * bloqueio por vetor contra registro sem entidade e um bloqueio por URL
     * idêntica não valem a mesma coisa na hora de calibrar, embora os dois
     * bloqueiem.
     */
    if (candidatoVetor && melhorVetor >= config.limiarSemantico) {
      const doHistorico = entidadesDoRegistro(candidatoVetor);
      const dias = diasAtras(candidatoVetor);
      const tituloContra = semelhancaDeTitulo(pauta.titulo, candidatoVetor.titulo);
      const mesmaFonte =
        dominioDaPauta && candidatoVetor.dominio ? dominioDaPauta === candidatoVetor.dominio : null;

      const sinais: SinaisDeRepeticao = {
        semantic_similarity: melhorVetor,
        title_similarity: tituloContra,
        same_source: mesmaFonte,
        same_event_type:
          pauta.entidades && doHistorico
            ? mesmoTipoDeAcontecimento(pauta.entidades, doHistorico)
            : null,
        shared_entities:
          pauta.entidades && doHistorico ? cruzaAtor(pauta.entidades, doHistorico) : null,
        same_location: pauta.entidades && doHistorico ? cruzaLugar(pauta.entidades, doHistorico) : null,
        time_distance: dias,
        canonical_match: false,
      };

      // Evidência contrária explícita: os dois lados descrevem o evento e os
      // eventos são outros. Assunto vizinho, episódio diferente.
      if (sinais.same_event_type === false) {
        return aprovado(
          "semantica",
          melhorVetor,
          `semelhante (${melhorVetor.toFixed(3)}) a "${candidatoVetor.titulo}", mas acontecimento diferente`,
          sinais
        );
      }

      /*
       * Confiança pelo número de sinais que corroboram, e não pela proporção.
       *
       * Proporção punia o registro sem entidade duas vezes: ele já não tem o
       * sinal, e ainda entrava no denominador. Agora conta quantos sinais
       * efetivamente apontam para repetição.
       */
      const corroboram = [
        sinais.same_event_type === true,
        sinais.shared_entities === true,
        sinais.same_location === true,
        sinais.same_source === true,
        (sinais.title_similarity ?? 0) >= 0.4,
        dias <= 3,
        resumoParecido(pauta.resumo, candidatoVetor.resumo),
      ].filter(Boolean).length;

      const confianca: Confianca = corroboram >= 3 ? "alta" : corroboram === 2 ? "media" : "baixa";

      /*
       * Confiança baixa não bloqueia.
       *
       * Só o vetor, entre 0.72 e 0.85, sem nenhum outro sinal apontando para o
       * mesmo fato, é semelhança de assunto. Bloquear aí custa pauta boa todo
       * dia por causa de um número que a calibração mostrou ambíguo: repetição
       * real apareceu em 0.729 e pautas distintas do mesmo ator em 0.760.
       *
       * O que faz a diferença nesses casos é entidade, e o histórico
       * reconstruído não tem. Quando tiver, o mesmo caso volta com dois ou
       * três sinais e cai na faixa que bloqueia.
       */
      if (confianca === "baixa") {
        return {
          repetida: false,
          motivo: null,
          conflito: candidatoVetor,
          camada: "semantica",
          score: melhorVetor,
          confianca,
          duplicate_confidence: confianca,
          sinais,
          explicacao:
            `suspeita não confirmada: ${melhorVetor.toFixed(3)} com "${candidatoVetor.titulo}" (${dias}d), ` +
            `${corroboram} sinal(is) a favor, confiança baixa, o vetor sozinho não basta`,
        };
      }

      return {
        repetida: true,
        motivo: MOTIVOS.REJEITADO_SEMANTICO,
        conflito: candidatoVetor,
        camada: "semantica",
        score: melhorVetor,
        confianca,
        duplicate_confidence: confianca,
        sinais,
        explicacao:
          `semelhança ${melhorVetor.toFixed(3)} com "${candidatoVetor.titulo}" (${dias}d), ` +
          `${corroboram} sinais a favor, confiança ${confianca}`,
      };
    }

    if (candidatoVetor) {
      return aprovado(
        "semantica",
        melhorVetor,
        `mais próxima: ${melhorVetor.toFixed(3)} com "${candidatoVetor.titulo}", suspeita a partir de ${config.limiarSemantico}`
      );
    }
  }

  return aprovado(
    "titulo",
    melhorTitulo,
    `mais próxima por título: ${melhorTitulo.toFixed(2)}, sem vetor comparável`
  );
}

/**
 * A mesma foto voltando é repetição visual, e tem janela própria.
 *
 * Separada da pauta porque foto e assunto se repetem por motivos diferentes:
 * um banco de imagem devolve a mesma foto para consultas parecidas mesmo
 * quando as pautas não têm nada a ver.
 */
export function imagemJaUsada(
  urlDaImagem: string,
  historico: RegistroHistorico[],
  janelaEmDias: number
): RegistroHistorico | null {
  const alvo = identidadeDeImagem(urlDaImagem);
  if (!alvo) return null;

  const limite = Date.now() - janelaEmDias * 24 * 60 * 60 * 1000;
  for (const h of historico) {
    const quando = h.publicadoEm ? new Date(h.publicadoEm).getTime() : 0;
    if (quando < limite) continue;
    const dele = identidadeDeImagem(h.imagemUrlCanonica || h.imagemUrl || "");
    if (dele && dele === alvo) return h;
  }
  return null;
}

/**
 * Identidade da foto: host mais caminho, sem querystring.
 *
 * Banco de imagem entrega a mesma foto em vários tamanhos, e o tamanho vive na
 * query: `.../pexels-photo-1550337.jpeg?auto=compress&w=1200` e a mesma foto
 * com `w=600` são o mesmo arquivo. Comparar a URL inteira faria a mesma
 * imagem passar como nova só por ter sido pedida em outra largura.
 *
 * Vale para os bancos que usamos, onde o caminho identifica a foto. Se algum
 * dia entrar uma fonte que identifica pela query, esta função precisa saber
 * disso, e não a chamada.
 */
export function identidadeDeImagem(url: string): string {
  const canonica = urlCanonica(url);
  if (!canonica) return "";
  const semQuery = canonica.split("?")[0];
  return semQuery;
}

function cruzaAtor(a: Entidades, b: Entidades): boolean {
  if (a.atores.length === 0 || b.atores.length === 0) return false;
  const A = new Set(a.atores.map((x) => x.trim().toLowerCase()).filter(Boolean));
  return b.atores.some((x) => A.has(x.trim().toLowerCase()));
}

function resumoParecido(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return semelhancaDeTitulo(a, b) >= 0.35;
}

function cruzaLugar(a: Entidades, b: Entidades): boolean {
  if (a.lugares.length === 0 || b.lugares.length === 0) return false;
  const A = new Set(a.lugares.map((x) => x.trim().toLowerCase()).filter(Boolean));
  return b.lugares.some((x) => A.has(x.trim().toLowerCase()));
}

function entidadesDoRegistro(h: RegistroHistorico): Entidades | null {
  const e = h.entidades as Partial<Entidades> | undefined;
  if (!e) return null;
  const atores = Array.isArray(e.atores) ? e.atores : [];
  const lugares = Array.isArray(e.lugares) ? e.lugares : [];
  const acontecimento = Array.isArray(e.acontecimento) ? e.acontecimento : [];
  if (atores.length === 0 && acontecimento.length === 0) return null;
  return { atores, lugares, acontecimento };
}

function diasAtras(h: RegistroHistorico): number {
  if (!h.publicadoEm) return 0;
  const ms = Date.now() - new Date(h.publicadoEm).getTime();
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}
