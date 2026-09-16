import { describe, expect, it } from "vitest";
import { diagnosticarLayout, layoutCarregaAFoto, montarCapaDoPost, publicavelSemFoto } from "./arte";
import { assembleSlide } from "@/lib/carousel-templates/assemble";
import { resolveFormatConfig } from "@/lib/carousel-templates/assemble";
import { DEFAULT_TOKENS } from "@/lib/carousel-templates/tokens";
import type { AssetVisual } from "../visual/tipos";
import type { Layout } from "@/lib/carousel-templates/layout";

function asset(over: Partial<AssetVisual> = {}): AssetVisual {
  return {
    entityName: "Departamento de Estado",
    entityNormalized: "departamento de estado",
    entityType: "government_agency",
    source: "wikimedia_commons",
    sourceAssetId: "Harry_S._Truman_Building.jpg",
    imageUrl: "https://upload.wikimedia.org/foto.jpg",
    sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Harry_S._Truman_Building.jpg",
    author: "Ser Amantio di Nicolao",
    license: "CC BY-SA",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    attribution: "Foto: Ser Amantio di Nicolao / Wikimedia Commons, CC BY-SA 3.0",
    rightsStatement: "cc-by-sa-3.0",
    rightsStatus: "verified",
    rightsCheckedAt: "2026-09-04T00:00:00Z",
    sourceLastCheckedAt: "2026-09-04T00:00:00Z",
    width: 2400,
    height: 1600,
    mimeType: "image/jpeg",
    storagePath: null,
    perceptualHash: null,
    imageRelevanceScore: 0.8,
    imageContextType: "institution",
    metadata: {},
    ...over,
  };
}

function montar(slide: ReturnType<typeof montarCapaDoPost>): string {
  return assembleSlide(slide.slide, {
    format: "noticia",
    tokens: DEFAULT_TOKENS,
    formatConfig: resolveFormatConfig("noticia"),
    slideIndex: 1,
    total: 1,
    layout: null,
    credito: slide.credito,
  });
}

describe("capa do post do feed", () => {
  it("a foto aprovada é a única imagem que entra na arte", () => {
    const capa = montarCapaDoPost({ headline: "Ordem suspende política do Diversity Visa", asset: asset() });

    expect(capa.comFoto).toBe(true);
    expect(capa.slide.bg_image_url).toBe("https://upload.wikimedia.org/foto.jpg");
    // O campo que o renderizador antigo usa como consulta e como prompt.
    expect(capa.slide.cover_image_prompt).toBe("");
  });

  it("sem asset aprovado a capa é de texto, e diz por quê", () => {
    const capa = montarCapaDoPost({
      headline: "Ordem suspende política do Diversity Visa",
      eixo: "outro",
      asset: null,
      motivoSemFoto: "NO_VALID_IMAGE",
    });

    expect(capa.comFoto).toBe(false);
    expect(capa.slide.bg_image_url).toBe("");
    expect(capa.variante).toBe("noticia_sem_foto");
    expect(capa.motivoSemFoto).toBe("NO_VALID_IMAGE");
    // A sobrancelha devolve a referência que a foto daria.
    expect(capa.slide.eyebrow).toBe("");
  });

  it("o eixo vira rótulo escrito, não o valor cru da classificação", () => {
    const capa = montarCapaDoPost({
      headline: "Ordem manda USCIS retomar pedidos pendentes",
      eixo: "politica",
      asset: null,
    });
    expect(capa.slide.eyebrow).toBe("POLÍTICA");
    expect(capa.slide.eyebrow).not.toContain("_");
  });

  it("eixo sem rótulo não inventa editoria", () => {
    expect(montarCapaDoPost({ headline: "Título qualquer serve", eixo: "outro", asset: null }).slide.eyebrow).toBe("");
    expect(montarCapaDoPost({ headline: "Título qualquer serve", eixo: "xpto", asset: null }).slide.eyebrow).toBe("");
  });

  it("capa sem foto nunca cai numa variante que precisa de foto", () => {
    const capa = montarCapaDoPost({ headline: "Título qualquer que serve", asset: null });
    const html = montar(capa);
    // `s-photo` é a camada de fundo fotográfico. O nome aparece no CSS base de
    // todo slide; o que não pode aparecer é a div.
    expect(html).not.toContain(`<div class="s-photo`);
    expect(html).toContain("Título qualquer que serve");
  });

  it("a atribuição exigida pela licença é impressa na arte", () => {
    const capa = montarCapaDoPost({ headline: "Ordem suspende política do Diversity Visa", asset: asset() });
    const html = montar(capa);

    expect(html).toContain(`<div class="s-credito">`);
    expect(html).toContain("Ser Amantio di Nicolao");
    expect(html).toContain("CC BY-SA 3.0");
  });

  it("licença que não exige atribuição não imprime tira de crédito", () => {
    const capa = montarCapaDoPost({
      headline: "Ordem suspende política do Diversity Visa",
      asset: asset({ license: "PD-USGov", attribution: "" }),
    });
    const html = montar(capa);

    expect(capa.credito).toBe("");
    expect(html).not.toContain(`<div class="s-credito">`);
  });

  it("o crédito é escapado, não injetado", () => {
    const capa = montarCapaDoPost({
      headline: "Título qualquer que serve",
      asset: asset({ attribution: 'Foto: <script>alert("x")</script>' }),
    });
    const html = montar(capa);

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("nenhuma peça convida a arrastar, com foto ou sem", () => {
  /*
   * A capa de texto já não emitia nada de carrossel. A capa COM foto emitia:
   * `fullbleed_portrait` imprimia "Arrasta que eu te atualizo em 1 minuto" num
   * post de imagem única.
   *
   * Isso passou despercebido no render porque existe um desenho salvo no
   * painel para a capa de notícia, e desenho vence a variante de código
   * inteira. Some o desenho, ou salve um sem bloco de imagem, e a afordância
   * volta. Defeito mascarado continua sendo defeito.
   */
  function comFoto(total: number): string {
    const capa = montarCapaDoPost({
      headline: "Suprema Corte aceita analisar regra de asilo",
      eixo: "politica",
      asset: {
        imageUrl: "https://upload.wikimedia.org/foto.jpg",
        license: "Public domain",
        attribution: "",
        source: "wikimedia",
        imageContextType: "institution",
      } as never,
    });
    return assembleSlide(capa.slide, {
      format: "noticia",
      tokens: DEFAULT_TOKENS,
      formatConfig: resolveFormatConfig("noticia"),
      slideIndex: 1,
      total,
      layout: null,
    });
  }

  it("um slide só: nada de arrastar", () => {
    const h = comFoto(1);
    expect(h).toContain("s-title");
    expect(h).not.toContain("Arrasta");
    expect(h).not.toContain("s-swipe\"");
  });

  /**
   * E o carrossel também não convida.
   *
   * O convite saiu de todas as telas em 16/09/2026, depois de conferido nas
   * referências: quatro capas de carrossel reais de @notjournal.ai e
   * @braziljournal, nenhuma com convite.
   */
  it("carrossel também não convida", () => {
    expect(comFoto(5)).not.toContain("Arrasta");
  });
});

describe("o desenho do painel só manda quando consegue mostrar a foto", () => {
  /** O desenho de `noticia/cover` como está em produção: sem bloco de imagem. */
  const comoEstaEmProducao = {
    canvas: { width: 1080, height: 1350 },
    blocks: [
      { id: "veu", tipo: "forma", x: 0, y: 0, w: 100, h: 18, z: 2 },
      { id: "marca", tipo: "texto", slot: "marca", x: 20, y: 4, w: 60, h: 5, z: 3, cor: "#FFFFFF" },
      { id: "titulo", tipo: "texto", slot: "titulo", x: 6, y: 57, w: 88, h: 24, z: 4, cor: "#FFFFFF" },
    ],
  } as unknown as Layout;

  const comFoto = {
    canvas: { width: 1080, height: 1350 },
    blocks: [
      { id: "foto", tipo: "imagem", imagem: "fundo", x: 0, y: 0, w: 100, h: 100, z: 1 },
      ...comoEstaEmProducao.blocks,
    ],
  } as unknown as Layout;

  it("desenho sem bloco de imagem não carrega a foto", () => {
    expect(layoutCarregaAFoto(comoEstaEmProducao)).toBe(false);
  });

  it("desenho com bloco de fundo carrega", () => {
    expect(layoutCarregaAFoto(comFoto)).toBe(true);
  });

  it("bloco de imagem fixa não conta: não é a foto da notícia", () => {
    const fixa = {
      canvas: comFoto.canvas,
      blocks: [{ id: "f", tipo: "imagem", imagem: "fixa", imagemUrl: "https://x/y.png", x: 0, y: 0, w: 100, h: 100, z: 1 }],
    } as unknown as Layout;
    expect(layoutCarregaAFoto(fixa)).toBe(false);
  });

  it("sem desenho nenhum, a variante de código assume", () => {
    expect(layoutCarregaAFoto(null)).toBe(false);
    expect(layoutCarregaAFoto({ canvas: comFoto.canvas, blocks: [] } as unknown as Layout)).toBe(false);
  });
});

describe("o diagnóstico do desenho tem nome", () => {
  const semSlot = {
    canvas: { width: 1080, height: 1350 },
    blocks: [{ id: "t", tipo: "texto", slot: "titulo", x: 6, y: 57, w: 88, h: 24, z: 4 }],
  } as unknown as Layout;

  const comSlot = {
    canvas: { width: 1080, height: 1350 },
    blocks: [
      { id: "f", tipo: "imagem", imagem: "fundo", x: 0, y: 0, w: 100, h: 100, z: 1 },
      ...semSlot.blocks,
    ],
  } as unknown as Layout;

  it("desenho salvo sem bloco de imagem é LAYOUT_MISSING_IMAGE_SLOT", () => {
    expect(diagnosticarLayout(semSlot, true)).toBe("LAYOUT_MISSING_IMAGE_SLOT");
  });

  it("desenho completo é usado", () => {
    expect(diagnosticarLayout(comSlot, true)).toBe("LAYOUT_USED");
  });

  it("sem desenho nenhum não é defeito de desenho", () => {
    expect(diagnosticarLayout(null, true)).toBe("LAYOUT_NOT_DESIGNED");
  });

  it("capa de texto não julga o desenho: ele não entra em jogo", () => {
    expect(diagnosticarLayout(semSlot, false)).toBe("LAYOUT_NOT_APPLICABLE_NO_PHOTO");
    expect(diagnosticarLayout(comSlot, false)).toBe("LAYOUT_NOT_APPLICABLE_NO_PHOTO");
  });

  it("o diagnóstico não contradiz a decisão de usar o desenho", () => {
    expect(layoutCarregaAFoto(semSlot)).toBe(false);
    expect(layoutCarregaAFoto(comSlot)).toBe(true);
  });
});

describe("falta de imagem não elimina o post", () => {
  it("o formato do feed publica sem fotografia", () => {
    // É a regra: NO_VALID_VISUAL_ASSET é decisão editorial, não erro.
    expect(publicavelSemFoto("noticia")).toBe(true);
  });

  it("o carrossel de texto também", () => {
    expect(publicavelSemFoto("tutorial")).toBe(true);
  });

  it("o formato que existe para mostrar imagem, não", () => {
    // Sem imagem não há o que mostrar, e um card escrito "aqui teria uma
    // imagem" é pior que não postar.
    expect(publicavelSemFoto("prompt")).toBe(false);
  });
});

describe("a capa de texto é decisão, não fallback quebrado", () => {
  function html(headline: string, eixo = "imigracao"): string {
    const capa = montarCapaDoPost({ headline, eixo, asset: null, motivoSemFoto: "NO_VALID_IMAGE" });
    return assembleSlide(capa.slide, {
      format: "noticia",
      tokens: DEFAULT_TOKENS,
      formatConfig: resolveFormatConfig("noticia"),
      slideIndex: 1,
      total: 1,
      layout: null,
    });
  }

  /*
   * Só a marcação, sem a folha de estilo.
   *
   * `toContain("s-card")` no documento inteiro casa com a REGRA de `.s-card`,
   * que está no CSS base de todo slide e não prova nada sobre esta peça. O que
   * importa é se a classe foi EMITIDA.
   */
  function corpo(h: string): string {
    return h.slice(h.indexOf("<body>"));
  }

  const CURTA = "Corte suspende regra de vistos H-1B";
  const LONGA =
    "USCIS atualiza a taxa do formulário I-765 e muda o prazo de análise para quem já protocolou";

  it("nenhum cartão, nenhuma moldura, nenhum bloco de cor vazio", () => {
    /*
     * O defeito do `brand_card` não era faltar imagem: era cercar o vazio.
     * `.s-card.dark` tem fundo próprio, raio e altura mínima de 360px, e um
     * retângulo preenchido e vazio anuncia que ali faltou alguma coisa.
     */
    for (const t of [CURTA, LONGA]) {
      expect(corpo(html(t))).not.toContain("s-card");
    }
  });

  it("nenhuma área reservada para imagem que não existe", () => {
    for (const t of [CURTA, LONGA]) {
      const h = corpo(html(t));
      /*
       * O ELEMENTO, e não o nome da classe.
       *
       * O script de ajuste passou a procurar a foto para decidir a versão da
       * marca, então a string "s-photo" aparece no seletor dele em toda
       * página. O que esta peça não pode ter é a camada desenhada.
       */
      expect(h).not.toContain(`<div class="s-photo`);
      expect(h).not.toContain("background-image:url");
    }
  });

  it("nenhuma affordance de carrossel numa peça única", () => {
    const h = html(CURTA);
    expect(h).not.toContain("SWIPE");
    expect(h).not.toContain("PROGRESSO");
    expect(h).not.toContain("01 / 01");
    expect(h).not.toContain(`<div class="c-dots">`);
  });

  it("a manchete é o elemento principal e o rótulo não é repetido", () => {
    const h = html(CURTA);
    // Uma vez na sobrancelha, e não uma segunda dentro de um cartão.
    expect(h.split("IMIGRAÇÃO").length - 1).toBe(1);
    expect(h).toContain("n-manchete");
    // O código de visto vem embrulhado; o resto da manchete, literal.
    expect(h).toContain("Corte suspende regra de vistos ");
    expect(h).toContain(`<span class="n-junto">H-1B</span>`);
  });

  it("código de formulário e de visto não quebra no meio", () => {
    /*
     * `USCIS muda prazo de análise do I-765` saiu da arte como `do I-` numa
     * linha e `765` na seguinte. O navegador trata o hífen como oportunidade
     * de quebra e não sabe que ali é o nome da coisa, e nesta vertical isso
     * apareceria em quase toda manchete.
     */
    for (const [manchete, codigo] of [
      ["USCIS muda prazo de análise do I-765", "I-765"],
      ["Corte derruba limite do H-1B para 2027", "H-1B"],
      ["Fila do EB-2 anda três meses", "EB-2"],
      ["Consulado exige DS-160 revisado", "DS-160"],
      ["Prazo do N-400 cai para seis meses", "N-400"],
      ["Novo teto para o EB-1A entra em vigor", "EB-1A"],
    ] as const) {
      expect(html(manchete), manchete).toContain(`<span class="n-junto">${codigo}</span>`);
    }
  });

  it("o que não é código fica em paz", () => {
    /*
     * Intervalo de anos e palavra hifenizada continuam quebráveis. A conferência
     * é no `corpo`: a REGRA `.n-junto` está na folha de estilo de todo slide, e
     * procurar a classe no documento inteiro casaria sempre.
     */
    for (const manchete of [
      "Regra vale de 2026-2027 segundo o governo",
      "Programa pós-graduação perde vagas no Texas",
      "Taxa sobe de 410 para 520 dólares",
    ]) {
      expect(corpo(html(manchete)), manchete).not.toContain("n-junto");
    }
  });

  it("o corpo do tipo é medido pelo navegador, não fixado no HTML", () => {
    /*
     * A primeira versão calculava o corpo por estimativa de largura de
     * caractere e a manchete de 65 caracteres encostava no rodapé: Playfair
     * Display 800 é largo e a média errava para baixo. Quem mede é o
     * navegador, pelo mesmo script que os layouts desenhados usam.
     */
    const h = html(LONGA);
    expect(h).toContain('data-ajuste="encolher"');
    expect(h).toContain('data-max="104"');
    expect(h).not.toMatch(/class="n-manchete[^"]*"[^>]*style="[^"]*font-size/);
  });

  it("sem rótulo editorial a peça não inventa um", () => {
    const capa = montarCapaDoPost({ headline: CURTA, eixo: "outro", asset: null });
    const h = assembleSlide(capa.slide, {
      format: "noticia",
      tokens: DEFAULT_TOKENS,
      formatConfig: resolveFormatConfig("noticia"),
      slideIndex: 1,
      total: 1,
      layout: null,
    });
    /*
     * O chapéu e a régua mudaram de forma em 16/09/2026, quando a capa sem
     * foto passou para a identidade nova: onde havia uma editoria em serifa
     * sobre creme e um filete preto, agora há o mesmo chapéu espaçado da peça
     * com foto. O que este teste guarda não é o desenho, é a regra: eixo que o
     * classificador não soube nomear NÃO vira rótulo inventado.
     */
    expect(corpo(h)).not.toContain("j-chapeu");
    // O fundo e a marca ficam: eles não afirmam nada sobre a pauta.
    expect(corpo(h)).toContain("n-fundo");
    expect(corpo(h)).toContain("j-marca");
  });

  it("o script de ajuste acompanha a peça, mesmo sem layout desenhado", () => {
    // Ele vivia dentro de `renderLayout`, então só existia com desenho salvo,
    // e sem ele o `data-max` nunca era aplicado: a manchete saía em 16px.
    expect(html(CURTA)).toContain("data-ajuste-pronto");
  });
});
