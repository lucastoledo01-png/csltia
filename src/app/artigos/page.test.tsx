import { render, screen } from "@testing-library/react";
import ArticlesPage from "./page";

describe("Articles index", () => {
  it("renderiza uma área de artigos inspirada em Substack", () => {
    render(<ArticlesPage />);

    expect(screen.getByRole("heading", { name: /artigos/i })).toBeInTheDocument();
    expect(screen.getByText(/edições, ensaios e prompts/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /assinar/i })).toHaveClass("cta-gradient");
    expect(screen.getByRole("link", { name: /comece por aqui/i })).toHaveAttribute("href", "/newsletter");
  });

  it("mostra posts em lista editorial com categorias e datas", () => {
    render(<ArticlesPage />);

    expect(screen.getByRole("heading", { name: /A semana em IA sem aquele cheiro/i })).toBeInTheDocument();
    expect(screen.getByText(/Radar/)).toBeInTheDocument();
    expect(screen.getByText(/20 AGO 2026/)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/placeholder visual do artigo/i).length).toBeGreaterThanOrEqual(4);
  });

  it("não reutiliza a home como página de artigos", () => {
    render(<ArticlesPage />);

    expect(screen.queryByText(/anti-spam entra aqui/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /while IA atualiza/i })).not.toBeInTheDocument();
  });

  it("mantém estrutura responsiva para mobile, tablet e desktop", () => {
    render(<ArticlesPage />);

    const list = screen.getByLabelText("lista editorial de artigos");
    expect(list).toHaveClass("grid");
    expect(list).toHaveClass("md:grid-cols-2");
    expect(list).toHaveClass("lg:grid-cols-3");
  });
});
