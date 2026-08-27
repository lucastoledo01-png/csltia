import { describe, expect, it } from "vitest";
import { escapeHtml, safeHttpUrl } from "./html";

describe("escape de HTML", () => {
  it("neutraliza tags vindas de título de RSS ou saída do modelo", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("escapa aspas para uso seguro dentro de atributo", () => {
    expect(escapeHtml('" onerror="alert(1)')).toBe("&quot; onerror=&quot;alert(1)");
  });

  it("trata ausência de valor sem quebrar o template", () => {
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(null)).toBe("");
  });
});

describe("validação de URL", () => {
  it("aceita http e https", () => {
    expect(safeHttpUrl("https://openai.com/news")).toBe("https://openai.com/news");
  });

  it("bloqueia esquemas executáveis", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBe("#");
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe("#");
  });

  it("bloqueia valor ausente ou inválido", () => {
    expect(safeHttpUrl(undefined)).toBe("#");
    expect(safeHttpUrl("não é uma url")).toBe("#");
  });
});
