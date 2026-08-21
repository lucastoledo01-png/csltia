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

  it("entra direto nos blocos de artigos sem headline e subheadline editorial", async () => {
    render(await ArticlesPage());

    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByText(/artigos com alma de Substack/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/edições, ensaios e prompts/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("lista editorial de artigos")).toBeInTheDocument();
  });

  it("mostra cards com imagem real, descrição e link para artigo completo", async () => {
    render(await ArticlesPage());

    expect(screen.getAllByRole("img", { name: /capa do artigo/i })[0]).toBeInTheDocument();
    expect(screen.getByText(/O que mudou em modelos, produtos e benchmarks/i)).toBeInTheDocument();
  });

  it("mantém estrutura responsiva para mobile, tablet e desktop", async () => {
    render(await ArticlesPage());

    const list = screen.getByLabelText("lista editorial de artigos");
    expect(list).toHaveClass("grid");
    expect(list).toHaveClass("md:grid-cols-2");
    expect(list).toHaveClass("lg:grid-cols-3");
  });
});
