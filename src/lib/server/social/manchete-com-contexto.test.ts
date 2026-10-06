import { describe, expect, it } from "vitest";
import {
  conferirContextoDaManchete,
  deiticosSemReferente,
  ehFamosoParaOPublico,
  pessoasSemApresentacao,
  semSujeitoReconhecivel,
  variacoesSemMetrica,
} from "./manchete-com-contexto";

/*
 * Os casos são as manchetes REAIS da fila de 07/10/2026 que o dono devolveu,
 * com os pacotes factuais como estavam gravados (recortados ao que a régua lê).
 * A lição de 16/09 vale aqui: fixture inventada testa a fixture.
 */
const pacoteTaylor = {
  people: ["Bret Taylor", "David Singleton"],
  organizations: ["Walmart", "Meta", "OpenAI", "Sierra", "Stripe"],
  places: ["U..S"],
  citacoes: [
    { autor: "Taylor", original: "It is kind of chaos until such a standard exists", traducao: "É uma espécie de caos até que tal padrão exista" },
  ],
};

const pacoteRuas = {
  people: ["Anthony Garotinho", "Douglas Ruas", "Eduardo Paes", "Alexandre Espinosa"],
  organizations: ["MPE", "TSE"],
  places: ["RJ", "Rio de Janeiro"],
  citacoes: [],
};

const pacoteCaiado = {
  // Com a esposa no pacote, como estava gravado: o sobrenome sozinho não pode apontar para ela.
  people: ["Ronaldo Caiado", "Flávio Bolsonaro", "Luiz Inácio Lula da Silva", "Gracinha Caiado", "Gustavo Gayer"],
  organizations: ["PL"],
  places: ["Goiânia"],
  citacoes: [],
};

describe("a manchete com contexto: os cinco posts reais de 07/10/2026", () => {
  it("recusa a fala de Bret Taylor sem cargo e com 'tal padrão' sem referente", () => {
    const h = "Bret Taylor: “É uma espécie de caos até que tal padrão exista”";
    const regras = conferirContextoDaManchete(h, { pacote: pacoteTaylor }).map((p) => p.regra);
    expect(regras).toContain("citacao_com_deitico");
    expect(regras).toContain("pessoa_sem_apresentacao");
  });

  it("aceita a reescrita com cargo e sem dêitico", () => {
    const h = "Bret Taylor, presidente do conselho da OpenAI, sobre agentes de IA nas empresas: “É uma espécie de caos”";
    expect(conferirContextoDaManchete(h, { pacote: pacoteTaylor })).toEqual([]);
  });

  it("aceita o dêitico quando o referente está nomeado fora das aspas", () => {
    const h = "Bret Taylor, da Sierra, sobre o padrão para agentes de IA: “É uma espécie de caos até que tal padrão exista”";
    expect(deiticosSemReferente(h)).toEqual([]);
  });

  it("recusa Douglas Ruas sem apresentação, e aceita com o cargo em disputa", () => {
    const ruim = "Douglas Ruas pode vencer no primeiro turno se votos de Garotinho forem anulados no RJ";
    expect(pessoasSemApresentacao(ruim, { pacote: pacoteRuas })).toEqual(["Douglas Ruas"]);
    const bom = "Votos anulados de Garotinho podem eleger Douglas Ruas governador do Rio sem segundo turno contra Eduardo Paes";
    expect(conferirContextoDaManchete(bom, { pacote: pacoteRuas })).toEqual([]);
  });

  it("aceita Ronaldo Caiado sem cargo: é conhecido do público brasileiro", () => {
    const h = "Ronaldo Caiado oficializa apoio a Flávio Bolsonaro no segundo turno em Goiânia";
    expect(conferirContextoDaManchete(h, { pacote: pacoteCaiado })).toEqual([]);
    expect(conferirContextoDaManchete("Caiado, derrotado no primeiro turno, oficializa apoio a Flávio Bolsonaro contra Lula", { pacote: pacoteCaiado })).toEqual([]);
    // Quem não é conhecido e abre a frase continua cobrado, mesmo com o sobrenome famoso.
    expect(pessoasSemApresentacao("Gracinha Caiado comemora vitória em Goiás", { pacote: pacoteCaiado })).toEqual(["Gracinha Caiado"]);
  });

  it("recusa 'SpaceX sobe quase 8%' e aceita 'Ações da SpaceX sobem quase 8%'", () => {
    const ruim = "SpaceX sobe quase 8%, atinge maior nível desde meados de junho e devolve Musk ao status de trilionário";
    const problemas = conferirContextoDaManchete(ruim, {});
    expect(problemas.map((p) => p.regra)).toEqual(["variacao_sem_metrica"]);
    expect(problemas[0].detalhe).toContain("SpaceX sobe quase 8%");
    expect(conferirContextoDaManchete("Ações da SpaceX sobem quase 8% e devolvem Elon Musk ao status de trilionário")).toEqual([]);
  });

  it("aceita a manchete da Anthropic: o defeito dela era de render, não de texto", () => {
    expect(conferirContextoDaManchete("Anthropic amplia programa para startups com até US$ 45.000 em descontos e créditos")).toEqual([]);
  });
});

describe("variação sem métrica", () => {
  it("confere o lide também, oração por oração", () => {
    expect(variacoesSemMetrica("As ações da SpaceX subiram quase 8% na segunda-feira (5), atingindo o maior nível")).toEqual([]);
    expect(variacoesSemMetrica("A Nvidia caiu 3,5% na terça-feira (6) depois do anúncio.")).toEqual([
      "A Nvidia caiu 3,5% na terça-feira (6) depois do anúncio",
    ]);
  });

  it("aceita índice, moeda, inflação e pesquisa como métrica", () => {
    for (const t of [
      "Ibovespa sobe 2% e passa de 200 mil pontos",
      "Dólar cai 1,2% e fecha abaixo de R$ 5",
      "Inflação nos EUA avança 0,4% em setembro",
      "Lula sobe 3 pontos na pesquisa Quaest",
      "Valor de mercado da Apple dispara US$ 200 bilhões",
    ]) {
      expect(variacoesSemMetrica(t)).toEqual([]);
    }
  });

  it("recusa empresa ou pessoa que 'sobe' ou 'cai' sem a métrica", () => {
    expect(variacoesSemMetrica("Tesla dispara 12% após entrega recorde")).toHaveLength(1);
    expect(variacoesSemMetrica("Lula cresce 3 pontos e encosta em Flávio")).toHaveLength(1);
  });

  it("não confunde verbo de variação sem número com variação medida", () => {
    expect(variacoesSemMetrica("Trump sobe o tom contra a China")).toEqual([]);
    expect(variacoesSemMetrica("Meta ganha processo na Califórnia")).toEqual([]);
  });
});

describe("sujeito reconhecível", () => {
  it("recusa manchete que abre com pronome", () => {
    expect(semSujeitoReconhecivel("Ele promete cortar impostos de quem ganha menos")).toMatch(/pronome/);
  });

  it("recusa manchete que não nomeia ninguém", () => {
    expect(semSujeitoReconhecivel("Empresas cortam vagas em ritmo mais lento")).toMatch(/não nomeia/);
  });

  it("aceita nome, sigla e marca", () => {
    expect(semSujeitoReconhecivel("Emprego nos EUA muda pouco e taxa de desemprego fica em 4,2%")).toBeNull();
    expect(semSujeitoReconhecivel("SpaceX lança missão")).toBeNull();
    expect(semSujeitoReconhecivel("Quem procura emprego passa a ver a faixa salarial, na Califórnia")).toBeNull();
  });
});

describe("a régua de fama", () => {
  it("reconhece pelo nome inteiro e pelo sobrenome famoso", () => {
    expect(ehFamosoParaOPublico("Elon Musk")).toBe(true);
    expect(ehFamosoParaOPublico("Musk")).toBe(true);
    expect(ehFamosoParaOPublico("Caiado")).toBe(true);
    expect(ehFamosoParaOPublico("Bret Taylor")).toBe(false);
    expect(ehFamosoParaOPublico("Douglas Ruas")).toBe(false);
  });

  it("fala de famoso sem cargo passa; sem pacote, o prefixo 'Nome:' é conferido", () => {
    expect(pessoasSemApresentacao("Trump: “Os EUA vão vencer a corrida da inteligência artificial”")).toEqual([]);
    expect(pessoasSemApresentacao("Jensen Huang: “A demanda por chips de IA segue acima da oferta”")).toEqual(["Jensen Huang"]);
    expect(pessoasSemApresentacao("Jensen Huang, CEO da Nvidia: “A demanda por chips de IA segue acima da oferta”")).toEqual([]);
  });
});
