import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { fotoNaLargura, HOSTS_OTIMIZAVEIS, hostOtimizavel } from "./imagem-da-capa";

/** A foto na largura da tela e a lista de hosts do otimizador (06/10/2026). */

const PEXELS_GRAVADA =
  "https://images.pexels.com/photos/27451140/pexels-photo-27451140.jpeg?auto=compress&amp%3Bcs=tinysrgb&amp%3Bdpr=2&amp%3Bh=650&amp%3Bw=940&w=600&h=360&fit=crop";

describe("fotoNaLargura", () => {
  it("pede ao Pexels a largura da manchete, sem altura nem corte, e limpa o &amp; torto", () => {
    const u = new URL(fotoNaLargura(PEXELS_GRAVADA, 1280));
    expect(u.hostname).toBe("images.pexels.com");
    expect(u.searchParams.get("w")).toBe("1280");
    expect(u.searchParams.has("h")).toBe(false);
    expect(u.searchParams.has("fit")).toBe(false);
    expect(u.searchParams.has("dpr")).toBe(false);
    expect(u.searchParams.get("auto")).toBe("compress");
    expect(u.toString()).not.toContain("amp");
  });

  it("no Commons é a miniatura, nunca o original de vários megabytes", () => {
    expect(fotoNaLargura("https://upload.wikimedia.org/wikipedia/commons/d/db/Wall_Street.jpg", 1280)).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Wall_Street.jpg/1280px-Wall_Street.jpg",
    );
  });

  it("host que não redimensiona fica como está, e vazio é vazio", () => {
    expect(fotoNaLargura("https://casaloti.ia.br/arte/a.png", 1280)).toBe("https://casaloti.ia.br/arte/a.png");
    expect(fotoNaLargura(null, 1280)).toBe("");
  });
});

describe("hosts do otimizador", () => {
  /*
   * `next/image` LANÇA com host fora de `images.remotePatterns`, e derruba a
   * página inteira (incidente do Commons, em `next.config.ts`). A lista que
   * decide quem passa pelo otimizador precisa ser a mesma do config.
   */
  it("é a mesma lista do next.config.ts", () => {
    const doConfig = (nextConfig.images?.remotePatterns ?? []).map((p) => ("hostname" in p ? p.hostname : ""));
    expect([...HOSTS_OTIMIZAVEIS].sort()).toEqual([...doConfig].sort());
  });

  it("só https e só host da lista", () => {
    expect(hostOtimizavel("https://images.pexels.com/a.jpeg")).toBe(true);
    expect(hostOtimizavel("http://images.pexels.com/a.jpeg")).toBe(false);
    expect(hostOtimizavel("https://exemplo.com/a.jpeg")).toBe(false);
    expect(hostOtimizavel("/marca/logo.png")).toBe(false);
  });
});
