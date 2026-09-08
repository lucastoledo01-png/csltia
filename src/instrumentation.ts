/**
 * Checagem de boot dos canais de monitoramento.
 *
 * `register` roda uma vez, quando a instância do servidor sobe, e antes de ela
 * atender requisição. É o único lugar onde "o canal de alerta não está
 * configurado" pode ser dito UMA vez, alto, em vez de virar um `console.warn`
 * por alerta perdido.
 *
 * O que motivou: em 06, 07 e 08 de setembro de 2026 três alertas críticos da
 * redação não chegaram, e a única evidência era um aviso por alerta dentro do
 * contêiner. Um canal de monitoramento quebrado tem que aparecer na subida do
 * processo, junto com o resto do que se olha num deploy.
 *
 * Nada aqui lança e nada aqui imprime valor de variável: só se ela existe.
 */
export function register(): void {
  const canais = [
    { nome: "Telegram (alertas)", vars: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] },
    { nome: "healthchecks.io (watchdog da redação)", vars: ["HEALTHCHECK_NEWSROOM_URL"] },
  ];

  for (const canal of canais) {
    const faltando = canal.vars.filter((v) => !String(process.env[v] ?? "").trim());
    if (faltando.length === 0) {
      console.log(`[BOOT] ${canal.nome}: configurado.`);
    } else {
      console.warn(
        `[BOOT] ${canal.nome}: NÃO CONFIGURADO. Faltando ${faltando.join(", ")}. ` +
          `Falha operacional vai passar em silêncio até isso ser resolvido.`,
      );
    }
  }
}
