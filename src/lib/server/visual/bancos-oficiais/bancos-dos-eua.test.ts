import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { CASA_BRANCA, dataNaLegenda, galeriasQueCitam, lerGaleria, lerMapaDeGalerias } from "./casa-branca";
import { FEDERAL_RESERVE, fotosQueCitam, lerGaleriaDoFed } from "./federal-reserve";
import { NASA, autorDaNasa, lerBuscaDaNasa } from "./nasa";
import { fotoParaAsset, legendaCita } from "./index";
import { esquecerRedeDosBancos, medidaDoJpeg } from "./rede";
import type { EntidadeVisual } from "../tipos";

/*
 * As fixtures são recortes das respostas reais de 06/10/2026, gravadas com o
 * agente honesto. O recorte tira só o que não é foto (menus, scripts), para o
 * repositório não carregar 300 KB por galeria.
 */
const fixture = (nome: string) => fs.readFileSync(path.join(__dirname, "fixtures", nome), "utf-8");

const pessoa = (nome: string): EntidadeVisual => ({
  nome,
  normalizado: nome.toLowerCase(),
  tipo: "public_official",
  qid: null,
  imagemPrincipal: null,
  categoriaCommons: null,
  siteOficial: null,
  origem: "teste",
  confianca: 90,
  evidencias: [],
});

beforeEach(() => esquecerRedeDosBancos());

describe("Casa Branca", () => {
  it("lê o mapa de galerias e acha a galeria pelo sobrenome", () => {
    const galerias = lerMapaDeGalerias(fixture("casa-branca-mapa-de-galerias-recorte.xml"));
    expect(galerias.length).toBeGreaterThanOrEqual(5);
    expect(galerias.every((g) => g.url.includes("/gallery/"))).toBe(true);
    const trump = galeriasQueCitam(galerias, "Donald Trump");
    expect(trump.length).toBeGreaterThan(0);
    expect(galeriasQueCitam(galerias, "Fulano Inexistente")).toHaveLength(0);
  });

  it("lê as fotos oficiais com o fotógrafo, a data, o original de 3.000 px e a licença do governo", () => {
    const fotos = lerGaleria(fixture("casa-branca-warsh-sworn-in.html"), "https://www.whitehouse.gov/gallery/x/");
    expect(fotos.length).toBeGreaterThan(3);
    const primeira = fotos[0];
    expect(primeira.autor).toBe("Daniel Torok");
    expect(primeira.data).toBe("2026-05-22");
    expect(primeira.largura).toBe(3000);
    expect(primeira.altura).toBe(2000);
    expect(primeira.imageUrl).not.toContain("?");
    expect(primeira.licenca).toBe("United States Government Work");
    expect(legendaCita(primeira, ["Kevin Warsh"])).toBe(true);
  });

  it("foto sem a assinatura do fotógrafo oficial é tratada como de terceiro e fica de fora", () => {
    const html =
      '<meta property="og:title" content="Galeria"><img class="wh-gallery-lightbox-image" data-id="1" width="1200" height="800" ' +
      'alt="Foto de agência, sem crédito oficial" srcset="https://www.whitehouse.gov/a.jpg 3000w">';
    expect(lerGaleria(html, "https://www.whitehouse.gov/gallery/x/")).toHaveLength(0);
  });

  it("o crédito sai no formato do dono", () => {
    const [foto] = lerGaleria(fixture("casa-branca-warsh-sworn-in.html"), "https://www.whitehouse.gov/gallery/x/");
    const r = fotoParaAsset(foto, CASA_BRANCA, pessoa("Kevin Warsh"), ["Kevin Warsh"], {});
    expect(r.ok && r.asset.attribution).toBe("Foto: Daniel Torok/Casa Branca");
    expect(r.ok && r.asset.license).toBe("PD-USGov");
  });

  it("a data da legenda vira ISO", () => {
    expect(dataNaLegenda("Wednesday, September 30, 2026. (Official...)")).toBe("2026-09-30");
    expect(dataNaLegenda("sem data")).toBeNull();
  });

  it("banco fora do ar vira erro para o agregador anotar, e nunca resposta vazia fingindo que não há foto", async () => {
    const fetcher = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    await expect(CASA_BRANCA.buscar("Trump", { env: {}, fetcher, quantos: 4, espaco: 0 })).rejects.toThrow("503");
  });
});

describe("Federal Reserve", () => {
  it("lê a galeria, tira a foto de terceiro e acha o presidente do Fed", () => {
    const fotos = lerGaleriaDoFed(fixture("fed-galeria-recorte.html"));
    expect(fotos.length).toBeGreaterThan(10);
    expect(fotos.some((f) => /photo credit/i.test(f.descricao))).toBe(false);
    const warsh = fotosQueCitam(fotos, "Kevin Warsh");
    expect(warsh.length).toBeGreaterThan(0);
    expect(warsh[0].imageUrl.startsWith("https://www.federalreserve.gov/photogallery/files/")).toBe(true);
    // "Chairman Warsh" é prova de identidade: cargo seguido do sobrenome.
    expect(legendaCita(warsh[0], ["Kevin Warsh"])).toBe(true);
  });

  it("mede a foto pelo próprio JPEG, porque a página não diz a medida", async () => {
    // Cabeçalho mínimo de JPEG com um SOF0 de 1024 x 683.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0xab, 0x04, 0x00, 0x03]);
    expect(medidaDoJpeg(jpeg)).toEqual({ largura: 1024, altura: 683 });
    const html = fixture("fed-galeria-recorte.html");
    const fetcher = (async (url: string) =>
      url.endsWith(".htm") ? new Response(html) : new Response(jpeg, { status: 206 })) as unknown as typeof fetch;
    const r = await FEDERAL_RESERVE.buscar("Kevin Warsh", { env: {}, fetcher, quantos: 4, espaco: 0 });
    expect(r.fotos[0].largura).toBe(1024);
    expect(r.fotos[0].altura).toBe(683);
  });
});

describe("NASA", () => {
  it("lê a busca com o arquivo de 1.920 px, a data e o crédito", () => {
    const fotos = lerBuscaDaNasa(fixture("nasa-busca-trump-recorte.json"));
    expect(fotos.length).toBeGreaterThan(0);
    const f = fotos[0];
    expect(f.imageUrl).toMatch(/~large\.jpg$/);
    expect(f.largura).toBe(1920);
    expect(f.data).toMatch(/^20\d{2}-\d{2}-\d{2}$/);
    const r = fotoParaAsset(f, NASA, pessoa("Donald Trump"), ["Donald Trump"], {});
    expect(r.ok && r.asset.attribution).toMatch(/^Foto: .+\/NASA$|^Foto: NASA$/);
  });

  it("o astronauta Vance Brand não vira o vice-presidente: a legenda não prova JD Vance", () => {
    const fotos = lerBuscaDaNasa(fixture("nasa-busca-vance-recorte.json"));
    expect(fotos.length).toBeGreaterThan(0);
    expect(fotos.some((f) => legendaCita(f, ["JD Vance"]))).toBe(false);
  });

  it("autor da NASA sem o prefixo", () => {
    expect(autorDaNasa("NASA/John Kraus")).toBe("John Kraus");
    expect(autorDaNasa("James Blair - NASA - JSC")).toBe("James Blair");
    expect(autorDaNasa("")).toBe("");
  });

  it("foto de terceiro no acervo da NASA fica de fora", () => {
    const json = JSON.stringify({
      collection: {
        items: [
          {
            data: [{ nasa_id: "x", title: "Launch", description: "Image courtesy of SpaceX", media_type: "image", photographer: "SpaceX" }],
            links: [{ href: "https://images-assets.nasa.gov/image/x/x~large.jpg", width: 1920, height: 1280 }],
          },
        ],
      },
    });
    expect(lerBuscaDaNasa(json)).toHaveLength(0);
  });
});
