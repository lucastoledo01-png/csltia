import { zonedTimeToUtc } from "../time";

/**
 * A distribuição dos posts do dia, a partir de quantos existem.
 *
 * O scheduler antigo tinha quatro horários fixos e publicava
 * `min(horários, pautas)`. Isso amarra a produção à grade: com dez vagas e
 * três pautas boas, a pressão vira "arrumar mais sete notícias", e é assim que
 * se enche um feed com o que não deveria ter saído.
 *
 * Aqui a ordem é a inversa. A quantidade chega decidida pela composição
 * editorial, e a única pergunta é como espalhar N publicações numa janela.
 * Nenhum horário é obrigatório e nenhuma vaga precisa ser preenchida.
 *
 * Duas propriedades que os testes travam:
 *
 *   nada é publicado no passado. Uma execução tardia não despeja os horários
 *   vencidos de uma vez, que já aconteceu ao trocar a vertical;
 *
 *   existe espaçamento mínimo entre posts, mesmo quando a janela restante é
 *   curta demais para o número de posts. Nesse caso a janela é estendida, não
 *   comprimida: melhor terminar de publicar mais tarde que empilhar.
 */

export type ConfigDaAgenda = {
  /** Primeiro horário possível, hora local. */
  inicio: string;
  /** Último horário possível, hora local. */
  fim: string;
  /** Quando só existe um post, ele vai para cá. */
  horarioNobre: string;
  espacamentoMinimoEmMinutos: number;
  /** Folga entre criar a vaga e ela vencer, para o roteiro ser gerado. */
  folgaInicialEmMinutos: number;
  timezone: string;
};

function texto(nome: string, padrao: string, env: Record<string, string | undefined>): string {
  const bruto = (env[nome] || "").trim();
  return /^\d{2}:\d{2}$/.test(bruto) ? bruto : padrao;
}

function numero(nome: string, padrao: number, env: Record<string, string | undefined>): number {
  const n = Number(env[nome]);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

export function carregarConfigDaAgenda(
  env: Record<string, string | undefined> = process.env,
  timezone = "America/Sao_Paulo",
): ConfigDaAgenda {
  return {
    inicio: texto("SOCIAL_JANELA_INICIO", "08:00", env),
    fim: texto("SOCIAL_JANELA_FIM", "21:30", env),
    horarioNobre: texto("SOCIAL_HORARIO_NOBRE", "12:00", env),
    espacamentoMinimoEmMinutos: numero("SOCIAL_ESPACAMENTO_MINUTOS", 45, env),
    folgaInicialEmMinutos: numero("SOCIAL_FOLGA_MINUTOS", 10, env),
    timezone,
  };
}

export type Vaga = {
  posicao: number;
  /** Rótulo do slot, para idempotência e para o relatório. */
  slot: string;
  quandoIso: string;
  horaLocal: string;
};

function horaLocal(d: Date, timezone: string): string {
  return d.toLocaleTimeString("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Espalha N posts na janela do dia.
 *
 * Com N igual a 1 o post vai para o horário nobre, não para o começo da
 * janela: um post só no dia merece a hora de maior audiência. De 2 em diante,
 * a janela é dividida em intervalos iguais, o que dá manhã, tarde e noite em
 * N igual a 3 sem precisar de grade fixa para cada quantidade.
 */
export function distribuirVagas(
  quantidade: number,
  dataIso: string,
  config: ConfigDaAgenda,
  agoraMs: number = Date.now(),
): Vaga[] {
  if (quantidade <= 0) return [];

  const inicioMs = zonedTimeToUtc(dataIso, config.inicio, config.timezone).getTime();
  const fimMs = zonedTimeToUtc(dataIso, config.fim, config.timezone).getTime();
  const nobreMs = zonedTimeToUtc(dataIso, config.horarioNobre, config.timezone).getTime();

  const espacamento = config.espacamentoMinimoEmMinutos * 60_000;
  const piso = agoraMs + config.folgaInicialEmMinutos * 60_000;

  const alvos: number[] = [];

  if (quantidade === 1) {
    alvos.push(nobreMs);
  } else {
    const passo = (fimMs - inicioMs) / (quantidade - 1);
    for (let i = 0; i < quantidade; i += 1) alvos.push(inicioMs + passo * i);
  }

  /*
   * O passo teórico pode ser menor que o espaçamento mínimo quando o dia
   * sustenta muitos posts. Nesse caso a janela cede, não o espaçamento: um
   * feed com dois posts em dez minutos parece robô, um que termina meia hora
   * mais tarde não parece nada.
   */
  const vagas: Vaga[] = [];
  let ultimo = -Infinity;

  for (const [i, alvo] of alvos.entries()) {
    const quando = Math.max(alvo, piso, ultimo + espacamento);
    ultimo = quando;

    const d = new Date(quando);
    vagas.push({
      posicao: i + 1,
      slot: `${dataIso}-${String(i + 1).padStart(2, "0")}`,
      quandoIso: d.toISOString(),
      horaLocal: horaLocal(d, config.timezone),
    });
  }

  return vagas;
}

/** Só para o relatório do dry-run: a grade em uma linha. */
export function descreverAgenda(vagas: Vaga[]): string {
  if (vagas.length === 0) return "nenhuma vaga, o dia não sustentou nenhum post";
  return `${vagas.length} post(s): ${vagas.map((v) => v.horaLocal).join(", ")}`;
}
