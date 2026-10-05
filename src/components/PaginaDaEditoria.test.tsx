import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaginaDaEditoria } from "./PaginaDaEditoria";
import type { PautaDoPortal } from "@/lib/server/portal";

function pauta(i: number): PautaDoPortal {
  return {
    id: `p${i}`,
    titulo: `Pauta de economia ${i}`,
    resumo: "Resumo com **negrito**.",
    rotulo: "Economia",
    editoria: "economia",
    imagem: i === 1 ? null : `https://images.pexels.com/photos/${i}/a.jpeg`,
    fonte: "CNBC",
    data: "2026-10-04",
    href: `/artigos/pauta-${i}`,
  };
}

describe("página de editoria", () => {
  it("abre pelo nome e pela descrição da editoria, e lista as pautas no card do feed", () => {
    render(<PaginaDaEditoria editoria="economia" pautas={[pauta(0), pauta(1), pauta(2)]} />);

    expect(screen.getByRole("heading", { level: 1, name: "Economia" })).toBeInTheDocument();
    expect(screen.getByText(/economia americana/)).toBeInTheDocument();
    const lista = screen.getByRole("region", { name: "Notícias de Economia" });
    const links = within(lista)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    // A primeira aparece duas vezes: a versão grande do celular e a linha do computador.
    expect([...new Set(links)]).toEqual(["/artigos/pauta-0", "/artigos/pauta-1", "/artigos/pauta-2"]);
  });

  it("tem UMA caixa de assinatura e leva às outras editorias, sem repetir a atual", () => {
    const { container } = render(<PaginaDaEditoria editoria="economia" pautas={[pauta(0)]} />);

    expect(container.querySelectorAll("#newsletter")).toHaveLength(1);
    const outras = screen.getByRole("navigation", { name: "Outras editorias" });
    expect(outras.querySelector('a[href="/editoria/brasil"]')).not.toBeNull();
    expect(outras.querySelector('a[href="/editoria/economia"]')).toBeNull();
  });

  it("sem pauta, diz que ainda não há, em vez de página vazia", () => {
    render(<PaginaDaEditoria editoria="brasil" pautas={[]} />);
    expect(screen.getByText(/Ainda não há notícias de Brasil/)).toBeInTheDocument();
  });
});
