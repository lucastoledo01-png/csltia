import { describe, expect, it } from "vitest";
import { arquivoDoCommonsNoLink } from "./imagem";

describe("o link do Commons que o Claude indica", () => {
  it("acha o arquivo no original, na miniatura e na página", () => {
    expect(arquivoDoCommonsNoLink("https://upload.wikimedia.org/wikipedia/commons/9/93/Moderna_Headquarters%2C_December_2020.jpg")).toBe(
      "Moderna Headquarters, December 2020.jpg",
    );
    expect(
      arquivoDoCommonsNoLink("https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Moderna_Headquarters%2C_December_2020.jpg/1280px-Moderna_Headquarters%2C_December_2020.jpg"),
    ).toBe("Moderna Headquarters, December 2020.jpg");
    expect(arquivoDoCommonsNoLink("https://commons.wikimedia.org/wiki/File:Avenida_Faria_Lima.jpg")).toBe("Avenida Faria Lima.jpg");
  });

  it("não confunde link de outro site com o Commons", () => {
    expect(arquivoDoCommonsNoLink("https://www.xpi.com.br/foto.jpg")).toBeNull();
    expect(arquivoDoCommonsNoLink("não é link")).toBeNull();
  });
});
