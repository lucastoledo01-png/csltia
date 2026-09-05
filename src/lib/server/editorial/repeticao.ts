import type { ConfigEditorial } from "./config";
import { MOTIVOS } from "./config";
import type { Motivo } from "./config";
import type { Entidades } from "./fingerprint";
import { mesmoAcontecimento, mesmoTipoDeAcontecimento, semelhancaDeTitulo } from "./fingerprint";
import { urlCanonica } from "./url-canonica";
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
 *   4. Vetor. O mesmo fato contado de um jeito que não compartilha palavra
 *      nenhuma, que é o caso que as três primeiras deixam passar.
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
  entidades?: Entidades;
  vetor?: Vetor | null;
};

export type Veredito = {
  repetida: boolean;
  motivo: Motivo | null;
  /** Registro que causou a rejeição, quando houve. */
  conflito: RegistroHistorico | null;
  /** Camada que decidiu, ou a que chegou mais perto quando aprovou. */
  camada: "url" | "titulo" | "entidade" | "semantica" | "nenhuma";
  score: number;
  /** Linha pronta para o log, com o número que interessa. */
  explicacao: string;
};

function aprovado(camada: Veredito["camada"], score: number, explicacao: string): Veredito {
  return { repetida: false, motivo: null, conflito: null, camada, score, explicacao };
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
      explicacao: `título ${melhorTitulo.toFixed(2)} contra "${candidatoTitulo.titulo}" (${diasAtras(candidatoTitulo)}d)`,
    };
  }

  if (pauta.entidades) {
    for (const h of doCanal) {
      const dele = entidadesDoRegistro(h);
      // Registro sem entidade não participa: o backfill não as reconstruiu, e
      // comparar contra listas vazias devolveria falso em silêncio, dando a
      // impressão de que a camada rodou.
      if (!dele) continue;
      if (mesmoAcontecimento(pauta.entidades, dele)) {
        return {
          repetida: true,
          motivo: MOTIVOS.REJEITADO_ENTIDADE_DUPLICADA,
          conflito: h,
          camada: "entidade",
          score: 1,
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
     * Quem desempata é o tipo de acontecimento. O vetor já disse que as duas
     * falam do mesmo assunto; falta saber se é o mesmo episódio. Duas
     * notícias da AWS, uma de integração e outra de benchmark, são assunto
     * vizinho e episódio diferente.
     *
     * Quando o registro antigo não tem entidade, e nenhum registro do backfill
     * tem, não há como desempatar. Aí vale não repetir: perder uma pauta custa
     * uma pauta, repetir custa a confiança de quem lê.
     */
    if (candidatoVetor && melhorVetor >= config.limiarSemantico) {
      const doHistorico = entidadesDoRegistro(candidatoVetor);
      const temComoConferir = Boolean(pauta.entidades && doHistorico);

      if (
        !temComoConferir ||
        (pauta.entidades && doHistorico && mesmoTipoDeAcontecimento(pauta.entidades, doHistorico))
      ) {
        return {
          repetida: true,
          motivo: MOTIVOS.REJEITADO_SEMANTICO,
          conflito: candidatoVetor,
          camada: "semantica",
          score: melhorVetor,
          explicacao:
            `semelhança ${melhorVetor.toFixed(3)} com "${candidatoVetor.titulo}" (${diasAtras(candidatoVetor)}d), ` +
            (temComoConferir ? "mesmo tipo de acontecimento" : "sem entidade para conferir"),
        };
      }

      return aprovado(
        "semantica",
        melhorVetor,
        `semelhante (${melhorVetor.toFixed(3)}) a "${candidatoVetor.titulo}", mas acontecimento diferente`
      );
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
