import { describe, expect, it } from "vitest";
import { familiasQueFaltaram, montarCapaDoPost, renderizarCapas } from "./arte";

/**
 * A fonte que não chega, e o que ela faz com a peça.
 *
 * Este é o único teste do repo que abre navegador de verdade, e a razão é que
 * a coisa afirmada só existe no navegador: `document.fonts.ready` resolve
 * mesmo quando o Google Fonts não respondeu — ele promete que o carregamento
 * terminou, não que deu certo.
 *
 * Sem a fonte real, o ajuste de corpo do texto mede na serifa do sistema. Foi
 * medido: a mesma manchete ocupa 709px de altura em vez de 557px, 27% mais.
 * A peça sai com outra quebra de linha e outro desenho, sem erro e sem log.
 *
 * O teste é lento (sobe Chromium duas vezes) e continua valendo, porque é a
 * diferença entre uma guarda escrita e uma guarda que funciona.
 */

const ENTRADA = {
  headline: "USCIS muda prazo de análise do I-765",
  eixo: "processo",
  asset: null,
  motivoSemFoto: "NO_VALID_IMAGE",
};

const ESPERADAS = ["Epilogue", "Playfair Display", "JetBrains Mono"];

describe("a decisão sobre as fontes, sem navegador", () => {
  /*
   * Os números destes casos não são inventados: saíram de medir o render com a
   * rede normal e com o Google Fonts bloqueado.
   */
  it("rede normal: 70 faces registradas, 2 carregadas, nada falta", () => {
    const faces = [
      ...Array.from({ length: 68 }, (_, i) => ({ family: ESPERADAS[i % 3], status: "unloaded" })),
      { family: "Playfair Display", status: "loaded" },
      { family: "JetBrains Mono", status: "loaded" },
    ];
    expect(familiasQueFaltaram(faces, ESPERADAS)).toEqual([]);
  });

  it("folha de estilo que não chegou: nenhuma face, tudo falta", () => {
    // Foi o que aconteceu com o Google Fonts bloqueado: document.fonts vazio.
    expect(familiasQueFaltaram([], ESPERADAS)).toEqual(ESPERADAS);
  });

  it("família registrada mas com face em erro conta como faltando", () => {
    const faces = [
      { family: "Epilogue", status: "unloaded" },
      { family: "Playfair Display", status: "error" },
      { family: "JetBrains Mono", status: "loaded" },
    ];
    expect(familiasQueFaltaram(faces, ESPERADAS)).toEqual(["Playfair Display"]);
  });

  it("carregamento sob demanda não é falha: unloaded é o estado normal", () => {
    const faces = ESPERADAS.map((family) => ({ family, status: "unloaded" }));
    expect(familiasQueFaltaram(faces, ESPERADAS)).toEqual([]);
  });

  it("não repete a mesma família duas vezes", () => {
    const faces = [
      { family: "Playfair Display", status: "error" },
      { family: "Playfair Display", status: "error" },
    ];
    expect(familiasQueFaltaram(faces, ["Playfair Display"])).toEqual(["Playfair Display"]);
  });
});

describe("as fontes do render", () => {
  it("com a rede normal, nenhuma família falta", async () => {
    const [arte] = await renderizarCapas([ENTRADA]);
    expect(arte.fontesQueFaltaram).toEqual([]);
    expect(arte.png.byteLength).toBeGreaterThan(1000);
  }, 90_000);

  it("a marcação declara a família que o CSS pede", () => {
    /*
     * Barato e imediato: se a variante parar de usar a família de destaque, o
     * teste lento acima continuaria verde medindo a fonte errada.
     */
    const capa = montarCapaDoPost(ENTRADA);
    expect(capa.slide.variant).toBe("noticia_sem_foto");
  });
});
