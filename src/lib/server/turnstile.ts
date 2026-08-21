type EnvLike = Record<string, string | undefined>;

type TurnstileConfig =
  | { enabled: false }
  | {
      enabled: true;
      secret: string;
      allowedHostnames: string[];
    };

type VerifyTurnstileInput = {
  token: string | undefined;
  expectedAction: string;
  requestHostname: string;
  env?: EnvLike;
  fetcher?: typeof fetch;
  remoteIp?: string | null;
};

type TurnstileSiteverifyResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

export function getTurnstileConfig(env: EnvLike = process.env): TurnstileConfig {
  const secret = env.TURNSTILE_SECRET_KEY;
  const allowedHostnames = String(env.TURNSTILE_ALLOWED_HOSTNAMES ?? "casaloti.ia.br,www.casaloti.ia.br")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (env.NODE_ENV !== "production") {
    allowedHostnames.push("localhost", "127.0.0.1");
  }

  if (!secret) {
    return { enabled: false };
  }

  return { enabled: true, secret, allowedHostnames: Array.from(new Set(allowedHostnames)) };
}

export async function verifyTurnstileToken({
  token,
  expectedAction,
  requestHostname,
  env = process.env,
  fetcher = fetch,
  remoteIp,
}: VerifyTurnstileInput): Promise<{ ok: true } | { ok: false; reason: string }> {
  const config = getTurnstileConfig(env);

  if (!config.enabled) {
    return { ok: false, reason: "turnstile_not_configured" };
  }

  if (!token) {
    return { ok: false, reason: "missing_turnstile_token" };
  }

  if (!config.allowedHostnames.includes(requestHostname.toLowerCase())) {
    return { ok: false, reason: "request_hostname_not_allowed" };
  }

  const body = new URLSearchParams({
    secret: config.secret,
    response: token,
  });

  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });

  if (!response.ok) {
    return { ok: false, reason: "turnstile_siteverify_failed" };
  }

  const result = (await response.json().catch(() => ({}))) as TurnstileSiteverifyResponse;

  if (!result.success) {
    return { ok: false, reason: result["error-codes"]?.[0] ?? "turnstile_denied" };
  }

  if (result.action !== expectedAction) {
    return { ok: false, reason: "action_mismatch" };
  }

  if (!result.hostname || !config.allowedHostnames.includes(result.hostname.toLowerCase())) {
    return { ok: false, reason: "hostname_mismatch" };
  }

  return { ok: true };
}
