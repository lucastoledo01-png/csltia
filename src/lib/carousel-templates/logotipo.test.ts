import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chromeHeader, logoParaOFundo } from "./chrome";
import { overlayBrand } from "./shell";
import { layoutInicial } from "./layouts-iniciais";
import { logoDoSite, MARCA } from "@/lib/marca";

/**
 * O logotipo entregue pelo dono em 05/10/2026.
 *
 * Antes dele, os arquivos que o `marca.ts` apontava ainda desenhavam
 * "usa.journal", e quatro lugares da arte escreviam a marca em texto, um deles
 * com o nome de 2025 ("desbuguei.ia"). Estes testes guardam as duas metades da
 * troca: o endereço aponta para um arquivo que existe, e a arte desenha a
 * imagem em vez do nome.
 */

describe("os arquivos do logotipo", () => {
  it.each([
    ["claro", MARCA.logoClaro],
    ["escuro", MARCA.logoEscuro],
  ])("a versão %s existe em public, no caminho que o site serve", (_, url) => {
    // O e-mail e a arte usam o endereço absoluto, e o site o relativo; os dois
    // saem do mesmo campo. Um nome de arquivo errado aqui só apareceria como
    // imagem quebrada depois do deploy.
    const arquivo = path.join(process.cwd(), "public", new URL(url).pathname);
    expect(fs.existsSync(arquivo), arquivo).toBe(true);
    expect(url.startsWith(`${MARCA.site}/`)).toBe(true);
  });

  it("o caminho do site é relativo", () => {
    expect(logoDoSite()).toBe("/marca/eua-journal-fundo-claro.png");
    expect(logoDoSite(true)).toBe("/marca/eua-journal-fundo-escuro.png");
  });
});

describe("a versão sai da cor do fundo", () => {
  it("fundo claro pede o eua azul-marinho", () => {
    expect(logoParaOFundo("#ffffff")).toBe(MARCA.logoClaro);
    expect(logoParaOFundo("#f7f5f0")).toBe(MARCA.logoClaro);
  });

  it("fundo escuro pede o eua branco", () => {
    expect(logoParaOFundo("#0A3161")).toBe(MARCA.logoEscuro);
    expect(logoParaOFundo("#080808")).toBe(MARCA.logoEscuro);
    expect(logoParaOFundo("#111")).toBe(MARCA.logoEscuro);
  });

  it("cor ilegível cai na versão clara, que é o fundo padrão dos tokens", () => {
    expect(logoParaOFundo("azul")).toBe(MARCA.logoClaro);
  });
});

describe("a arte desenha a imagem, e não o nome", () => {
  it("o cabeçalho social", () => {
    const html = chromeHeader("social", 1, 3, "#080808");
    expect(html).toContain(`src="${MARCA.logoEscuro}"`);
    expect(html).toContain(`alt="${MARCA.nome}"`);
  });

  it("a sobreposição das capas com foto", () => {
    const html = overlayBrand();
    expect(html).toContain(`src="${MARCA.logoEscuro}"`);
    expect(html).not.toContain("s-wordmark");
  });

  it("os desenhos iniciais do painel não escrevem nome nenhum", () => {
    for (const tipo of ["cover", "intro", "step", "cta", "gallery"] as const) {
      const layout = layoutInicial(tipo);
      const textos = layout.blocks.map((b) => b.textoFixo).join(" ");
      expect(textos).not.toMatch(/desbuguei|imigra\.us|usa\.journal|eua\.journal/);
    }
  });
});
