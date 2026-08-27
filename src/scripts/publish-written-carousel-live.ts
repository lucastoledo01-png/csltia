/**
 * Publica ao vivo uma vaga já agendada, identificada pelo id.
 *
 * Substitui o script anterior, que trazia o token de acesso do Instagram
 * escrito no fonte e gerava um carrossel avulso. As credenciais agora vêm do
 * ambiente, e o conteúdo vem da edição gravada — nunca de um objeto de exemplo.
 *
 * Uso:
 *   npx tsx src/scripts/publish-written-carousel-live.ts <socialPostId>
 */

import { processScheduledPost } from "../lib/server/social/instagram/instagram-service";
import { loadEnvLocal, requireInstagramEnv } from "./load-env";

async function main() {
  loadEnvLocal();
  requireInstagramEnv();

  const socialPostId = process.argv[2];

  if (!socialPostId) {
    console.error("Informe o id do post: npx tsx src/scripts/publish-written-carousel-live.ts <socialPostId>");
    process.exit(1);
  }

  console.log(`=== PUBLICAÇÃO AO VIVO DO POST ${socialPostId} ===\n`);

  const result = await processScheduledPost(socialPostId, { autoPost: true });

  console.log("\n=======================================================");
  console.log("             RESULTADO DA PUBLICAÇÃO                   ");
  console.log("=======================================================");
  console.log(`- Sucesso: ${result.ok}`);
  console.log(`- Status: ${result.status}`);
  console.log(`- Media ID da Meta: ${result.providerPostId || "N/A"}`);
  console.log(`- Título do Post: ${result.carousel?.title || "N/A"}`);
  console.log(`- Slides publicados: ${result.slideUrls?.length ?? 0}`);
  console.log(`- Tempo: ${result.executionTimeMs}ms`);
  if (result.error) console.log(`- Erro: ${result.error}`);
  console.log("=======================================================\n");

  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("Erro ao publicar:", err);
  process.exit(1);
});
