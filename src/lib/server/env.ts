/**
 * Acesso a segredos e configuração obrigatória.
 *
 * Regra desta camada: segredo ausente é erro, nunca valor padrão. Os fallbacks
 * silenciosos que existiam antes faziam o sistema aceitar senhas fixas do
 * código e conectar em um projeto Supabase escrito no fonte quando o ambiente
 * não estava configurado.
 */

export class MissingEnvError extends Error {
  readonly variables: string[];

  constructor(variables: string[], hint: string) {
    super(
      `Configuração ausente: defina ${variables.join(" ou ")} no ambiente. ${hint}`,
    );
    this.name = "MissingEnvError";
    this.variables = variables;
  }
}

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string | undefined {
  const raw = env[name];
  if (typeof raw !== "string") return undefined;

  // Arquivos .env costumam manter as aspas em volta do valor.
  let value = raw.trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }

  return value.length > 0 ? value : undefined;
}

export function optionalEnv(name: string, env: Env = process.env): string | undefined {
  return read(env, name);
}

export function requireEnv(name: string, hint: string, env: Env = process.env): string {
  const value = read(env, name);
  if (!value) throw new MissingEnvError([name], hint);
  return value;
}

/** Aceita nomes alternativos para a mesma configuração, na ordem de preferência. */
export function requireOneOf(names: string[], hint: string, env: Env = process.env): string {
  for (const name of names) {
    const value = read(env, name);
    if (value) return value;
  }
  throw new MissingEnvError(names, hint);
}

export function getAdminPassword(env: Env = process.env): string {
  return requireOneOf(
    ["ADMIN_PASSWORD", "ADMIN_TEMP_PASSWORD"],
    "É a senha de acesso ao painel administrativo.",
    env,
  );
}

export function getAdminSessionSecret(env: Env = process.env): string {
  return requireEnv(
    "ADMIN_SESSION_SECRET",
    "Assina o cookie de sessão do admin. Use um valor aleatório longo e exclusivo.",
    env,
  );
}

export function getCronSecret(env: Env = process.env): string {
  return requireEnv(
    "CRON_SECRET",
    "Autoriza o disparo automático da redação. Envie como cabeçalho Authorization: Bearer <valor>.",
    env,
  );
}

export function getOpenAIKey(env: Env = process.env): string {
  return requireEnv(
    "OPENAI_API_KEY",
    "Sem ela o pipeline editorial não tem como gerar conteúdo.",
    env,
  );
}

/**
 * Fork mínimo do OpenReply (D1 em docs/sistema-prompt-arquitetura.md): rota
 * aditiva `POST /api/service/automations` protegida por token estático. A
 * rota ainda não existe no OpenReply — chamar sem ela implementada lá dá 404,
 * não é bug daqui.
 */
export function getOpenReplyServiceConfig(env: Env = process.env): { baseUrl: string; token: string } {
  return {
    baseUrl: requireEnv(
      "OPENREPLY_SERVICE_BASE_URL",
      "URL base do OpenReply, ex: https://openreply.casaloti.ia.br",
      env,
    ),
    token: requireEnv(
      "PROMPT_SYSTEM_API_TOKEN",
      "Token estático compartilhado com a rota de serviço do OpenReply.",
      env,
    ),
  };
}

export function getSupabaseAdminConfig(env: Env = process.env): { url: string; key: string } {
  return {
    url: requireEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      "É a URL do projeto Supabase.",
      env,
    ),
    key: requireOneOf(
      ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
      "É a chave de serviço do Supabase, usada apenas no servidor.",
      env,
    ),
  };
}
