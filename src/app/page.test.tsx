import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Casaloti home", () => {
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

  it("exibe a logo no topo", () => {
    render(<Home />);

    expect(screen.getAllByAltText(/Casaloti IA/i).length).toBeGreaterThanOrEqual(1);
  });

  it("exibe a headline clean e institucional", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: /Inteligência Artificial explicada de forma clara/i })).toBeInTheDocument();
  });

  it("exibe a seção de dúvidas frequentes", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: /Perguntas Frequentes/i })).toBeInTheDocument();
  });
});
