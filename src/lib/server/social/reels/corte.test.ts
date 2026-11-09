import { describe, expect, it } from "vitest";
import { ASPECTO_DO_MOLDE, corteDaMascara, corteDoCanalNaGrade, FAIXA_LIMPA_DA_TRANSMISSAO, maiorRetanguloLivre, mascaraDeSobreposicao } from "./corte";

const W = 64;
const H = 112;

/** Quadros sintéticos: fundo que mexe (ruído que muda por quadro) e um logotipo parado no alto. */
function quadros(comLogo: boolean, comFaixa = false): Uint8Array[] {
  const lista: Uint8Array[] = [];
  let semente = 7;
  const aleatorio = () => ((semente = (semente * 1103515245 + 12345) & 0x7fffffff) % 200) + 20;
  for (let q = 0; q < 12; q++) {
    const f = new Uint8Array(W * H);
    for (let i = 0; i < f.length; i++) f[i] = aleatorio();
    if (comLogo) {
      for (let y = 4; y < 14; y++) for (let x = 4; x < 24; x++) f[y * W + x] = (x + y) % 4 < 2 ? 255 : 0;
    }
    if (comFaixa) {
      for (let y = 90; y < 104; y++) for (let x = 0; x < W; x++) f[y * W + x] = x % 6 < 3 ? 250 : 10;
    }
    lista.push(f);
  }
  return lista;
}

describe("o corte automático", () => {
  it("acha o logotipo parado sobre o fundo que mexe", () => {
    const m = mascaraDeSobreposicao(quadros(true), W, H);
    expect(m[8][10]).toBe(true);
    expect(m[60][40]).toBe(false);
  });

  it("vídeo sem sobreposição não tem corte", () => {
    const m = mascaraDeSobreposicao(quadros(false), W, H);
    expect(corteDaMascara(m, ASPECTO_DO_MOLDE.b, { largura: 720, altura: 1280 })).toBeNull();
  });

  it("o corte foge do logotipo e da faixa de legenda", () => {
    const m = mascaraDeSobreposicao(quadros(true, true), W, H);
    const c = corteDaMascara(m, ASPECTO_DO_MOLDE.a, { largura: W * 10, altura: H * 10 });
    expect(c).not.toBeNull();
    const corte = c!;
    // Em pixels do original (10x a grade): longe do logotipo e da faixa.
    const tocaLogo = corte.y < 150 && corte.x < 250;
    const tocaFaixa = corte.y + corte.altura > 890 && corte.y < 1040;
    expect(tocaLogo).toBe(false);
    expect(tocaFaixa).toBe(false);
    expect(Math.abs(corte.largura / corte.altura - ASPECTO_DO_MOLDE.a)).toBeLessThan(0.05);
  });

  it("o maior retângulo respeita a proporção pedida", () => {
    const livre = Array.from({ length: 10 }, () => Array.from({ length: 20 }, () => false));
    const r = maiorRetanguloLivre(livre, 2)!;
    expect(r).toEqual({ x: 0, y: 0, largura: 20, altura: 10 });
  });
});

describe("o corte do vídeo de canal", () => {
  /*
   * A cena do primeiro teste real (Powell em Harvard, CNBC, 09/11/2026): 16:9,
   * logotipo no canto de cima, faixa embaixo, uma coluna escura e parada à
   * esquerda e quem fala do lado direito. O maior retângulo livre era a coluna
   * escura; o corte do canal fica em quem fala.
   */
  const gw = 64;
  const gh = 36;
  const original = { largura: 1920, altura: 1080 };
  const mascara = Array.from({ length: gh }, (_, y) =>
    Array.from({ length: gw }, (_, x) => (y < 4 && x > 54) || y > 29),
  );
  const atividade = new Float64Array(gw * gh);
  for (let y = 8; y < 26; y++) for (let x = 40; x < 50; x++) atividade[y * gw + x] = 30;

  it("centra em quem fala, dentro da faixa limpa, sem tocar a máscara", () => {
    const c = corteDoCanalNaGrade(mascara, atividade, ASPECTO_DO_MOLDE.b, original);
    expect(Math.abs(c.largura / c.altura - ASPECTO_DO_MOLDE.b)).toBeLessThan(0.02);
    const centro = c.x + c.largura / 2;
    expect(centro).toBeGreaterThan((40 / gw) * 1920);
    expect(centro).toBeLessThan((50 / gw) * 1920);
    expect(c.y).toBeGreaterThanOrEqual(Math.floor(FAIXA_LIMPA_DA_TRANSMISSAO.topo * 1080));
    expect(c.y + c.altura).toBeLessThanOrEqual(Math.ceil(FAIXA_LIMPA_DA_TRANSMISSAO.base * 1080));
    expect([c.x, c.y, c.largura, c.altura].every((n) => n % 2 === 0)).toBe(true);
  });

  it("o quadrado também fica fora do logotipo e da faixa", () => {
    const q = corteDoCanalNaGrade(mascara, atividade, ASPECTO_DO_MOLDE.q, original);
    expect(Math.abs(q.largura - q.altura)).toBeLessThanOrEqual(2);
    expect(q.y + q.altura).toBeLessThanOrEqual(Math.ceil(FAIXA_LIMPA_DA_TRANSMISSAO.base * 1080));
    expect(q.y).toBeGreaterThanOrEqual(Math.floor(FAIXA_LIMPA_DA_TRANSMISSAO.topo * 1080));
  });

  it("vídeo sem sobreposição nenhuma ainda fica dentro da faixa limpa", () => {
    const limpa = Array.from({ length: gh }, () => new Array<boolean>(gw).fill(false));
    const c = corteDoCanalNaGrade(limpa, new Float64Array(gw * gh), ASPECTO_DO_MOLDE.b, original);
    expect(c.y).toBeGreaterThanOrEqual(Math.floor(FAIXA_LIMPA_DA_TRANSMISSAO.topo * 1080));
    expect(c.y + c.altura).toBeLessThanOrEqual(Math.ceil(FAIXA_LIMPA_DA_TRANSMISSAO.base * 1080));
  });
});
