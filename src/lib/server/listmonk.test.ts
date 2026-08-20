import { describe, expect, it, vi } from "vitest";
import { buildListmonkSubscriberPayload, createListmonkClient, getListmonkConfig } from "./listmonk";

describe("listmonk integration", () => {
  it("monta cadastro de lead com lista, atributos e consentimento", () => {
    expect(
      buildListmonkSubscriberPayload({ email: "  Pessoa@Exemplo.com ", source: "newsletter-home" }, [7]),
    ).toEqual({
      email: "pessoa@exemplo.com",
      name: "",
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

  it("envia subscriber via API com token sem expor segredo no payload", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { id: 123 } }), { status: 200 }));
    const client = createListmonkClient(
      {
        LISTMONK_URL: "https://mail.casaloti.ia.br",
        LISTMONK_API_TOKEN: "token-secreto",
        LISTMONK_DEFAULT_LIST_ID: "7",
      },
      fetchMock,
    );

    const result = await client.upsertSubscriber({ email: "lead@casaloti.ia.br", source: "newsletter" });

    expect(result).toEqual({ ok: true, id: 123 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mail.casaloti.ia.br/api/subscribers",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "token token-secreto" }),
      }),
    );
    expect(JSON.stringify(fetchMock.mock.calls[0][1]?.body)).not.toContain("token-secreto");
  });
});
