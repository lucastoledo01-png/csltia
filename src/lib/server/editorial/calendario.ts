/**
 * O calendário editorial dos Estados Unidos e do Brasil.
 *
 * Existe para responder uma pergunta que a coleta sozinha não responde: **o
 * que vem por aí?** A coleta é reativa por natureza, ela só enxerga o que
 * alguém já publicou. Quem trabalha com data marcada, e toda redação
 * trabalha, precisa saber na segunda-feira que a Black Friday é daqui a três
 * semanas, porque a pauta boa de Black Friday se escreve antes, não no dia.
 *
 * Duas decisões de projeto que valem o comentário:
 *
 * 1. **Regra, não tabela.** Thanksgiving é a quarta quinta de novembro, e
 *    isso vale para 2027 como vale para 2030. Uma tabela de datas envelhece e
 *    exige alguém lembrar de atualizá-la; a regra não. Só vira tabela o que
 *    não tem regra, que é o caso das reuniões do Fomc e dos grandes eventos
 *    esportivos, e esses ficam separados em {@link DATAS_ANUNCIADAS} com a
 *    data de validade explícita.
 *
 * 2. **Data sem leitor não entra.** O calendário é de uma publicação sobre os
 *    EUA escrita para brasileiros, então Columbus Day entra com peso baixo e
 *    Black Friday entra com peso alto. `pesoParaOBrasileiro` é o que separa a
 *    efeméride do gancho.
 *
 * Este arquivo é puro: não lê banco, não lê rede e não lê relógio a não ser
 * pela data que recebe. Isso é o que torna o comportamento testável em
 * qualquer dia do ano.
 */

export type PaisDaData = "eua" | "brasil" | "ambos";

export type TipoDeData =
  | "feriado"
  | "comercial"
  | "economia"
  | "politica"
  | "cultura"
  | "esporte"
  | "prazo";

export type DataDoCalendario = {
  id: string;
  nome: string;
  /** Sempre AAAA-MM-DD. */
  data: string;
  pais: PaisDaData;
  tipo: TipoDeData;
  /**
   * De 1 a 3, quanto a data interessa a um brasileiro que acompanha os EUA.
   *
   * 3 muda o bolso ou o plano de alguém (Black Friday, decisão de juros).
   * 2 é conversa do dia (Super Bowl, Thanksgiving).
   * 1 é contexto, entra se o dia estiver magro (Columbus Day).
   */
  pesoParaOBrasileiro: 1 | 2 | 3;
  /**
   * Quantos dias antes a data começa a valer pauta.
   *
   * Compra de Black Friday se pesquisa três semanas antes; feriado de trânsito
   * interessa na véspera. O número é o que decide quando o assunto entra na
   * busca, e ele é por data, não global.
   */
  antecedenciaEmDias: number;
  /** O que procurar em fonte de notícia quando a data se aproxima. */
  termosDeBusca: string[];
  /**
   * O dia em que o país efetivamente para, quando ele não é a data legal.
   *
   * Regra da OPM para feriado federal americano de data fixa: caindo no
   * sábado, observa-se na sexta anterior; caindo no domingo, na segunda
   * seguinte. A distinção é prática, não burocrática: quem precisa saber se o
   * banco abre, se a bolsa opera e se o consulado atende está perguntando
   * pelo dia OBSERVADO, e não pela data do calendário.
   *
   * Ausente quando os dois dias coincidem, que é o caso comum.
   */
  observado?: string;
};

/** Formata em AAAA-MM-DD sem passar pelo fuso local. */
function iso(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * A enésima ocorrência de um dia da semana no mês.
 *
 * `diaDaSemana` segue o padrão de `Date.getUTCDay`: 0 é domingo.
 */
export function enesimoDiaDaSemana(
  ano: number,
  mes: number,
  diaDaSemana: number,
  ocorrencia: number,
): string {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1));
  const deslocamento = (diaDaSemana - primeiro.getUTCDay() + 7) % 7;
  const dia = 1 + deslocamento + (ocorrencia - 1) * 7;
  return iso(ano, mes, dia);
}

/** A última ocorrência de um dia da semana no mês. Memorial Day depende disto. */
export function ultimoDiaDaSemana(ano: number, mes: number, diaDaSemana: number): string {
  const ultimo = new Date(Date.UTC(ano, mes, 0));
  const recuo = (ultimo.getUTCDay() - diaDaSemana + 7) % 7;
  return iso(ano, mes, ultimo.getUTCDate() - recuo);
}

/**
 * A Páscoa pelo algoritmo gregoriano anônimo (Meeus, Jones, Butcher).
 *
 * Três feriados nacionais brasileiros dependem dela, e nenhum deles tem data
 * fixa: Carnaval, Sexta-feira Santa e Corpus Christi. Sem esta função, o
 * calendário brasileiro só funcionaria no ano em que alguém digitou as datas.
 */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(ano, mes, dia);
}

/** Soma dias a uma data AAAA-MM-DD, em UTC, sem tocar no fuso local. */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  t.setUTCDate(t.getUTCDate() + dias);
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Distância em dias entre duas datas AAAA-MM-DD. Negativa quando já passou. */
export function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  const t1 = Date.UTC(a1, m1 - 1, d1);
  const t2 = Date.UTC(a2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86400000);
}

/**
 * Os feriados federais dos Estados Unidos, por regra (5 U.S.C. 6103).
 *
 * Feriado federal não é só folga: é banco fechado, bolsa fechada, correio
 * parado e órgão sem atendimento. Para quem lê daqui e tem processo, dinheiro
 * ou viagem lá, a folga americana é informação prática.
 */
function feriadosEUA(ano: number): DataDoCalendario[] {
  const thanksgiving = enesimoDiaDaSemana(ano, 11, 4, 4);

  const comObservancia = (d: DataDoCalendario): DataDoCalendario => {
    const observado = diaObservado(d.data);
    return observado ? { ...d, observado } : d;
  };

  return ([
    {
      id: `us-ano-novo-${ano}`,
      nome: "Ano Novo nos EUA",
      data: iso(ano, 1, 1),
      pais: "ambos",
      tipo: "feriado",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 5,
      termosDeBusca: ["new year", "holiday closures"],
    },
    {
      id: `us-mlk-${ano}`,
      nome: "Dia de Martin Luther King Jr.",
      data: enesimoDiaDaSemana(ano, 1, 1, 3),
      pais: "eua",
      tipo: "feriado",
      pesoParaOBrasileiro: 1,
      antecedenciaEmDias: 4,
      termosDeBusca: ["Martin Luther King Day", "MLK Day"],
    },
    {
      id: `us-presidents-${ano}`,
      nome: "Dia dos Presidentes",
      data: enesimoDiaDaSemana(ano, 2, 1, 3),
      pais: "eua",
      tipo: "feriado",
      pesoParaOBrasileiro: 1,
      antecedenciaEmDias: 4,
      termosDeBusca: ["Presidents Day", "Presidents Day sales"],
    },
    {
      id: `us-memorial-${ano}`,
      nome: "Memorial Day",
      data: ultimoDiaDaSemana(ano, 5, 1),
      pais: "eua",
      tipo: "feriado",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 7,
      termosDeBusca: ["Memorial Day travel", "Memorial Day sales", "gas prices Memorial Day"],
    },
    {
      id: `us-juneteenth-${ano}`,
      nome: "Juneteenth",
      data: iso(ano, 6, 19),
      pais: "eua",
      tipo: "feriado",
      pesoParaOBrasileiro: 1,
      antecedenciaEmDias: 4,
      termosDeBusca: ["Juneteenth"],
    },
    {
      id: `us-independencia-${ano}`,
      nome: "4 de Julho, Independência dos EUA",
      data: iso(ano, 7, 4),
      pais: "eua",
      tipo: "feriado",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 10,
      termosDeBusca: ["Fourth of July", "July 4 travel", "July 4 cookout cost"],
    },
    {
      id: `us-labor-${ano}`,
      nome: "Labor Day",
      data: enesimoDiaDaSemana(ano, 9, 1, 1),
      pais: "eua",
      tipo: "feriado",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 7,
      termosDeBusca: ["Labor Day", "Labor Day weekend travel"],
    },
    {
      id: `us-columbus-${ano}`,
      nome: "Columbus Day",
      data: enesimoDiaDaSemana(ano, 10, 1, 2),
      pais: "eua",
      tipo: "feriado",
      pesoParaOBrasileiro: 1,
      antecedenciaEmDias: 3,
      termosDeBusca: ["Columbus Day", "Indigenous Peoples Day"],
    },
    {
      id: `us-veterans-${ano}`,
      nome: "Dia dos Veteranos",
      data: iso(ano, 11, 11),
      pais: "eua",
      tipo: "feriado",
      pesoParaOBrasileiro: 1,
      antecedenciaEmDias: 3,
      termosDeBusca: ["Veterans Day"],
    },
    {
      id: `us-thanksgiving-${ano}`,
      nome: "Thanksgiving",
      data: thanksgiving,
      pais: "eua",
      tipo: "feriado",
      pesoParaOBrasileiro: 3,
      antecedenciaEmDias: 14,
      termosDeBusca: [
        "Thanksgiving travel",
        "Thanksgiving dinner cost",
        "Thanksgiving airport",
      ],
    },
    {
      id: `us-natal-${ano}`,
      nome: "Natal nos EUA",
      data: iso(ano, 12, 25),
      pais: "ambos",
      tipo: "feriado",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 14,
      termosDeBusca: ["holiday shopping", "Christmas travel", "holiday retail sales"],
    },
  ] as DataDoCalendario[]).map(comObservancia);
}

/**
 * As datas comerciais e culturais americanas que mexem com o bolso ou com a
 * conversa. Aqui mora o gancho de verdade: Black Friday vale mais para o
 * leitor daqui do que metade dos feriados federais.
 */
function datasComerciaisEUA(ano: number): DataDoCalendario[] {
  const thanksgiving = enesimoDiaDaSemana(ano, 11, 4, 4);

  return [
    {
      id: `us-black-friday-${ano}`,
      nome: "Black Friday",
      data: somarDias(thanksgiving, 1),
      pais: "ambos",
      tipo: "comercial",
      pesoParaOBrasileiro: 3,
      antecedenciaEmDias: 21,
      termosDeBusca: ["Black Friday deals", "Black Friday spending", "holiday shopping season"],
    },
    {
      id: `us-cyber-monday-${ano}`,
      nome: "Cyber Monday",
      data: somarDias(thanksgiving, 4),
      pais: "ambos",
      tipo: "comercial",
      pesoParaOBrasileiro: 3,
      antecedenciaEmDias: 14,
      termosDeBusca: ["Cyber Monday", "online holiday sales"],
    },
    {
      id: `us-super-bowl-${ano}`,
      nome: "Super Bowl",
      /*
       * Segundo domingo de fevereiro desde a temporada de 17 jogos, aprovada
       * em 2021. A NFL publica a data exata com anos de antecedência; quando
       * ela divergir da regra, o anúncio entra em DATAS_ANUNCIADAS e vence.
       */
      data: enesimoDiaDaSemana(ano, 2, 0, 2),
      pais: "eua",
      tipo: "esporte",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 10,
      termosDeBusca: ["Super Bowl ad price", "Super Bowl halftime", "Super Bowl betting"],
    },
    {
      id: `us-tax-day-${ano}`,
      nome: "Tax Day, prazo do imposto americano",
      /*
       * 15 de abril, empurrado para o dia útil seguinte quando cai em fim de
       * semana. O Emancipation Day do Distrito de Columbia também empurra, e
       * essa é a exceção que a regra simples não cobre: quando ela valer, o
       * IRS anuncia, e o anúncio entra em DATAS_ANUNCIADAS.
       */
      data: proximoDiaUtil(iso(ano, 4, 15)),
      pais: "eua",
      tipo: "prazo",
      pesoParaOBrasileiro: 3,
      antecedenciaEmDias: 30,
      termosDeBusca: ["tax filing deadline", "IRS refund", "tax season"],
    },
    {
      id: `us-halloween-${ano}`,
      nome: "Halloween",
      data: iso(ano, 10, 31),
      pais: "eua",
      tipo: "cultura",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 10,
      termosDeBusca: ["Halloween spending", "Halloween candy prices"],
    },
    {
      id: `us-volta-as-aulas-${ano}`,
      nome: "Volta às aulas nos EUA",
      data: enesimoDiaDaSemana(ano, 8, 1, 3),
      pais: "eua",
      tipo: "comercial",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 21,
      termosDeBusca: ["back to school spending", "school supplies cost", "college tuition"],
    },
    {
      id: `us-horario-verao-inicio-${ano}`,
      nome: "Começa o horário de verão nos EUA",
      data: enesimoDiaDaSemana(ano, 3, 0, 2),
      pais: "eua",
      tipo: "cultura",
      pesoParaOBrasileiro: 3,
      antecedenciaEmDias: 7,
      termosDeBusca: ["daylight saving time"],
    },
    {
      id: `us-horario-verao-fim-${ano}`,
      nome: "Termina o horário de verão nos EUA",
      data: enesimoDiaDaSemana(ano, 11, 0, 1),
      pais: "eua",
      tipo: "cultura",
      pesoParaOBrasileiro: 3,
      antecedenciaEmDias: 7,
      termosDeBusca: ["daylight saving time ends"],
    },
    {
      id: `us-dia-das-maes-${ano}`,
      nome: "Dia das Mães nos EUA",
      // 36 U.S.C. 117: segundo domingo de maio, e não o segundo domingo de
      // maio brasileiro por coincidência: são a mesma regra nos dois países.
      data: enesimoDiaDaSemana(ano, 5, 0, 2),
      pais: "ambos",
      tipo: "comercial",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 14,
      termosDeBusca: ["Mother's Day spending", "Mother's Day retail"],
    },
    {
      id: `us-dia-dos-pais-${ano}`,
      nome: "Dia dos Pais nos EUA",
      // 36 U.S.C. 109: terceiro domingo de junho. No Brasil é agosto, e a
      // diferença é pauta: o varejo dos dois países não faz promoção junto.
      data: enesimoDiaDaSemana(ano, 6, 0, 3),
      pais: "eua",
      tipo: "comercial",
      pesoParaOBrasileiro: 1,
      antecedenciaEmDias: 10,
      termosDeBusca: ["Father's Day spending"],
    },
    {
      id: `us-temporada-furacoes-${ano}`,
      nome: "Começa a temporada de furacões no Atlântico",
      // Janela oficial da NOAA: 1 de junho a 30 de novembro, pico em 10 de
      // setembro. Interessa a quem tem casa, viagem ou família na Flórida.
      data: iso(ano, 6, 1),
      pais: "eua",
      tipo: "cultura",
      pesoParaOBrasileiro: 3,
      antecedenciaEmDias: 14,
      termosDeBusca: ["hurricane season forecast", "NOAA hurricane outlook"],
    },
    {
      id: `us-pico-furacoes-${ano}`,
      nome: "Pico da temporada de furacões",
      data: iso(ano, 9, 10),
      pais: "eua",
      tipo: "cultura",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 7,
      termosDeBusca: ["hurricane Florida", "storm forecast"],
    },
    {
      id: `us-open-enrollment-${ano}`,
      nome: "Abre a contratação de plano de saúde nos EUA",
      // HealthCare.gov: 1 de novembro a 15 de janeiro, com corte em 15 de
      // dezembro para cobertura a partir de 1 de janeiro. Data dura para quem
      // mora lá, e quase nenhum veículo brasileiro cobre.
      data: iso(ano, 11, 1),
      pais: "eua",
      tipo: "prazo",
      pesoParaOBrasileiro: 3,
      antecedenciaEmDias: 14,
      termosDeBusca: ["open enrollment health insurance", "ACA marketplace premiums"],
    },
    {
      id: `us-h1b-registro-${ano}`,
      nome: "Abre o registro do H-1B",
      // Início de março, por cerca de duas semanas. Peso 2, e não 3: a
      // publicação deixou de ser sobre imigração, mas a data é real.
      data: iso(ano, 3, 5),
      pais: "eua",
      tipo: "prazo",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 14,
      termosDeBusca: ["H-1B registration", "H-1B cap season"],
    },
    {
      id: `us-eleicao-${ano}`,
      nome: "Dia da eleição nos EUA",
      /*
       * A terça seguinte à primeira segunda de novembro. Em ano par é eleição
       * de verdade; em ano ímpar são disputas estaduais e locais, que rendem
       * menos e por isso entram com peso menor logo abaixo.
       */
      data: somarDias(enesimoDiaDaSemana(ano, 11, 1, 1), 1),
      pais: "eua",
      tipo: "politica",
      pesoParaOBrasileiro: ano % 2 === 0 ? 3 : 1,
      antecedenciaEmDias: ano % 2 === 0 ? 30 : 7,
      termosDeBusca: ["election day", "midterm elections", "ballot measures"],
    },
  ];
}

/**
 * O dia observado de um feriado federal de data fixa, ou nada.
 *
 * Só para os de data fixa: os calculados por posição no mês já caem sempre em
 * dia útil, por construção da própria regra.
 */
export function diaObservado(data: string): string | undefined {
  const [a, m, d] = data.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  if (dia === 6) return somarDias(data, -1);
  if (dia === 0) return somarDias(data, 1);
  return undefined;
}

/** Empurra sábado e domingo para a segunda-feira seguinte. */
function proximoDiaUtil(data: string): string {
  const [a, m, d] = data.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  if (dia === 6) return somarDias(data, 2);
  if (dia === 0) return somarDias(data, 1);
  return data;
}

/**
 * Os feriados nacionais brasileiros.
 *
 * Eles entram num jornal sobre os EUA por dois motivos: o leitor está aqui, e
 * o que ele faz no feriado depende de câmbio, de passagem e do que abre lá.
 * Feriado prolongado brasileiro é semana de viagem para Orlando e Miami.
 */
function feriadosBrasil(ano: number): DataDoCalendario[] {
  const dom = pascoa(ano);

  return [
    {
      id: `br-ano-novo-${ano}`,
      nome: "Confraternização Universal",
      data: iso(ano, 1, 1),
      pais: "brasil",
      tipo: "feriado",
      pesoParaOBrasileiro: 1,
      antecedenciaEmDias: 3,
      termosDeBusca: ["reveillon", "ano novo"],
    },
    {
      id: `br-carnaval-${ano}`,
      nome: "Carnaval",
      // Terça de Carnaval é 47 dias antes da Páscoa.
      data: somarDias(dom, -47),
      pais: "brasil",
      tipo: "feriado",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 14,
      termosDeBusca: ["carnaval", "viagem carnaval", "dolar carnaval"],
    },
    {
      id: `br-sexta-santa-${ano}`,
      nome: "Sexta-feira Santa",
      data: somarDias(dom, -2),
      pais: "brasil",
      tipo: "feriado",
      pesoParaOBrasileiro: 1,
      antecedenciaEmDias: 5,
      termosDeBusca: ["semana santa"],
    },
    {
      id: `br-tiradentes-${ano}`,
      nome: "Tiradentes",
      data: iso(ano, 4, 21),
      pais: "brasil",
      tipo: "feriado",
      pesoParaOBrasileiro: 1,
      antecedenciaEmDias: 5,
      termosDeBusca: ["feriado tiradentes"],
    },
    {
      id: `br-trabalho-${ano}`,
      nome: "Dia do Trabalho",
      data: iso(ano, 5, 1),
      pais: "ambos",
      tipo: "feriado",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 5,
      termosDeBusca: ["dia do trabalho", "mercado de trabalho"],
    },
    {
      id: `br-corpus-christi-${ano}`,
      nome: "Corpus Christi",
      data: somarDias(dom, 60),
      pais: "brasil",
      tipo: "feriado",
      pesoParaOBrasileiro: 1,
      antecedenciaEmDias: 5,
      termosDeBusca: ["feriado corpus christi"],
    },
    {
      id: `br-independencia-${ano}`,
      nome: "Independência do Brasil",
      data: iso(ano, 9, 7),
      pais: "brasil",
      tipo: "feriado",
      pesoParaOBrasileiro: 1,
      antecedenciaEmDias: 5,
      termosDeBusca: ["7 de setembro"],
    },
    {
      id: `br-aparecida-${ano}`,
      nome: "Nossa Senhora Aparecida",
      data: iso(ano, 10, 12),
      pais: "brasil",
      tipo: "feriado",
      pesoParaOBrasileiro: 1,
      antecedenciaEmDias: 5,
      termosDeBusca: ["feriado 12 de outubro"],
    },
    {
      id: `br-finados-${ano}`,
      nome: "Finados",
      data: iso(ano, 11, 2),
      pais: "brasil",
      tipo: "feriado",
      pesoParaOBrasileiro: 1,
      antecedenciaEmDias: 3,
      termosDeBusca: ["finados"],
    },
    {
      id: `br-republica-${ano}`,
      nome: "Proclamação da República",
      data: iso(ano, 11, 15),
      pais: "brasil",
      tipo: "feriado",
      pesoParaOBrasileiro: 1,
      antecedenciaEmDias: 3,
      termosDeBusca: ["15 de novembro"],
    },
    {
      id: `br-consciencia-negra-${ano}`,
      // Feriado nacional desde a Lei 14.759 de 2023.
      nome: "Dia da Consciência Negra",
      data: iso(ano, 11, 20),
      pais: "brasil",
      tipo: "feriado",
      pesoParaOBrasileiro: 1,
      antecedenciaEmDias: 5,
      termosDeBusca: ["consciencia negra"],
    },
    {
      id: `br-natal-${ano}`,
      nome: "Natal",
      data: iso(ano, 12, 25),
      pais: "ambos",
      tipo: "feriado",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 10,
      termosDeBusca: ["natal", "compras de natal"],
    },
  ];
}

/**
 * As datas brasileiras que cruzam com os EUA.
 *
 * Imposto de renda é o caso claro: quem tem conta, casa ou empresa lá declara
 * aqui, e a temporada tem prazo. Black Friday brasileira acontece no mesmo
 * dia da americana e com preço diferente, o que é pauta por si só.
 */
function datasDoBrasil(ano: number): DataDoCalendario[] {
  const thanksgiving = enesimoDiaDaSemana(ano, 11, 4, 4);

  /*
   * Eleição brasileira: primeiro domingo de outubro do ano par, com segundo
   * turno no último domingo do mesmo mês (Lei 9.504/1997, art. 1).
   *
   * Isto era data cravada para 2028 e 2030, e as duas estavam erradas por
   * chute. Regra vale para 2032 e 2034 também, e não envelhece.
   */
  const temEleicao = ano % 2 === 0;
  const eleicao: DataDoCalendario[] = temEleicao
    ? [
        {
          id: `br-eleicao-${ano}`,
          nome: ano % 4 === 0 ? "Eleições municipais no Brasil" : "Eleições gerais no Brasil",
          data: enesimoDiaDaSemana(ano, 10, 0, 1),
          pais: "brasil",
          tipo: "politica",
          pesoParaOBrasileiro: ano % 4 === 0 ? 2 : 3,
          antecedenciaEmDias: 30,
          termosDeBusca: ["eleicoes brasil", "pesquisa eleitoral"],
        },
      ]
    : [];

  return [
    ...eleicao,
    {
      id: `br-irpf-abertura-${ano}`,
      nome: "Abre a temporada do Imposto de Renda",
      // A Receita costuma abrir em março e fechar no fim de maio. O prazo
      // exato sai por instrução normativa a cada ano; a janela não muda.
      data: iso(ano, 3, 15),
      pais: "brasil",
      tipo: "prazo",
      pesoParaOBrasileiro: 3,
      antecedenciaEmDias: 21,
      termosDeBusca: [
        "imposto de renda bens no exterior",
        "declaracao conta no exterior",
        "IRPF investimentos exterior",
      ],
    },
    {
      id: `br-irpf-prazo-${ano}`,
      nome: "Prazo final do Imposto de Renda",
      data: iso(ano, 5, 30),
      pais: "brasil",
      tipo: "prazo",
      pesoParaOBrasileiro: 3,
      antecedenciaEmDias: 21,
      termosDeBusca: ["prazo imposto de renda", "malha fina exterior"],
    },
    {
      id: `br-black-friday-${ano}`,
      nome: "Black Friday brasileira",
      data: somarDias(thanksgiving, 1),
      pais: "brasil",
      tipo: "comercial",
      pesoParaOBrasileiro: 3,
      antecedenciaEmDias: 21,
      termosDeBusca: ["black friday brasil", "importacao taxa", "compra internacional"],
    },
    {
      id: `br-13o-primeira-${ano}`,
      nome: "Prazo da primeira parcela do décimo terceiro",
      // Lei 4.749/1965, art. 2: até 30 de novembro.
      data: iso(ano, 11, 30),
      pais: "brasil",
      tipo: "prazo",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 10,
      termosDeBusca: ["décimo terceiro", "consumo fim de ano"],
    },
    {
      id: `br-ferias-julho-${ano}`,
      nome: "Férias escolares de julho",
      data: iso(ano, 7, 1),
      pais: "brasil",
      tipo: "cultura",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 21,
      termosDeBusca: ["ferias julho viagem", "passagem para os estados unidos", "orlando ferias"],
    },
  ];
}

/**
 * O calendário econômico recorrente dos EUA.
 *
 * Três números mandam na conversa de economia americana e nenhum deles é
 * surpresa: emprego, inflação e juros. Emprego e inflação têm recorrência
 * mensal; juros dependem do calendário do Fomc, que é anunciado e por isso
 * mora em {@link DATAS_ANUNCIADAS}.
 *
 * `precisao` é honestidade de engenharia: a primeira sexta do mês é regra
 * publicada, o dia do índice de preços não é. Quem consome o calendário
 * precisa saber qual das duas está lendo, porque uma serve para dizer "sai
 * amanhã" e a outra só serve para dizer "sai nesta semana".
 */
/**
 * A data em que sai o relatório de emprego sobre o mês de referência.
 *
 * NÃO é a primeira sexta do mês seguinte, que é a lenda repetida em toda
 * parte. A regra publicada pelo Bureau of Labor Statistics é: **a terceira
 * sexta-feira depois do fim da semana de referência**, sendo a semana de
 * referência a que contém o dia 12 do mês pesquisado.
 *
 * As duas regras coincidem na maioria dos meses, e é por isso que a lenda
 * sobrevive. Elas divergem em cerca de um terço deles, e num desses meses o
 * sistema anunciaria o número mais importante da economia americana no dia
 * errado. Conferido contra o feed do BLS: o relatório de agosto de 2026 saiu
 * em 4 de setembro, que é o que esta função devolve.
 */
export function saidaDoRelatorioDeEmprego(ano: number, mesDeReferencia: number): string {
  const doze = new Date(Date.UTC(ano, mesDeReferencia - 1, 12));
  // Sábado que fecha a semana do dia 12 (semana de domingo a sábado).
  const fimDaSemana = iso(ano, mesDeReferencia, 12 + (6 - doze.getUTCDay()));

  let data = fimDaSemana;
  for (let sextas = 0; sextas < 3; ) {
    data = somarDias(data, 1);
    const [a, m, d] = data.split("-").map(Number);
    if (new Date(Date.UTC(a, m - 1, d)).getUTCDay() === 5) sextas += 1;
  }

  /*
   * Sexta que cai em feriado federal empurra a divulgação.
   *
   * O relatório de dezembro cai em 1 de janeiro pela regra, e o BLS não
   * publica no Ano Novo. Sem esta linha, o calendário anunciaria o número do
   * emprego para um dia em que ninguém trabalha.
   */
  while (feriadosFederaisFixos(Number(data.slice(0, 4))).has(data)) data = somarDias(data, 1);

  return data;
}

/**
 * Os feriados federais de data fixa, como conjunto de datas.
 *
 * Só os fixos: os calculados por posição no mês caem sempre em segunda ou
 * quinta e nunca colidem com uma sexta de divulgação.
 */
function feriadosFederaisFixos(ano: number): Set<string> {
  return new Set([iso(ano, 1, 1), iso(ano, 6, 19), iso(ano, 7, 4), iso(ano, 11, 11), iso(ano, 12, 25)]);
}

function datasEconomicasEUA(ano: number): DataDoCalendario[] {
  const datas: DataDoCalendario[] = [];

  for (let mes = 1; mes <= 12; mes++) {
    datas.push({
      id: `us-emprego-${ano}-${String(mes).padStart(2, "0")}`,
      nome: "Relatório de emprego dos EUA",
      // Do mês ANTERIOR, que é o que o relatório mede.
      data: saidaDoRelatorioDeEmprego(mes === 1 ? ano - 1 : ano, mes === 1 ? 12 : mes - 1),
      pais: "eua",
      tipo: "economia",
      pesoParaOBrasileiro: 3,
      antecedenciaEmDias: 3,
      termosDeBusca: ["jobs report", "unemployment rate", "payrolls"],
    });

    datas.push({
      id: `us-inflacao-${ano}-${String(mes).padStart(2, "0")}`,
      nome: "Índice de preços ao consumidor dos EUA",
      // Meio do mês. O dia exato sai no calendário do BLS e varia de 10 a 15.
      data: proximoDiaUtil(iso(ano, mes, 12)),
      pais: "eua",
      tipo: "economia",
      pesoParaOBrasileiro: 3,
      antecedenciaEmDias: 2,
      termosDeBusca: ["CPI inflation", "consumer price index", "inflation report"],
    });
  }

  /*
   * O PIB, três vezes por trimestre, e só a primeira estimativa entra.
   *
   * O Bureau of Economic Analysis publica a estimativa preliminar cerca de
   * quatro semanas depois do fim do trimestre, e revisa duas vezes. Quem faz
   * manchete é a primeira: as revisões mexem em décimos e não mudam a
   * conversa.
   */
  for (const mes of [1, 4, 7, 10]) {
    datas.push({
      id: `us-pib-${ano}-${String(mes).padStart(2, "0")}`,
      nome: "PIB dos EUA, primeira estimativa",
      data: proximoDiaUtil(iso(ano, mes, 28)),
      pais: "eua",
      tipo: "economia",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 2,
      termosDeBusca: ["GDP growth", "US economy growth"],
    });
  }

  /*
   * O boletim de vistos, mensal.
   *
   * Continua no calendário mesmo depois do reposicionamento, e com peso 2, e
   * não 3: a publicação deixou de ser sobre imigração, mas a data existe, é
   * previsível e interessa a uma parte do público. O teto de uma pauta de
   * visto por edição é quem impede isso de voltar a dominar a edição.
   */
  for (let mes = 1; mes <= 12; mes++) {
    datas.push({
      id: `us-visa-bulletin-${ano}-${String(mes).padStart(2, "0")}`,
      nome: "Boletim de vistos do Departamento de Estado",
      data: proximoDiaUtil(iso(ano, mes, 15)),
      pais: "eua",
      tipo: "prazo",
      pesoParaOBrasileiro: 2,
      antecedenciaEmDias: 2,
      termosDeBusca: ["visa bulletin", "priority date"],
    });
  }

  return datas;
}

/**
 * O que não tem regra e por isso é tabela.
 *
 * Toda linha aqui veio de anúncio oficial, e toda linha aqui envelhece. A
 * diferença para o resto do arquivo é essa: as funções acima valem para 2050,
 * esta lista vale até alguém anunciar o próximo bloco. Quando o ano pedido não
 * estiver coberto, {@link datasDoAno} segue sem ele, e não inventa.
 */
/**
 * As reuniões do Fomc, copiadas do calendário oficial do Federal Reserve.
 *
 * A data que importa é a do SEGUNDO dia, quarta-feira, quando sai a decisão e
 * o presidente do Fed fala. O Fed publica com cerca de dois anos de
 * antecedência; consultado em 16/09/2026, o calendário ia até 2027. Quando
 * 2028 for publicado, ele entra aqui, e enquanto não entrar o calendário
 * simplesmente não tem Fomc naquele ano, que é melhor do que ter data errada.
 *
 * Fonte: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
 */
const DECISOES_DO_FOMC: Record<number, string[]> = {
  2026: ["01-28", "03-18", "04-29", "06-17", "07-29", "09-16", "10-28", "12-09"],
  2027: ["01-27", "03-17", "04-28", "06-09", "07-28", "09-15", "10-27", "12-08"],
};

function reunioesDoFomc(ano: number): DataDoCalendario[] {
  return (DECISOES_DO_FOMC[ano] ?? []).map((mmdd) => ({
    id: `us-fomc-${ano}-${mmdd}`,
    nome: "Decisão de juros do Federal Reserve",
    data: `${ano}-${mmdd}`,
    pais: "eua",
    tipo: "economia" as const,
    pesoParaOBrasileiro: 3 as const,
    antecedenciaEmDias: 5,
    termosDeBusca: ["Fed interest rate decision", "FOMC meeting", "Powell press conference"],
  }));
}

export const DATAS_ANUNCIADAS: DataDoCalendario[] = [
  {
    id: "us-eleicao-presidencial-2028",
    nome: "Eleição presidencial nos EUA",
    data: "2028-11-07",
    pais: "eua",
    tipo: "politica",
    pesoParaOBrasileiro: 3,
    antecedenciaEmDias: 60,
    termosDeBusca: ["presidential election", "election 2028"],
  },
  {
    id: "us-posse-2029",
    nome: "Posse presidencial nos EUA",
    data: "2029-01-20",
    pais: "eua",
    tipo: "politica",
    pesoParaOBrasileiro: 3,
    antecedenciaEmDias: 30,
    termosDeBusca: ["inauguration day", "presidential transition"],
  },
  {
    id: "us-olimpiadas-2028",
    nome: "Olimpíadas de Los Angeles",
    data: "2028-07-14",
    pais: "eua",
    tipo: "esporte",
    pesoParaOBrasileiro: 3,
    antecedenciaEmDias: 90,
    termosDeBusca: ["LA28 Olympics", "Los Angeles Olympics", "Olympic tickets"],
  },
  {
    id: "us-censo-2030",
    nome: "Censo dos Estados Unidos",
    data: "2030-04-01",
    pais: "eua",
    tipo: "politica",
    pesoParaOBrasileiro: 2,
    antecedenciaEmDias: 45,
    termosDeBusca: ["US Census", "census count"],
  },
  {
    id: "br-copa-feminina-2027",
    nome: "Copa do Mundo feminina, no Brasil",
    data: "2027-06-24",
    pais: "ambos",
    tipo: "esporte",
    pesoParaOBrasileiro: 3,
    antecedenciaEmDias: 60,
    termosDeBusca: ["Women's World Cup Brazil", "copa do mundo feminina"],
  },
  {
    id: "us-olimpiadas-inverno-2030",
    nome: "Olimpíadas de Inverno nos Alpes",
    data: "2030-02-01",
    pais: "eua",
    tipo: "esporte",
    pesoParaOBrasileiro: 1,
    antecedenciaEmDias: 30,
    termosDeBusca: ["Winter Olympics 2030"],
  },
  {
    id: "br-copa-2030",
    nome: "Copa do Mundo do centenário",
    data: "2030-06-08",
    pais: "ambos",
    tipo: "esporte",
    pesoParaOBrasileiro: 3,
    antecedenciaEmDias: 60,
    termosDeBusca: ["World Cup 2030", "copa do mundo 2030"],
  },
];

/** Todas as datas de um ano, ordenadas. */
export function datasDoAno(ano: number): DataDoCalendario[] {
  const todas = [
    ...feriadosEUA(ano),
    ...datasComerciaisEUA(ano),
    ...datasEconomicasEUA(ano),
    ...reunioesDoFomc(ano),
    ...feriadosBrasil(ano),
    ...datasDoBrasil(ano),
    ...DATAS_ANUNCIADAS.filter((d) => d.data.startsWith(String(ano))),
  ];

  return todas.sort((a, b) => a.data.localeCompare(b.data));
}

export type DataNaAgenda = DataDoCalendario & {
  /** Quantos dias faltam. Zero é hoje. */
  faltam: number;
};

/**
 * O que está no radar hoje.
 *
 * Uma data só entra quando falta menos do que a antecedência DELA. É por isso
 * que Black Friday aparece com três semanas e Finados aparece com três dias:
 * o horizonte é da data, não do calendário. Sem isso, ou o sistema anuncia
 * Thanksgiving em setembro, ou descobre a Black Friday na quinta à noite.
 *
 * `horizonteMaximo` é só o teto de varredura, para não percorrer anos à toa.
 */
export function agenda(hoje: string, horizonteMaximo = 120): DataNaAgenda[] {
  const anoAtual = Number(hoje.slice(0, 4));
  const limite = somarDias(hoje, horizonteMaximo);
  const anoLimite = Number(limite.slice(0, 4));

  const universo: DataDoCalendario[] = [];
  for (let ano = anoAtual; ano <= anoLimite; ano++) universo.push(...datasDoAno(ano));

  return universo
    .map((d) => ({ ...d, faltam: diasEntre(hoje, d.data) }))
    .filter((d) => d.faltam >= 0 && d.faltam <= Math.min(d.antecedenciaEmDias, horizonteMaximo))
    .sort((a, b) => a.faltam - b.faltam || b.pesoParaOBrasileiro - a.pesoParaOBrasileiro);
}

/**
 * A agenda escrita para o redator, em português e em uma linha por data.
 *
 * Vazio quando não há nada no radar, e vazio é resposta legítima: em 12 de
 * março não existe gancho de calendário, e inventar um seria pior do que não
 * ter.
 */
export function agendaEmTexto(hoje: string, horizonteMaximo = 120): string {
  const itens = agenda(hoje, horizonteMaximo);
  if (itens.length === 0) return "";

  return itens
    .map((d) => {
      const quando =
        d.faltam === 0 ? "é hoje" : d.faltam === 1 ? "é amanhã" : `em ${d.faltam} dias`;
      return `${d.nome} (${d.data}, ${quando})`;
    })
    .join("; ");
}

/**
 * Os termos de busca das datas que estão chegando, sem repetição.
 *
 * É o que a coleta usa para procurar o que ainda não foi publicado: em vez de
 * esperar que alguma fonte fale de Black Friday, o sistema vai atrás do
 * assunto porque sabe a data.
 */
export function termosDaAgenda(hoje: string, horizonteMaximo = 120): string[] {
  const vistos = new Set<string>();
  const termos: string[] = [];

  for (const data of agenda(hoje, horizonteMaximo)) {
    // Peso 1 é contexto, e contexto não justifica uma busca extra por dia.
    if (data.pesoParaOBrasileiro < 2) continue;
    for (const termo of data.termosDeBusca) {
      const chave = termo.toLowerCase();
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      termos.push(termo);
    }
  }

  return termos;
}
