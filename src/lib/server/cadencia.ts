import { zonedTimeToUtc } from "./time";

/**
 * A cadência de cada ramo, como CONFIGURAÇÃO do projeto.
 *
 * Até 05/10/2026 o calendário do eua.journal era uma linha de crontab
 * (`3 9 * * *`) mais meia dúzia de variáveis de ambiente do social
 * (`SOCIAL_JANELA_INICIO`, `SOCIAL_POSTS_MAX_PER_DAY`...). Variável de ambiente
 * é global ao deploy, então um segundo projeto herdaria o horário do primeiro,
 * e mudar um horário pedia deploy. O PRD validado pelo dono em 05/10/2026
 * (RNF-08) diz o contrário: dia, horário, volume e fonte de cada ramo são
 * configuração do PROJETO, nunca código nem ambiente.
 *
 * Mora em `projects.settings.cadencia`, que é jsonb e já é lido em produção,
 * pelo mesmo motivo que as capacidades moram em `settings.capacidades`: não
 * exige migration, e projeto que não declara nada recebe os padrões abaixo,
 * que são exatamente a tabela do PRD.
 *
 *   | Canal      | Dias            | Horário (Brasília)              | Volume       |
 *   | Newsletter | terça a sexta   | 06:07                           | 2 a 4 pautas |
 *   | Portal     | terça a sexta   | 06:07, 12:00, 18:00             | 3 artigos    |
 *   | Instagram  | terça a sexta   | 08:00, 11:22, 14:45, 18:07, 21:30 | até 5 posts |
 *   | Produção   | segunda a quinta| 17:00                           | tudo do dia seguinte |
 *   | Aprovação  | segunda a quinta| noite                           | lote ou peça a peça |
 *
 * ## A regra que torna isto seguro
 *
 * Campo declarado e inválido cai no PADRÃO daquele campo, e o aviso sobe para o
 * painel. É o contrário das capacidades, onde inválido vira `off`, e é de
 * propósito: lá o erro de digitação poderia LIGAR publicação; aqui o pior que o
 * padrão faz é publicar no horário que o dono aprovou no PRD. Cair em lista
 * vazia de horários, por outro lado, faria o dia sumir em silêncio.
 *
 * ## Quem lê o quê (05/10/2026, para o merge com a separação dos ramos)
 *
 *   cadenciaDoProjeto(projeto)          a cadência inteira, já validada
 *   horariosDoPortal(projeto)           ["06:07", "12:00", "18:00"]
 *   agendaDoPortal(projeto, data)       os mesmos, como instantes UTC daquele dia
 *   horarioDaNewsletter(projeto)        "06:07"
 *   horariosDoInstagram(projeto)        os cinco horários do feed
 *   volumeDoCanal(projeto, canal)       { minimo, maximo }
 *   fontesDoRamo(projeto, canal)        source_keys do ramo; vazio = todas
 */

export const CANAIS = ["newsletter", "portal", "instagram"] as const;
export type Canal = (typeof CANAIS)[number];

/** 0 é domingo, 6 é sábado: a convenção de `Date.getUTCDay`. */
export type DiaDaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Volume = { minimo: number; maximo: number };

export type CadenciaDoCanal = {
  dias: DiaDaSemana[];
  /** Hora local do projeto, "HH:MM", em ordem crescente. */
  horarios: string[];
  volume: Volume;
  /**
   * Quais fontes alimentam este ramo, por `project_news_sources.source_key`.
   * Vazio quer dizer todas, que é o comportamento de antes desta configuração.
   */
  fontes: string[];
};

export type CadenciaDaProducao = {
  dias: DiaDaSemana[];
  horario: string;
  /** Quantos dias depois da produção o conteúdo vai ao ar. O PRD diz 1. */
  antecedenciaEmDias: number;
};

export type CadenciaDaAprovacao = {
  dias: DiaDaSemana[];
  inicio: string;
  fim: string;
  modo: "lote_ou_peca" | "lote" | "peca";
};

export type CadenciaDoProjeto = {
  newsletter: CadenciaDoCanal;
  portal: CadenciaDoCanal;
  instagram: CadenciaDoCanal;
  producao: CadenciaDaProducao;
  aprovacao: CadenciaDaAprovacao;
};

const TERCA_A_SEXTA: DiaDaSemana[] = [2, 3, 4, 5];
const SEGUNDA_A_QUINTA: DiaDaSemana[] = [1, 2, 3, 4];

/** A tabela do PRD de 05/10/2026, e nada além dela. */
export const CADENCIA_PADRAO: CadenciaDoProjeto = {
  newsletter: { dias: TERCA_A_SEXTA, horarios: ["06:07"], volume: { minimo: 2, maximo: 4 }, fontes: [] },
  portal: { dias: TERCA_A_SEXTA, horarios: ["06:07", "12:00", "18:00"], volume: { minimo: 3, maximo: 3 }, fontes: [] },
  instagram: {
    dias: TERCA_A_SEXTA,
    horarios: ["08:00", "11:22", "14:45", "18:07", "21:30"],
    volume: { minimo: 0, maximo: 5 },
    fontes: [],
  },
  producao: { dias: SEGUNDA_A_QUINTA, horario: "17:00", antecedenciaEmDias: 1 },
  /*
   * "Noite" no PRD. A janela começa depois da produção das 17:00 terminar (ela
   * leva de 10 a 30 minutos, medido nos runs de setembro) e fecha antes da
   * virada do dia, que é quando o conteúdo deixa de ser "de amanhã".
   */
  aprovacao: { dias: SEGUNDA_A_QUINTA, inicio: "18:00", fim: "23:59", modo: "lote_ou_peca" },
};

export type ProjetoComCadencia = {
  settings?: Record<string, unknown> | null;
  timezone?: string;
};

export type LeituraDaCadencia = {
  cadencia: CadenciaDoProjeto;
  /** O que o projeto declarou e não valia. Vai para o painel, nunca derruba o dia. */
  avisos: string[];
};

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function lerDias(bruto: unknown, padrao: DiaDaSemana[], onde: string, avisos: string[]): DiaDaSemana[] {
  if (bruto === undefined) return padrao;
  if (!Array.isArray(bruto)) {
    avisos.push(`${onde}.dias não é lista; valendo o padrão`);
    return padrao;
  }
  const dias = bruto.filter((d): d is DiaDaSemana => Number.isInteger(d) && d >= 0 && d <= 6);
  if (dias.length !== bruto.length) {
    avisos.push(`${onde}.dias tem valor fora de 0 a 6; valendo o padrão`);
    return padrao;
  }
  // Lista vazia declarada é decisão (o ramo não publica), e não erro.
  return [...new Set(dias)].sort((a, b) => a - b);
}

function lerHorarios(bruto: unknown, padrao: string[], onde: string, avisos: string[]): string[] {
  if (bruto === undefined) return padrao;
  if (!Array.isArray(bruto) || bruto.length === 0 || !bruto.every((h) => typeof h === "string" && HORA.test(h))) {
    avisos.push(`${onde}.horarios precisa ser lista de "HH:MM"; valendo o padrão`);
    return padrao;
  }
  return [...new Set(bruto as string[])].sort();
}

function lerHora(bruto: unknown, padrao: string, onde: string, avisos: string[]): string {
  if (bruto === undefined) return padrao;
  if (typeof bruto !== "string" || !HORA.test(bruto)) {
    avisos.push(`${onde} precisa ser "HH:MM"; valendo o padrão`);
    return padrao;
  }
  return bruto;
}

function lerVolume(bruto: unknown, padrao: Volume, onde: string, avisos: string[]): Volume {
  if (bruto === undefined) return padrao;
  const o = objeto(bruto);
  const minimo = o ? Number(o.minimo ?? padrao.minimo) : NaN;
  const maximo = o ? Number(o.maximo ?? padrao.maximo) : NaN;
  if (!Number.isInteger(minimo) || !Number.isInteger(maximo) || minimo < 0 || maximo < minimo) {
    avisos.push(`${onde}.volume precisa de inteiros com 0 <= minimo <= maximo; valendo o padrão`);
    return padrao;
  }
  return { minimo, maximo };
}

function lerFontes(bruto: unknown, onde: string, avisos: string[]): string[] {
  if (bruto === undefined) return [];
  if (!Array.isArray(bruto) || !bruto.every((f) => typeof f === "string" && f.trim())) {
    avisos.push(`${onde}.fontes precisa ser lista de source_key; valendo todas`);
    return [];
  }
  return (bruto as string[]).map((f) => f.trim());
}

function lerCanal(bruto: unknown, padrao: CadenciaDoCanal, onde: string, avisos: string[]): CadenciaDoCanal {
  const o = objeto(bruto);
  if (bruto !== undefined && !o) avisos.push(`${onde} não é objeto; valendo o padrão`);
  return {
    dias: lerDias(o?.dias, padrao.dias, onde, avisos),
    horarios: lerHorarios(o?.horarios, padrao.horarios, onde, avisos),
    volume: lerVolume(o?.volume, padrao.volume, onde, avisos),
    fontes: lerFontes(o?.fontes, onde, avisos),
  };
}

/** Lê `settings.cadencia`, campo a campo, com o padrão de cada um. */
export function lerCadencia(projeto: ProjetoComCadencia | null | undefined): LeituraDaCadencia {
  const avisos: string[] = [];
  const settings = objeto(projeto?.settings);
  const bruto = settings?.cadencia;
  const raiz = objeto(bruto);
  if (bruto !== undefined && !raiz) avisos.push("settings.cadencia não é objeto; valendo o padrão inteiro");

  const p = CADENCIA_PADRAO;
  const prod = objeto(raiz?.producao);
  const apr = objeto(raiz?.aprovacao);

  const antecedenciaBruta = prod?.antecedenciaEmDias;
  let antecedenciaEmDias = p.producao.antecedenciaEmDias;
  if (antecedenciaBruta !== undefined) {
    const n = Number(antecedenciaBruta);
    if (Number.isInteger(n) && n >= 0 && n <= 7) antecedenciaEmDias = n;
    else avisos.push("producao.antecedenciaEmDias precisa ser inteiro de 0 a 7; valendo o padrão");
  }

  const modoBruto = apr?.modo;
  const modos: CadenciaDaAprovacao["modo"][] = ["lote_ou_peca", "lote", "peca"];
  let modo = p.aprovacao.modo;
  if (modoBruto !== undefined) {
    if (modos.includes(modoBruto as CadenciaDaAprovacao["modo"])) modo = modoBruto as CadenciaDaAprovacao["modo"];
    else avisos.push(`aprovacao.modo precisa ser ${modos.join(", ")}; valendo o padrão`);
  }

  return {
    cadencia: {
      newsletter: lerCanal(raiz?.newsletter, p.newsletter, "newsletter", avisos),
      portal: lerCanal(raiz?.portal, p.portal, "portal", avisos),
      instagram: lerCanal(raiz?.instagram, p.instagram, "instagram", avisos),
      producao: {
        dias: lerDias(prod?.dias, p.producao.dias, "producao", avisos),
        horario: lerHora(prod?.horario, p.producao.horario, "producao.horario", avisos),
        antecedenciaEmDias,
      },
      aprovacao: {
        dias: lerDias(apr?.dias, p.aprovacao.dias, "aprovacao", avisos),
        inicio: lerHora(apr?.inicio, p.aprovacao.inicio, "aprovacao.inicio", avisos),
        fim: lerHora(apr?.fim, p.aprovacao.fim, "aprovacao.fim", avisos),
        modo,
      },
    },
    avisos,
  };
}

/** A cadência do projeto, já validada. É o getter que os ramos devem chamar. */
export function cadenciaDoProjeto(projeto: ProjetoComCadencia | null | undefined): CadenciaDoProjeto {
  return lerCadencia(projeto).cadencia;
}

/** Os horários do portal, hora local do projeto. Lido pelo ramo do portal. */
export function horariosDoPortal(projeto: ProjetoComCadencia | null | undefined): string[] {
  return cadenciaDoProjeto(projeto).portal.horarios;
}

/** O horário de disparo da newsletter, hora local. O primeiro, se houver mais de um. */
export function horarioDaNewsletter(projeto: ProjetoComCadencia | null | undefined): string {
  return cadenciaDoProjeto(projeto).newsletter.horarios[0];
}

export function horariosDoInstagram(projeto: ProjetoComCadencia | null | undefined): string[] {
  return cadenciaDoProjeto(projeto).instagram.horarios;
}

export function volumeDoCanal(projeto: ProjetoComCadencia | null | undefined, canal: Canal): Volume {
  return cadenciaDoProjeto(projeto)[canal].volume;
}

export function fontesDoRamo(projeto: ProjetoComCadencia | null | undefined, canal: Canal): string[] {
  return cadenciaDoProjeto(projeto)[canal].fontes;
}

// --- datas ------------------------------------------------------------------

/**
 * Dia da semana de uma data AAAA-MM-DD que JÁ está no fuso do projeto.
 *
 * Meio-dia UTC de propósito: a data já foi calculada no fuso certo por
 * `projectToday`, e meio-dia não vira o dia vizinho em fuso nenhum habitado.
 */
export function diaDaSemana(dataIso: string): DiaDaSemana {
  return new Date(`${dataIso}T12:00:00Z`).getUTCDay() as DiaDaSemana;
}

export function somarDiasIso(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function canalPublicaEm(cadencia: CadenciaDoProjeto, canal: Canal, dataIso: string): boolean {
  return cadencia[canal].dias.includes(diaDaSemana(dataIso));
}

export type InstanteAgendado = { horaLocal: string; quandoIso: string };

/** Os horários de um canal num dia, como instantes UTC. Vazio se o canal não publica nesse dia. */
export function agendaDoCanal(
  projeto: ProjetoComCadencia & { timezone: string },
  canal: Canal,
  dataIso: string,
): InstanteAgendado[] {
  const cadencia = cadenciaDoProjeto(projeto);
  if (!canalPublicaEm(cadencia, canal, dataIso)) return [];
  return cadencia[canal].horarios.map((horaLocal) => ({
    horaLocal,
    quandoIso: zonedTimeToUtc(dataIso, horaLocal, projeto.timezone).toISOString(),
  }));
}

/** Os horários do portal naquele dia, como instantes. Lido pelo ramo do portal. */
export function agendaDoPortal(projeto: ProjetoComCadencia & { timezone: string }, dataIso: string): InstanteAgendado[] {
  return agendaDoCanal(projeto, "portal", dataIso);
}

// --- a decisão de produzir --------------------------------------------------

export type MotivoDaProducao =
  /** A capacidade `producao_vespera` está desligada no projeto. */
  | "PRODUCAO_VESPERA_OFF"
  /** Hoje não está na lista de dias de produção. */
  | "NAO_E_DIA_DE_PRODUCAO"
  /** O dia-alvo não tem nenhum canal publicando, e produzir seria jogar fora. */
  | "ALVO_SEM_PUBLICACAO"
  | "PRODUZIR";

export type DecisaoDeProducao = {
  produzir: boolean;
  motivo: MotivoDaProducao;
  /** Data local da produção. */
  hoje: string;
  /** Data local em que o conteúdo produzido vai ao ar. */
  alvo: string;
  /** Canais que publicam no alvo. */
  canais: Canal[];
  explicacao: string;
};

const NOMES_DOS_DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/**
 * Produz hoje, e para qual dia?
 *
 * Pura de propósito: é a decisão que mais custa se estiver errada (um dia sem
 * produção, ou produção de um dia que não publica), e por isso é a que precisa
 * de teste produzindo um "não" de verdade para cada motivo.
 */
export function decidirProducao(
  cadencia: CadenciaDoProjeto,
  hoje: string,
  capacidadeLigada: boolean,
): DecisaoDeProducao {
  const alvo = somarDiasIso(hoje, cadencia.producao.antecedenciaEmDias);
  const canais = CANAIS.filter((c) => canalPublicaEm(cadencia, c, alvo));
  const base = { hoje, alvo, canais };

  if (!capacidadeLigada) {
    return {
      ...base,
      produzir: false,
      motivo: "PRODUCAO_VESPERA_OFF",
      explicacao: "A produção na véspera está desligada neste projeto; o ciclo das 06:03 segue valendo.",
    };
  }

  const dia = diaDaSemana(hoje);
  if (!cadencia.producao.dias.includes(dia)) {
    return {
      ...base,
      produzir: false,
      motivo: "NAO_E_DIA_DE_PRODUCAO",
      explicacao: `Hoje é ${NOMES_DOS_DIAS[dia]}, fora dos dias de produção do projeto.`,
    };
  }

  if (canais.length === 0) {
    return {
      ...base,
      produzir: false,
      motivo: "ALVO_SEM_PUBLICACAO",
      explicacao: `${alvo} (${NOMES_DOS_DIAS[diaDaSemana(alvo)]}) não tem canal publicando.`,
    };
  }

  return {
    ...base,
    produzir: true,
    motivo: "PRODUZIR",
    explicacao: `Produzindo ${alvo} para ${canais.join(", ")}.`,
  };
}

// --- o que ainda lê ambiente ------------------------------------------------

/**
 * A cadência traduzida para o ambiente que a redação e o ciclo social leem.
 *
 * O ciclo social inteiro (seleção, evergreen, agenda) lê a configuração de
 * `process.env`, e reescrever essa leitura em três módulos que a separação dos
 * ramos está mexendo em paralelo seria um merge ruim por um ganho nulo. Então a
 * fonte da verdade é o projeto, e o ambiente é só o TRANSPORTE até o ciclo, e
 * só na produção da véspera: o ciclo das 06:03 continua recebendo o
 * `process.env` intocado.
 *
 * `SOCIAL_HORARIOS` é lido por `agenda.ts` e só existe por aqui.
 */
export function ambientePelaCadencia(
  cadencia: CadenciaDoProjeto,
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const ig = cadencia.instagram;
  const maximo = String(ig.volume.maximo);
  return {
    ...env,
    SOCIAL_HORARIOS: ig.horarios.join(","),
    SOCIAL_JANELA_INICIO: ig.horarios[0],
    SOCIAL_JANELA_FIM: ig.horarios[ig.horarios.length - 1],
    SOCIAL_POSTS_MAX_PER_DAY: maximo,
    SOCIAL_POSTS_TARGET_PER_DAY: maximo,
    SOCIAL_POSTS_MIN_PER_DAY: String(ig.volume.minimo),
    EDITORIAL_MIN_PAUTAS: String(cadencia.newsletter.volume.minimo),
    EDITORIAL_MAX_PAUTAS: String(cadencia.newsletter.volume.maximo),
  };
}
