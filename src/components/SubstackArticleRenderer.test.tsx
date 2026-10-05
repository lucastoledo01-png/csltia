import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SubstackArticleRenderer } from "./SubstackArticleRenderer";

describe("página da matéria", () => {
  it("o link do WhatsApp sai do servidor com o canônico e, no clique, leva o endereço que o navegador mostra", () => {
    render(<SubstackArticleRenderer title="Uma matéria" shareUrl="https://casaloti.ia.br/artigos/uma-materia" />);
    const link = screen.getByRole("link", { name: /Compartilhar no WhatsApp/ }) as HTMLAnchorElement;
    expect(decodeURIComponent(link.href)).toContain("https://casaloti.ia.br/artigos/uma-materia");

    window.history.pushState({}, "", "/artigos/uma-materia?utm_source=x#topo");
    fireEvent.click(link);
    const texto = decodeURIComponent(link.href.split("text=")[1]);
    expect(texto).toContain(`${window.location.origin}/artigos/uma-materia`);
    expect(texto).not.toContain("utm_source");
    expect(texto).not.toContain("#topo");
  });

  it("a capa tem alt descritivo e legenda com a descrição e o crédito", () => {
    render(
      <SubstackArticleRenderer
        title="Uma matéria"
        coverImage="https://images.pexels.com/photos/1/foto.jpeg"
        coverDescription="Edifícios altos vistos de baixo."
        coverCredit="Foto: Fulano, Pexels"
      />,
    );
    expect(screen.getByRole("img").getAttribute("alt")).toBe("Edifícios altos vistos de baixo.");
    const legenda = document.querySelector("figure figcaption");
    expect(legenda?.textContent).toContain("Edifícios altos vistos de baixo.");
    expect(legenda?.textContent).toContain("Foto: Fulano, Pexels");
  });

  it("a fileira de assuntos aparece em texto puro, sem link, e some quando não há assunto", () => {
    const { rerender } = render(<SubstackArticleRenderer title="Uma matéria" topics={["data centers", "Chicago"]} />);
    const fileira = screen.getByRole("heading", { name: "Assuntos" }).parentElement!;
    expect(fileira.textContent).toContain("data centers");
    expect(fileira.querySelector("a")).toBeNull();
    rerender(<SubstackArticleRenderer title="Uma matéria" topics={[]} />);
    expect(screen.queryByRole("heading", { name: "Assuntos" })).toBeNull();
  });
});
