import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { TopoDoPortal } from "@/components/PortalChrome";

/**
 * A página busca os artigos publicados no Supabase. Sem este mock o teste
 * depende do conteúdo real do banco: ele passava ou falhava conforme o que
 * estivesse publicado em produção naquele momento.
 */
const artigoDeTeste = {
  slug: "ia-semana-sem-hype",
  category: "Radar",
  title: "A semana em IA sem aquele cheiro de palestra de LinkedIn",
  excerpt: "O que mudou em modelos, produtos e benchmarks, direto ao ponto.",
  description:
    "O que mudou em modelos, produtos e benchmarks, direto ao ponto. Um filtro simples para separar notícia útil de espuma antes do café esfriar.",
  date: "20 AGO 2026",
  readTime: "5 min",
  image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80",
  imageAlt: "Mesa de trabalho moderna com café e notebook exibindo gráficos",
  quote: "Se a notícia não muda sua rotina, ela ainda pode ser interessante.",
  quoteBy: "desbuguei.ia",
  sections: [],
};

vi.mock("@/lib/server/articles-service", () => ({
  getPublishedArticles: async () => [artigoDeTeste],
}));

const { default: ArticlesPage } = await import("./page");

describe("Articles index", () => {
  /**
   * A regra é a mesma de antes, e ela pegou um defeito real.
   *
   * O menu do portal é azul-marinho e o da landing anterior era branco. Quando
   * o topo vivia dentro da home, `/artigos` continuava com o branco, e o site
   * tinha dois menus conforme a página. O dono viu isso como "menu com texto
   * preto e fundo branco" num produto cujo topo é escuro.
   *
   * O rótulo mudou de "Navegação principal" para "Editorias" porque é isso que
   * o menu lista agora. A regra não mudou: as duas páginas usam o mesmo topo.
   */
  it("usa o mesmo padrão de menu da home", async () => {
    // A comparação é contra `TopoDoPortal`, que é a fonte única do topo. A
    // home é componente de servidor assíncrono e renderizá-la aqui traria o
    // banco junto, sem acrescentar nada à regra que este teste guarda.
    const { unmount } = render(<TopoDoPortal />);
    const homeNav = screen.getByLabelText("Editorias");
    const homeLinks = Array.from(homeNav.querySelectorAll("a")).map((link) => ({
      href: link.getAttribute("href"),
      text: link.textContent,
      className: link.className,
    }));
    const homeHeaderClass = homeNav.closest("header")?.className;
    unmount();

    render(await ArticlesPage());
    const articlesNav = screen.getByLabelText("Editorias");
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

    // O título anterior era da vertical de IA: "Artigos & Análises", com a
    // linha "Leitura quinzenal sobre IA, produtos e tecnologia sem hype".
    expect(screen.getByRole("heading", { level: 1, name: /Edições/i })).toBeInTheDocument();
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
