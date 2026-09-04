import { afterEach, describe, expect, it, vi } from "vitest";
import { createAutomation, isKeywordAvailableOnOpenReply, OpenReplyRequestError } from "./openreply-client";

const env = {
  OPENREPLY_SERVICE_BASE_URL: "https://openreply.casaloti.ia.br",
  PROMPT_SYSTEM_API_TOKEN: "token-de-teste",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

function withEnv() {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

describe("openreply-client", () => {
  it("checa keyword livre via GET com token no header", async () => {
    withEnv();
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));

    const available = await isKeywordAvailableOnOpenReply("GTA26", fetchMock);

    expect(available).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openreply.casaloti.ia.br/api/service/automations?keyword=GTA26",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer token-de-teste", "Content-Type": "application/json" },
      }),
    );
  });

  it("interpreta 409 como keyword ocupada", async () => {
    withEnv();
    const fetchMock = vi.fn(async () => new Response(null, { status: 409 }));

    await expect(isKeywordAvailableOnOpenReply("GTA26", fetchMock)).resolves.toBe(false);
  });

  it("cria automação enviando o contrato completo, incluindo o upsell (etapa 9b)", async () => {
    withEnv();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ automationId: "auto_1", trackedLinkUrl: "https://desbuguei.ia/u/gta26" }), {
          status: 200,
        }),
    );

    const result = await createAutomation(
      {
        keyword: "GTA26",
        postId: "ig_media_123",
        dmMessage: "achei você — aqui está o link",
        openingDmMessage: "olá",
        trackedLink: { slug: "gta26", destinationUrl: "https://desbuguei.ia/ultraprompts/gta26" },
        followUp: { enabled: true, delayMinutes: 10, message: "quer o infoproduto?" },
      },
      fetchMock,
    );

    expect(result).toEqual({ automationId: "auto_1", trackedLinkUrl: "https://desbuguei.ia/u/gta26" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://openreply.casaloti.ia.br/api/service/automations");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      keyword: "GTA26",
      followUp: { enabled: true, delayMinutes: 10 },
    });
  });

  it("lança OpenReplyRequestError quando a rota ainda não existe do lado do OpenReply (404)", async () => {
    withEnv();
    const fetchMock = vi.fn(async () => new Response("not found", { status: 404 }));

    await expect(
      createAutomation(
        {
          keyword: "GTA26",
          postId: "ig_media_123",
          dmMessage: "x",
          openingDmMessage: "y",
          trackedLink: { slug: "gta26", destinationUrl: "https://desbuguei.ia/ultraprompts/gta26" },
        },
        fetchMock,
      ),
    ).rejects.toBeInstanceOf(OpenReplyRequestError);
  });
});
