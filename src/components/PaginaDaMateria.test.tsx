import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaginaDaMateria, type MateriaDaPagina } from "./PaginaDaMateria";

const WALL_STREET =
  "https://upload.wikimedia.org/wikipedia/commons/d/db/New_York_City_%28New_York%2C_USA%29%2C_Wall_Street_--_2012_--_6614.jpg";

/**
 * O defeito que o dono viu em 05/10/2026: a capa e, logo abaixo, a mesma foto
 * de novo, porque o HTML da edição traz a foto dentro do corpo. O endereço no
 * corpo tem `&amp;` e tamanho diferente do da capa de propósito.
 */
const materia: MateriaDaPagina = {
  slug: "hollywood-2026-10-04",
  title: "Hollywood nos EUA atrai capital privado para filmes independentes",
  description: "Investidores privados entram no financiamento de Hollywood.",
  category: "Economia",
  cover_image: WALL_STREET,
  published_at: "2026-10-04T09:29:38.729Z",
  updated_at: "2026-10-04T09:29:38.729Z",
  content_html:
    `<img src="${WALL_STREET}?w=600&amp;h=360" alt="" />` +
    `<p style="font-size:12px">Dietmar Rabich, CC BY-SA 4.0, via Wikimedia Commons</p>` +
    `<section><p>Investidores privados estão entrando no financiamento de Hollywood.</p></section>` +
    `<p class="fonte">Fonte: <a href="https://www.cnbc.com/x">CNBC</a></p>`,
  aeo_questions: [{ pergunta: "Quanto tempo leva uma produção independente?", resposta: "Cerca de um ano." }],
};

function jsonLd(container: HTMLElement): Record<string, unknown> {
  const script = container.querySelector('script[type="application/ld+json"]');
  return JSON.parse(script?.innerHTML ?? "{}");
}

describe("PaginaDaMateria", () => {
  it("a foto da capa aparece uma vez, e o crédito dela fica embaixo da capa", () => {
    const { container } = render(<PaginaDaMateria article={materia} comComentarios={false} />);
    const fotos = [...container.querySelectorAll("img")].filter((i) => (i.getAttribute("src") ?? "").includes("Wall_Street"));
    expect(fotos).toHaveLength(1);
    expect(container.querySelector("figcaption")?.textContent).toBe("Dietmar Rabich, CC BY-SA 4.0, via Wikimedia Commons");
    expect(container.querySelector(".artigo-corpo")?.innerHTML).not.toContain("Dietmar Rabich");
  });

  it("mostra as perguntas e respostas e só então marca o FAQPage", () => {
    const { container } = render(<PaginaDaMateria article={materia} comComentarios={false} />);
    expect(screen.getByRole("heading", { name: "Perguntas e respostas" })).toBeInTheDocument();
    expect(screen.getByText("Quanto tempo leva uma produção independente?")).toBeInTheDocument();
    const grafo = jsonLd(container)["@graph"] as Array<Record<string, unknown>>;
    expect(grafo.map((n) => n["@type"])).toEqual(["Organization", "NewsArticle", "BreadcrumbList", "FAQPage"]);
  });

  it("sem pergunta, sem FAQPage", () => {
    const { container } = render(<PaginaDaMateria article={{ ...materia, aeo_questions: [] }} comComentarios={false} />);
    const grafo = jsonLd(container)["@graph"] as Array<Record<string, unknown>>;
    expect(grafo.some((n) => n["@type"] === "FAQPage")).toBe(false);
    expect(screen.queryByRole("heading", { name: "Perguntas e respostas" })).toBeNull();
  });

  it("a linha fina que repete o começo do lide não aparece duas vezes", () => {
    const repetida = { ...materia, description: "Investidores privados estão entrando no financiamento de Hollywood." };
    const { container } = render(<PaginaDaMateria article={repetida} comComentarios={false} />);
    expect(container.querySelector("article")?.textContent?.split("Investidores privados estão entrando").length).toBe(2);
    render(<PaginaDaMateria article={materia} comComentarios={false} />);
    expect(screen.getByText("Investidores privados entram no financiamento de Hollywood.")).toBeInTheDocument();
  });

  it("o JSON-LD sai com < escapado", () => {
    const { container } = render(
      <PaginaDaMateria article={{ ...materia, title: "Título com </script> no meio" }} comComentarios={false} />,
    );
    const bruto = container.querySelector('script[type="application/ld+json"]')?.innerHTML ?? "";
    expect(bruto).not.toContain("</script>");
    expect(bruto).toContain("\\u003c/script>");
  });
});
