import { beforeEach, describe, expect, it, vi } from "vitest";

// O login agora registra a sessão no banco para que ela possa ser revogada.
// O teste isola essa gravação: o que está sob teste é a decisão de autorizar,
// não a disponibilidade do Supabase.
const persistAdminSession = vi.fn(async () => true);

vi.mock("@/lib/server/admin-session", () => ({
  persistAdminSession: (...args: unknown[]) => persistAdminSession(...args),
}));

const { POST } = await import("./route");

beforeEach(() => {
  persistAdminSession.mockClear();
  persistAdminSession.mockResolvedValue(true);
});

describe("admin login route", () => {
  it("redireciona de volta para o admin quando senha do formulario falha", async () => {
    process.env.ADMIN_TEMP_PASSWORD = "senha-certa";
    process.env.ADMIN_SESSION_SECRET = "segredo-de-sessao";
    const form = new FormData();
    form.set("password", "senha-errada");

    const response = await POST(
      new Request("https://casaloti.ia.br/api/admin/login", {
        method: "POST",
        headers: { accept: "text/html" },
        body: form,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://casaloti.ia.br/admin?erro=senha");
  });

  it("redireciona para o painel quando senha temporaria confere", async () => {
    process.env.ADMIN_TEMP_PASSWORD = "senha-certa";
    process.env.ADMIN_SESSION_SECRET = "segredo-de-sessao";
    const form = new FormData();
    form.set("password", "senha-certa");

    const response = await POST(
      new Request("https://casaloti.ia.br/api/admin/login", {
        method: "POST",
        headers: { accept: "text/html" },
        body: form,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://casaloti.ia.br/admin");
    expect(response.headers.get("set-cookie")).toContain("casaloti_admin=");
  });

  it("resolve o dominio correto quando executado atras de proxy em 0.0.0.0:3000", async () => {
    process.env.ADMIN_TEMP_PASSWORD = "senha-certa";
    process.env.ADMIN_SESSION_SECRET = "segredo-de-sessao";
    const form = new FormData();
    form.set("password", "senha-errada");

    const response = await POST(
      new Request("http://0.0.0.0:3000/api/admin/login", {
        method: "POST",
        headers: {
          accept: "text/html",
          "x-forwarded-host": "casaloti.ia.br",
          "x-forwarded-proto": "https",
        },
        body: form,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://casaloti.ia.br/admin?erro=senha");
  });

  it("recusa o login quando a sessão não pode ser registrada", async () => {
    process.env.ADMIN_TEMP_PASSWORD = "senha-certa";
    process.env.ADMIN_SESSION_SECRET = "segredo-de-sessao";
    persistAdminSession.mockResolvedValue(false);

    const response = await POST(
      new Request("https://casaloti.ia.br/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "senha-certa" }),
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("responde 500 quando o segredo de sessao nao esta configurado", async () => {
    process.env.ADMIN_TEMP_PASSWORD = "senha-certa";
    delete process.env.ADMIN_SESSION_SECRET;

    const response = await POST(
      new Request("https://casaloti.ia.br/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "senha-certa" }),
      }),
    );

    expect(response.status).toBe(500);

    process.env.ADMIN_SESSION_SECRET = "segredo-de-sessao";
  });
});