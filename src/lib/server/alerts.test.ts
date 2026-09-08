import { afterEach, describe, expect, it, vi } from "vitest";
import { enviarAlerta, pingHealthcheck, sendAlert } from "./alerts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendAlert", () => {
  it("no-opa (sem fetch, sem throw) quando o Telegram não está configurado", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const sent = await sendAlert("critical", "teste", "detalhe", {});

    expect(sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posta no endpoint do bot com chat_id e HTML quando configurado", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const sent = await sendAlert("warning", "Título <perigoso>", "corpo", {
      TELEGRAM_BOT_TOKEN: "BOT123",
      TELEGRAM_CHAT_ID: "42",
    });

    expect(sent).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/botBOT123/sendMessage");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.chat_id).toBe("42");
    expect(body.parse_mode).toBe("HTML");
    expect(body.text).toContain("Título &lt;perigoso&gt;"); // escapado
  });

  it("engole rejeição do fetch e devolve false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("rede fora");
    }));

    const sent = await sendAlert("info", "x", undefined, {
      TELEGRAM_BOT_TOKEN: "t",
      TELEGRAM_CHAT_ID: "c",
    });

    expect(sent).toBe(false);
  });
});

describe("pingHealthcheck", () => {
  it("no-opa quando a url é undefined", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await pingHealthcheck(undefined);
    await pingHealthcheck(undefined, "fail");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("acrescenta /fail e /start ao endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await pingHealthcheck("https://hc.example/abc");
    await pingHealthcheck("https://hc.example/abc/", "fail");
    await pingHealthcheck("https://hc.example/abc", "start");

    expect(fetchMock.mock.calls[0][0]).toBe("https://hc.example/abc");
    expect(fetchMock.mock.calls[1][0]).toBe("https://hc.example/abc/fail");
    expect(fetchMock.mock.calls[2][0]).toBe("https://hc.example/abc/start");
  });
});

describe("nenhuma falha de alerta é silenciosa", () => {
  const ENV = { TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHAT_ID: "123" };

  it("token ausente tem motivo nomeado, não só false", async () => {
    const r = await enviarAlerta("critical", "Redação falhou", "detalhe", { TELEGRAM_CHAT_ID: "123" });
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("sem_token");
    expect(r.descricao).toContain("TELEGRAM_BOT_TOKEN");
  });

  it("chat_id ausente é distinguido de token ausente", async () => {
    const r = await enviarAlerta("critical", "x", undefined, { TELEGRAM_BOT_TOKEN: "tok" });
    expect(r.motivo).toBe("sem_chat_id");
  });

  it("recusa do Telegram traz status e a description dele", async () => {
    /*
     * É esta a informação que faltava: "Telegram respondeu 400" sem o corpo
     * não diz se o chat está errado, se o bot foi removido do grupo ou se a
     * mensagem passou do limite. A `description` diz.
     */
    const fetchFalso = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: message is too long" }), {
        status: 400,
      }),
    );
    vi.stubGlobal("fetch", fetchFalso);

    const r = await enviarAlerta("critical", "Redação falhou", "detalhe", ENV);

    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("telegram_recusou");
    expect(r.status).toBe(400);
    expect(r.descricao).toBe("Bad Request: message is too long");
    vi.unstubAllGlobals();
  });

  it("erro de rede é distinguido de recusa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("socket hang up"); }));
    const r = await enviarAlerta("critical", "x", undefined, ENV);
    expect(r.motivo).toBe("erro_de_rede");
    expect(r.descricao).toContain("socket hang up");
    vi.unstubAllGlobals();
  });

  it("nenhum desfecho carrega o token", async () => {
    const r = await enviarAlerta("info", "x", "y", { TELEGRAM_BOT_TOKEN: "SEGREDO-AQUI", TELEGRAM_CHAT_ID: "1" }).catch(
      () => null,
    );
    expect(JSON.stringify(r ?? {})).not.toContain("SEGREDO-AQUI");
  });

  it("mensagem longa é cortada em vez de recusada", async () => {
    /*
     * O corte de 3500 é aplicado ao detalhe CRU e o escape vem depois. Um
     * stack trace cheio de `<` e `&` cresce até 4x no escape e passava de
     * 4096, e aí o Telegram responde 400 e o alerta não chega. Cortar é sempre
     * melhor que não mandar.
     */
    let enviado = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        enviado = JSON.parse(String(init?.body)).text;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );

    const r = await enviarAlerta("critical", "Redação falhou", "<&".repeat(1750), ENV);

    expect(r.enviado).toBe(true);
    expect(enviado.length).toBeLessThanOrEqual(4096);
    vi.unstubAllGlobals();
  });

  it("sendAlert continua devolvendo booleano para quem já usava", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    expect(await sendAlert("info", "x", undefined, ENV)).toBe(true);
    vi.unstubAllGlobals();
  });
});
