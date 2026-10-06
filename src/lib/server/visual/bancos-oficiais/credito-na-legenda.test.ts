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
 *
 * ATUALIZADO em 06/10/2026, à noite: o dono leu a fila de 07/10 e escolheu SÓ
 * o nome do fotógrafo na legenda ("Foto: Kayo Magalhães"), sem o banco e sem a
 * sigla. O "Nome/Banco" continua gravado em `asset.attribution`, que é o
 * registro da licença e o crédito da capa do portal; só a linha do Instagram
 * mudou. Banco sem fotógrafo assina com o próprio nome.
 */

describe("o crédito do banco oficial na legenda do Instagram", () => {
  it("todo banco do registro tem o nome na lista que a legenda reconhece", () => {
    for (const b of BANCOS_OFICIAIS) expect(NOMES_DOS_BANCOS as readonly string[]).toContain(b.nome);
  });

  it("a linha leva só o fotógrafo, sem o banco e sem a sigla", () => {
    expect(
      linhaDeCredito([{ author: "Kayo Magalhães", license: "CC BY", attribution: "Foto: Kayo Magalhães/Câmara dos Deputados" }]),
    ).toBe("Foto: Kayo Magalhães");
    expect(linhaDeCredito([{ author: "Daniel Torok", license: "PD-USGov", attribution: "Foto: Daniel Torok/Casa Branca" }])).toBe(
      "Foto: Daniel Torok",
    );
  });

  it("banco sem fotógrafo assina com o nome do banco", () => {
    expect(linhaDeCredito([{ author: "", license: "PD-USGov", attribution: "Foto: Federal Reserve" }])).toBe("Foto: Federal Reserve");
  });

  it("o crédito de outra origem também sai só com o nome", () => {
    expect(linhaDeCredito([{ author: "Gage Skidmore", license: "CC BY-SA 4.0", attribution: "" }])).toBe("Foto: Gage Skidmore");
  });

  it("a edição à mão que mantém o crédito não apaga o crédito, e o formato antigo vira o novo", () => {
    const uma = legendaDoInstagram("Trump assina a ordem executiva nesta segunda-feira.", { credito: "Foto: Daniel Torok/Casa Branca" });
    expect(uma.endsWith("\nFoto: Daniel Torok")).toBe(true);
    const duas = legendaDoInstagram(uma, { credito: "manter", hashtags: "manter" });
    expect(duas.endsWith("\nFoto: Daniel Torok")).toBe(true);
  });
});
