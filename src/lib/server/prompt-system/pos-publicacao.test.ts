import { describe, expect, it } from "vitest";
import { montarCopyDoDirect } from "./pos-publicacao";

/**
 * A copy do Direct existe para dispensar preenchimento à mão.
 *
 * O desenho original exigia as duas mensagens **e** o ID da mídia do Instagram
 * antes de criar a automação — mas o ID só existe depois de publicar, o que
 * tornava a ordem impossível de seguir. Agora o worker grava o ID no instante
 * da publicação e a copy tem padrão.
 */

describe("copy padrão do Direct", () => {
  it("nomeia a keyword na abertura — é o que a pessoa comentou", () => {
    const c = montarCopyDoDirect("GTA26", "Retrato estilo GTA");
    expect(c.openingDmMessage).toContain("GTA26");
  });

  it("menciona o tema na entrega quando existe", () => {
    expect(montarCopyDoDirect("GTA26", "Retrato estilo GTA").dmMessage).toContain(
      "Retrato estilo GTA",
    );
  });

  it("funciona sem tema, sem deixar frase quebrada", () => {
    const c = montarCopyDoDirect("GTA26");
    expect(c.dmMessage).not.toContain(" de .");
    expect(c.dmMessage).not.toContain("undefined");
    expect(c.dmMessage.length).toBeGreaterThan(20);
  });

  it("cabe no limite de 1000 caracteres do OpenReply", () => {
    // O schema do OpenReply recusa acima disso, e a recusa só apareceria na
    // hora de criar a automação — depois de o post já estar publicado.
    const c = montarCopyDoDirect("A".repeat(50), "T".repeat(400));
    expect(c.openingDmMessage.length).toBeLessThanOrEqual(1000);
    expect(c.dmMessage.length).toBeLessThanOrEqual(1000);
  });

  it("é determinística", () => {
    expect(montarCopyDoDirect("GTA26", "tema")).toEqual(montarCopyDoDirect("GTA26", "tema"));
  });

  it("as duas mensagens são diferentes", () => {
    // A abertura convida a tocar no botão; a segunda entrega. Iguais, a
    // conversa fica repetitiva e a pessoa não entende o que fazer.
    const c = montarCopyDoDirect("GTA26", "tema");
    expect(c.openingDmMessage).not.toBe(c.dmMessage);
  });

  it("não promete link no texto da abertura", () => {
    // O link vai no botão do OpenReply, não no corpo. Prometer no texto e não
    // entregar ali confunde.
    expect(montarCopyDoDirect("GTA26").openingDmMessage).toMatch(/bot(ã|a)o/i);
  });
});
