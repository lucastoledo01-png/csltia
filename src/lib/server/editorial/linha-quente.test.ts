import { describe, expect, it } from "vitest";
import { carregarConfigEditorial, MOTIVOS } from "./config";
import { decidirPauta, montarSystemDoClassificador, type Classificacao } from "./classificador";
import { montarSystemDoVerificador, impressaoDaReguaDoVerificador } from "./verificador";
import { LINHA_PADRAO, linhaDoProjeto, regraDoRecorte, REGRA_DO_RECORTE, eixosDoBrasil } from "./linha-editorial";
import { assinaturaDoClassificador } from "./candidatos-store";
import { LIMIAR_DE_VEICULOS_DO_CALOR, contarVeiculos, limiarDeVeiculosDoCalor } from "./calor";

/*
 * As decisões do dono de 06/10/2026 sobre a auditoria da notícia quente.
 * Cada caso aqui é uma das histórias reais da auditoria, para o teste dizer
 * que ela entra (ou continua fora) pelo motivo certo.
 */

const projeto = (politica?: string) => ({ settings: politica ? { linha: { politica_brasileira: politica } } : {} });
const eleicao = carregarConfigEditorial({}, projeto("eleicao"));
const soMercado = carregarConfigEditorial({}, projeto());
const fora = carregarConfigEditorial({}, projeto("fora"));

function c(over: Partial<Classificacao> = {}): Classificacao {
  return {
    id: "1",
    pais: "EUA",
    imigracao: false,
    leitura: "neutra",
    eixo: "economia",
    natureza: "official_action",
    relevancia: 6,
    atores: [],
    lugares: [],
    acontecimento: [],
    justificativa: "",
    ...over,
  };
}

describe("a política brasileira por projeto", () => {
  it("ausente, valor torto ou sem projeto vale a linha de antes", () => {
    expect(linhaDoProjeto(null)).toEqual(LINHA_PADRAO);
    expect(linhaDoProjeto({ settings: {} })).toEqual({ politicaBrasileira: "so_mercado" });
    expect(linhaDoProjeto({ settings: { linha: { politica_brasileira: "ELEICÃO" } } })).toEqual(LINHA_PADRAO);
    expect(linhaDoProjeto({ settings: { linha: "eleicao" } })).toEqual(LINHA_PADRAO);
    expect(carregarConfigEditorial({}).linha).toEqual(LINHA_PADRAO);
  });

  it("lê os três modos", () => {
    expect(linhaDoProjeto(projeto("eleicao")).politicaBrasileira).toBe("eleicao");
    expect(linhaDoProjeto(projeto(" fora ")).politicaBrasileira).toBe("fora");
    expect(linhaDoProjeto(projeto("so_mercado")).politicaBrasileira).toBe("so_mercado");
  });

  const flavio = c({
    pais: "Brasil",
    eixo: "politica",
    natureza: "political_statement",
    leitura: "desfavoravel",
    relevancia: 6,
    politica_brasileira: true,
  });

  it("fofoca de campanha do segundo turno entra na eleição, em qualquer tom", () => {
    const d = decidirPauta(flavio, eleicao);
    expect(d.aprovada).toBe(true);
    expect(d.motivo).toBe(MOTIVOS.APROVADO_POLITICA_BRASIL);
    expect(decidirPauta({ ...flavio, leitura: "oportunidade" }, eleicao).aprovada).toBe(true);
  });

  it("fora da eleição, a mesma pauta continua fora, como antes de 06/10", () => {
    expect(decidirPauta(flavio, soMercado).aprovada).toBe(false);
    expect(decidirPauta({ ...flavio, natureza: "official_action" }, soMercado).motivo).toBe(MOTIVOS.REJEITADO_EIXO_BRASIL);
  });

  it("Trump comentando a eleição sai como EUA, e entra pelo assunto", () => {
    const trump = c({ pais: "EUA", eixo: "politica", natureza: "political_statement", politica_brasileira: true, relevancia: 7 });
    expect(decidirPauta(trump, eleicao).motivo).toBe(MOTIVOS.APROVADO_POLITICA_BRASIL);
    expect(decidirPauta(trump, soMercado).motivo).toBe(MOTIVOS.REJEITADO_DECLARACAO);
  });

  it("a eleição ainda precisa do piso de relevância", () => {
    expect(decidirPauta({ ...flavio, relevancia: 2 }, eleicao).motivo).toBe(MOTIVOS.REJEITADO_RELEVANCIA);
  });

  it("nem a eleição abre imigração nem notícia ruim dos EUA", () => {
    expect(decidirPauta({ ...flavio, imigracao: true }, eleicao).motivo).toBe(MOTIVOS.REJEITADO_IMIGRACAO);
    const ruim = c({ pais: "EUA", leitura: "desfavoravel", politica_brasileira: true });
    expect(decidirPauta(ruim, eleicao).motivo).toBe(MOTIVOS.REJEITADO_EUA_NEGATIVO);
  });

  it("em fora, o Brasil só entra pelo bolso", () => {
    const stf = c({ pais: "Brasil", eixo: "brasil", relevancia: 8 });
    expect(decidirPauta(stf, soMercado).aprovada).toBe(true);
    expect(decidirPauta(stf, fora).motivo).toBe(MOTIVOS.REJEITADO_EIXO_BRASIL);
    expect(decidirPauta({ ...stf, eixo: "economia" }, fora).aprovada).toBe(true);
    expect([...eixosDoBrasil({ politicaBrasileira: "fora" })]).toEqual(["economia", "custo_de_vida"]);
  });
});

describe("citação de famoso", () => {
  const huang = c({
    pais: "EUA",
    eixo: "tecnologia",
    natureza: "political_statement",
    relevancia: 6,
    citacao_de_famoso: true,
    quem_fala: "Jensen Huang",
  });

  it("Jensen Huang e o milhão de empregos entra como formato, em qualquer modo", () => {
    for (const config of [soMercado, eleicao, fora]) {
      const d = decidirPauta(huang, config);
      expect(d.aprovada).toBe(true);
      expect(d.motivo).toBe(MOTIVOS.APROVADO_CITACAO_DE_FAMOSO);
    }
  });

  it("sem o nome de quem fala, ou fora dos eixos, volta a ser fala com teto", () => {
    expect(decidirPauta({ ...huang, quem_fala: " " }, soMercado).motivo).toBe(MOTIVOS.REJEITADO_DECLARACAO);
    expect(decidirPauta({ ...huang, eixo: "seguranca" }, soMercado).motivo).toBe(MOTIVOS.REJEITADO_DECLARACAO);
    expect(decidirPauta({ ...huang, citacao_de_famoso: undefined }, soMercado).motivo).toBe(MOTIVOS.REJEITADO_DECLARACAO);
  });

  it("citação sobre imigração ou que retrata mal os EUA continua fora", () => {
    expect(decidirPauta({ ...huang, eixo: "imigracao" }, soMercado).motivo).toBe(MOTIVOS.REJEITADO_IMIGRACAO);
    expect(decidirPauta({ ...huang, leitura: "desfavoravel" }, soMercado).motivo).toBe(MOTIVOS.REJEITADO_EUA_NEGATIVO);
  });

  it("classificação persistida antes de 06/10, sem os campos novos, decide como antes", () => {
    const antiga = c({ natureza: "political_statement", relevancia: 8 });
    expect(decidirPauta(antiga, eleicao).motivo).toBe(MOTIVOS.REJEITADO_DECLARACAO);
  });
});

describe("geopolítica do mundo", () => {
  it("sem os EUA no centro é terceiro país, e fica fora", () => {
    const netanyahu = c({ pais: "outro", eixo: "politica", relevancia: 7 });
    expect(decidirPauta(netanyahu, eleicao).aprovada).toBe(false);
  });
});

describe("os dois prompts leem o mesmo recorte", () => {
  it("o bloco do modo do projeto está no classificador e no verificador", () => {
    for (const modo of ["eleicao", "so_mercado", "fora"] as const) {
      const linha = { politicaBrasileira: modo };
      expect(montarSystemDoClassificador(linha)).toContain(regraDoRecorte(linha));
      expect(montarSystemDoVerificador(linha)).toContain(regraDoRecorte(linha));
    }
  });

  it("o recorte comum diz o que entra e o que continua fora", () => {
    expect(REGRA_DO_RECORTE).toContain("GEOPOLÍTICA DO MUNDO");
    expect(REGRA_DO_RECORTE).toContain("citacao_de_famoso");
    expect(REGRA_DO_RECORTE).toContain("placar");
    expect(REGRA_DO_RECORTE).toContain("ICE");
  });

  it("o verificador aceita a citação e, só na eleição, a fala de campanha", () => {
    expect(montarSystemDoVerificador(LINHA_PADRAO)).toContain("A citação de famoso descrita acima NÃO é");
    expect(montarSystemDoVerificador(LINHA_PADRAO)).not.toContain("abertura eleitoral, política brasileira");
    expect(montarSystemDoVerificador({ politicaBrasileira: "eleicao" })).toContain("abertura eleitoral, política brasileira");
  });

  it("abrir ou fechar a eleição invalida a classificação e a verificação guardadas", () => {
    const a = assinaturaDoClassificador(montarSystemDoClassificador(LINHA_PADRAO), {});
    const b = assinaturaDoClassificador(montarSystemDoClassificador({ politicaBrasileira: "eleicao" }), {});
    expect(a.promptHash).not.toBe(b.promptHash);
    expect(impressaoDaReguaDoVerificador(LINHA_PADRAO)).not.toBe(impressaoDaReguaDoVerificador({ politicaBrasileira: "eleicao" }));
  });
});

describe("o limiar de contar veículos do calor", () => {
  it("é 0.65 por padrão, sem mexer nos limiares da composição", () => {
    expect(LIMIAR_DE_VEICULOS_DO_CALOR).toBe(0.65);
    expect(limiarDeVeiculosDoCalor({})).toBe(0.65);
    expect(limiarDeVeiculosDoCalor({ CALOR_LIMIAR_VEICULOS: "0.7" })).toBe(0.7);
    expect(limiarDeVeiculosDoCalor({ CALOR_LIMIAR_VEICULOS: "7" })).toBe(0.65);
    const config = carregarConfigEditorial({});
    expect(config.limiarDeAgrupamento).toBe(0.7);
    expect(config.limiarSemanticoCerto).toBe(0.85);
  });

  it("o par de 0.685 da auditoria conta como o mesmo fato a 0.65, e não a 0.70", () => {
    // Dois vetores unitários com cosseno 0.685.
    const v = [1, 0];
    const vizinha = { dominio: "axios.com", publicadoEm: new Date(1_000_000).toISOString(), vetor: [0.685, Math.sqrt(1 - 0.685 ** 2)] };
    expect(contarVeiculos(v, ["cnbc.com"], [vizinha], 0.65, 1_000_000)).toBe(2);
    expect(contarVeiculos(v, ["cnbc.com"], [vizinha], 0.7, 1_000_000)).toBe(1);
  });
});
