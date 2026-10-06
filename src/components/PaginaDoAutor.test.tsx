import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaginaDoAutor } from "./PaginaDoAutor";
import type { Autor } from "@/lib/autores";
import { juntarPautasEArtigos } from "@/lib/server/portal";

const autor: Autor = {
  id: "a1",
  project_id: "p1",
  slug: "ana-silva",
  nome: "Ana Silva",
  cargo: "Editora de Economia",
  minibio: "Cobre juros, mercado e o bolso de quem olha para os EUA.",
  foto_url: "https://azqpdesusdzqndvsqmko.supabase.co/storage/v1/object/public/public_assets/autores/p/ana.jpg",
  area: "economia",
  redes: { instagram: "https://www.instagram.com/ana.silva/", linkedin: "https://www.linkedin.com/in/ana-silva", x: "", site: "" },
  ativo: true,
};

// As matérias passam pela MESMA função que a rota usa para virar card.
const pautas = juntarPautasEArtigos(
  [],
  [
    { slug: "fed-mantem-juros", title: "Fed mantém juros nos EUA", excerpt: "Resumo.", cover_image: null, category: "Economia", published_at: "2026-10-05T12:00:00Z", source_urls: null },
    { slug: "dolar-cai", title: "Dólar cai depois do Fed", excerpt: "", cover_image: "https://images.pexels.com/photos/1/a.jpeg", category: "Economia", published_at: "2026-10-04T12:00:00Z", source_urls: null },
  ],
);

describe("página do autor", () => {
  it("mostra foto, nome, cargo, área com link, minibio e as redes", () => {
    const { container } = render(<PaginaDoAutor autor={autor} pautas={pautas} />);
    const cabecalho = container.querySelector("main header") as HTMLElement;
    expect(screen.getByRole("heading", { level: 1, name: "Ana Silva" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Foto de Ana Silva" })).toHaveAttribute("src", autor.foto_url);
    expect(screen.getByText("Editora de Economia")).toBeInTheDocument();
    expect(within(cabecalho).getByRole("link", { name: "Economia" })).toHaveAttribute("href", "/editoria/economia");
    expect(screen.getByText(/Cobre juros, mercado/)).toBeInTheDocument();
    const redes = screen.getByRole("list", { name: "Redes de Ana Silva" });
    expect(within(redes).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      "https://www.instagram.com/ana.silva/",
      "https://www.linkedin.com/in/ana-silva",
    ]);
  });

  it("lista as matérias no card do feed, mais recente primeiro, e tem UMA caixa de assinatura", () => {
    const { container } = render(<PaginaDoAutor autor={autor} pautas={pautas} />);
    const lista = screen.getByRole("region", { name: "Matérias de Ana Silva" });
    const links = within(lista)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect([...new Set(links)]).toEqual(["/artigos/fed-mantem-juros", "/artigos/dolar-cai"]);
    expect(container.querySelectorAll("#newsletter")).toHaveLength(1);
  });

  it("sem foto, sem rede e sem matéria: inicial, nenhuma fileira de redes e o aviso", () => {
    const { container } = render(
      <PaginaDoAutor autor={{ ...autor, foto_url: null, redes: {}, area: "Mercado imobiliário" }} pautas={[]} />,
    );
    expect(container.querySelector("main header img")).toBeNull();
    expect(screen.queryByRole("list", { name: /Redes de/ })).toBeNull();
    expect(screen.getByText("Mercado imobiliário").tagName).toBe("SPAN");
    expect(screen.getByText("Ainda não há matérias assinadas por Ana Silva.")).toBeInTheDocument();
  });
});
