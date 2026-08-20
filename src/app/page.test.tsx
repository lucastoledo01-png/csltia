import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Casaloti The News-inspired home", () => {
  it("apresenta hero de newsletter com logo e inscrição", () => {
    render(<Home />);

    expect(screen.getAllByRole("link", { name: /casaloti ia/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("heading", { name: /o_ jornal digital da ia/i })).toBeInTheDocument();
    expect(screen.getByText(/principais notícias de inteligência artificial/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /inscreva-se/i }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByLabelText(/email para newsletter/i)).toHaveLength(2);
  });

  it("inclui seções inspiradas no the news sem copiar assets", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: /mais inteligente em 5 minutos/i })).toBeInTheDocument();
    expect(screen.getByText(/criando bons hábitos/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /dúvidas/i })).toBeInTheDocument();
    expect(screen.getByText(/A newsletter é realmente gratuita/i)).toBeInTheDocument();
  });

  it("expõe automação e rotas do ecossistema", () => {
    render(<Home />);

    expect(screen.getByRole("link", { name: /streak/i })).toHaveAttribute("href", "/automacao");
    expect(screen.getByText(/automação 06:06/i)).toBeInTheDocument();
    expect(screen.getByText(/notícias úteis, não barulho/i)).toBeInTheDocument();
  });
});
