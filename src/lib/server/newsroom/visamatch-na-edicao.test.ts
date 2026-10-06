import { describe, expect, it } from "vitest";
import { renderEditionToHtml } from "./newsroom-service";
import type { EditionContent } from "./schemas";
import {
  VARIANTES_DO_VISAMATCH,
  configDoVisaMatch,
  vagaDaEdicao,
  varianteDaEdicao,
} from "./visamatch-na-edicao";
import { somarDiasIso, diaDaSemana, type DiaDaSemana } from "../cadencia";

/**
 * O bloco do VisaMatch alterna de formato a cada edição (decisão do dono,
 * 05/10/2026). O que estes testes prendem: a rotação é determinística, nunca
 * repete em duas edições seguidas, passa por todas antes de repetir, cada
 * variante leva o MESMO link com a própria variante no utm_content, e a voz
 * não promete nada nem usa travessão.
 */

// Montado pelo código para o próprio teste não conter o caractere que procura.
const TRAVESSAO = String.fromCharCode(0x2014);
const PROIBIDAS = [/garantid/i, /aprovad/i, /100\s*%/];
const TERCA_A_SEXTA: DiaDaSemana[] = [2, 3, 4, 5];

/** As próximas `n` datas de publicação a partir de `inicio`, inclusive. */
function datasDePublicacao(inicio: string, n: number, dias: DiaDaSemana[] = TERCA_A_SEXTA): string[] {
  const saida: string[] = [];
  for (let d = inicio; saida.length < n; d = somarDiasIso(d, 1)) {
    if (dias.includes(diaDaSemana(d))) saida.push(d);
  }
  return saida;
}

const EDICAO: EditionContent = {
  subject: "assunto de teste",
  subject_options: ["assunto de teste"],
  preheader: "Um preheader de teste com tamanho suficiente para o schema.",
  headline: "Manchete única da edição de teste",
  intro: "Bom dia. Esta é a abertura da edição, com tamanho suficiente para passar na validação do schema.",
  stories: [
    {
      rank: 1,
      category: "Economia",
      title: "Fed mantém os juros e o crédito segue caro nos EUA",
      summary: "Resumo da primeira pauta, longo o bastante para o schema aceitar sem reclamar do tamanho.",
      context: "",
      why_it_matters: "",
      practical_impact: "",
      humor_line: "",
      source_name: "Fonte",
      source_url: "https://exemplo.com/1",
    },
  ],
  quick_bits: [],
  closing: "Fechamento da edição.",
  final_line: "Até amanhã. Equipe eua.journal.",
} as unknown as EditionContent;

describe("as variantes", () => {
  it("são de 6 a 8, com id único, e de formatos diferentes", () => {
    expect(VARIANTES_DO_VISAMATCH.length).toBeGreaterThanOrEqual(6);
    expect(VARIANTES_DO_VISAMATCH.length).toBeLessThanOrEqual(8);
    expect(new Set(VARIANTES_DO_VISAMATCH.map((v) => v.id)).size).toBe(VARIANTES_DO_VISAMATCH.length);
    expect(new Set(VARIANTES_DO_VISAMATCH.map((v) => v.formato)).size).toBe(VARIANTES_DO_VISAMATCH.length);
    // Pelo menos uma depois da despedida (o P.S.), para não ser só troca de palavra.
    expect(VARIANTES_DO_VISAMATCH.some((v) => v.posicao === "depois-do-fechamento")).toBe(true);
  });

  it("toda variante diz que é de parceiro", () => {
    for (const v of VARIANTES_DO_VISAMATCH) {
      expect(v.textos.join(" "), v.id).toMatch(/parceir/i);
    }
  });

  it("nenhuma promete, nenhuma usa travessão", () => {
    for (const v of VARIANTES_DO_VISAMATCH) {
      const texto = v.textos.join(" ");
      for (const p of PROIBIDAS) expect(texto, `${v.id} ${p}`).not.toMatch(p);
      expect(texto, v.id).not.toContain(TRAVESSAO);
    }
  });
});

describe("a rotação", () => {
  it("é determinística: a mesma data dá sempre a mesma variante", () => {
    for (const d of ["2026-10-06", "2026-10-07", "2027-03-02"]) {
      expect(varianteDaEdicao(d).id).toBe(varianteDaEdicao(d).id);
    }
  });

  it("nunca repete em duas edições seguidas, inclusive na virada de sexta para terça", () => {
    const datas = datasDePublicacao("2026-10-06", 60);
    expect(datas).toContain("2026-10-09");
    expect(datas).toContain("2026-10-13");
    for (let i = 1; i < datas.length; i += 1) {
      expect(varianteDaEdicao(datas[i]).id, `${datas[i - 1]} -> ${datas[i]}`).not.toBe(varianteDaEdicao(datas[i - 1]).id);
    }
  });

  it("passa por todas antes de repetir alguma", () => {
    const n = VARIANTES_DO_VISAMATCH.length;
    const datas = datasDePublicacao("2026-10-06", n * 3);
    for (let ini = 0; ini + n <= datas.length; ini += n) {
      const janela = datas.slice(ini, ini + n).map((d) => varianteDaEdicao(d).id);
      expect(new Set(janela).size, janela.join(",")).toBe(n);
    }
  });

  it("segue a cadência do projeto: com segunda a sexta, também não repete em dias seguidos", () => {
    const dias: DiaDaSemana[] = [1, 2, 3, 4, 5];
    const datas = datasDePublicacao("2026-10-05", 30, dias);
    for (let i = 1; i < datas.length; i += 1) {
      expect(varianteDaEdicao(datas[i], { dias }).id).not.toBe(varianteDaEdicao(datas[i - 1], { dias }).id);
    }
    expect(vagaDaEdicao("2026-10-06", dias) - vagaDaEdicao("2026-10-05", dias)).toBe(1);
  });

  it("vale também antes do marco zero (vaga negativa)", () => {
    const datas = datasDePublicacao("2025-11-04", 12);
    for (let i = 1; i < datas.length; i += 1) {
      expect(varianteDaEdicao(datas[i]).id).not.toBe(varianteDaEdicao(datas[i - 1]).id);
    }
  });

  it("o projeto pode fixar uma variante ou trocar a ordem; o que não existe é ignorado", () => {
    expect(varianteDaEdicao("2026-10-06", { variante: "ps" }).id).toBe("ps");
    expect(varianteDaEdicao("2026-10-06", { variante: "nao-existe" }).id).toBe(varianteDaEdicao("2026-10-06").id);
    const ordem = ["quiz", "checklist", "nao-existe"];
    const ids = datasDePublicacao("2026-10-06", 4).map((d) => varianteDaEdicao(d, { ordem }).id);
    expect(new Set(ids)).toEqual(new Set(["quiz", "checklist"]));
    expect(configDoVisaMatch({ visamatch: { variante: "quiz", ordem: ["ps", 3] } })).toEqual({ variante: "quiz", ordem: ["ps"] });
    expect(configDoVisaMatch({})).toEqual({});
    expect(configDoVisaMatch(null)).toEqual({});
  });
});

describe("cada variante, renderizada na edição", () => {
  for (const v of VARIANTES_DO_VISAMATCH) {
    it(`${v.id}: um bloco só, com o link do VisaMatch e a própria variante no utm_content`, () => {
      const html = renderEditionToHtml(EDICAO, new Map(), false, new Map(), "2026-10-06", { variante: v.id });

      const links = [...html.matchAll(/href="([^"]*visamatch[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
      expect(links.length).toBeGreaterThan(0);
      for (const l of links) {
        const u = new URL(l);
        expect(u.hostname).toBe("visamatch.imigrareua.com");
        expect(u.searchParams.get("utm_content")).toBe(v.id);
        expect(u.searchParams.get("utm_source")).toBe("newsletter");
        expect(u.searchParams.get("utm_term")).toBe("edicao-2026-10-06");
        expect(u.searchParams.get("affiliatetype")).toBe("external");
      }
      // Todos os links do bloco são o MESMO link.
      expect(new Set(links).size).toBe(1);

      // O texto que o leitor vê é o declarado na variante, e não promete nada.
      const visivel = html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/\s+/g, " ");
      for (const t of v.textos) expect(visivel, `${v.id}: ${t}`).toContain(t);
      for (const p of PROIBIDAS) expect(visivel, `${v.id} ${p}`).not.toMatch(p);

      // Nenhuma outra variante aparece junto: o convite continua sendo um só.
      for (const outra of VARIANTES_DO_VISAMATCH.filter((o) => o.id !== v.id)) {
        expect(html).not.toContain(`utm_content=${outra.id}&`);
      }

      // O P.S. vem depois da despedida; as outras, antes.
      const despedida = html.indexOf("Até amanhã. Equipe eua.journal.");
      const bloco = html.indexOf(links.length ? "visamatch.imigrareua.com" : "");
      if (v.posicao === "depois-do-fechamento") expect(bloco).toBeGreaterThan(despedida);
      else expect(bloco).toBeLessThan(despedida);
    });
  }

  it("o HTML de cada variante não tem travessão", () => {
    for (const v of VARIANTES_DO_VISAMATCH) {
      const html = renderEditionToHtml(EDICAO, new Map(), false, new Map(), "2026-10-06", { variante: v.id });
      const inicio = html.indexOf("visamatch.imigrareua.com");
      expect(html.slice(Math.max(0, inicio - 3000), inicio + 3000), v.id).not.toContain(TRAVESSAO);
    }
  });
});
