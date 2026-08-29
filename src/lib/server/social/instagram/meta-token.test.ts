import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getProjectCredentials = vi.fn();
const upsertProjectCredentials = vi.fn(async () => {});
const sendAlert = vi.fn(async () => true);

vi.mock("../../projects", () => ({
  DEFAULT_PROJECT_ID: "proj-1",
  getProjectCredentials: (...a: unknown[]) => getProjectCredentials(...a),
  upsertProjectCredentials: (...a: unknown[]) => upsertProjectCredentials(...a),
}));
vi.mock("../../alerts", () => ({
  sendAlert: (...a: unknown[]) => sendAlert(...a),
}));

import { checkAndRefreshInstagramToken, resolveInstagramToken } from "./meta-token";

const DAY = 86_400_000;
function debugTokenResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify({ data }), { status: 200 });
}

beforeEach(() => {
  getProjectCredentials.mockReset();
  upsertProjectCredentials.mockReset().mockResolvedValue(undefined);
  sendAlert.mockReset().mockResolvedValue(true);
});
afterEach(() => vi.unstubAllGlobals());

describe("resolveInstagramToken", () => {
  it("usa o token persistido quando existe", async () => {
    getProjectCredentials.mockResolvedValue({ access_token: "persistido" });
    expect(await resolveInstagramToken("proj-1", {})).toBe("persistido");
  });

  it("cai na env quando não há persistido", async () => {
    getProjectCredentials.mockResolvedValue(null);
    expect(await resolveInstagramToken("proj-1", { INSTAGRAM_ACCESS_TOKEN: "da-env" })).toBe("da-env");
  });
});

describe("checkAndRefreshInstagramToken", () => {
  it("alerta crítico quando o token está inválido", async () => {
    getProjectCredentials.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn(async () => debugTokenResponse({ is_valid: false, expires_at: 0 })));

    const r = await checkAndRefreshInstagramToken("proj-1", { INSTAGRAM_ACCESS_TOKEN: "t" });

    expect(r.isValid).toBe(false);
    expect(sendAlert).toHaveBeenCalledWith("critical", expect.stringContaining("inválido"), expect.any(String), expect.anything());
  });

  it("não faz nada quando o token está válido e longe de expirar", async () => {
    getProjectCredentials.mockResolvedValue(null);
    const farExpiry = Math.floor((Date.now() + 50 * DAY) / 1000);
    vi.stubGlobal("fetch", vi.fn(async () => debugTokenResponse({ is_valid: true, expires_at: farExpiry })));

    const r = await checkAndRefreshInstagramToken("proj-1", { INSTAGRAM_ACCESS_TOKEN: "t" });

    expect(r.ok).toBe(true);
    expect(r.refreshed).toBe(false);
    expect(sendAlert).not.toHaveBeenCalled();
    expect(upsertProjectCredentials).toHaveBeenCalled(); // persiste a validade
  });

  it("renova via fb_exchange_token quando falta pouco e há META_APP_ID/SECRET", async () => {
    getProjectCredentials.mockResolvedValue(null);
    const soonExpiry = Math.floor((Date.now() + 5 * DAY) / 1000);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("debug_token")) return debugTokenResponse({ is_valid: true, expires_at: soonExpiry });
      return new Response(JSON.stringify({ access_token: "TOKEN_NOVO", expires_in: 60 * DAY / 1000 }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await checkAndRefreshInstagramToken("proj-1", {
      INSTAGRAM_ACCESS_TOKEN: "velho",
      META_APP_ID: "app",
      META_APP_SECRET: "secret",
    });

    expect(r.refreshed).toBe(true);
    expect(upsertProjectCredentials).toHaveBeenCalledWith(
      "proj-1",
      "instagram",
      { access_token: "TOKEN_NOVO" },
      expect.any(String),
    );
  });

  it("alerta quando falta pouco mas não há como renovar", async () => {
    getProjectCredentials.mockResolvedValue(null);
    const soonExpiry = Math.floor((Date.now() + 4 * DAY) / 1000);
    vi.stubGlobal("fetch", vi.fn(async () => debugTokenResponse({ is_valid: true, expires_at: soonExpiry })));

    const r = await checkAndRefreshInstagramToken("proj-1", { INSTAGRAM_ACCESS_TOKEN: "t" });

    expect(r.refreshed).toBe(false);
    expect(sendAlert).toHaveBeenCalledWith(
      expect.stringMatching(/warning|critical/),
      expect.stringContaining("expira em"),
      expect.any(String),
      expect.anything(),
    );
  });
});
