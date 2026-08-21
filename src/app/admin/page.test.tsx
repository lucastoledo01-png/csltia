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
  it("mostra o painel de gestao de artigos e abas diretamente", () => {
    render(<AdminPage />);

    expect(screen.getByRole("heading", { name: /Painel de Gestão & Analytics/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gestão de Artigos/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Analytics/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Comentários/i })).toBeInTheDocument();
  });
});
