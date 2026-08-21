import { render, screen } from "@testing-library/react";
import { cookies } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "./page";
import { signAdminSession } from "@/lib/server/admin-auth";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

const mockedCookies = vi.mocked(cookies);

function mockCookieStore(token?: string) {
  mockedCookies.mockResolvedValue({
    get: (name: string) => (name === "casaloti_admin" && token ? { name, value: token } : undefined),
  } as Awaited<ReturnType<typeof cookies>>);
}

describe("Admin dashboard", () => {
  it("mostra o painel de gestao de artigos diretamente", async () => {
    render(await AdminPage());

    expect(screen.getByRole("heading", { name: /gestao de artigos/i })).toBeInTheDocument();
    expect(screen.getAllByText(/rascunho novo/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText(/^titulo$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/resumo age/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salvar artigo/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Listmonk/i).length).toBeGreaterThanOrEqual(1);
  });
});
