import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A falha do alerta vai para `platform_events`, e o sucesso não.
 *
 * Arquivo próprio porque o mock do cliente do Supabase precisa valer para o
 * módulo inteiro, e o `alerts.test.ts` confere justamente que, sem Supabase no
 * ambiente, nada além do Telegram é chamado.
 */

const inseridos: Array<{ tabela: string; linha: Record<string, unknown> }> = [];

vi.mock("./supabase-admin", () => ({
  getSupabaseAdminClient: () => ({
    from: (tabela: string) => ({
      insert: async (linha: Record<string, unknown>) => {
        inseridos.push({ tabela, linha });
        return { error: null };
      },
    }),
  }),
}));

vi.mock("./projects", () => ({ DEFAULT_PROJECT_ID: "proj-semente" }));

import { EVENTO_DE_ALERTA_FALHO, enviarAlerta } from "./alerts";

const AMBIENTE = {
  TELEGRAM_BOT_TOKEN: "BOT123",
  TELEGRAM_CHAT_ID: "42",
  NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "chave",
};

afterEach(() => {
  inseridos.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("gravação da falha do alerta", () => {
  it("Telegram recusou: grava o motivo, sem segredo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false, description: "Bad Request: chat not found" }), { status: 400 })),
    );

    const r = await enviarAlerta("warning", "Lembrete", undefined, AMBIENTE);

    expect(r.enviado).toBe(false);
    expect(inseridos).toHaveLength(1);
    expect(inseridos[0].tabela).toBe("platform_events");
    expect(inseridos[0].linha).toMatchObject({
      event_type: EVENTO_DE_ALERTA_FALHO,
      project_id: "proj-semente",
      payload: { alertType: "Lembrete", motivo: "telegram_recusou", status: 400, descricao: "Bad Request: chat not found" },
    });
    const texto = JSON.stringify(inseridos[0].linha);
    expect(texto).not.toContain("BOT123");
    expect(texto).not.toContain("chave");
  });

  it("sem token também é gravado: é o caso do canal não configurado", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const semToken = { ...AMBIENTE, TELEGRAM_BOT_TOKEN: "" };
    await enviarAlerta("critical", "Produção falhou", "x", semToken);
    expect(inseridos[0].linha).toMatchObject({ payload: { motivo: "sem_token", temToken: false, temChatId: true } });
  });

  it("enviado: nada gravado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const r = await enviarAlerta("info", "ok", undefined, AMBIENTE);
    expect(r.enviado).toBe(true);
    expect(inseridos).toHaveLength(0);
  });
});
