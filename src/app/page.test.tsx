import { render, screen } from "@testing-library/react";
import Home from "./page";
import { MARCA } from "@/lib/marca";

describe("home do portal", () => {
  it("exibe o formulário de inscrição na newsletter", () => {
    render(<Home />);

    const button = screen.getByRole("button", { name: /inscreva-se/i });
    expect(button).toBeInTheDocument();
  });

  it("mantém o menu limpo", () => {
    render(<Home />);

    expect(screen.getAllByRole("link", { name: /ultraprompts/i })[0]).toHaveAttribute("href", "/ultraprompts");
    expect(screen.getAllByRole("link", { name: /artigos/i })[0]).toHaveAttribute("href", "/artigos");
    expect(screen.getAllByRole("link", { name: /formações/i })[0]).toHaveAttribute("href", "/formacoes");
  });

  it("exibe a marca no topo", () => {
    // Afirma contra `MARCA`, não contra o texto literal: o nome já mudou uma
    // vez, e um teste que repete a string vira o último lugar onde a marca
    // antiga sobrevive.
    render(<Home />);

    expect(screen.getAllByRole("link", { name: new RegExp(MARCA.nome, "i") }).length).toBeGreaterThanOrEqual(1);
  });

  it("exibe a headline principal", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("exibe a seção de dúvidas frequentes", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: /Perguntas Frequentes/i })).toBeInTheDocument();
  });
});
