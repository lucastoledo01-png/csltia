import { describe, expect, it } from "vitest";
import { POST } from "./route";

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
});
