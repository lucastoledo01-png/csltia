import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import AdminPage from "./page";
import { MARCA } from "@/lib/marca";

describe("Admin dashboard", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("exibe formulário de login quando não estiver autenticado", () => {
    render(<AdminPage />);

    expect(screen.getByRole("heading", { name: /Painel de Controle/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Entrar no Painel/i })).toBeInTheDocument();
  });

  it("libera o painel de gestão quando a sessão estiver autenticada", () => {
    sessionStorage.setItem("casaloti_admin_authed", "true");
    render(<AdminPage />);

    expect(screen.getByRole("heading", { name: new RegExp(`Central ${MARCA.nome}`, "i") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Redação \(IA\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sistema PROMPT/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CMS Artigos/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Analytics/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Comentários/i })).toBeInTheDocument();
  });
});
