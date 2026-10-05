import { describe, expect, it } from "vitest";
import { enderecoDaPaginaAtual, linkDoWhatsApp, mensagemDeCompartilhamento } from "./compartilhar";

describe("compartilhar no WhatsApp", () => {
  it("a mensagem leva o endereço da matéria, e não só o título", () => {
    expect(mensagemDeCompartilhamento("eua.journal", "Título", "https://exemplo.com/artigos/x")).toBe(
      "Confira esta leitura no eua.journal: Título\nhttps://exemplo.com/artigos/x",
    );
    const link = linkDoWhatsApp("eua.journal", "Título", "https://exemplo.com/artigos/x");
    expect(decodeURIComponent(link.split("text=")[1])).toContain("https://exemplo.com/artigos/x");
  });

  it("o endereço da página vem do navegador, sem consulta e sem âncora", () => {
    expect(enderecoDaPaginaAtual({ origin: "https://outro-dominio.com.br", pathname: "/artigos/x" })).toBe("https://outro-dominio.com.br/artigos/x");
  });
});
