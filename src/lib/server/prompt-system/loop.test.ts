import { describe, expect, it } from "vitest";
import { calcularPerformanceScore } from "./loop";

/**
 * A fórmula decide a próxima pauta, então o que estes testes travam não é
 * aritmética — é a intenção editorial. O loop **não otimiza para alcance**:
 * um conteúdo com poucas views e muitos leads tem que valer mais que um viral
 * que não converte. Ordenar por alcance produziria a decisão oposta.
 */

describe("pontuação de desempenho", () => {
  it("o conteúdo pequeno que converte vence o viral que não converte", () => {
    // É o caso que a etapa 14 nomeia explicitamente.
    const pequenoQueConverte = calcularPerformanceScore({
      reach: 2_000,
      saves: 40,
      shares: 10,
      leads: 30,
      clicks: 90,
    });
    const viralQueNaoConverte = calcularPerformanceScore({
      reach: 200_000,
      saves: 500,
      shares: 300,
      leads: 5,
      clicks: 40,
    });

    expect(pequenoQueConverte).toBeGreaterThan(viralQueNaoConverte);
  });

  it("lead pesa mais que clique, salvamento e compartilhamento", () => {
    const base = { reach: 10_000, saves: 0, shares: 0, leads: 0, clicks: 0 };
    const comLead = calcularPerformanceScore({ ...base, leads: 10 });

    expect(comLead).toBeGreaterThan(calcularPerformanceScore({ ...base, clicks: 10 }));
    expect(comLead).toBeGreaterThan(calcularPerformanceScore({ ...base, saves: 10 }));
    expect(comLead).toBeGreaterThan(calcularPerformanceScore({ ...base, shares: 10 }));
  });

  it("normaliza por alcance — campanha grande não vence só por ser grande", () => {
    const eficiente = calcularPerformanceScore({ reach: 1_000, saves: 0, shares: 0, leads: 10, clicks: 0 });
    const inflada = calcularPerformanceScore({ reach: 100_000, saves: 0, shares: 0, leads: 10, clicks: 0 });

    expect(eficiente).toBeGreaterThan(inflada);
  });

  it("alcance zero não gera divisão por zero nem NaN", () => {
    // Acontece de verdade: enquanto os insights da Meta não chegam, reach é 0.
    const s = calcularPerformanceScore({ reach: 0, saves: 5, shares: 2, leads: 3, clicks: 8 });
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBe(0);
  });

  it("alcance negativo é tratado como zero", () => {
    const s = calcularPerformanceScore({ reach: -100, saves: 0, shares: 0, leads: 1, clicks: 0 });
    expect(Number.isFinite(s)).toBe(true);
  });

  it("sem engajamento nenhum a pontuação é zero", () => {
    expect(calcularPerformanceScore({ reach: 50_000, saves: 0, shares: 0, leads: 0, clicks: 0 })).toBe(0);
  });

  it("cabe em numeric(10,4) mesmo num caso extremo", () => {
    // A coluna aceita até 999999,9999. Alcance 1 com 100 leads dava 9.500.000
    // e a gravação do retrato falhava — acontece nos minutos após publicar,
    // enquanto os insights da Meta não chegam.
    const s = calcularPerformanceScore({ reach: 1, saves: 100, shares: 100, leads: 100, clicks: 100 });
    expect(s).toBeLessThan(999_999);
  });

  it("alcance abaixo do piso não infla a taxa", () => {
    // Abaixo de 100 pessoas a taxa por mil não significa nada, então o
    // denominador para de encolher.
    const dez = calcularPerformanceScore({ reach: 10, saves: 0, shares: 0, leads: 1, clicks: 0 });
    const cem = calcularPerformanceScore({ reach: 100, saves: 0, shares: 0, leads: 1, clicks: 0 });
    expect(dez).toBe(cem);
  });

  it("tem no máximo duas casas decimais", () => {
    const s = calcularPerformanceScore({ reach: 3_333, saves: 7, shares: 3, leads: 1, clicks: 11 });
    expect(s).toBe(Math.round(s * 100) / 100);
  });
});
