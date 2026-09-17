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

  /**
   * Este teste afirmava o contrario, e o contrario quebrou a producao.
   *
   * Ele exigia que o formulario publico tivesse precedencia mesmo havendo token,
   * e chamava o token de "token-nao-usado". Em 17/09/2026 o dono tornou a lista
   * `homesite` privada, para que ela sumisse da pagina publica de inscricao. O
   * endpoint de formulario do Listmonk so aceita lista PUBLICA, e passou a
   * responder HTTP 400 "UUID invalido", reproduzido contra o servidor real.
   *
   * O teste continuava verde, porque ele fixava a escolha do modo e nunca a
   * consequencia dela. Inverter a precedencia e o conserto; trocar o teste junto
   * e o reconhecimento de que ele guardava a regra errada.
   */
  it("usa a API quando ha token, porque ela aceita lista privada", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { id: 42 } }), { status: 200 }));
    const client = createListmonkClient(
      {
        LISTMONK_URL: "https://listmonk.casaloti.ia.br",
        LISTMONK_FORM_LIST_UUID: homesiteListUuid,
        LISTMONK_API_TOKEN: "token-de-teste",
        LISTMONK_DEFAULT_LIST_ID: "7",
      },
      fetchMock,
    );

    const result = await client.upsertSubscriber({ email: "lead@casaloti.ia.br", source: "newsletter" });

    expect(result).toEqual({ ok: true, id: 42 });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://listmonk.casaloti.ia.br/api/subscribers");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).lists).toEqual([7]);
  });

  /** Sem token nao ha escolha: o formulario publico e o unico caminho. */
  it("cai no formulario publico quando nao ha token", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    const client = createListmonkClient(
      {
        LISTMONK_URL: "https://listmonk.casaloti.ia.br",
        LISTMONK_FORM_LIST_UUID: homesiteListUuid,
        LISTMONK_DEFAULT_LIST_ID: "7",
      },
      fetchMock,
    );

    await client.upsertSubscriber({ email: "lead@casaloti.ia.br", source: "newsletter" });

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://listmonk.casaloti.ia.br/subscription/form");
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain(`l=${encodeURIComponent(homesiteListUuid)}`);
  });

  /** A volta deliberada ao formulario, para quem quiser o comportamento antigo. */
  it("LISTMONK_FORCE_FORM devolve a precedencia ao formulario publico", () => {
    const config = getListmonkConfig({
      LISTMONK_URL: "https://listmonk.casaloti.ia.br",
      LISTMONK_FORM_LIST_UUID: homesiteListUuid,
      LISTMONK_API_TOKEN: "token-de-teste",
      LISTMONK_FORCE_FORM: "true",
    });
    expect(config).toMatchObject({ enabled: true, mode: "form" });
  });

  /**
   * O que tornou o estrago invisivel: com o Listmonk recusando, o cliente
   * devolve `ok: false`, e a rota `/api/newsletter` responde `ok: true` assim
   * mesmo. O visitante le "inscrito" e nunca recebe edicao nenhuma.
   */
  it("recusa do Listmonk chega como ok:false, com motivo", async () => {
    const fetchMock = vi.fn(async () => new Response("UUID invalido", { status: 400 }));
    const client = createListmonkClient(
      {
        LISTMONK_URL: "https://listmonk.casaloti.ia.br",
        LISTMONK_FORM_LIST_UUID: homesiteListUuid,
        LISTMONK_FORCE_FORM: "true",
        LISTMONK_API_TOKEN: "token-de-teste",
      },
      fetchMock,
    );

    const result = await client.upsertSubscriber({ email: "lead@casaloti.ia.br", source: "newsletter" });

    expect(result).toMatchObject({ ok: false, reason: "listmonk_form_request_failed" });
  });
});
