import { render, screen } from "@testing-library/react";
import ArticlePage from "./page";
import { articles } from "@/lib/editorial";

describe("Article page", () => {
  it("renderiza um artigo completo com imagem, título, descrição e corpo", async () => {
    // O slug sai de `articles`, não escrito à mão. A versão anterior apontava
    // para um artigo da vertical antiga e quebrou no dia em que ele foi
    // apagado, o que fez o teste falhar por conteúdo, não por regressão.
    const artigo = articles[0];

    render(await ArticlePage({ params: Promise.resolve({ slug: artigo.slug }) }));

    expect(screen.getByRole("heading", { name: artigo.title })).toBeInTheDocument();
    // O renderizador usa o título como `alt` da capa, não o `imageAlt` do
    // registro. Afirmar contra o que a página de fato produz.
    expect(screen.getByRole("img", { name: artigo.title })).toBeInTheDocument();
    expect(screen.getByText(artigo.description)).toBeInTheDocument();
    expect(screen.getByText(artigo.sections[0].heading)).toBeInTheDocument();
    expect(screen.getByText(/Voltar para todos os artigos/i)).toHaveAttribute("href", "/artigos");
  });
});
