import { describe, expect, it } from "vitest";
import { assembleSlide } from "./assemble";
import { DEFAULT_TOKENS } from "./tokens";
import { esc, juntarValores } from "./util";
import type { InstagramSlide } from "./types";

/**
 * Valor com unidade não quebra de linha na arte (regra do dono, 06/10/2026).
 *
 * O caso real: a capa da Anthropic na fila de 07/10/2026, "Anthropic amplia
 * programa para startups com até US$ 45.000 em descontos e créditos", saiu com
 * "US$" no fim de uma linha e "45.000" na seguinte. O destaque em cor era
 * justamente "US$ 45.000". Este arquivo confere a MARCAÇÃO em todo molde do
 * feed; quem confere que o navegador respeita é `validar-valores-na-arte.ts`,
 * medindo as caixas de cada valor na peça montada.
 */

const NBSP = " ";

function montar(slide: Partial<InstagramSlide>, variante: string, tipo = "cover"): string {
  return assembleSlide(
    { index: 1, type: tipo, body: "", bullet_points: [], title: "", ...slide } as InstagramSlide,
    {
      format: "noticia",
      tokens: DEFAULT_TOKENS,
      formatConfig: { variantBySlideType: { [tipo]: variante }, eyebrowLabel: null, ctaText: null },
      slideIndex: 1,
      total: 1,
      molduraDiscreta: true,
    },
  );
}

/** O texto visível do HTML, sem tags e sem o CSS. */
function textoDe(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, "");
}

describe("juntarValores", () => {
  it("cola moeda, número e escala com espaço sem quebra", () => {
    expect(juntarValores("até US$ 45.000 em créditos")).toBe(`até US$${NBSP}45.000 em créditos`);
    expect(juntarValores("custa R$ 5 a mais")).toBe(`custa R$${NBSP}5 a mais`);
    expect(juntarValores("aporte de US$ 2,9 bilhões")).toBe(`aporte de US$${NBSP}2,9${NBSP}bilhões`);
    expect(juntarValores("R$ 5 bi no tigrinho")).toBe(`R$${NBSP}5${NBSP}bi no tigrinho`);
    expect(juntarValores("vale US$ 1,03 trilhão")).toBe(`vale US$${NBSP}1,03${NBSP}trilhão`);
  });

  it("cola número com escala, percentual e ponto percentual sem moeda", () => {
    expect(juntarValores("mais de 670 mil vagas")).toBe(`mais de 670${NBSP}mil vagas`);
    expect(juntarValores("sobe 8 % no dia")).toBe(`sobe 8${NBSP}% no dia`);
    expect(juntarValores("cai 0,25 ponto percentual")).toBe(`cai 0,25${NBSP}ponto${NBSP}percentual`);
    expect(juntarValores("alta de 3 por cento")).toBe(`alta de 3${NBSP}por${NBSP}cento`);
  });

  it("não toca no que não é valor", () => {
    expect(juntarValores("Fed corta juros em setembro")).toBe("Fed corta juros em setembro");
    expect(juntarValores("2026 mostra")).toBe("2026 mostra");
    expect(juntarValores("8% ao ano")).toBe("8% ao ano");
  });

  it("é idempotente", () => {
    const uma = juntarValores("US$ 2,9 bilhões e 45 mil");
    expect(juntarValores(uma)).toBe(uma);
  });

  it("passa por esc, o ponto por onde todo texto da arte passa", () => {
    expect(esc("até US$ 45.000 & mais")).toBe(`até US$${NBSP}45.000 &amp; mais`);
  });
});

describe("todo molde do feed imprime o valor colado", () => {
  const manchete = "Anthropic amplia programa para startups com até US$ 45.000 em descontos e créditos";

  it("capa de jornal com foto", () => {
    const html = montar({ title: manchete, bg_image_url: "https://example.com/foto.jpg" }, "capa_jornal");
    expect(textoDe(html)).toContain(`US$${NBSP}45.000`);
    expect(textoDe(html)).not.toContain("US$ 45.000");
  });

  it("capa de texto (sem foto)", () => {
    const html = montar({ title: manchete }, "noticia_sem_foto");
    expect(textoDe(html)).toContain(`US$${NBSP}45.000`);
  });

  it("capa com destaque em cor, o caso real: o destaque É o valor", () => {
    const html = montar({ title: manchete, highlight_text: "US$ 45.000" }, "capa_destaque");
    expect(html).toMatch(new RegExp(`US\\$${NBSP}45\\.000`));
    expect(textoDe(html)).not.toContain("US$ 45.000");
  });

  it("capa com destaque que começa no meio do valor", () => {
    const html = montar({ title: manchete, highlight_text: "45.000 em descontos" }, "capa_destaque");
    expect(html).toContain(`US$${NBSP}<mark>45.000`);
  });

  it("miolo do jornal (título e corpo)", () => {
    const html = montar(
      { title: "Benefício chega a US$ 45.000", body: "Organizações elegíveis também ganham crédito único de US$ 1.000 para a API." },
      "miolo_jornal",
      "content",
    );
    expect(textoDe(html)).toContain(`US$${NBSP}45.000`);
    expect(textoDe(html)).toContain(`US$${NBSP}1.000`);
  });

  it("miolo da notícia, em blocos", () => {
    const html = montar(
      { title: "", body: "As ações subiram quase 8 % e o valor de mercado passou de US$ 2,9 bilhões." },
      "miolo_noticia",
      "content",
    );
    expect(textoDe(html)).toContain(`US$${NBSP}2,9${NBSP}bilhões`);
  });

  it("recorte de post", () => {
    const html = montar(
      { title: "A Anthropic dá até US$ 45.000 para startups", body: "O crédito único é de R$ 5 mil na conversão.", bg_image_url: "https://example.com/foto.jpg" },
      "recorte_post",
    );
    expect(textoDe(html)).toContain(`US$${NBSP}45.000`);
    expect(textoDe(html)).toContain(`R$${NBSP}5${NBSP}mil`);
  });
});
