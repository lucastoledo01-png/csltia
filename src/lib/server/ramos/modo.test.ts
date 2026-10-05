import { describe, expect, it } from "vitest";
import { modoDosRamos } from "./modo";
import { criarLivroDeCustos } from "./custos";
import { hashDoArtefato, montarPeca, serializarEstavel } from "./peca";

/**
 * O interruptor dos ramos, e o que ele promete: subir o código não muda o dia.
 */
describe("modoDosRamos", () => {
  it("projeto que não declara e ambiente vazio: off, o fluxo de antes", () => {
    expect(modoDosRamos({}, { settings: { capacidades: { evergreen: "off" } } })).toBe("off");
    expect(modoDosRamos({})).toBe("off");
  });

  it("o projeto em produção hoje (05/10/2026) não liga nada", () => {
    // Lido do banco nesta data, por PostgREST.
    const producao = {
      settings: {
        moldes: { recorte: false, sem_foto: false },
        final_line: "Até amanhã. Equipe eua.journal.",
        capacidades: { evergreen: "off" },
        instagram_keyword: "NEWS",
      },
    };
    expect(modoDosRamos({}, producao)).toBe("off");
  });

  it("declarado no projeto, vale o projeto", () => {
    expect(modoDosRamos({}, { settings: { capacidades: { ramos: "enforce" } } })).toBe("enforce");
    expect(modoDosRamos({ EDITORIAL_RAMOS: "enforce" }, { settings: { capacidades: { ramos: "off" } } })).toBe("off");
  });

  it("valor irreconhecível NÃO liga: vira off", () => {
    expect(modoDosRamos({}, { settings: { capacidades: { ramos: "enforse" } } })).toBe("off");
    expect(modoDosRamos({ EDITORIAL_RAMOS: "sim" })).toBe("off");
  });
});

describe("peça pronta", () => {
  it("o hash não depende da ordem das chaves", () => {
    expect(hashDoArtefato({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(hashDoArtefato({ b: { d: [1, 2], c: 2 }, a: 1 }));
    expect(serializarEstavel({ b: 1, a: undefined })).toBe('{"b":1}');
  });

  it("conteúdo diferente dá hash diferente: aprovação antiga NÃO vale para texto reescrito", () => {
    const base = { ramo: "artigo" as const, referenciaId: "x", storyIds: ["s"], titulo: "t", avisos: [], aprovadaPeloAuditor: true, bloqueios: [] };
    const a = montarPeca({ ...base, conteudo: { texto: "O Fed cortou os juros." } });
    const b = montarPeca({ ...base, conteudo: { texto: "O Fed cortou os juros em 0,5 ponto." } });
    expect(a.hashDoArtefato).not.toBe(b.hashDoArtefato);
    expect(a.hashDoArtefato).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("livro de custos", () => {
  it("separa por ramo e soma o dia", () => {
    const livro = criarLivroDeCustos();
    livro.lancar("classificacao", "comum", 0.01, 100);
    livro.lancar("redacao", "artigo", 0.02);
    livro.lancar("redacao", "newsletter", 0.03);
    livro.lancar("redacao", "post", Number.NaN);
    expect(livro.porRamo()).toEqual({ comum: 0.01, artigo: 0.02, newsletter: 0.03, post: 0 });
    expect(livro.total()).toBeCloseTo(0.06);
    // A etapa que rodou sem gastar continua registrada.
    expect(livro.lancamentos()).toHaveLength(4);
  });
});
