import { describe, expect, it } from "vitest";
import { linhaDeCredito, legendaDoInstagram } from "../../social/legenda-final";
import { BANCOS_OFICIAIS } from "./registro";
import { NOMES_DOS_BANCOS } from "./credito";

/**
 * O crédito curto do banco oficial chega à legenda do Instagram (06/10/2026).
 *
 * A legenda monta o crédito do autor e tira toda linha de crédito com "/"
 * (era o "Fulano/Wikimedia"). O "/Banco" é o formato que o banco exige e o
 * dono pediu, e não pode sair nem sumir na edição à mão.
 */

describe("o crédito do banco oficial na legenda do Instagram", () => {
  it("todo banco do registro tem o nome na lista que a legenda reconhece", () => {
    for (const b of BANCOS_OFICIAIS) expect(NOMES_DOS_BANCOS as readonly string[]).toContain(b.nome);
  });

  it("a linha leva o banco no formato do dono, e a sigla só onde a licença exige", () => {
    expect(
      linhaDeCredito([{ author: "Kayo Magalhães", license: "CC BY", attribution: "Foto: Kayo Magalhães/Câmara dos Deputados" }]),
    ).toBe("Foto: Kayo Magalhães/Câmara dos Deputados (CC BY)");
    expect(linhaDeCredito([{ author: "Daniel Torok", license: "PD-USGov", attribution: "Foto: Daniel Torok/Casa Branca" }])).toBe(
      "Foto: Daniel Torok/Casa Branca",
    );
  });

  it("o crédito de outra origem continua como era", () => {
    expect(linhaDeCredito([{ author: "Gage Skidmore", license: "CC BY-SA 4.0", attribution: "" }])).toBe(
      "Foto: Gage Skidmore (CC BY-SA 4.0)",
    );
  });

  it("a edição à mão que mantém o crédito não apaga o crédito do banco", () => {
    const credito = "Foto: Daniel Torok/Casa Branca";
    const uma = legendaDoInstagram("Trump assina a ordem executiva nesta segunda-feira.", { credito });
    expect(uma.endsWith(credito)).toBe(true);
    const duas = legendaDoInstagram(uma, { credito: "manter", hashtags: "manter" });
    expect(duas.endsWith(credito)).toBe(true);
  });
});
