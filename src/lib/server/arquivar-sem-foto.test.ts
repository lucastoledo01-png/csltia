import { describe, expect, it } from "vitest";
import { motivoDoArtigoSemFoto, publicadasSemFoto } from "./arquivar-sem-foto";
import { escolherBandeira } from "./visual/bandeira";

/**
 * A lista que o dono recebe para decidir o que arquivar (05/10/2026): só
 * publicadas, só sem foto real, e a bandeira conta como sem foto.
 */
describe("matérias publicadas sem foto", () => {
  const bandeira = escolherBandeira({}).imageUrl;

  it("capa vazia e bandeira são sem foto; foto comum não é", () => {
    expect(motivoDoArtigoSemFoto({ cover_image: null })).toBe("capa_vazia");
    expect(motivoDoArtigoSemFoto({ cover_image: "  " })).toBe("capa_vazia");
    expect(motivoDoArtigoSemFoto({ cover_image: bandeira })).toBe("bandeira");
    expect(motivoDoArtigoSemFoto({ cover_image: `${bandeira}?w=600` })).toBe("bandeira");
    expect(motivoDoArtigoSemFoto({ cover_image: "https://x/fed.jpg" })).toBeNull();
  });

  it("só entra o que está publicado, mais recente primeiro", () => {
    const lista = publicadasSemFoto([
      { slug: "velha", cover_image: null, status: "published", published_at: "2026-09-01T00:00:00Z" },
      { slug: "com-foto", cover_image: "https://x/a.jpg", status: "published", published_at: "2026-10-01T00:00:00Z" },
      { slug: "rascunho", cover_image: null, status: "draft", published_at: "2026-10-02T00:00:00Z" },
      { slug: "nova", cover_image: bandeira, status: "published", published_at: "2026-10-03T00:00:00Z" },
    ]);
    expect(lista.map((a) => [a.slug, a.motivo])).toEqual([
      ["nova", "bandeira"],
      ["velha", "capa_vazia"],
    ]);
  });
});
