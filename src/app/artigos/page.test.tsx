import { render, screen } from "@testing-library/react";
import Home from "../page";
import ArticlesPage from "./page";

describe("Articles index", () => {
  it("usa o mesmo padrão de menu da home", async () => {
    const { unmount } = render(<Home />);
    const homeNav = screen.getByLabelText("Navegação principal");
    const homeLinks = Array.from(homeNav.querySelectorAll("a")).map((link) => ({
      href: link.getAttribute("href"),
      text: link.textContent,
      className: link.className,
    }));
    const homeHeaderClass = homeNav.closest("header")?.className;
    unmount();

    render(await ArticlesPage());
    const articlesNav = screen.getByLabelText("Navegação principal");
    const articlesLinks = Array.from(articlesNav.querySelectorAll("a")).map((link) => ({
      href: link.getAttribute("href"),
      text: link.textContent,
      className: link.className,
    }));

    expect(articlesNav.closest("header")?.className).toBe(homeHeaderClass);
    expect(articlesLinks).toEqual(homeLinks);
  });

  it("exibe o cabeçalho clean e a lista de artigos estilo Substack", async () => {
    render(await ArticlesPage());

    expect(screen.getByRole("heading", { level: 1, name: /Artigos & Análises/i })).toBeInTheDocument();
    expect(screen.getByLabelText("lista editorial de artigos")).toBeInTheDocument();
  });

  it("mostra cards com imagem real, descrição e link para artigo completo", async () => {
    render(await ArticlesPage());

    expect(screen.getAllByRole("img")[0]).toBeInTheDocument();
    expect(screen.getByText(/O que mudou em modelos, produtos e benchmarks/i)).toBeInTheDocument();
  });

  it("mantém estrutura de container responsivo", async () => {
    render(await ArticlesPage());

    const list = screen.getByLabelText("lista editorial de artigos");
    expect(list).toHaveClass("max-w-[760px]");
    expect(list).toHaveClass("mx-auto");
  });
});
