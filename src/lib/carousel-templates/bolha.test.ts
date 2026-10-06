import { describe, expect, it } from "vitest";
import {
  CANVAS_DO_FEED,
  POSICOES_DA_BOLHA,
  POSICOES_DA_BOLHA_DO_MIOLO,
  POSICAO_PADRAO,
  TOPO_DA_FAIXA_DO_TEXTO,
  TOPO_DA_FAIXA_DO_TEXTO_DO_MIOLO,
  posicaoPorChave,
  ZONA_DA_MARCA,
  caixaEmPixels,
  circuloCruzaCaixa,
  circuloDaPosicao,
  estiloDaPosicao,
  recorteDoCover,
} from "./bolha";
import { assembleSlide } from "./assemble";
import { DEFAULT_TOKENS } from "./tokens";
import type { InstagramSlide } from "./types";

describe("as posições da bolha", () => {
  const canvas = CANVAS_DO_FEED;

  it("a primeira é a posição de sempre, a do CSS", () => {
    expect(POSICAO_PADRAO).toMatchObject({ chave: "padrao", esquerda: 0.04, topo: 0.19, diametro: 0.44 });
  });

  it.each(POSICOES_DA_BOLHA.map((p) => [p.chave, p] as const))(
    "%s fica inteira no canvas, fora da marca e acima da faixa do texto",
    (_, p) => {
      const c = circuloDaPosicao(p, canvas);
      // Com o anel de 7px, que fica fora do círculo.
      const r = c.raio + 7;
      expect(c.cx - r).toBeGreaterThanOrEqual(0);
      expect(c.cx + r).toBeLessThanOrEqual(canvas.width);
      expect(c.cy - r).toBeGreaterThanOrEqual(0);
      // Termina antes do topo da faixa do texto, onde o chapéu pode estar.
      expect(c.cy + r).toBeLessThan(TOPO_DA_FAIXA_DO_TEXTO * canvas.height);
      // E não encosta na marca do topo, com 12px de folga.
      expect(circuloCruzaCaixa({ ...c, raio: r }, caixaEmPixels(ZONA_DA_MARCA, canvas), 12)).toBe(false);
    },
  );

  it("as chaves são únicas", () => {
    const chaves = POSICOES_DA_BOLHA.map((p) => p.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("nenhuma posição fica menor que 30% da largura: menos que isso a bolha vira um ponto", () => {
    expect(Math.min(...POSICOES_DA_BOLHA.map((p) => p.diametro))).toBeGreaterThanOrEqual(0.3);
  });
});

describe("as posições da bolha no miolo da notícia (06/10/2026)", () => {
  const canvas = CANVAS_DO_FEED;

  it.each(POSICOES_DA_BOLHA_DO_MIOLO.map((p) => [p.chave, p] as const))(
    "%s fica inteira no canvas, fora da marca e acima do texto do miolo",
    (_, p) => {
      const c = circuloDaPosicao(p, canvas);
      const r = c.raio + 7;
      expect(c.cx - r).toBeGreaterThanOrEqual(0);
      expect(c.cx + r).toBeLessThanOrEqual(canvas.width);
      expect(c.cy - r).toBeGreaterThanOrEqual(0);
      expect(c.cy + r).toBeLessThan(TOPO_DA_FAIXA_DO_TEXTO_DO_MIOLO * canvas.height);
      expect(circuloCruzaCaixa({ ...c, raio: r }, caixaEmPixels(ZONA_DA_MARCA, canvas), 12)).toBe(false);
    },
  );

  it("as chaves não colidem com as da capa, e a busca por chave acha as duas listas", () => {
    const todas = [...POSICOES_DA_BOLHA, ...POSICOES_DA_BOLHA_DO_MIOLO].map((p) => p.chave);
    expect(new Set(todas).size).toBe(todas.length);
    expect(posicaoPorChave("miolo_esquerda")?.esquerda).toBe(0.07);
    expect(posicaoPorChave("padrao")).toBe(POSICAO_PADRAO);
  });
});

describe("a conta do círculo contra a caixa", () => {
  const circulo = { cx: 100, cy: 100, raio: 50 };

  it("caixa longe não cruza; encostando, cruza", () => {
    expect(circuloCruzaCaixa(circulo, { x0: 200, y0: 200, x1: 300, y1: 300 })).toBe(false);
    expect(circuloCruzaCaixa(circulo, { x0: 140, y0: 90, x1: 200, y1: 110 })).toBe(true);
  });

  it("a diagonal conta pela distância, e não pela caixa do círculo", () => {
    // O canto (140, 140) está a 56,6 do centro: fora do raio 50, embora dentro
    // do quadrado que envolve o círculo.
    expect(circuloCruzaCaixa(circulo, { x0: 140, y0: 140, x1: 200, y1: 200 })).toBe(false);
  });

  it("a folga cresce a caixa para os quatro lados", () => {
    const caixa = { x0: 160, y0: 90, x1: 200, y1: 110 };
    expect(circuloCruzaCaixa(circulo, caixa, 0)).toBe(false);
    expect(circuloCruzaCaixa(circulo, caixa, 15)).toBe(true);
  });

  it("caixa que contém o círculo inteiro cruza", () => {
    expect(circuloCruzaCaixa(circulo, { x0: 0, y0: 0, x1: 1000, y1: 1000 })).toBe(true);
  });
});

describe("o recorte do cover", () => {
  it("foto deitada perde as laterais, centralizada", () => {
    // 4000x2000 num canvas 3:4: a altura manda, sobram as laterais.
    const r = recorteDoCover(4000, 2000, 1080, 1440);
    expect(r.sh).toBeCloseTo(2000);
    expect(r.sw).toBeCloseTo(1500);
    expect(r.sx).toBeCloseTo(1250);
    expect(r.sy).toBeCloseTo(0);
  });

  it("foto em pé e estreita perde em cima e embaixo", () => {
    const r = recorteDoCover(1000, 2000, 1080, 1440);
    expect(r.sw).toBeCloseTo(1000);
    expect(r.sh).toBeCloseTo(1333.33, 1);
    expect(r.sy).toBeCloseTo(333.33, 1);
  });

  it("foto já em 3:4 não perde nada", () => {
    expect(recorteDoCover(2160, 2880, 1080, 1440)).toEqual({ sx: 0, sy: 0, sw: 2160, sh: 2880 });
  });
});

describe("o desenho da bolha na posição", () => {
  const slide = (posicao?: string): InstagramSlide =>
    ({
      index: 1,
      type: "cover",
      title: "Fed mantém juros e o crédito segue caro nos EUA",
      eyebrow: "ECONOMIA",
      body: "",
      bullet_points: [],
      variant: "capa_jornal",
      bg_image_url: "https://x/fundo.jpg",
      inset_image_url: "https://x/bolha.jpg",
      ...(posicao ? { inset_position: posicao } : {}),
    }) as unknown as InstagramSlide;
  const html = (s: InstagramSlide) =>
    assembleSlide(s, {
      format: "noticia",
      tokens: DEFAULT_TOKENS,
      formatConfig: { variantBySlideType: { cover: "capa_jornal" }, eyebrowLabel: null, ctaText: null },
      slideIndex: 1,
      total: 1,
    });

  it("sem posição, a bolha sai onde sempre saiu, sem estilo inline", () => {
    const h = html(slide());
    expect(h).toContain('class="j-bolha" data-posicao="padrao">');
  });

  it("com posição, o círculo leva o lugar dela", () => {
    const h = html(slide("media_esquerda_baixa"));
    expect(h).toContain('data-posicao="media_esquerda_baixa" style="left:4%;top:36%;width:36%;"');
  });

  it("estilo da padrão é vazio, e o das outras é em porcentagem", () => {
    expect(estiloDaPosicao(POSICAO_PADRAO)).toBe("");
    expect(estiloDaPosicao(POSICOES_DA_BOLHA[1])).toBe("left:52%;top:19%;width:44%;");
  });
});
