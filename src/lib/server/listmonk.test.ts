import { describe, expect, it, vi } from "vitest";
import { buildListmonkFormPayload, buildListmonkSubscriberPayload, createListmonkClient, getListmonkConfig } from "./listmonk";

const homesiteListUuid = "7c3535ab-988f-4c98-88c0-b73be3b9a90b";

describe("listmonk integration", () => {
  it("monta payload do formulario publico com lista homesite e somente email", () => {
    const payload = buildListmonkFormPayload({ email: "  Pessoa@Exemplo.com ", source: "newsletter-home" }, homesiteListUuid);

    expect(payload.get("email")).toBe("pessoa@exemplo.com");
    expect(payload.get("l")).toBe(homesiteListUuid);
    expect(payload.get("nonce")).toBe("");
    expect(payload.has("name")).toBe(false);
  });

  it("monta cadastro via API sem nome quando a API for usada como fallback", () => {
    expect(
      buildListmonkSubscriberPayload({ email: "  Pessoa@Exemplo.com ", source: "newsletter-home" }, [7]),
    ).toEqual({
      email: "pessoa@exemplo.com",
      status: "enabled",
      lists: [7],
      preconfirm_subscriptions: false,
      attribs: {
        source: "newsletter-home",
        consent: "site_opt_in",
      },
    });
  });

  it("não tenta enviar para Listmonk quando configuração está incompleta", () => {
    expect(getListmonkConfig({})).toEqual({ enabled: false });
  });

  it("prioriza o formulario publico do Listmonk com o UUID da lista homesite", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    const client = createListmonkClient(
      {
        LISTMONK_URL: "https://listmonk.casaloti.ia.br",
        LISTMONK_FORM_LIST_UUID: homesiteListUuid,
        LISTMONK_API_TOKEN: "token-nao-usado",
        LISTMONK_DEFAULT_LIST_ID: "7",
      },
      fetchMock,
    );

    const result = await client.upsertSubscriber({ email: "lead@casaloti.ia.br", source: "newsletter" });

    expect(result).toEqual({ ok: true, id: undefined });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://listmonk.casaloti.ia.br/subscription/form",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }),
    );
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain(`l=${encodeURIComponent(homesiteListUuid)}`);
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain("name=");
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).not.toContain("token-nao-usado");
  });
});
