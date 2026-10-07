import { describe, expect, it } from "vitest";
import { CASA_BRANCA_COMMONS, CATEGORIA_DO_ESPELHO, dataDoCommons, lerBuscaDoEspelho } from "./casa-branca-commons";
import { BANCOS_OFICIAIS } from "./registro";
import { avaliarLicenca } from "../licencas";

const pagina = (pageid: number, descricao: string, data: string) => ({
  pageid,
  title: `File:Foto ${pageid}.jpg`,
  imageinfo: [
    {
      url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/Foto_${pageid}.jpg`,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:Foto_${pageid}.jpg`,
      width: 3000,
      height: 2000,
      extmetadata: {
        ImageDescription: { value: `<p>${descricao}</p>` },
        LicenseShortName: { value: "Public domain" },
        DateTimeOriginal: { value: data },
      },
    },
  ],
});

describe("Casa Branca pelo espelho do Commons (07/10/2026)", () => {
  it("entra no registro, sem chave, com a imagem num host liberado", () => {
    expect(BANCOS_OFICIAIS).toContain(CASA_BRANCA_COMMONS);
    expect(CASA_BRANCA_COMMONS.chave).toBeUndefined();
    expect(CASA_BRANCA_COMMONS.hostsDeImagem).toEqual(["upload.wikimedia.org"]);
  });

  it("só a foto do fotógrafo oficial entra, com o nome dele no crédito e a mais nova primeiro", () => {
    const fotos = lerBuscaDoEspelho({
      query: {
        pages: {
          "1": pagina(1, "Vice President JD Vance, September 30, 2026. (Official White House Photo by Emily J. Higgins)", "Taken on 30 September 2026, 08:40:24"),
          "2": pagina(2, "Vice President JD Vance at a rally. Courtesy photo.", "2026-10-01 10:00:00"),
          "3": pagina(3, "Vice President JD Vance, October 2, 2026. (Official White House Photo by Daniel Torok)", "2026-10-02 09:00:00"),
        },
      },
    });
    expect(fotos.map((f) => [f.id, f.autor, f.data])).toEqual([
      ["3", "Daniel Torok", "2026-10-02"],
      ["1", "Emily J. Higgins", "2026-09-30"],
    ]);
    expect(avaliarLicenca(fotos[0].licenca).aceita).toBe(true);
    expect(fotos[0].paginaUrl).toBe("https://commons.wikimedia.org/wiki/File:Foto_3.jpg");
  });

  it("busca dentro da categoria do espelho", async () => {
    let pedido = "";
    const fetcher = (async (url: string) => {
      pedido = url;
      return new Response(JSON.stringify({ query: { pages: {} } }));
    }) as unknown as typeof fetch;
    const r = await CASA_BRANCA_COMMONS.buscar("Vance", { env: {}, fetcher, quantos: 3, espaco: 0 });
    expect(decodeURIComponent(new URL(pedido).searchParams.get("gsrsearch") ?? "")).toBe(`incategory:${CATEGORIA_DO_ESPELHO} Vance`);
    expect(r.fotos).toEqual([]);
  });

  it("lê as duas formas de data do Commons", () => {
    expect(dataDoCommons("Taken on 5 October 2026, 08:40:24")).toBe("2026-10-05");
    expect(dataDoCommons("2026-08-20 16:11:15")).toBe("2026-08-20");
    expect(dataDoCommons("")).toBeNull();
  });
});
