import { afterEach, describe, expect, it, vi } from "vitest";
import { pingHealthcheck, sendAlert } from "./alerts";

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
