import {
  createCarouselContainer,
  createCarouselItemContainer,
  publishContainer,
  verifyMetaInstagramCredentials,
} from "../lib/server/social/instagram/meta-client";

async function main() {
  console.log("=== DESBUGUEI.IA — TESTE DE POSTAGEM DIRETA NO INSTAGRAM (@desbuguei.ig) ===");

  const customEnv = {
    ...process.env,
    INSTAGRAM_ACCOUNT_ID: "17841465061867883",
    INSTAGRAM_ACCESS_TOKEN:
      "EAAcHmrXDrZBABSXp7azR23gQJRfCOgUfRvrxx14TUfb4OD3uMyh831iZBfcLbzOEY8vRjqfZCDKG5meSUj68QqR4ZCFGeZCVkCZCNwIe4NZAol62A7PGOlAO4ySixdZAKYhfW7pJjxJuv1uNTiXNZAIH3CaFRJz8YsKkqopU7QdPllS6OZBbuBc1Rfyz0RjfdI4gZDZD",
  };

  console.log("1. Verificando token...");
  const verifyRes = await verifyMetaInstagramCredentials(customEnv);

  if (!verifyRes.ok || !verifyRes.account) {
    console.error("❌ O token foi revogado ou expirou:", verifyRes.error);
    process.exit(1);
  }

  console.log(`✅ Token Ativo! Conta: ${verifyRes.account.name} (@${verifyRes.account.username})`);

  console.log("\n2. Preparando imagens para o carrossel (format 4:5 / 1080x1350)...");
  const slideImages = [
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080",
    "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1080",
  ];

  console.log("3. Criando itens individuais de mídia na Meta API...");
  const itemIds: string[] = [];

  for (let i = 0; i < slideImages.length; i++) {
    const itemRes = await createCarouselItemContainer(slideImages[i], customEnv);
    if (itemRes.ok && itemRes.creationId) {
      console.log(`   - Slide ${i + 1} criado. ID: ${itemRes.creationId}`);
      itemIds.push(itemRes.creationId);
    } else {
      console.error(`   - Slide ${i + 1} falhou:`, itemRes.error);
    }
  }

  if (itemIds.length < 2) {
    console.error("❌ Não foi possível criar slides suficientes para o carrossel.");
    process.exit(1);
  }

  const captionText = `🚀 Radar de IA | desbuguei.ia\n\nA nova era da inteligência artificial aplicada ao seu negócio e redes sociais!\n\n📌 Roteiros práticos de conteúdo\n💡 Dicas de vendas e produtividade\n⚡ Economia de tempo diária\n\n👇 Comente NEWS aqui nos comentários para receber a nossa newsletter gratuita direto no seu Direct!\n\nAgora você está desbugado. 🚀\n\n#inteligenciaartificial #redessociais #marketingdigital #desbuguei #vendascomia`;

  console.log("\n4. Agrupando slides no container de carrossel...");
  const carouselRes = await createCarouselContainer(itemIds, captionText, customEnv);

  if (!carouselRes.ok || !carouselRes.creationId) {
    console.error("❌ Falha ao criar container de carrossel:", carouselRes.error);
    process.exit(1);
  }

  console.log(`✅ Container de Carrossel criado com sucesso! Creation ID: ${carouselRes.creationId}`);

  console.log("\n5. Publicando no feed do Instagram `@desbuguei.ig`...");
  const publishRes = await publishContainer(carouselRes.creationId, customEnv);

  if (publishRes.ok && publishRes.mediaId) {
    console.log("\n=======================================================");
    console.log(" 🎉 POST PUBLICADO COM SUCESSO NO INSTAGRAM!           ");
    console.log("=======================================================");
    console.log(`- Media ID da Meta: ${publishRes.mediaId}`);
    console.log(`- Conta: @${verifyRes.account.username}`);
    console.log("=======================================================\n");
  } else {
    console.error("❌ Falha na publicação final:", publishRes.error);
  }
}

main().catch((err) => {
  console.error("❌ Exceção:", err);
  process.exit(1);
});
