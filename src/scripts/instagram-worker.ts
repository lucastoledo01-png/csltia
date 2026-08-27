/**
 * Worker de renderização e publicação do Instagram.
 *
 * Roda na VPS, não na hospedagem do site: precisa de Chromium para renderizar
 * os slides, o que hospedagem compartilhada não oferece.
 *
 * Cada giro pega as vagas que já venceram o horário e processa uma a uma.
 * Falha em uma vaga não interrompe as demais — o motivo fica gravado na
 * própria linha, em `error_message`.
 *
 * Uso:
 *   npx tsx src/scripts/instagram-worker.ts          processa o que venceu
 *   npx tsx src/scripts/instagram-worker.ts --once   idem, e encerra
 */

import { processScheduledPost } from "../lib/server/social/instagram/worker-service";
import { findDuePosts } from "../lib/server/social/instagram/scheduler";

const LOTE_MAXIMO = 5;

async function girar(): Promise<number> {
  const pendentes = await findDuePosts(LOTE_MAXIMO);

  if (pendentes.length === 0) {
    console.log(`[WORKER ${new Date().toISOString()}] Nenhum post vencido.`);
    return 0;
  }

  console.log(`[WORKER ${new Date().toISOString()}] ${pendentes.length} post(s) a processar.`);

  let publicados = 0;

  for (const pendente of pendentes) {
    try {
      const resultado = await processScheduledPost(pendente.id);
      if (resultado.ok && resultado.status === "published") publicados++;
    } catch (err) {
      // processScheduledPost já grava o motivo na linha; aqui só evitamos que
      // uma vaga problemática impeça as seguintes de rodar.
      console.error(`[WORKER] Erro não tratado no post ${pendente.id}:`, err);
    }
  }

  return publicados;
}

async function main() {
  try {
    const publicados = await girar();
    console.log(`[WORKER] Giro concluído. ${publicados} post(s) publicado(s).`);
    process.exit(0);
  } catch (err) {
    console.error("[WORKER] Falha no giro:", err);
    process.exit(1);
  }
}

main();
