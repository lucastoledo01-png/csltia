import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { CAMARA, lerBuscaDaCamara } from "./camara";
import { SENADO, lerBuscaDoSenado, lerDetalheDoSenado, maisRecentesQueCitam } from "./senado";
import { LICENCAS_COMERCIAIS_DO_FLICKR, PLANALTO, autorNaLegenda, fotoDoFlickr } from "./flickr";
import { buscarNosBancosOficiais, fotoParaAsset, legendaCita } from "./index";
import { esquecerRedeDosBancos } from "./rede";
import type { EntidadeVisual } from "../tipos";

/*
 * Recortes das respostas reais de 06/10/2026, gravadas com o agente honesto.
 * Da Câmara ficam o total, o rodapé da licença e as tags das fotos; do Senado,
 * as 25 primeiras fotos da busca e, no detalhe, a licença e os tamanhos.
 */
const fixture = (nome: string) => fs.readFileSync(path.join(__dirname, "fixtures", nome), "utf-8");

const pessoa = (nome: string): EntidadeVisual => ({
  nome,
  normalizado: nome.toLowerCase(),
  tipo: "politician",
  qid: null,
  imagemPrincipal: null,
  categoriaCommons: null,
  siteOficial: null,
  origem: "teste",
  confianca: 90,
  evidencias: [],
});

beforeEach(() => esquecerRedeDosBancos());

describe("Câmara dos Deputados", () => {
  it("o rodapé da página prova a licença CC BY e o formato do crédito", () => {
    const html = fixture("camara-busca-flavio-bolsonaro.html");
    expect(html).toContain("Creative Commons BY");
    expect(html).toContain("Nome do Fotógrafo/Câmara dos Deputados");
  });

  it("lê as fotos com o original sem sufixo, o autor, a data do evento e a legenda", () => {
    const url = "https://www.camara.leg.br/banco-imagens/pesquisar?buscar=Fl%C3%A1vio%20Bolsonaro";
    const fotos = lerBuscaDaCamara(fixture("camara-busca-flavio-bolsonaro.html"), url);
    expect(fotos.length).toBe(12);
    const f = fotos[0];
    expect(f.imageUrl).toMatch(/^https:\/\/www\.camara\.leg\.br\/internet\/bancoimagem\/banco\/2026\/05\/img\d+\.jpg$/);
    expect(f.autor).toBe("Kayo Magalhães");
    expect(f.data).toBe("2026-05-21");
    expect(f.descricao).toContain("Flávio Bolsonaro");
    const r = fotoParaAsset(f, CAMARA, pessoa("Flávio Bolsonaro"), ["Flávio Bolsonaro"], {});
    expect(r.ok && r.asset.attribution).toBe("Foto: Kayo Magalhães/Câmara dos Deputados");
    expect(r.ok && r.asset.license).toBe("CC BY");
    expect(r.ok && r.asset.metadata.legenda_cita_a_entidade).toBe(true);
  });

  it("o deputado Lula da Fonte não é o presidente Lula", () => {
    const fotos = lerBuscaDaCamara(fixture("camara-busca-lula.html"), "x");
    const nomes = ["Luiz Inácio Lula da Silva", "Lula"];
    const doPresidente = fotos.filter((f) => legendaCita(f, nomes));
    const doDeputado = fotos.filter((f) => f.descricao.includes("Lula da Fonte"));
    expect(doDeputado.length).toBeGreaterThan(0);
    expect(doDeputado.every((f) => !legendaCita(f, nomes))).toBe(true);
    // "Luis Inácio Lula da Silva", com S, ainda é ele: o apelido seguido de "da Silva".
    expect(doPresidente.length).toBeGreaterThan(0);
  });

  it("o deputado Tarcísio Motta não é o governador Tarcísio de Freitas", () => {
    const fotos = lerBuscaDaCamara(fixture("camara-busca-tarcisio.html"), "x");
    expect(fotos.length).toBeGreaterThan(0);
    expect(fotos.some((f) => legendaCita(f, ["Tarcísio de Freitas", "Tarcísio"]))).toBe(false);
  });

  it("falha da Câmara cai para o banco seguinte, com nota", async () => {
    const fetcher = (async (url: string) =>
      url.includes("camara.leg.br")
        ? new Response("", { status: 500 })
        : new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const r = await buscarNosBancosOficiais(pessoa("Flávio Bolsonaro"), { atores: [], pais: "Brasil" }, { bancos: [CAMARA], fetcher, espaco: 0 });
    expect(r.assets).toHaveLength(0);
    expect(r.notas.join(" ")).toContain("Câmara dos Deputados: falhou");
  });
});

describe("Agência Senado", () => {
  it("lê a busca do proxy e ordena da mais recente, só com legenda que cita a pessoa", () => {
    const fotos = lerBuscaDoSenado(fixture("senado-busca-flavio-bolsonaro-recorte.json"));
    expect(fotos.length).toBe(25);
    const citam = maisRecentesQueCitam(fotos, "Flávio Bolsonaro");
    expect(citam.length).toBeGreaterThan(0);
    for (let i = 1; i < citam.length; i += 1) expect(citam[i - 1].datetaken! >= citam[i].datetaken!).toBe(true);
  });

  it("a licença vem do detalhe, foto a foto: CC BY-SA 4.0 entra, CC BY-NC fica de fora", () => {
    const sa = lerDetalheDoSenado(fixture("senado-detalhe-55503209914-recorte.json"));
    const nc = lerDetalheDoSenado(fixture("senado-detalhe-8744129465-recorte.json"));
    expect(sa.licenca).toBe(12);
    expect(sa.k?.w).toBe(2048);
    expect(nc.licenca).toBe(2);
    expect(LICENCAS_COMERCIAIS_DO_FLICKR).toContain(12);
    expect(LICENCAS_COMERCIAIS_DO_FLICKR).not.toContain(2);

    const [f] = lerBuscaDoSenado(fixture("senado-busca-flavio-bolsonaro-recorte.json"));
    const comSa = fotoDoFlickr(f, "senado", "https://www.flickr.com/photos/agenciasenado/", 12)!;
    const comNc = fotoDoFlickr(f, "senado", "https://www.flickr.com/photos/agenciasenado/", 2)!;
    expect(fotoParaAsset(comSa, SENADO, pessoa("Flávio Bolsonaro"), ["Flávio Bolsonaro"], {}).ok).toBe(true);
    const recusada = fotoParaAsset(comNc, SENADO, pessoa("Flávio Bolsonaro"), ["Flávio Bolsonaro"], {});
    expect(recusada.ok).toBe(false);
  });

  it("o autor sai da linha 'Foto:' da legenda, e o crédito no formato do dono", () => {
    expect(autorNaLegenda("Plenário...\n\nFoto: Jonas Pereira/Agência Senado")).toBe("Jonas Pereira");
    const [f] = lerBuscaDoSenado(fixture("senado-busca-flavio-bolsonaro-recorte.json"));
    const foto = fotoDoFlickr(f, "senado", "https://www.flickr.com/photos/agenciasenado/", 12)!;
    const r = fotoParaAsset(foto, SENADO, pessoa("Flávio Bolsonaro"), ["Flávio Bolsonaro"], {});
    expect(r.ok && r.asset.attribution).toMatch(/^Foto: .+\/Agência Senado$/);
    expect(r.ok && r.asset.sourcePageUrl).toMatch(/^https:\/\/www\.flickr\.com\/photos\/agenciasenado\/\d+\/$/);
  });

  it("busca de ponta a ponta com a rede de mentira: POST da busca, detalhe com licença, foto de 2.048 px", async () => {
    const pedidos: string[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      pedidos.push(`${init?.method ?? "GET"} ${url} ${String(init?.body ?? "")}`);
      if (url.endsWith("busca-fotos")) return new Response(fixture("senado-busca-flavio-bolsonaro-recorte.json"));
      return new Response(fixture("senado-detalhe-55503209914-recorte.json"));
    }) as unknown as typeof fetch;
    const r = await SENADO.buscar("Flávio Bolsonaro", { env: {}, fetcher, quantos: 2, espaco: 0 });
    expect(pedidos[0]).toMatch(/^POST https:\/\/www12\.senado\.leg\.br\/fotos\/busca-fotos inputSearch=%22Fl/);
    expect(r.fotos).toHaveLength(2);
    expect(r.fotos[0].largura).toBe(2048);
    expect(r.fotos[0].licenca).toBe("CC BY-SA 4.0");
  });
});

describe("Flickr com chave (Planalto e STF)", () => {
  it("sem FLICKR_API_KEY o banco é pulado sem pedido nenhum", async () => {
    let pediu = false;
    const fetcher = (async () => {
      pediu = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    const r = await buscarNosBancosOficiais(pessoa("Lula"), { atores: [], pais: "Brasil" }, { bancos: [PLANALTO], fetcher, env: {} });
    expect(pediu).toBe(false);
    expect(r.notas.join(" ")).toContain("sem FLICKR_API_KEY");
  });

  it("com a chave, pede a licença comercial na busca e lê a licença de cada foto", async () => {
    let pedido = "";
    // O formato do Flickr é o mesmo que o proxy do Senado devolve; a fixture é a dele, com a licença que a busca com chave traz.
    const busca = JSON.parse(fixture("senado-busca-lula-recorte.json"));
    const photo = busca.photo.slice(0, 3).map((p: Record<string, unknown>, i: number) => ({
      ...p,
      owner: "51178866@N04",
      license: i === 0 ? "4" : i === 1 ? "14" : "12",
    }));
    const fetcher = (async (url: string) => {
      pedido = url;
      return new Response(JSON.stringify({ stat: "ok", photos: { total: 3, photo } }));
    }) as unknown as typeof fetch;
    const r = await PLANALTO.buscar("Lula", { env: { FLICKR_API_KEY: "k" }, fetcher, quantos: 5, espaco: 0 });
    expect(pedido).toContain("user_id=51178866%40N04");
    expect(pedido).toContain("license=4%2C5%2C8%2C9%2C10%2C11%2C12");
    expect(r.fotos.map((f) => f.licenca)).toEqual(["CC BY 2.0", "CC BY-NC 4.0", "CC BY-SA 4.0"]);
    const nc = fotoParaAsset(r.fotos[1], PLANALTO, pessoa("Lula"), ["Lula"], {});
    expect(nc.ok).toBe(false);
  });

  it("resposta de erro do Flickr vira falha anotada, não lista vazia", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ stat: "fail", message: "Invalid API Key" }))) as unknown as typeof fetch;
    await expect(PLANALTO.buscar("Lula", { env: { FLICKR_API_KEY: "x" }, fetcher, quantos: 5, espaco: 0 })).rejects.toThrow("Invalid API Key");
  });
});
