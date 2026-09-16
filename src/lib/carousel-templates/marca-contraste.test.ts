import { describe, expect, it } from "vitest";
import { SCRIPT_DE_AJUSTE } from "./layout-render";
import { SLIDE_VARIANTS } from "./variants";
import { MARCA } from "@/lib/marca";
import type { InstagramSlide, VariantContext } from "./types";
import { DEFAULT_TOKENS } from "./tokens";

/**
 * A marca clara ou a escura, decidida pelo brilho da foto atrás dela.
 *
 * O logotipo do topo tem o "usa" em branco, desenhado para foto escura, e em
 * céu claro ele sumia: a peça saía com meia marca, só o ".journal" vermelho. O
 * dono apontou isso em 16/09/2026 com um caso concreto, céu branco.
 *
 * Não dá para resolver na hora de escrever o código, porque quem decide é a
 * foto que o resolvedor achou naquele dia. A decisão é medida no navegador,
 * com a peça montada, e estes testes guardam as três coisas que a fizeram
 * falhar durante a implementação.
 */

function ctx(): VariantContext {
  return {
    format: "noticia",
    tokens: DEFAULT_TOKENS,
    eyebrowLabel: "",
    ctaText: "",
    slideIndex: 1,
    total: 1,
  };
}

function slide(): InstagramSlide {
  return {
    index: 1,
    type: "cover",
    eyebrow: "Economia",
    title: "Uma manchete",
    body: "",
    bullet_points: [],
    highlight_text: "",
    variant: "capa_jornal",
    cover_variant: "dark_speaker",
    headline_style: "clean",
    cover_image_prompt: "",
    bg_image_url: "https://upload.wikimedia.org/foto.jpg",
    cta_text: "",
  } as unknown as InstagramSlide;
}

describe("a capa leva as duas versões da marca", () => {
  it("emite a escura como padrão e a clara como alternativa", () => {
    const html = SLIDE_VARIANTS.cover.capa_jornal.render(slide(), ctx()).body;

    expect(html).toContain(`src="${MARCA.logoEscuro}"`);
    expect(html).toContain(`data-claro="${MARCA.logoClaro}"`);
  });

  it("as duas versões são arquivos diferentes", () => {
    // Apontar as duas para o mesmo arquivo faria a troca acontecer e não
    // mudar nada, que é o defeito mais difícil de enxergar numa imagem.
    expect(MARCA.logoClaro).not.toBe(MARCA.logoEscuro);
  });
});

describe("o script que decide", () => {
  /**
   * A ARMADILHA que custou a implementação.
   *
   * O script mora dentro de um template literal do TypeScript, e o literal
   * processa escapes antes de a string existir. Escrita com uma barra só, a
   * expressão chega ao navegador como /url(["']?(.*?)["']?)/, sem escapar o
   * parêntese: ela deixa de casar a função url(), devolve string vazia, a
   * medição nunca roda e a marca fica sempre escura.
   *
   * O sintoma é silêncio, não erro. Por isso o teste não confere o texto do
   * arquivo: ele monta a expressão A PARTIR do script emitido e a executa.
   */
  it("a expressão que acha a foto sobrevive ao template literal", () => {
    const achado = SCRIPT_DE_AJUSTE.match(/fundo\.match\((\/.*?\/)\)/);
    expect(achado, "linha que extrai a URL da foto sumiu do script").toBeTruthy();

    const corpo = achado![1].slice(1, -1);
    const expressao = new RegExp(corpo);

    const computado = `url("data:image/jpeg;base64,/9j/4AAQSkZJRg")`;
    expect(computado.match(expressao)?.[1]).toBe("data:image/jpeg;base64,/9j/4AAQSkZJRg");

    // E também com a forma sem aspas, que é como alguns navegadores devolvem.
    expect(`url(https://exemplo.org/a.jpg)`.match(expressao)?.[1]).toBe("https://exemplo.org/a.jpg");
  });

  /**
   * O logotipo precisa estar CARREGADO antes da medida.
   *
   * A medida recorta o pedaço da foto que fica atrás do logotipo, e para isso
   * precisa do retângulo dele. Um img que ainda não carregou tem altura pelo
   * CSS e largura ZERO, porque a largura é auto. Medido durante a
   * implementação: na primeira renderização a medição não acontecia, e na
   * segunda sim, porque aí o arquivo já estava em cache. É o defeito que só
   * aparece no render frio.
   */
  it("espera o logotipo carregar antes de medir", () => {
    expect(SCRIPT_DE_AJUSTE).toContain("quandoCarregar(marca");
    expect(SCRIPT_DE_AJUSTE).toContain("img.complete && img.naturalWidth > 0");
    // E não fica preso nele: rede lenta segue com a marca escura.
    expect(SCRIPT_DE_AJUSTE).toContain("setTimeout(uma, 2000)");
  });

  it("grava o brilho medido e o motivo da falha na peça", () => {
    // Sem os dois, canvas marcado, expressão quebrada e largura zero são o
    // mesmo sintoma, que é a marca escura de sempre.
    expect(SCRIPT_DE_AJUSTE).toContain("data-brilho");
    expect(SCRIPT_DE_AJUSTE).toContain("data-erro");
  });

  it("a régua é 0.62, e a troca só acontece acima dela", () => {
    expect(SCRIPT_DE_AJUSTE).toContain("media > 0.62");
    /*
     * Medido em fotos reais, com o mesmo recorte que a peça usa:
     *   Fed, céu de fim de tarde        0.661  -> clara
     *   Boston, céu branco              0.948  -> clara
     *   Manhattan à noite               0.093  -> escura
     *
     * O número é alto de propósito. Errar para o lado da marca escura custa
     * pouco, porque ela tem sombra e o ".journal" vermelho aguenta fundo
     * médio; errar para o lado da clara põe azul-marinho sobre foto escura,
     * que some de vez.
     */
  });
});
