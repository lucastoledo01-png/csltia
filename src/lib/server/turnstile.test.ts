import { describe, expect, it, vi } from "vitest";
import { getTurnstileConfig, verifyTurnstileToken } from "./turnstile";

describe("turnstile", () => {
  it("fica indisponivel sem secret no servidor", async () => {
    expect(getTurnstileConfig({})).toEqual({ enabled: false });
  });

  it("exige sucesso, action esperada e hostname permitido", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          action: "newsletter_signup",
          hostname: "casaloti.ia.br",
        }),
        { status: 200 },
      ),
    );

    const result = await verifyTurnstileToken({
      token: "turnstile-token",
      expectedAction: "newsletter_signup",
      requestHostname: "casaloti.ia.br",
      env: {
        TURNSTILE_SECRET_KEY: "secret-test",
        TURNSTILE_ALLOWED_HOSTNAMES: "casaloti.ia.br,www.casaloti.ia.br",
      },
      fetcher,
    });

    expect(result).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST" }),
    );
    expect(String(fetcher.mock.calls[0][1]?.body)).toContain("response=turnstile-token");
    expect(String(fetcher.mock.calls[0][1]?.body)).not.toContain("sitekey");
  });

  it("bloqueia hostname inesperado mesmo com token valido", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, action: "newsletter_signup", hostname: "evil.example" }), { status: 200 }),
    );

    await expect(
      verifyTurnstileToken({
        token: "turnstile-token",
        expectedAction: "newsletter_signup",
        requestHostname: "casaloti.ia.br",
        env: { TURNSTILE_SECRET_KEY: "secret-test", TURNSTILE_ALLOWED_HOSTNAMES: "casaloti.ia.br" },
        fetcher,
      }),
    ).resolves.toEqual({ ok: false, reason: "hostname_mismatch" });
  });
});
