import { describe, expect, it } from "vitest";
import { areaDoAutor, linksDasRedes, normalizarRede, pessoaDoAutor, slugDoAutor, validarAutor } from "./autores";

describe("slug do autor", () => {
  it("sem acento, minúsculo, com hífen", () => {
    expect(slugDoAutor("  Ana Luíza São João  ")).toBe("ana-luiza-sao-joao");
    expect(slugDoAutor("!!!")).toBe("");
  });
});

describe("redes", () => {
  it("Instagram e X aceitam @perfil, perfil com ponto e o link inteiro", () => {
    expect(normalizarRede("instagram", "@ana.silva")).toBe("https://www.instagram.com/ana.silva/");
    expect(normalizarRede("instagram", "ana.silva")).toBe("https://www.instagram.com/ana.silva/");
    expect(normalizarRede("instagram", "https://instagram.com/ana_silva?igsh=x")).toBe("https://www.instagram.com/ana_silva/");
    expect(normalizarRede("x", "https://twitter.com/ana")).toBe("https://x.com/ana");
    expect(normalizarRede("x", "@ana")).toBe("https://x.com/ana");
  });

  it("NÃO: link de outra rede no campo errado é recusado", () => {
    expect(normalizarRede("instagram", "https://x.com/ana")).toBeNull();
    expect(normalizarRede("linkedin", "ana")).toBeNull();
    expect(normalizarRede("linkedin", "https://evil.com/in/ana")).toBeNull();
  });

  it("LinkedIn só pelo link do perfil, e o site vira https", () => {
    expect(normalizarRede("linkedin", "linkedin.com/in/ana-silva/")).toBe("https://www.linkedin.com/in/ana-silva");
    expect(normalizarRede("site", "http://ana.com.br")).toBe("https://ana.com.br/");
  });

  it("os links saem na ordem fixa, só os válidos", () => {
    const links = linksDasRedes({ site: "ana.com.br", instagram: "@ana", linkedin: "lixo" });
    expect(links.map((l) => l.id)).toEqual(["instagram", "site"]);
  });
});

describe("validarAutor", () => {
  it("cria com slug derivado do nome e ativo por padrão", () => {
    const v = validarAutor({ nome: "Ana Silva", redes: { instagram: "@ana" } });
    expect(v).toEqual({
      ok: true,
      campos: expect.objectContaining({ nome: "Ana Silva", slug: "ana-silva", ativo: true, redes: { instagram: "https://www.instagram.com/ana/" } }),
    });
  });

  it("NÃO: sem nome, foto sem https e rede irreconhecível", () => {
    expect(validarAutor({ nome: "  " }).ok).toBe(false);
    expect(validarAutor({ nome: "Ana", foto_url: "http://a.com/f.jpg" }).ok).toBe(false);
    expect(validarAutor({ nome: "Ana", redes: { linkedin: "ana" } }).ok).toBe(false);
  });

  it("edição parcial só mexe no que veio", () => {
    expect(validarAutor({ ativo: false }, true)).toEqual({ ok: true, campos: { ativo: false } });
    expect(validarAutor({}, true).ok).toBe(false);
  });
});

describe("área e Person", () => {
  it("id de editoria vira link; texto livre fica texto", () => {
    expect(areaDoAutor("economia")).toEqual({ nome: "Economia", href: "/editoria/economia" });
    expect(areaDoAutor("Mercado imobiliário")).toEqual({ nome: "Mercado imobiliário", href: null });
    expect(areaDoAutor("")).toBeNull();
  });

  it("Person sem campo vazio: sem foto não há image, sem rede não há sameAs", () => {
    const p = pessoaDoAutor({ slug: "ana", nome: "Ana", cargo: "", foto_url: null, redes: {} });
    expect(p).toEqual({
      "@type": "Person",
      "@id": "https://casaloti.ia.br/autor/ana#pessoa",
      name: "Ana",
      url: "https://casaloti.ia.br/autor/ana",
      worksFor: { "@id": "https://casaloti.ia.br/#organizacao" },
    });
  });
});
