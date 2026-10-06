import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A rota `/autor/<slug>` com o banco de mentira: autor ativo abre com a
 * ProfilePage e o canônico; desativado ou inexistente é 404; sem matéria, a
 * página abre e fica fora do índice.
 */

const autorPeloSlug = vi.fn();
const materiasDoAutor = vi.fn();

vi.mock("@/lib/server/autores", () => ({
  autorPeloSlug: (...a: unknown[]) => autorPeloSlug(...a),
  materiasDoAutor: (...a: unknown[]) => materiasDoAutor(...a),
}));

vi.mock("@/lib/server/projects", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/server/projects")>();
  return { ...real, getProjectById: async () => ({ timezone: "America/Sao_Paulo" }) };
});

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: () => notFound(),
}));

const { default: AutorPage, generateMetadata } = await import("./page");

const ANA = {
  id: "a1",
  project_id: "00000000-0000-4000-8000-000000000001",
  slug: "ana-silva",
  nome: "Ana Silva",
  cargo: "Editora de Economia",
  minibio: "Cobre juros e mercado.",
  foto_url: null,
  area: "economia",
  redes: {},
  ativo: true,
};

const MATERIA = {
  slug: "fed-mantem-juros",
  title: "Fed mantém juros nos EUA",
  excerpt: "",
  cover_image: null,
  category: "Economia",
  published_at: "2026-10-05T12:00:00Z",
  source_urls: null,
};

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  autorPeloSlug.mockReset().mockResolvedValue(ANA);
  materiasDoAutor.mockReset().mockResolvedValue([MATERIA]);
  notFound.mockClear();
});

describe("rota do autor", () => {
  it("abre com nome, matérias e a ProfilePage no JSON-LD", async () => {
    const { container } = render(await AutorPage(params("ana-silva")));
    expect(screen.getByRole("heading", { level: 1, name: "Ana Silva" })).toBeInTheDocument();
    expect(container.querySelector('a[href="/artigos/fed-mantem-juros"]')).not.toBeNull();
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.innerHTML);
    expect(ld["@graph"].map((n: { "@type": string }) => n["@type"])).toEqual(["Organization", "ProfilePage", "ItemList"]);
  });

  it("metadados com canônico e indexável quando há matéria", async () => {
    const m = await generateMetadata(params("ana-silva"));
    expect(m.alternates?.canonical).toBe("https://casaloti.ia.br/autor/ana-silva");
    expect(m.title).toEqual({ absolute: "Ana Silva | eua.journal" });
    expect(m.description).toBe("Cobre juros e mercado.");
    expect(m.robots).toBeUndefined();
  });

  it("sem matéria publicada: a página abre, mas fora do índice", async () => {
    materiasDoAutor.mockResolvedValue([]);
    const m = await generateMetadata(params("ana-silva"));
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("NÃO: autor inexistente ou desativado é 404", async () => {
    autorPeloSlug.mockResolvedValue(null);
    await expect(AutorPage(params("ninguem"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await generateMetadata(params("ninguem"))).toEqual({});
  });
});
