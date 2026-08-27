import fs from "node:fs";
import path from "node:path";

/**
 * Carrega .env.local para os scripts de linha de comando.
 *
 * Credenciais NUNCA devem ser escritas dentro dos scripts: três deles traziam
 * o token de acesso do Instagram em texto no fonte, o que levou esse token ao
 * histórico do repositório.
 */
export function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const [key, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key.trim()]) {
      process.env[key.trim()] = value;
    }
  }
}

/** Interrompe o script quando falta credencial, em vez de falhar mais adiante. */
export function requireInstagramEnv(): void {
  const faltando = ["INSTAGRAM_ACCOUNT_ID", "INSTAGRAM_ACCESS_TOKEN"].filter(
    (nome) => !process.env[nome]?.trim(),
  );

  if (faltando.length > 0) {
    console.error(
      `Faltam variáveis de ambiente: ${faltando.join(", ")}.\n` +
        "Defina em .env.local ou no ambiente antes de rodar este script.",
    );
    process.exit(1);
  }
}
