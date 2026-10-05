import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ajustarMateriaGravada, type MateriaGravada } from "./ajuste-de-materia";

/**
 * A matéria-piloto de Chicago como estava gravada em 06/10/2026, antes das
 * regras: quatro tópicos que repetiam a abertura, "energia" e "água" como
 * assunto, e Trump em `mentions` sem estar no texto.
 */
const CHICAGO = JSON.parse(fs.readFileSync(path.join(__dirname, "ajuste-de-materia.chicago.fixture.json"), "utf-8")) as MateriaGravada;

describe("ajuste determinista da matéria gravada: Chicago", () => {
  const r = ajustarMateriaGravada(CHICAGO);

  it("os quatro tópicos repetiam a abertura: o bloco sai", () => {
    expect(r.essencial.antes).toHaveLength(4);
    expect(r.essencial.depois).toEqual([]);
    expect(r.patch.content_html).not.toContain('class="essencial"');
  });

  it("nenhuma outra parte do HTML muda", () => {
    const semBloco = (CHICAGO.content_html ?? "").replace(/<section class="essencial">[\s\S]*?<\/section>/, "");
    expect(r.patch.content_html).toBe(semBloco);
  });

  it("assuntos: sem 'energia' e 'água', com 'data centers' da lista fechada, no máximo cinco", () => {
    expect(r.depois.assuntos).not.toContain("energia");
    expect(r.depois.assuntos).not.toContain("água");
    expect(r.depois.assuntos).toContain("data centers");
    expect(r.depois.assuntos[0]).toBe("Chicago");
    expect(r.depois.assuntos.length).toBeLessThanOrEqual(5);
  });

  it("mentions: Trump sai, porque o texto não o nomeia; quem o texto nomeia fica", () => {
    const nomes = r.depois.entidades.map((e) => e.nome);
    expect(nomes).not.toContain("President Trump");
    expect(nomes).toEqual(expect.arrayContaining(["Chicago", "Brandon Johnson", "Bill Conway", "JB Pritzker", "Brad Tietz"]));
    expect(r.patch.tags.filter((t) => t.startsWith("assunto:"))).toEqual(r.depois.assuntos.map((a) => `assunto:${a}`));
    expect(r.patch.tags.slice(0, 2)).toEqual(["Política", "origem:edicao-2026-09-24"]);
  });

  it("aplicar duas vezes dá o mesmo resultado", () => {
    const de_novo = ajustarMateriaGravada({ ...CHICAGO, content_html: r.patch.content_html, tags: r.patch.tags });
    expect(de_novo.patch).toEqual(r.patch);
  });
});
