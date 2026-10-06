import { describe, expect, it, vi } from "vitest";
import { conferirAlcance, type BuscaDeEntidade } from "./alcance";
import { MOTIVOS } from "./config";
import type { EntidadeNaWikipedia } from "./calor-do-dia";

/**
 * O piso de alcance nacional (06/10/2026). Os números da tabela abaixo são os
 * MEDIDOS com a busca de produção nesse dia (Wikipédias com artigo), e não
 * construções: é a calibração do piso, e o teste quebra se ela mudar.
 */
const MEDIDO: Record<string, EntidadeNaWikipedia> = {
  Lula: { nome: "Luiz Inácio Lula da Silva", sitelinks: 128, tipo: "pessoa" },
  "Flávio Bolsonaro": { nome: "Flávio Bolsonaro", sitelinks: 29, tipo: "pessoa" },
  Tarcísio: { nome: "Tarcísio de Freitas", sitelinks: 10, tipo: "pessoa" },
  Caiado: { nome: "Ronaldo Caiado", sitelinks: 11, tipo: "pessoa" },
  Moraes: { nome: "Alexandre de Moraes", sitelinks: 16, tipo: "pessoa" },
  Haddad: { nome: "Fernando Haddad", sitelinks: 28, tipo: "pessoa" },
  "Nikolas Ferreira": { nome: "Nikolas Ferreira", sitelinks: 7, tipo: "pessoa" },
  "Erika Hilton": { nome: "Erika Hilton", sitelinks: 16, tipo: "pessoa" },
  "Hugo Motta": { nome: "Hugo Motta", sitelinks: 5, tipo: "pessoa" },
  "Douglas Ruas": { nome: "Douglas Ruas", sitelinks: 5, tipo: "pessoa" },
  Garotinho: { nome: "Anthony Garotinho", sitelinks: 5, tipo: "pessoa" },
  "Washington Reis": { nome: "Washington Reis", sitelinks: 4, tipo: "pessoa" },
  TSE: { nome: "Tribunal Superior Eleitoral", sitelinks: 20, tipo: "organizacao" },
  "TRE-RJ": { nome: "Tribunal Regional Eleitoral do Rio de Janeiro", sitelinks: 2, tipo: "organizacao" },
  "Bret Taylor": { nome: "Bret Taylor", sitelinks: 10, tipo: "pessoa" },
  "Sam Altman": { nome: "Sam Altman", sitelinks: 66, tipo: "pessoa" },
  "Jensen Huang": { nome: "Jensen Huang", sitelinks: 48, tipo: "pessoa" },
  "Kevin Warsh": { nome: "Kevin Warsh", sitelinks: 24, tipo: "pessoa" },
};

const buscar: BuscaDeEntidade = async (nome) => MEDIDO[nome] ?? null;
const politica = (atores: string[]) => ({ classificacao: { atores }, motivo: MOTIVOS.APROVADO_POLITICA_BRASIL });
const citacao = (quem: string) => ({ classificacao: { atores: [], quem_fala: quem }, motivo: MOTIVOS.APROVADO_CITACAO_DE_FAMOSO });

describe("a política da abertura eleitoral precisa de alcance nacional", () => {
  it.each(["Lula", "Flávio Bolsonaro", "Tarcísio", "Caiado", "Moraes", "Haddad", "Nikolas Ferreira", "Erika Hilton"])(
    "%s passa",
    async (nome) => {
      expect(await conferirAlcance(politica([nome]), buscar)).toMatchObject({ confere: true, passa: true });
    },
  );

  it("o caso do dono: Douglas Ruas e Garotinho no RJ cai, com o motivo e os números", async () => {
    const v = await conferirAlcance(politica(["Douglas Ruas", "Garotinho", "TRE-RJ"]), buscar);
    expect(v).toMatchObject({ confere: true, passa: false, motivo: "REJECT_LOW_REACH" });
    expect(v.confere && !v.passa && v.explicacao).toContain("Douglas Ruas 5 (pessoa), Garotinho 5 (pessoa), TRE-RJ 2 (organizacao)");
  });

  it("figura nacional como protagonista salva a pauta regional", async () => {
    expect(await conferirAlcance(politica(["Douglas Ruas", "Lula"]), buscar)).toMatchObject({ passa: true });
  });

  it("o comando do Congresso entra pelo cargo, mesmo abaixo do piso", async () => {
    expect(await conferirAlcance(politica(["Hugo Motta"]), buscar)).toMatchObject({ passa: true });
  });

  it("ator sem artigo na Wikipédia conta como regional", async () => {
    const v = await conferirAlcance(politica(["Fulano de Tal", "TRE-RJ"]), buscar);
    expect(v).toMatchObject({ passa: false, motivo: "REJECT_LOW_REACH" });
  });

  it("instituição nacional da lista passa sem rede, inclusive partido e sigla", async () => {
    const espia = vi.fn(buscar);
    expect(await conferirAlcance(politica(["TSE"]), espia)).toMatchObject({ passa: true });
    // Medido em 06/10/2026: "PL" não acha artigo nenhum, e "Nunes Marques" (STF) tem 4 Wikipédias.
    expect(await conferirAlcance(politica(["PL"]), espia)).toMatchObject({ passa: true, protagonista: "PL" });
    expect(await conferirAlcance(politica(["Nunes Marques"]), espia)).toMatchObject({ passa: true });
    expect(await conferirAlcance(politica(["Ministério da Fazenda"]), espia)).toMatchObject({ passa: true });
    expect(espia).not.toHaveBeenCalled();
  });

  it("instituição nacional como árbitro de disputa regional não salva: o caso do RJ com o TSE", async () => {
    // Atores reais do ensaio de 06/10/2026: "RJ: 204 mil eleitores votaram '13' para governador".
    const v = await conferirAlcance(politica(["TSE", "Tribunal Superior Eleitoral", "Garotinho"]), buscar);
    expect(v).toMatchObject({ passa: false, motivo: "REJECT_LOW_REACH" });
  });

  it("instituição no centro com figura nacional junto passa", async () => {
    expect(await conferirAlcance(politica(["PL", "Moraes"]), buscar)).toMatchObject({ passa: true, protagonista: "Moraes" });
  });

  it("erro de rede lança: quem chama decide, e não vira 'desconhecido'", async () => {
    const falha: BuscaDeEntidade = vi.fn(async () => {
      throw new Error("wikipedia 503");
    });
    await expect(conferirAlcance(politica(["Lula"]), falha)).rejects.toThrow("503");
  });

  it("pauta que não é de gente não consulta nada", async () => {
    const espia = vi.fn(buscar);
    const v = await conferirAlcance({ classificacao: { atores: ["Fed"] }, motivo: MOTIVOS.APROVADO_OPORTUNIDADE_EUA }, espia);
    expect(v).toEqual({ confere: false });
    expect(espia).not.toHaveBeenCalled();
  });
});

describe("a citação de famoso precisa de alguém que o leitor reconhece", () => {
  it.each(["Sam Altman", "Jensen Huang", "Kevin Warsh"])("%s passa", async (quem) => {
    expect(await conferirAlcance(citacao(quem), buscar)).toMatchObject({ passa: true });
  });

  it("Bret Taylor (10 Wikipédias, 60 visitas por mês em português) cai", async () => {
    const v = await conferirAlcance(citacao("Bret Taylor"), buscar);
    expect(v).toMatchObject({ passa: false, motivo: "REJECT_LOW_REACH" });
    expect(v.confere && !v.passa && v.explicacao).toContain("abaixo do piso 20");
  });

  it("quem fala sem artigo cai", async () => {
    expect(await conferirAlcance(citacao("Executivo Anônimo"), buscar)).toMatchObject({ passa: false });
  });
});
