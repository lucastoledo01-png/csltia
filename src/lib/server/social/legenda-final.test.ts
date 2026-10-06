import { describe, expect, it } from "vitest";
import { MARCA } from "@/lib/marca";
import {
  CTA_DA_LEGENDA,
  autorDaFoto,
  ehLinhaDeCredito,
  fecharLegenda,
  hashtagsLigadasNoProjeto,
  legendaDoInstagram,
  linhaDeCredito,
  linhaDeCreditoSoComNomes,
  siglaDaLicenca,
} from "./legenda-final";
import { montarLegenda, type CopyDoPost } from "./copy";

/**
 * As duas regras do dono para a legenda do Instagram (06/10/2026), em código:
 * o crédito de foto é UMA linha curta, a última, montada pelo código; e o
 * corpo fecha com "Siga @eua.journal", uma vez. Os textos de crédito abaixo
 * são as formas que a casa já gravou e as que o modelo costuma escrever.
 */

const CORPO = [
  "O Federal Reserve cortou os juros em 0,25 ponto na quarta-feira (1), para a faixa de 4% a 4,25%, segundo o comunicado do banco central.",
  "A decisão teve dois votos contrários, de acordo com a ata divulgada pelo Fed.",
  "A próxima reunião está marcada para 28 de outubro.",
].join("\n\n");

describe("o fecho é sempre o mesmo, uma vez, depois de uma linha em branco", () => {
  it("o handle sai da marca, nunca escrito à mão", () => {
    expect(CTA_DA_LEGENDA).toBe(`Siga ${MARCA.instagramHandle}`);
    expect(CTA_DA_LEGENDA).toBe("Siga @eua.journal");
  });

  it("sem crédito, o fecho é a última linha", () => {
    const t = legendaDoInstagram(CORPO);
    expect(t.endsWith(`\n\n${CTA_DA_LEGENDA}`)).toBe(true);
    expect(t.match(/Siga @eua\.journal/g)).toHaveLength(1);
  });

  it("um fecho escrito pelo modelo, no meio ou repetido, não duplica", () => {
    const t = legendaDoInstagram(`Siga @eua.journal\n\n${CORPO}\n\nSiga @eua.journal\nSiga @eua.journal`);
    expect(t.match(/Siga @eua\.journal/g)).toHaveLength(1);
    expect(t.startsWith("O Federal Reserve")).toBe(true);
  });

  it("outro fecho e o convite de comentário antigo saem", () => {
    const t = legendaDoInstagram(
      `${CORPO}\n\nComente NEWS e receba no Direct o link da nossa newsletter.\n\nSiga @outra.conta\n\nLink na bio.`,
      { keyword: "NEWS" },
    );
    expect(t).not.toMatch(/Comente|@outra|Link na bio/);
    expect(t.endsWith("Siga @eua.journal")).toBe(true);
  });

  it("é idempotente: passar duas vezes dá o mesmo texto", () => {
    const uma = legendaDoInstagram(CORPO, { credito: "Foto: Daniel Torok" });
    expect(legendaDoInstagram(uma, { credito: "Foto: Daniel Torok" })).toBe(uma);
    expect(legendaDoInstagram(uma, { credito: "manter" })).toBe(uma);
  });
});

describe("a linha do crédito é a última, logo abaixo do fecho", () => {
  it("corpo, linha em branco, Siga, e o crédito na linha seguinte", () => {
    const t = legendaDoInstagram(CORPO, { credito: "Foto: Daniel Torok" });
    expect(t.endsWith("\n\nSiga @eua.journal\nFoto: Daniel Torok")).toBe(true);
  });

  it("sem crédito montado, não há linha de crédito", () => {
    expect(legendaDoInstagram(CORPO, { credito: "" })).not.toMatch(/Foto/);
  });
});

describe("crédito escrito no corpo sai, em qualquer formato", () => {
  const FORMAS = [
    "Foto: Gage Skidmore / Wikimedia Commons / CC BY-SA 4.0",
    "· Foto: Tony Webster / Wikimedia Commons / CC BY-SA 2.0; Foto: Fulano / Flickr / CC BY 2.0",
    "Crédito: Reuters",
    "Créditos da foto: Joe Ravi, CC BY-SA 3.0, via Wikimedia Commons",
    "Fotos: Pexels",
    "Photo by Klea Masati on Unsplash",
    "Imagem: Divulgação",
    "Reprodução/Instagram",
    "Licença Pexels",
    "Dietmar Rabich, CC BY-SA 4.0, via Wikimedia Commons",
    "Wall Street (Wikimedia Commons, domínio público)",
    "- Foto de Klea Masati via Pexels",
  ];

  for (const forma of FORMAS) {
    it(`tira "${forma}"`, () => {
      expect(ehLinhaDeCredito(forma)).toBe(true);
      const t = legendaDoInstagram(`${CORPO}\n\n${forma}`);
      expect(t).toBe(`${CORPO}\n\nSiga @eua.journal`);
    });
  }

  it("tira o crédito entre parênteses e o que vem colado no fim da frase", () => {
    const t = legendaDoInstagram(
      "O prédio do Capitólio amanheceu cercado (Foto: Fulano/Wikimedia) na terça-feira (30). Foto: Reuters",
    );
    expect(t).toBe("O prédio do Capitólio amanheceu cercado na terça-feira (30).\n\nSiga @eua.journal");
  });

  it("tira um crédito velho mesmo abaixo do fecho e põe só o montado", () => {
    const antiga = `${CORPO}\n\n#EconomiaEUA\n\n· Foto: Tony Webster / Wikimedia Commons / CC BY-SA 2.0`;
    // A linha no formato antigo, com sigla, sai só com o nome (regra do dono, 06/10/2026, noite).
    const t = legendaDoInstagram(antiga, { credito: "Foto: Tony Webster (CC BY-SA 2.0)" });
    expect(t).toBe(`${CORPO}\n\nSiga @eua.journal\nFoto: Tony Webster`);
    expect(t.match(/Foto:/g)).toHaveLength(1);
  });

  it("não confunde notícia com crédito", () => {
    for (const frase of [
      "A foto viralizou nas redes depois da posse, segundo a CNN Brasil.",
      "A Getty Images anunciou a compra da Shutterstock por US$ 3,7 bilhões, segundo as duas empresas.",
      "O Pexels foi citado no processo como exemplo de banco gratuito de imagens usado por empresas de mídia em todo o país.",
    ]) {
      expect(ehLinhaDeCredito(frase)).toBe(false);
      expect(legendaDoInstagram(frase)).toContain(frase);
    }
  });

  it("linha de 'Fonte:' sai: a atribuição mora dentro da frase", () => {
    expect(legendaDoInstagram(`${CORPO}\n\nFonte: Reuters`)).toBe(`${CORPO}\n\nSiga @eua.journal`);
  });
});

describe("hashtag só com o projeto pedindo", () => {
  it("por padrão sai, em qualquer lugar", () => {
    const t = legendaDoInstagram(`O #Fed cortou os juros.\n\n#EconomiaEUA #Juros`);
    expect(t).not.toContain("#");
    expect(t).toBe("O cortou os juros.\n\nSiga @eua.journal");
  });

  it("ligada, entra num bloco antes do fecho, e o fecho segue antes do crédito", () => {
    const t = legendaDoInstagram(CORPO, { hashtags: ["#EconomiaEUA", "#Fed"], credito: "Foto: Daniel Torok" });
    expect(t.endsWith("\n\n#EconomiaEUA #Fed\n\nSiga @eua.journal\nFoto: Daniel Torok")).toBe(true);
  });

  it("a chave do projeto: só true liga", () => {
    expect(hashtagsLigadasNoProjeto({ instagram: { hashtags: true } })).toBe(true);
    expect(hashtagsLigadasNoProjeto({ instagram: { hashtags: "sim" } })).toBe(false);
    expect(hashtagsLigadasNoProjeto({})).toBe(false);
    expect(hashtagsLigadasNoProjeto(null)).toBe(false);
  });
});

describe("parágrafos separados por uma linha em branco", () => {
  it("colapsa linhas em branco a mais e tira espaço das pontas", () => {
    const t = legendaDoInstagram("\n\nPrimeiro parágrafo.  \n\n\n\nSegundo parágrafo.\n\n\n");
    expect(t).toBe("Primeiro parágrafo.\n\nSegundo parágrafo.\n\nSiga @eua.journal");
  });

  it("montarLegenda junta o lide e os parágrafos com uma linha em branco, e linha solta vira espaço", () => {
    const copy = {
      headline: "x",
      destaque: "",
      gancho: "O lide.",
      paragrafos: ["Primeiro\nparágrafo.", "Segundo.\n\nTerceiro."],
      fato_principal: "não entra quando há parágrafos",
      contexto: "",
      informacao_util: "",
      ressalva: "",
      cta: "",
      hashtags: [],
    } as CopyDoPost;
    expect(montarLegenda(copy)).toBe("O lide.\n\nPrimeiro parágrafo.\n\nSegundo.\n\nTerceiro.");
  });

  it("sem parágrafos, os campos antigos ainda montam a legenda (instrução antiga ativa no banco)", () => {
    const copy = {
      headline: "x",
      destaque: "",
      gancho: "O lide.",
      fato_principal: "O fato.",
      contexto: "O contexto.",
      informacao_util: "",
      ressalva: "",
      cta: "",
      hashtags: [],
    } as CopyDoPost;
    expect(montarLegenda(copy)).toBe("O lide.\n\nO fato.\n\nO contexto.");
  });

  it("o teto é respeitado e o corpo cede, nunca o fecho nem o crédito", () => {
    const enorme = Array.from({ length: 40 }, (_, i) => `Parágrafo ${i} ${"palavra ".repeat(15)}fim.`).join("\n\n");
    const t = legendaDoInstagram(enorme, { credito: "Foto: Daniel Torok" });
    expect(t.length).toBeLessThanOrEqual(2000);
    expect(t.endsWith("Siga @eua.journal\nFoto: Daniel Torok")).toBe(true);
    // Corta em parágrafo inteiro.
    expect(t.split("\n\n").slice(0, -1).every((p) => p.endsWith("fim."))).toBe(true);
  });
});

describe("a linha do crédito, montada das fotos", () => {
  it("Pexels e Unsplash: só o nome, sem 'Licença Pexels'", () => {
    expect(linhaDeCredito([{ author: "Klea Masati", license: "Pexels License", attribution: "" }])).toBe(
      "Foto: Klea Masati",
    );
  });

  it("CC BY-SA: só o nome, sem sigla e sem 'via Wikimedia Commons' (regra do dono, 06/10/2026, noite)", () => {
    expect(
      linhaDeCredito([
        { author: "Gage Skidmore", license: "CC BY-SA 4.0", attribution: "Foto: Gage Skidmore / Wikimedia Commons / CC BY-SA 4.0" },
      ]),
    ).toBe("Foto: Gage Skidmore");
  });

  it("domínio público e CC0: só o nome", () => {
    expect(linhaDeCredito([{ author: "Daniel Torok", license: "Public Domain", attribution: "" }])).toBe(
      "Foto: Daniel Torok",
    );
    expect(linhaDeCredito([{ author: "Fulano", license: "CC0", attribution: "" }])).toBe("Foto: Fulano");
  });

  it("sem autor conhecido, sem linha (nunca 'Foto: desconhecido')", () => {
    expect(linhaDeCredito([{ author: "", license: "CC BY-SA 4.0", attribution: "Foto: autor não identificado / Wikimedia Commons / CC BY-SA 4.0" }])).toBe("");
    expect(linhaDeCredito([{ author: "Unknown", license: "Pexels License" }])).toBe("");
    expect(linhaDeCredito([null, undefined])).toBe("");
  });

  it("sem o campo de autor, lê o nome da atribuição gravada", () => {
    expect(autorDaFoto({ attribution: "Foto: Tdorante10 / Wikimedia Commons / CC BY-SA 4.0" })).toBe("Tdorante10");
    expect(autorDaFoto({ attribution: "Dietmar Rabich, CC BY-SA 4.0, via Wikimedia Commons" })).toBe("Dietmar Rabich");
    expect(autorDaFoto({ author: "<a href='x'>Joe Ravi</a>" })).toBe("Joe Ravi");
  });

  it("várias fotos: 'Fotos: A, B e C', sem repetir e sem sigla", () => {
    expect(
      linhaDeCredito([
        { author: "Gage Skidmore", license: "CC BY-SA 2.0" },
        { author: "Klea Masati", license: "Pexels License" },
        { author: "Gage Skidmore", license: "CC BY-SA 2.0" },
        { author: "Daniel Torok", license: "Public Domain" },
      ]),
    ).toBe("Fotos: Gage Skidmore, Klea Masati e Daniel Torok");
  });

  it("mais de três nomes: os três primeiros e 'e outros'", () => {
    expect(
      linhaDeCredito([{ author: "A" + "na" }, { author: "Bia" }, { author: "Caio" }, { author: "Duda" }]),
    ).toBe("Fotos: Ana, Bia, Caio e outros");
  });

  it("a sigla: CC BY e CC BY-SA com versão; NC, ND e o resto, nada", () => {
    expect(siglaDaLicenca("CC BY-SA 4.0")).toBe("CC BY-SA 4.0");
    expect(siglaDaLicenca("cc-by-2.0")).toBe("CC BY 2.0");
    expect(siglaDaLicenca("CC BY")).toBe("CC BY");
    expect(siglaDaLicenca("Pexels License")).toBe("");
    expect(siglaDaLicenca("CC0")).toBe("");
  });

  it("a edição à mão preserva a linha curta abaixo do fecho e tira o resto", () => {
    const fechada = legendaDoInstagram(CORPO, { credito: "Foto: Daniel Torok" });
    const editada = fechada.replace("O Federal Reserve", "O Fed") + "\nvia Wikimedia Commons";
    const t = fecharLegenda(`Foto: Outro / Wikimedia Commons\n\n${editada}`, { credito: "manter" }).texto;
    expect(t.endsWith("Siga @eua.journal\nFoto: Daniel Torok")).toBe(true);
    expect(t.match(/Foto:/g)).toHaveLength(1);
    expect(t).not.toMatch(/Wikimedia/);
  });
});

/*
 * A fila de 07/10/2026: o dono leu "Fotos: Lucio Bernardo Jr./Câmara dos
 * Deputados (CC BY) e Leonardo Prado/Câmara dos Deputados (CC BY)" e pediu só
 * os nomes. Os créditos abaixo são os gravados nos posts daquele dia.
 */
describe("só o nome de quem fez a foto (regra do dono, 06/10/2026, noite)", () => {
  it("banco oficial: o fotógrafo, sem o banco e sem a sigla", () => {
    expect(
      linhaDeCredito([
        { author: "Lucio Bernardo Jr.", license: "CC BY", attribution: "Foto: Lucio Bernardo Jr./Câmara dos Deputados" },
        { author: "", license: "CC BY", attribution: "Foto: Leonardo Prado/Câmara dos Deputados / Wikimedia Commons / CC BY" },
      ]),
    ).toBe("Fotos: Lucio Bernardo Jr. e Leonardo Prado");
  });

  it("banco sem fotógrafo: a instituição sozinha", () => {
    expect(linhaDeCredito([{ author: "", license: "Public Domain", attribution: "Foto: NASA" }])).toBe("Foto: NASA");
  });

  it("o 'from Washington, DC, USA' do Flickr sai", () => {
    expect(
      linhaDeCredito([
        {
          author: "Bruno Sanchez-Andrade Nuño from Washington, DC, USA",
          license: "CC BY",
          attribution: "Foto: Bruno Sanchez-Andrade Nuño from Washington, DC, USA / Wikimedia Commons / CC BY",
        },
      ]),
    ).toBe("Foto: Bruno Sanchez-Andrade Nuño");
  });

  it("a linha antiga gravada no post é reescrita no fecho, venha da refação ou do painel", () => {
    const antiga =
      "Fotos: Lucio Bernardo Jr./Câmara dos Deputados (CC BY) e Leonardo Prado/Câmara dos Deputados (CC BY)";
    expect(linhaDeCreditoSoComNomes(antiga)).toBe("Fotos: Lucio Bernardo Jr. e Leonardo Prado");
    expect(linhaDeCreditoSoComNomes("Foto: Bruno Sanchez-Andrade Nuño from Washington, DC, USA (CC BY)")).toBe(
      "Foto: Bruno Sanchez-Andrade Nuño",
    );
    expect(linhaDeCreditoSoComNomes("Fotos: Ana (CC BY), Bia, Caio e outros")).toBe("Fotos: Ana, Bia, Caio e outros");
    expect(legendaDoInstagram("Corpo do post.", { credito: antiga })).toBe(
      "Corpo do post.\n\nSiga @eua.journal\nFotos: Lucio Bernardo Jr. e Leonardo Prado",
    );
    // A edição à mão do painel preserva a linha abaixo do fecho, já reescrita.
    expect(legendaDoInstagram(`Corpo do post.\n\nSiga @eua.journal\n${antiga}`, { credito: "manter" })).toBe(
      "Corpo do post.\n\nSiga @eua.journal\nFotos: Lucio Bernardo Jr. e Leonardo Prado",
    );
  });

  it("é idempotente: a linha nova passa igual", () => {
    expect(linhaDeCreditoSoComNomes("Fotos: Lucio Bernardo Jr. e Leonardo Prado")).toBe(
      "Fotos: Lucio Bernardo Jr. e Leonardo Prado",
    );
    expect(linhaDeCreditoSoComNomes("Foto: Paloma Lima")).toBe("Foto: Paloma Lima");
  });
});
