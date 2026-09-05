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
  /** Sinais conferidos, com o que cada um disse. Vai inteiro para o log. */
  sinais: string[];
  /** Linha pronta para o log, com o número que interessa. */
  explicacao: string;
};

function aprovado(
  camada: Veredito["camada"],
  score: number,
  explicacao: string,
  sinais: string[] = []
): Veredito {
  return {
    repetida: false,
    motivo: null,
    conflito: null,
    camada,
    score,
    confianca: "alta",
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
        sinais: ["url canônica idêntica"],
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
      sinais: [`título ${melhorTitulo.toFixed(2)}`],
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
          sinais: [`mesma fonte (${dominioDaPauta})`, "mesmo tipo de acontecimento"],
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
          sinais: ["ator e acontecimento coincidem"],
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
        sinais: [`vetor ${melhorVetor.toFixed(3)}, acima da faixa de certeza`],
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
      const sinais: string[] = [`vetor ${melhorVetor.toFixed(3)} na faixa de suspeita`];
      let aFavor = 0;
      let conferiveis = 0;

      if (pauta.entidades && doHistorico) {
        conferiveis += 2;
        const mesmoEvento = mesmoTipoDeAcontecimento(pauta.entidades, doHistorico);
        sinais.push(mesmoEvento ? "mesmo tipo de acontecimento" : "acontecimento diferente");

        if (!mesmoEvento) {
          // A única saída da faixa: os dois lados descrevem o evento e os
          // eventos são outros. Assunto vizinho, episódio diferente.
          return aprovado(
            "semantica",
            melhorVetor,
            `semelhante (${melhorVetor.toFixed(3)}) a "${candidatoVetor.titulo}", mas acontecimento diferente`,
            sinais
          );
        }
        aFavor += 2;

        const lugarEmComum = cruzaLugar(pauta.entidades, doHistorico);
        conferiveis += 1;
        if (lugarEmComum) {
          aFavor += 1;
          sinais.push("mesmo lugar");
        } else {
          sinais.push("lugar diferente ou ausente");
        }
      } else {
        sinais.push("sem entidade dos dois lados para conferir");
      }

      const tituloContra = semelhancaDeTitulo(pauta.titulo, candidatoVetor.titulo);
      conferiveis += 1;
      if (tituloContra >= 0.4) {
        aFavor += 1;
        sinais.push(`título ${tituloContra.toFixed(2)}`);
      } else {
        sinais.push(`título distante ${tituloContra.toFixed(2)}`);
      }

      if (pauta.resumo && candidatoVetor.resumo) {
        const resumoContra = semelhancaDeTitulo(pauta.resumo, candidatoVetor.resumo);
        conferiveis += 1;
        if (resumoContra >= 0.35) {
          aFavor += 1;
          sinais.push(`resumo ${resumoContra.toFixed(2)}`);
        } else {
          sinais.push(`resumo distante ${resumoContra.toFixed(2)}`);
        }
      }

      if (dominioDaPauta && candidatoVetor.dominio) {
        conferiveis += 1;
        if (dominioDaPauta === candidatoVetor.dominio) {
          aFavor += 1;
          sinais.push("mesma fonte");
        } else {
          sinais.push("fonte diferente");
        }
      }

      const dias = diasAtras(candidatoVetor);
      conferiveis += 1;
      if (dias <= 3) {
        aFavor += 1;
        sinais.push(`${dias}d de distância`);
      } else {
        sinais.push(`${dias}d de distância, fato já antigo`);
      }

      const proporcao = conferiveis > 0 ? aFavor / conferiveis : 0;
      const confianca: Confianca =
        conferiveis >= 4 && proporcao >= 0.6 ? "alta" : proporcao >= 0.4 ? "media" : "baixa";

      return {
        repetida: true,
        motivo: MOTIVOS.REJEITADO_SEMANTICO,
        conflito: candidatoVetor,
        camada: "semantica",
        score: melhorVetor,
        confianca,
        sinais,
        explicacao:
          `semelhança ${melhorVetor.toFixed(3)} com "${candidatoVetor.titulo}" (${dias}d), ` +
          `${aFavor} de ${conferiveis} sinais a favor, confiança ${confianca}`,
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
