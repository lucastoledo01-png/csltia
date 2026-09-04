import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { assembleSlide, resolveFormatConfig } from "./assemble";
import { DEFAULT_TOKENS } from "./tokens";
import { blocoNovo, orcamentoDeCaracteres, type Layout } from "./layout";
import { renderLayout } from "./layout-render";
import type { InstagramSlide } from "./types";

/**
 * Estes testes abrem um Chromium de verdade, e é deliberado.
 *
 * Os dois bugs que este módulo teve eram invisíveis para teste unitário:
 *
 * 1. A pilha de fontes traz aspas duplas, e `style="font-family:"Epilogue"…"`
 *    fecha o atributo na primeira aspa — o `font-size` era descartado em
 *    silêncio. A string gerada "parecia certa"; só o navegador discorda.
 * 2. O `scrollHeight` de um bloco de altura fracionária vem alguns pixels
 *    acima do `clientHeight` por arredondamento, sempre. Comparar os dois dava
 *    "não coube" mesmo com a caixa vazia, e toda manchete era encolhida sem
 *    motivo.
 *
 * Nenhum dos dois aparece sem renderizar. O custo são ~3 segundos na suíte.
 */

function slideDeTeste(title: string): InstagramSlide {
  return {
    index: 1,
    type: "cover",
    eyebrow: "NOTÍCIA",
    title,
    body: "",
    bullet_points: [],
    highlight_text: "",
    variant: "",
    cover_variant: "dark_speaker",
    headline_style: "clean",
    cover_image_prompt: "",
    bg_image_url: "",
    cta_text: "",
  };
}

function layoutDeCapa(): Layout {
  return {
    canvas: { width: 1080, height: 1440 },
    blocks: [
      {
        ...blocoNovo("texto", 1),
        slot: "titulo",
        x: 7,
        y: 68,
        w: 86,
        h: 22,
        tamanho: 96,
        tamanhoMinimo: 40,
        entrelinha: 0.95,
        alinhamentoVertical: "end",
      },
    ],
  };
}

async function medir(title: string) {
  const html = assembleSlide(slideDeTeste(title), {
    format: "noticia",
    tokens: DEFAULT_TOKENS,
    formatConfig: resolveFormatConfig("noticia"),
    slideIndex: 1,
    total: 1,
    layout: layoutDeCapa(),
  });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1440 } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector("html[data-ajuste-pronto]", { timeout: 20_000 });

    // `await` e não `return` cru: sem ele o `finally` fecha o navegador antes
    // da promessa resolver, e a medição morre com "browser has been closed".
    const medida = await page.evaluate(() => {
      const el = document.querySelector(".lay-texto") as HTMLElement;
      const span = el.firstElementChild as HTMLElement;
      const cs = window.getComputedStyle(el);
      const disponivel =
        el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      return {
        fonte: parseFloat(cs.fontSize),
        transbordou: span.scrollHeight > disponivel + 1,
      };
    });

    return medida;
  } finally {
    await browser.close();
  }
}

describe("render do layout no navegador", () => {
  it("aplica o tamanho desenhado — o atributo de estilo não pode quebrar nas aspas da fonte", async () => {
    const m = await medir("OpenAI lança o GPT-6");

    // 96 é o tamanho do desenho. Qualquer outro valor aqui significa que o
    // estilo não chegou inteiro ou que o encaixe encolheu sem necessidade.
    expect(m.fonte).toBe(96);
    expect(m.transbordou).toBe(false);
  }, 60_000);

  it("encolhe o título longo até caber, sem transbordar", async () => {
    const m = await medir(
      "OpenAI anuncia o GPT-6 com janela de contexto de dez milhões de tokens e " +
        "raciocínio multimodal em tempo real para desenvolvedores do mundo inteiro",
    );

    expect(m.fonte).toBeLessThan(96);
    expect(m.fonte).toBeGreaterThanOrEqual(40); // o piso do bloco
    expect(m.transbordou).toBe(false);
  }, 60_000);
});

describe("montagem do HTML", () => {
  it("escapa as aspas da pilha de fontes dentro do atributo de estilo", () => {
    const html = renderLayout(layoutDeCapa(), slideDeTeste("Teste"), {
      tokens: DEFAULT_TOKENS,
      eyebrowLabel: "",
      ctaText: "",
      slideIndex: 1,
      total: 1,
    });

    // A pilha da Epilogue traz aspas duplas. Cruas, elas fechariam o atributo.
    expect(html).toContain("&quot;Epilogue&quot;");
    expect(html).toContain("font-size:96px");
  });

  it("bloco de texto sem conteúdo não vira caixa vazia no slide", () => {
    const layout: Layout = {
      canvas: { width: 1080, height: 1440 },
      blocks: [{ ...blocoNovo("texto", 1), slot: "destaque", fundo: "#ff0000" }],
    };

    const html = renderLayout(layout, slideDeTeste("Título"), {
      tokens: DEFAULT_TOKENS,
      eyebrowLabel: "",
      ctaText: "",
      slideIndex: 1,
      total: 1,
    });

    // O slide não tem destaque. Um retângulo vermelho flutuando no meio do post
    // seria o resultado de renderizar o bloco mesmo assim.
    expect(html).not.toContain("#ff0000");
  });

  it("recusa URL de imagem que não seja https: ou data:", () => {
    const layout: Layout = {
      canvas: { width: 1080, height: 1440 },
      blocks: [
        {
          ...blocoNovo("imagem", 1),
          imagem: "fixa",
          imagemUrl: "javascript:alert(1)",
        },
      ],
    };

    const html = renderLayout(layout, slideDeTeste("Título"), {
      tokens: DEFAULT_TOKENS,
      eyebrowLabel: "",
      ctaText: "",
      slideIndex: 1,
      total: 1,
    });

    expect(html).not.toContain("javascript:");
  });
});

describe("orçamento de caracteres", () => {
  it("cresce com a caixa e encolhe com a fonte", () => {
    const canvas = { width: 1080, height: 1440 };
    const base = { ...blocoNovo("texto", 1), w: 80, h: 20, tamanho: 60 };

    const maior = orcamentoDeCaracteres({ ...base, h: 40 }, canvas);
    const menor = orcamentoDeCaracteres(base, canvas);
    const fonteGrande = orcamentoDeCaracteres({ ...base, tamanho: 120 }, canvas);

    expect(maior).toBeGreaterThan(menor);
    expect(fonteGrande).toBeLessThan(menor);
  });

  it("é zero para bloco que não é de texto", () => {
    expect(orcamentoDeCaracteres(blocoNovo("imagem", 1), { width: 1080, height: 1440 })).toBe(0);
  });
});
