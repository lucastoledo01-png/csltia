/**
 * Conversão entre horário local de um projeto e instante UTC.
 *
 * Os projetos publicam em horários locais ("06:03", "12:30"), mas o banco e o
 * agendador trabalham em UTC. Converter na mão com offset fixo quebra sempre
 * que o fuso muda de regra, então a conversão consulta o próprio Intl.
 */

/** Deslocamento do fuso, em milissegundos, no instante informado. */
export function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const formatador = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const partes: Record<string, number> = {};
  for (const parte of formatador.formatToParts(date)) {
    if (parte.type !== "literal") partes[parte.type] = Number(parte.value);
  }

  const comoUtc = Date.UTC(
    partes.year,
    partes.month - 1,
    partes.day,
    partes.hour === 24 ? 0 : partes.hour,
    partes.minute,
    partes.second,
  );

  return comoUtc - date.getTime();
}

/**
 * Instante UTC correspondente a uma data e hora locais de um fuso.
 *
 * @param dateStr data no formato AAAA-MM-DD
 * @param timeStr hora no formato HH:MM
 */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [ano, mes, dia] = dateStr.split("-").map(Number);
  const [hora, minuto] = timeStr.split(":").map(Number);

  if ([ano, mes, dia, hora, minuto].some((n) => !Number.isFinite(n))) {
    throw new Error(`Data ou hora inválida: "${dateStr}" "${timeStr}"`);
  }

  // Primeira aproximação tratando os componentes como UTC, depois corrigida
  // pelo deslocamento real do fuso naquele instante.
  const aproximado = Date.UTC(ano, mes - 1, dia, hora, minuto);
  const deslocamento = timeZoneOffsetMs(new Date(aproximado), timeZone);

  return new Date(aproximado - deslocamento);
}
