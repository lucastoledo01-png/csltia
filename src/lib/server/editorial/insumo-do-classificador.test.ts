import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { LIMITE_DO_RESUMO, montarUserDoClassificador, decidirPauta } from "./classificador";
import { carregarConfigEditorial } from "./config";
import {
  conteudoInsuficiente,
  desembrulharTextoDoGPO,
  enriquecerPauta,
  idDoFederalRegister,
  textoDoFederalRegister,
} from "./enriquecimento";

/**
 * O que cada juiz do funil enxerga antes de julgar.
 *
 * A medição de sete dias mostrou 18 pautas aprovadas na linha editorial e 16
 * mortas na verificação, cinco delas por divergência no mesmo campo:
 * `relevancia_no_piso`. A leitura fácil seria "o verificador está severo". A
 * causa era outra: o classificador lia 600 caracteres e o verificador lia
 * 2500 do mesmo texto. O verificador não errou, ele leu mais.
 */

const RAIZ = path.resolve(__dirname, "../../../..");

describe("classificador e verificador julgam o mesmo texto", () => {
  it("o corte do classificador é o mesmo do verificador", () => {
    const verificador = fs.readFileSync(path.join(RAIZ, "src/lib/server/editorial/verificador.ts"), "utf-8");
    const corte = verificador.match(/contexto\.slice\(0,\s*(\d+)\)/);

    expect(corte, "o verificador precisa ter um corte declarado").toBeTruthy();
    expect(Number(corte![1])).toBe(LIMITE_DO_RESUMO);
  });

  it("o resumo entregue ao modelo carrega o texto inteiro até esse limite", () => {
    const longo = "a".repeat(4000);
    const user = montarUserDoClassificador([
      { id: "1", titulo: "t", descricao: longo, fonte: "f", url: "u" },
    ]);

    // O que importa é que não seja mais o corte antigo de 600.
    expect(user).toContain("a".repeat(LIMITE_DO_RESUMO));
    expect(user).not.toContain("a".repeat(LIMITE_DO_RESUMO + 1));
  });
});

describe("REJECT_LOW_RELEVANCE eram três recusas com um nome só", () => {
  const config = carregarConfigEditorial({});

  function classificacao(over: Record<string, unknown> = {}) {
    return {
      id: "c1",
      justificativa: "",
      pais: "EUA",
      leitura: "oportunidade",
      eixo: "processo",
      relevancia: 8,
      natureza: "official_action",
      imigracao: true,
      atores: [],
      lugares: [],
      acontecimento: [],
      ...over,
    } as Parameters<typeof decidirPauta>[0];
  }

  it("nota abaixo do piso continua sendo relevância baixa", () => {
    const r = decidirPauta(classificacao({ relevancia: 2 }), config);
    expect(r.aprovada).toBe(false);
    expect(r.motivo).toBe("REJECT_LOW_RELEVANCE");
  });

  it("declaração política com nota alta é recorte editorial, não nota baixa", () => {
    /*
     * O teto de declaração é 3 e o piso é 4: toda fala sobre ato é reprovada
     * por construção, com a nota que for. Isso é uma decisão de linha
     * editorial, e chamá-la de "pouca relevância" escondia dela no relatório.
     */
    const r = decidirPauta(classificacao({ relevancia: 9, natureza: "political_statement" }), config);
    expect(r.aprovada).toBe(false);
    expect(r.motivo).toBe("REJECT_POLITICAL_STATEMENT");
    expect(r.explicacao).toContain("9");
  });

  it("pauta brasileira fora do eixo tem código próprio", () => {
    const r = decidirPauta(
      classificacao({ pais: "Brasil", relevancia: 9, eixo: "decisao_judicial", imigracao: false }),
      config,
    );
    expect(r.aprovada).toBe(false);
    expect(r.motivo).toBe("REJECT_BR_OFF_AXIS");
  });

  it("nenhum limiar mudou: o que mudou é o que o log diz", () => {
    expect(config.relevanciaMinima).toBe(4);
    expect(config.tetoDeDeclaracao).toBe(3);
  });
});

describe("a página de bloqueio do Federal Register", () => {
  /** O aviso real, como ele volta de federalregister.gov hoje. */
  const BLOQUEIO =
    "Due to aggressive automated scraping of FederalRegister.gov and eCFR.gov, programmatic " +
    "access to these sites is limited to access to our extensive developer APIs. We appreciate " +
    "your understanding. Your request has been flagged as potentially automated. If you are a " +
    "human user receiving this message, please complete the CAPTCHA (bot test) below and click " +
    "Request Access. This process will be necessary for each IP address you wish to access the " +
    "site from. Requests from educational and non profit institutions are automatically approved. " +
    "Please contact us if you have questions about this policy. We apologize for the " +
    "inconvenience and appreciate your patience.";

  it("é reconhecida como bloqueio", () => {
    /*
     * Ela passava pelas três portas: um marcador só ("captcha") e nove frases
     * bem formadas, porque o aviso é escrito em prosa. A guarda tinha nascido
     * por causa deste caso e não o cobria.
     */
    const leitura = conteudoInsuficiente(BLOQUEIO);
    expect(leitura.insuficiente).toBe(true);
    expect(leitura.motivo).toContain("bloqueio");
  });

  it("o enriquecimento não troca texto bom por página de bloqueio", async () => {
    const fetcher = vi.fn(async () =>
      new Response(`<html><body><p>${BLOQUEIO}</p></body></html>`, { status: 200 }),
    ) as unknown as typeof fetch;

    const r = await enriquecerPauta(
      {
        titulo: "Agency Information Collection Activities",
        descricao: "Um resumo oficial curto demais para o mínimo, mas legítimo.",
        url: "https://exemplo.gov/nota",
      },
      fetcher,
    );

    expect(r.texto).not.toContain("CAPTCHA");
    expect(r.enrichmentStatus).not.toBe("enriquecida");
  });
});

describe("Federal Register pela porta documentada", () => {
  it("extrai o id do documento da URL", () => {
    expect(
      idDoFederalRegister("https://www.federalregister.gov/documents/2026/09/04/2026-18099/agency-info"),
    ).toBe("2026-18099");
    expect(idDoFederalRegister("https://www.uscis.gov/news/alerts/algo")).toBeNull();
    expect(idDoFederalRegister("nao e url")).toBeNull();
  });

  it("desembrulha o texto do GPO, que vem dentro de um pre", () => {
    const bruto =
      "<html><head><title>Federal Register</title></head><body><pre>\n[Notices]\n" +
      "O ato come&#231;a aqui &amp; segue.\n</pre></body></html>";
    const texto = desembrulharTextoDoGPO(bruto);

    expect(texto).not.toContain("<pre>");
    expect(texto).not.toContain("Federal Register</title>");
    expect(texto).toContain("&");
  });

  it("usa o abstract quando o texto integral não vem", async () => {
    const abstract = "O Departamento de Segurança Interna publica esta regra. ".repeat(12);
    const fetcher = vi.fn(async (url: string | URL) => {
      if (String(url).includes("/api/v1/documents/")) {
        return new Response(JSON.stringify({ abstract, raw_text_url: null }), { status: 200 });
      }
      return new Response("", { status: 500 });
    }) as unknown as typeof fetch;

    const texto = await textoDoFederalRegister(
      "https://www.federalregister.gov/documents/2026/09/04/2026-18099/x",
      fetcher,
    );
    expect(texto).toBe(abstract.trim());
  });

  it("não interfere em URL que não é do Federal Register", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    expect(await textoDoFederalRegister("https://www.uscis.gov/news/x", fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("o lote fecha por texto, não só por quantidade", () => {
  /*
   * O teto de 20 pautas por chamada foi calibrado com resumos de 600
   * caracteres. Com 2500, vinte pautas viram 50 mil caracteres e o modelo para
   * no meio sem erro: o JSON volta válido e curto, e as pautas que faltam são
   * recusadas por precaução. Na medição de sete dias isso apareceu como 45
   * `REJECT_UNCLASSIFIED` contra 1 antes.
   */
  function pauta(id: number, tamanho: number) {
    return {
      id: String(id),
      titulo: `Pauta ${id}`,
      descricao: "x".repeat(tamanho),
      fonte: "f",
      url: `https://exemplo/${id}`,
    };
  }

  it("vinte pautas longas não cabem num lote só", () => {
    const user = montarUserDoClassificador(Array.from({ length: 20 }, (_, i) => pauta(i, 2500)));
    // O prompt de um lote cheio de textos longos passaria de 50 mil.
    expect(user.length).toBeGreaterThan(45_000);
  });

  it("o orçamento de caracteres é menor que isso", () => {
    const fonte = fs.readFileSync(path.join(RAIZ, "src/lib/server/editorial/classificador.ts"), "utf-8");
    const teto = fonte.match(/CARACTERES_POR_CHAMADA = ([\d_]+)/);
    expect(teto).toBeTruthy();
    expect(Number(teto![1].replace(/_/g, ""))).toBeLessThan(20 * LIMITE_DO_RESUMO);
  });
});
