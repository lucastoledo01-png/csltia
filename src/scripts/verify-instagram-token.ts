import { verifyMetaInstagramCredentials } from "../lib/server/social/instagram/meta-client";

async function main() {
  console.log("=== DESBUGUEI.IA — VERIFICAÇÃO DE CREDENCIAIS DA META GRAPH API ===");

  const customEnv = {
    ...process.env,
    INSTAGRAM_ACCOUNT_ID: "17841465061867883",
    INSTAGRAM_ACCESS_TOKEN: "EAAcHmrXDrZBABSXp7azR23gQJRfCOgUfRvrxx14TUfb4OD3uMyh831iZBfcLbzOEY8vRjqfZCDKG5meSUj68QqR4ZCFGeZCVkCZCNwIe4NZAol62A7PGOlAO4ySixdZAKYhfW7pJjxJuv1uNTiXNZAIH3CaFRJz8YsKkqopU7QdPllS6OZBbuBc1Rfyz0RjfdI4gZDZD",
  };

  console.log(`[TEST] Verificando acesso para INSTAGRAM_ACCOUNT_ID: ${customEnv.INSTAGRAM_ACCOUNT_ID}...`);

  const result = await verifyMetaInstagramCredentials(customEnv);

  console.log("\n=======================================================");
  console.log("          RESULTADO DA VERIFICAÇÃO DA META API        ");
  console.log("=======================================================");

  if (result.ok && result.account) {
    console.log("✅ STATUS: CONECTADO COM SUCESSO!");
    console.log(`- Instagram Account ID: ${result.account.id}`);
    console.log(`- Nome da Conta: ${result.account.name || "N/A"}`);
    console.log(`- Username/Handle: @${result.account.username || "N/A"}`);
    if (result.account.profile_picture_url) {
      console.log(`- Foto de Perfil: ${result.account.profile_picture_url}`);
    }
  } else {
    console.log("❌ STATUS: FALHA NA CONEXÃO");
    console.log(`- Erro Retornado: ${result.error}`);
  }
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("❌ Erro ao executar script de verificação:", err);
  process.exit(1);
});
