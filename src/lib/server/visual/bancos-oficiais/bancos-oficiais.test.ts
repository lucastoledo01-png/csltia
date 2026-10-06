import { beforeEach, describe, expect, it } from "vitest";
import type { EntidadeVisual } from "../tipos";
import { avaliarLicenca } from "../licencas";
import { figuraNaoCentralNaImagem } from "../temporalidade";
import { creditoCurto } from "./credito";
import { bancosOficiaisLigados } from "./modo";
import {
  bancosNaOrdem,
  buscarNosBancosOficiais,
  cenaDeGovernoPara,
  consultaParaOBanco,
  fotoParaAsset,
  legendaCita,
  nomesDaEntidade,
  oficiaisPrimeiro,
  protagonistaDaLegenda,
} from "./index";
import { esquecerRedeDosBancos, pedirAoBanco } from "./rede";
import type { DefinicaoDoBanco, FotoDoBanco } from "./tipos";

const lula: EntidadeVisual = {
  nome: "Luiz Inácio Lula da Silva",
  normalizado: "luiz inacio lula da silva",
  tipo: "politician",
  qid: "Q37181",
  imagemPrincipal: null,
  categoriaCommons: null,
  siteOficial: null,
  origem: "teste",
  confianca: 90,
  evidencias: [],
};

function foto(parcial: Partial<FotoDoBanco> = {}): FotoDoBanco {
  return {
    banco: "agencia_brasil",
    id: "1",
    titulo: "Presidente Lula",
    descricao: "Brasília (DF), 01/10/2026 - O presidente Luiz Inácio Lula da Silva durante cerimônia no Palácio do Planalto.",
    imageUrl: "https://imagens.ebc.com.br/abc.jpg",
    paginaUrl: "https://agenciabrasil.ebc.com.br/foto/1",
    autor: "Marcelo Camargo",
    data: "2026-10-01",
    largura: 1920,
    altura: 1280,
    licenca: "CC BY 3.0 BR",
    licencaUrl: "https://creativecommons.org/licenses/by/3.0/br/",
    ...parcial,
  };
}

const bancoFalso = (parcial: Partial<DefinicaoDoBanco> = {}): DefinicaoDoBanco => ({
  id: "agencia_brasil",
  nome: "Agência Brasil",
  pais: "BR",
  hostsDeImagem: ["imagens.ebc.com.br"],
  buscar: async () => ({ fotos: [foto()], nota: "1 foto" }),
  ...parcial,
});

describe("crédito curto no formato do dono", () => {
  it("monta 'Foto: Nome/Banco'", () => {
    expect(creditoCurto("Agência Brasil", "Marcelo Camargo")).toBe("Foto: Marcelo Camargo/Agência Brasil");
  });

  it("não repete o banco quando a origem já o escreve junto do autor", () => {
    expect(creditoCurto("Agência Brasil", "Marcelo Camargo/Agência Brasil")).toBe("Foto: Marcelo Camargo/Agência Brasil");
    expect(creditoCurto("Câmara dos Deputados", "Foto: Bruno Spada/Câmara dos Deputados")).toBe(
      "Foto: Bruno Spada/Câmara dos Deputados",
    );
  });

  it("sem autor de verdade, credita só o banco", () => {
    expect(creditoCurto("Casa Branca", "")).toBe("Foto: Casa Branca");
    expect(creditoCurto("Senado Federal", "Divulgação")).toBe("Foto: Senado Federal");
  });
});

describe("o interruptor do projeto", () => {
  it("só o true booleano liga", () => {
    expect(bancosOficiaisLigados({ settings: { imagens: { bancos_oficiais: true } } })).toBe(true);
    expect(bancosOficiaisLigados({ settings: { imagens: { bancos_oficiais: "true" } } })).toBe(false);
    expect(bancosOficiaisLigados({ settings: { imagens: {} } })).toBe(false);
    expect(bancosOficiaisLigados({ settings: {} })).toBe(false);
    expect(bancosOficiaisLigados(null)).toBe(false);
  });
});

describe("licença dos bancos, pela régua de sempre", () => {
  it("aceita CC BY da Agência Brasil e o trabalho do governo americano", () => {
    expect(avaliarLicenca("CC BY 3.0 BR").aceita).toBe(true);
    expect(avaliarLicenca("CC BY 3.0 BR").exigeAtribuicao).toBe(true);
    expect(avaliarLicenca("United States Government Work").nome).toBe("PD-USGov");
    expect(avaliarLicenca("Public Domain Mark 1.0").aceita).toBe(true);
  });

  it("recusa não comercial e sem derivada, que é o caso da Fiocruz", () => {
    expect(avaliarLicenca("CC BY-NC 4.0").aceita).toBe(false);
    expect(avaliarLicenca("CC BY-NC-SA 4.0").aceita).toBe(false);
    expect(avaliarLicenca("CC BY-ND 2.0").aceita).toBe(false);
    expect(avaliarLicenca("All Rights Reserved").aceita).toBe(false);
  });

  it("a foto NC nunca vira asset, e a recusa fica anotada", async () => {
    const banco = bancoFalso({ buscar: async () => ({ fotos: [foto({ licenca: "CC BY-NC 4.0" })], nota: "1" }) });
    const r = await buscarNosBancosOficiais(lula, { atores: ["Lula"], pais: "Brasil" }, { bancos: [banco] });
    expect(r.assets).toHaveLength(0);
    expect(r.recusados[0]?.motivo).toBe("LICENSE_UNKNOWN");
  });
});

describe("nomes, consulta e prova de identidade", () => {
  it("o apelido da pauta é o mesmo nome, e vai para a busca", () => {
    const nomes = nomesDaEntidade(lula, ["Lula", "Fernando Haddad", "Casa Branca"]);
    expect(nomes).toEqual(["Luiz Inácio Lula da Silva", "Lula"]);
    expect(consultaParaOBanco(lula, nomes)).toBe("Lula");
  });

  it("nome curto de pessoa vai como está", () => {
    const flavio = { ...lula, nome: "Flávio Bolsonaro", normalizado: "flavio bolsonaro" };
    expect(consultaParaOBanco(flavio, nomesDaEntidade(flavio, ["Flávio Bolsonaro"]))).toBe("Flávio Bolsonaro");
  });

  it("a legenda prova a identidade com fronteira de palavra", () => {
    expect(legendaCita(foto(), ["Luiz Inácio Lula da Silva", "Lula"])).toBe(true);
    expect(legendaCita(foto({ titulo: "Lulavaz", descricao: "Lulavaz no Senado" }), ["Lula"])).toBe(false);
  });

  it("a foto cuja legenda cita a pessoa ganha o nome resolvido em `categorias`; a que não cita, não", () => {
    const sim = fotoParaAsset(foto(), bancoFalso(), lula, ["Luiz Inácio Lula da Silva", "Lula"], {});
    const nao = fotoParaAsset(
      foto({ titulo: "Ministro em reunião", descricao: "O ministro Fernando Haddad em reunião." }),
      bancoFalso(),
      lula,
      ["Luiz Inácio Lula da Silva", "Lula"],
      {},
    );
    expect(sim.ok && sim.asset.metadata.categorias).toBe("retrata Luiz Inácio Lula da Silva");
    expect(nao.ok && nao.asset.metadata.categorias).toBe("");
  });
});

describe("a pessoa tem que ser a protagonista da legenda (replay de 06/10/2026)", () => {
  const moraes = { ...lula, nome: "Alexandre de Moraes", normalizado: "alexandre de moraes" };

  it("o senador da entrevista sobre Moraes não é foto do Moraes", async () => {
    const entrevista = foto({
      titulo: "Entrevista coletiva",
      descricao: "Senador Eduardo Girão (Novo-CE) concede entrevista sobre o ministro Alexandre de Moraes.",
    });
    const doMinistro = foto({ id: "2", imageUrl: "https://imagens.ebc.com.br/2.jpg", descricao: "O ministro Alexandre de Moraes durante sessão do STF." });
    const banco = bancoFalso({ buscar: async () => ({ fotos: [entrevista, doMinistro], nota: "2" }) });
    const r = await buscarNosBancosOficiais(moraes, { atores: ["Alexandre de Moraes"] }, { bancos: [banco] });
    expect(r.assets.map((a) => a.sourceAssetId)).toEqual(["agencia_brasil:2"]);
    expect(r.recusados[0]?.motivo).toBe("NON_CENTRAL_PUBLIC_FIGURE");
  });

  it("a legenda real da Agência Senado: o ministro é o tema, o senador é a foto", () => {
    // Legenda da foto 55528791444, lida em 06/10/2026; foi escolhida como "foto do Moraes" no primeiro replay.
    const f = foto({
      titulo: "Entrevista Coletiva - Parlamentares de oposição",
      descricao:
        "Parlamentares da oposição conversam com jornalistas sobre  julgamento que analisa a abertura de investigação " +
        "envolvendo o ministro Alexandre de Moraes, do Supremo Tribunal Federal (STF). \n\nSenador Jorge Seif (PL-SC) durante entrevista. " +
        "\n\nFoto: Ton Molina/Agência Senado",
    });
    const nomes = ["Alexandre de Moraes", "Moraes"];
    expect(legendaCita(f, nomes) && protagonistaDaLegenda(f, nomes)).toBe(false);
    expect(protagonistaDaLegenda(f, ["Jorge Seif"])).toBe(true);
  });

  it("foto de grupo não é retrato: as legendas reais da posse (Fachin) e da coletiva (Moraes)", () => {
    // Legendas das fotos 53542387807 e 53971780728 da Agência Senado, lidas em 06/10/2026.
    const posse = foto({
      titulo: "Posse Servidores",
      descricao:
        "Cerimônia de posse dos novos servidores. À tribuna, em discurso, vice-presidente do Supremo Tribunal Federal (STF), " +
        "ministro Edson Fachin. Mesa: diretor da Secretaria de Gestão de Pessoas, Gustavo Ponce de Leon Soriano Lago; " +
        "diretora-geral do Senado Federal, Ilana Trombka; presidente do Senado Federal, senador Rodrigo Pacheco (PSD-MG).",
    });
    const coletiva = foto({
      titulo: "Senadores e deputados da oposição concedem entrevista",
      descricao:
        "Líderes da oposição concedem entrevista coletiva. Os parlamentares informam que irão obstruir as votações após a " +
        "suspensão do X, determinada pelo ministro Alexandre de Moraes. Participam: senador Luis Carlos Heinze (PP-RS); " +
        "senador Rogerio Marinho (PL-RN); senador Izalci Lucas (PL-DF).",
    });
    const flavio = foto({ titulo: "Entrevistas Diversas", descricao: "Senador Flávio Bolsonaro (PL-RJ) concede entrevista." });
    expect(protagonistaDaLegenda(posse, ["Luiz Edson Fachin", "Fachin"])).toBe(false);
    expect(protagonistaDaLegenda(coletiva, ["Alexandre de Moraes", "Moraes"])).toBe(false);
    expect(protagonistaDaLegenda(flavio, ["Flávio Bolsonaro"])).toBe(true);
  });

  it("Hugo Motta nomeado primeiro faz da foto uma foto do Hugo Motta", () => {
    const f = foto({
      descricao:
        "Desfile da Independência. Presidente da Câmara dos Deputados, Hugo Motta (REPUBLICANOS - PB) e Presidente da República do Brasil, Luis Inácio Lula da Silva.",
    });
    expect(protagonistaDaLegenda(f, ["Luiz Inácio Lula da Silva", "Lula"])).toBe(false);
  });

  it("Lula com S, o cargo na frente e o sobrenome do Fed continuam valendo", () => {
    const nomes = ["Luiz Inácio Lula da Silva", "Lula"];
    expect(protagonistaDaLegenda(foto({ descricao: "Presidente da República do Brasil, Luis Inácio Lula da Silva." }), nomes)).toBe(true);
    expect(protagonistaDaLegenda(foto({ descricao: "Chairman Warsh reads opening statement." }), ["Kevin Warsh"])).toBe(true);
    expect(protagonistaDaLegenda(foto({ descricao: "Secretary of War Pete Hegseth is seen during a meeting." }), ["Pete Hegseth"])).toBe(true);
  });

  it("parente com o mesmo sobrenome e homônimo não passam", () => {
    expect(protagonistaDaLegenda(foto({ descricao: "O ex-presidente Jair Bolsonaro em Brasília." }), ["Flávio Bolsonaro"])).toBe(false);
    expect(protagonistaDaLegenda(foto({ descricao: "Dep. Lula da Fonte (PP - PE)." }), ["Luiz Inácio Lula da Silva", "Lula"])).toBe(false);
  });
});

describe("o asset grava provedor, autor, licença, página e crédito", () => {
  it("tudo o que a origem disse vai para a metadata", () => {
    const r = fotoParaAsset(foto(), bancoFalso(), lula, ["Lula"], {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.asset.source).toBe("banco_oficial");
    expect(r.asset.attribution).toBe("Foto: Marcelo Camargo/Agência Brasil");
    expect(r.asset.license).toBe("CC BY");
    expect(r.asset.sourcePageUrl).toBe("https://agenciabrasil.ebc.com.br/foto/1");
    expect(r.asset.metadata).toMatchObject({
      provedor: "agencia_brasil",
      banco_nome: "Agência Brasil",
      autor: "Marcelo Camargo",
      licenca_declarada: "CC BY 3.0 BR",
      pagina: "https://agenciabrasil.ebc.com.br/foto/1",
      data: "2026-10-01",
    });
  });

  it("host fora da lista do next/image é recusado, e não derruba a página do portal", () => {
    const r = fotoParaAsset(foto({ imageUrl: "https://outro.cdn.com/a.jpg" }), bancoFalso(), lula, ["Lula"], {});
    expect(r.ok).toBe(false);
  });
});

describe("falha de banco cai para o seguinte, com nota", () => {
  it("banco que lança vira nota, e o outro banco continua entregando", async () => {
    const quebrado = bancoFalso({
      id: "camara",
      nome: "Câmara dos Deputados",
      buscar: async () => {
        throw new Error("camara.leg.br respondeu 503");
      },
    });
    const r = await buscarNosBancosOficiais(lula, { atores: ["Lula"], pais: "Brasil" }, { bancos: [quebrado, bancoFalso()] });
    expect(r.assets).toHaveLength(1);
    expect(r.notas.join(" ")).toContain("Câmara dos Deputados: falhou (camara.leg.br respondeu 503)");
  });

  it("banco que pede chave e não tem é pulado sem pedido nenhum", async () => {
    let chamou = false;
    const comChave = bancoFalso({
      id: "casa_branca",
      nome: "Casa Branca",
      pais: "US",
      chave: "FLICKR_API_KEY",
      buscar: async () => {
        chamou = true;
        return { fotos: [], nota: "" };
      },
    });
    const r = await buscarNosBancosOficiais(lula, { atores: [], pais: "EUA" }, { bancos: [comChave], env: {} });
    expect(chamou).toBe(false);
    expect(r.notas.join(" ")).toContain("sem FLICKR_API_KEY");
  });

  it("empresa e lugar não consultam banco oficial", async () => {
    let chamou = false;
    const banco = bancoFalso({
      buscar: async () => {
        chamou = true;
        return { fotos: [], nota: "" };
      },
    });
    await buscarNosBancosOficiais({ ...lula, tipo: "company", nome: "Nvidia" }, { atores: [] }, { bancos: [banco] });
    expect(chamou).toBe(false);
  });
});

describe("ordem dos bancos e da conferência", () => {
  it("o país da pauta vem primeiro, e o outro também entra", () => {
    const br = bancoFalso();
    const us = bancoFalso({ id: "casa_branca", nome: "Casa Branca", pais: "US" });
    expect(bancosNaOrdem("EUA", [br, us]).map((b) => b.pais)).toEqual(["US", "BR"]);
    expect(bancosNaOrdem("Brasil", [us, br]).map((b) => b.pais)).toEqual(["BR", "US"]);
  });

  it("a foto oficial que cita a pessoa vai à frente, da mais recente para a mais antiga", () => {
    const item = (source: string, data: string, cita: boolean, total: number) => ({
      item: { source, metadata: { data, legenda_cita_a_entidade: cita } } as never,
      nota: { total },
    });
    const commons = item("wikimedia_commons", "", false, 95);
    const velha = item("banco_oficial", "2024-01-10", true, 80);
    const nova = item("banco_oficial", "2026-10-01", true, 75);
    const semProva = item("banco_oficial", "2026-10-02", false, 90);
    const ordem = oficiaisPrimeiro([commons, velha, nova, semProva]);
    expect(ordem).toEqual([nova, velha, commons, semProva]);
  });

  it("no máximo três oficiais passam na frente", () => {
    const of = (d: string) => ({ item: { source: "banco_oficial", metadata: { data: d, legenda_cita_a_entidade: true } } as never, nota: { total: 80 } });
    const commons = { item: { source: "wikimedia_commons", metadata: {} } as never, nota: { total: 99 } };
    const ordem = oficiaisPrimeiro([commons, of("2026-01-01"), of("2026-02-01"), of("2026-03-01"), of("2026-04-01")]);
    expect(ordem[3]).toBe(commons);
  });

  it("a cena de governo só existe com país e editoria de governo", () => {
    expect(cenaDeGovernoPara("politica", "Brasil")).toEqual({ consulta: "fachada do Congresso Nacional", pais: "BR" });
    expect(cenaDeGovernoPara("politica", "EUA")?.pais).toBe("US");
    expect(cenaDeGovernoPara("tecnologia", "EUA")).toBeNull();
    expect(cenaDeGovernoPara("politica", "outro")).toBeNull();
  });
});

describe("legenda em português e a régua de figura não central", () => {
  it("lugar com forma de nome não é gente: a Esplanada e o Planalto não recusam a foto", () => {
    const asset = { sourceAssetId: "x", metadata: { descricao: "Vista aérea da Esplanada dos Ministérios e do Palácio do Planalto." } };
    expect(figuraNaoCentralNaImagem(asset, ["Lula"]).recusa).toBeNull();
  });

  it("o político na legenda continua sendo visto, com o cargo na frente", () => {
    const asset = { sourceAssetId: "x", metadata: { descricao: "Presidente do Senado, senador Davi Alcolumbre, no Palácio do Planalto." } };
    expect(figuraNaoCentralNaImagem(asset, ["Flávio Bolsonaro"]).recusa).toBe("NON_CENTRAL_PUBLIC_FIGURE");
    expect(figuraNaoCentralNaImagem(asset, ["Davi Alcolumbre"]).recusa).toBeNull();
  });
});

describe("a rede dos bancos", () => {
  beforeEach(() => esquecerRedeDosBancos());

  it("manda o agente honesto, guarda a resposta e não guarda a falha", async () => {
    const agentes: string[] = [];
    let status = 503;
    const fetcher = (async (_url: string, init?: RequestInit) => {
      agentes.push(String((init?.headers as Record<string, string>)["User-Agent"]));
      return new Response("ok", { status });
    }) as unknown as typeof fetch;

    await expect(pedirAoBanco("https://exemplo.gov.br/busca?q=1", { fetcher, espaco: 0 })).rejects.toThrow("503");
    status = 200;
    expect(await pedirAoBanco("https://exemplo.gov.br/busca?q=1", { fetcher, espaco: 0 })).toBe("ok");
    expect(await pedirAoBanco("https://exemplo.gov.br/busca?q=1", { fetcher, espaco: 0 })).toBe("ok");
    expect(agentes).toHaveLength(2);
    expect(agentes.every((a) => a.startsWith("eua.journal/1.0"))).toBe(true);
    expect(agentes.some((a) => /mozilla|chrome|safari/i.test(a))).toBe(false);
  });
});
