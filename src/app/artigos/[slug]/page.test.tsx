import { render, screen } from "@testing-library/react";
import ArticlePage from "./page";

describe("Article page", () => {
  it("renderiza um artigo completo com imagem, descrição, citação e corpo", async () => {
    render(await ArticlePage({ params: Promise.resolve({ slug: "ia-semana-sem-hype" }) }));

    expect(screen.getByRole("img", { name: /capa do artigo A semana em IA/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /A semana em IA sem aquele cheiro/i })).toBeInTheDocument();
    expect(screen.getByText(/O que mudou em modelos, produtos e benchmarks/i)).toBeInTheDocument();
    expect(screen.getByText(/Se a notícia não muda sua rotina/i)).toBeInTheDocument();
    expect(screen.getByText(/O teste do café/i)).toBeInTheDocument();
    expect(screen.getByText(/Voltar para artigos/i)).toHaveAttribute("href", "/artigos");
  });
});
