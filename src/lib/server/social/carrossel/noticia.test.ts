import { describe, expect, it, vi } from "vitest";
import type { PacoteFactual } from "../../editorial/pacote-factual";
import type { ResultadoVisual } from "../../visual/tipos";
import { SLIDE_VARIANTS } from "@/lib/carousel-templates/variants";
import { DEFAULT_TOKENS } from "@/lib/carousel-templates/tokens";
import type { InstagramSlide, VariantContext } from "@/lib/carousel-templates/types";
import { montarCapaDoPost } from "../arte";
import { determinarFormatoDaNoticia, passosDaNoticia } from "./formato";
import { ESTRUTURAS, fechamentoObrigatorio, papeisPara } from "./estrutura";
import { blocosDoCorpo, conferirBlocosDaNoticia, conferirFormaDosSlides, conferirLinguagemDoCarrossel } from "./guarda";
import { entradasDoCarrossel, VARIANTE_DO_CONVITE, VARIANTE_DO_PASSO_DA_NOTICIA } from "./arte";
import { arquivoDaFoto, citaPessoa, fotosDoCarrossel, type ResolvedorDeFoto } from "./fotos";
import { decisorDoDia } from "./modo";
import { montarSystemDoCarrossel, type CopyDoCarrossel } from "./copy";

function pacote(fatos: string[], extra: Partial<PacoteFactual> = {}): PacoteFactual {
  return {
    verified_facts: fatos,
    people: [],
    organizations: [],
    places: [],
    dates: [],
    numbers: [],
    gaps: [],
    source_urls: [],
    texto_de_origem: fatos.join(" "),
    ...extra,
  };
}

const LIDE = "A China fechou mais de 670 bancos rurais no último ano, numa reestruturação do setor.";
const ESCALA = "Os bancos fechados somavam ativos de 1,2 trilhão de yuans no fim de 2025.";
const DETALHE = "A maior parte das instituições fechadas ficava em províncias do interior do país.";
const EXPLICACAO = "Segundo o regulador bancário, as fusões reduzem o risco de quebras em cadeia.";
const CONSEQUENCIA = "O regulador planeja concluir as fusões restantes até o fim do próximo ano.";

describe("a decisão de formato da notícia", () => {
  it("sem pacote, e com um passo só, é peça única", () => {
    expect(determinarFormatoDaNoticia(null).formato).toBe("static");
    const d = determinarFormatoDaNoticia(pacote([LIDE, DETALHE]));
    expect(d.formato).toBe("static");
    expect(d.motivo).toContain("1 passo");
  });

  it("dois passos além da capa viram o carrossel curto, de três slides", () => {
    const d = determinarFormatoDaNoticia(pacote([LIDE, ESCALA, DETALHE]));
    expect(d).toMatchObject({ formato: "carousel", estrutura: "noticia_curta", slides: 3 });
  });

  it("três passos viram cinco slides, e quatro viram seis", () => {
    expect(determinarFormatoDaNoticia(pacote([LIDE, ESCALA, DETALHE, EXPLICACAO]))).toMatchObject({
      estrutura: "noticia",
      slides: 5,
    });
    expect(determinarFormatoDaNoticia(pacote([LIDE, ESCALA, DETALHE, EXPLICACAO, CONSEQUENCIA]))).toMatchObject({
      estrutura: "noticia",
      slides: 6,
    });
  });

  it("dois passos com seis fatos ou mais além do lide sustentam cinco slides", () => {
    const detalhes = [
      "O vice-presidente presidiu a reunião, que durou várias horas na sexta-feira.",
      "O secretário de Estado participou da reunião ao lado do secretário de Defesa.",
      "O enviado especial também participou da reunião, que não foi anunciada.",
      "O diretor da agência de inteligência participou da reunião no mesmo dia.",
      "O secretário do Tesouro participou da reunião, de acordo com as autoridades ouvidas.",
      "Uma reunião semelhante aconteceu no mesmo local em junho do ano passado.",
    ];
    const d = determinarFormatoDaNoticia(pacote([LIDE, ...detalhes]));
    expect(d).toMatchObject({ formato: "carousel", estrutura: "noticia", slides: 5 });
    expect(d.motivo).toContain("fatos além do lide");
  });

  it("o número do LIDE não conta como escala: ele já foi gasto na capa", () => {
    // O lide tem "670 bancos"; os outros fatos não têm número nenhum.
    const r = passosDaNoticia(pacote([LIDE, DETALHE, "A medida foi anunciada na capital do país nesta semana."]));
    expect(r.passos).not.toContain("escala");
    expect(r.passos).toEqual(["detalhe"]);
  });

  it("dígito sem sentido de tamanho não é escala", () => {
    const r = passosDaNoticia(pacote([LIDE, "A regra está na seção 245 do código bancário de 2026."]));
    expect(r.passos).toEqual(["detalhe"]);
  });
});

describe("as estruturas da notícia", () => {
  it("o convite de assinatura existe mesmo sem CTA de keyword", () => {
    expect(fechamentoObrigatorio("noticia")).toBe(true);
    expect(fechamentoObrigatorio("explainer")).toBe(false);
    const curta = papeisPara("noticia_curta", 3, false);
    expect(curta.map((p) => p.tipo)).toEqual(["cover", "content", "cta"]);
    const longa = papeisPara("noticia", 6, false);
    expect(longa).toHaveLength(6);
    expect(longa[longa.length - 1].tipo).toBe("cta");
  });

  it("os passos ficam na ordem de leitura", () => {
    expect(papeisPara("noticia", 5, true).map((p) => p.papel)).toEqual([
      "capa",
      "passo 1",
      "passo 2",
      "passo 3",
      "fechamento",
    ]);
  });
});

const BLOCO_BOM =
  "Os bancos fechados somavam ativos de 1,2 trilhão de yuans no fim de 2025, segundo o regulador bancário do país.";
const BLOCO_BOM_2 =
  "A maior parte das instituições fechadas ficava em províncias do interior, onde os bancos rurais concentravam o crédito agrícola.";

describe("o roteiro do slide de notícia", () => {
  it("um ou dois blocos de 15 a 30 palavras passam", () => {
    expect(conferirBlocosDaNoticia(`${BLOCO_BOM}\n\n${BLOCO_BOM_2}`, [], 2, "passo 1")).toEqual([]);
    expect(conferirBlocosDaNoticia(BLOCO_BOM, [], 2, "passo 1")).toEqual([]);
  });

  it("três blocos, bloco curto e lista são apontados para reparo", () => {
    const tres = conferirBlocosDaNoticia(`${BLOCO_BOM}\n\n${BLOCO_BOM_2}\n\n${BLOCO_BOM}`, [], 2, "passo 1");
    expect(tres.some((p) => p.detalhe.includes("3 blocos"))).toBe(true);
    const curto = conferirBlocosDaNoticia("Os bancos fecharam.", [], 3, "passo 2");
    expect(curto[0].detalhe).toContain("3 palavras");
    expect(curto[0].reparavel).toBe(true);
    const lista = conferirBlocosDaNoticia(BLOCO_BOM, ["um item"], 3, "passo 2");
    expect(lista.some((p) => p.detalhe.includes("lista"))).toBe(true);
  });

  it("a guarda de forma aplica o roteiro só aos passos da notícia", () => {
    const papeis = papeisPara("noticia_curta", 3, true);
    const problemas = conferirFormaDosSlides(
      [{ papel: "passo único", titulo: "escala", corpo: "Curto demais.", bullets: [], lado_a: "", lado_b: "" }],
      papeis,
    );
    expect(problemas.some((p) => p.detalhe.includes("palavras"))).toBe(true);
  });

  it("na notícia a relevância para o leitor é silêncio permitido; no permanente, não", () => {
    // Texto de fato puro, sem "quem" nem "você": o que o método pede.
    const slidesDaNoticia = [
      { papel: "passo 1", titulo: "escala", corpo: `${BLOCO_BOM}\n\n${BLOCO_BOM_2}`, bullets: [], lado_a: "", lado_b: "" },
    ];
    const legenda = "A China fechou mais de 670 bancos rurais em um ano, segundo o regulador bancário do país.";
    const daNoticia = conferirLinguagemDoCarrossel("China fecha mais de 670 bancos em um ano", slidesDaNoticia, legenda);
    expect(daNoticia.map((p) => p.motivo)).not.toContain("LOW_READER_RELEVANCE");

    const doPermanente = conferirLinguagemDoCarrossel(
      "China fecha mais de 670 bancos em um ano",
      [{ ...slidesDaNoticia[0], papel: "o que é" }],
      legenda,
    );
    expect(doPermanente.map((p) => p.motivo)).toContain("LOW_READER_RELEVANCE");
  });

  it("os blocos são o corpo partido nas linhas em branco", () => {
    expect(blocosDoCorpo("um  dois\n\n  tres\n \nquatro")).toEqual(["um dois", "tres", "quatro"]);
  });
});

function copyDaNoticia(cta: string): CopyDoCarrossel {
  return {
    headline: "China fecha mais de 670 bancos em um ano: Pequim reestrutura o setor em meio à desaceleração",
    destaque: "",
    gancho: "A China fechou mais de 670 bancos rurais em um ano.",
    fato_principal: "O regulador conduz as fusões.",
    contexto: "",
    informacao_util: "",
    ressalva: "",
    cta,
    hashtags: [],
    slides: [
      { papel: "passo 1", titulo: "escala", corpo: `${BLOCO_BOM}\n\n${BLOCO_BOM_2}`, bullets: [], lado_a: "", lado_b: "" },
      { papel: "passo 2", titulo: "detalhe", corpo: BLOCO_BOM_2, bullets: [], lado_a: "", lado_b: "" },
      { papel: "passo 3", titulo: "explicação", corpo: BLOCO_BOM, bullets: [], lado_a: "", lado_b: "" },
    ],
  };
}

const FOTO = (n: number) => ({ imageUrl: `https://upload.wikimedia.org/wikipedia/commons/a/ab/Foto_${n}.jpg`, attribution: `Autor ${n}, CC BY 4.0` });

describe("a arte do carrossel de notícia", () => {
  it("cada slide de conteúdo leva a sua foto, o chapéu da editoria e só os blocos", () => {
    const papeis = papeisPara("noticia", 5, true);
    const { entradas } = entradasDoCarrossel(copyDaNoticia("Comente NEWS e receba o link."), papeis, {
      eixo: "economia",
      asset: FOTO(0),
      motivoSemFoto: "",
      fotosDoMiolo: [FOTO(1), FOTO(2), null],
      bolhasDoMiolo: [null, FOTO(9), null],
    });
    expect(entradas).toHaveLength(5);

    const miolo = entradas[1];
    expect(miolo.slidePronto?.variant).toBe(VARIANTE_DO_PASSO_DA_NOTICIA);
    expect(miolo.slidePronto?.eyebrow).toBe("ECONOMIA");
    expect(miolo.slidePronto?.title).toBe("");
    expect(miolo.slidePronto?.body.split("\n\n")).toHaveLength(2);

    const desenhado = montarCapaDoPost(miolo);
    expect(desenhado.comFoto).toBe(true);
    expect(desenhado.slide.bg_image_url).toBe(FOTO(1).imageUrl);
    expect(desenhado.slide.inset_image_url).toBe("");

    // A bolha só no slide em que o segundo personagem entra.
    expect(montarCapaDoPost(entradas[2]).slide.inset_image_url).toBe(FOTO(9).imageUrl);
    // Slide sem foto sai sem foto, e não com a de outro slide.
    expect(montarCapaDoPost(entradas[3]).comFoto).toBe(false);
  });

  it("o último slide é o convite de assinatura, com a palavra só quando há keyword", () => {
    const papeis = papeisPara("noticia_curta", 3, false);
    const comPalavra = entradasDoCarrossel(copyDaNoticia("Comente NEWS e receba no Direct o link."), papeis, {
      eixo: "economia",
      asset: FOTO(0),
      motivoSemFoto: "",
    }).entradas;
    const fim = comPalavra[comPalavra.length - 1].slidePronto!;
    expect(fim.variant).toBe(VARIANTE_DO_CONVITE);
    expect(fim.highlight_text).toBe("NEWS");

    const semPalavra = entradasDoCarrossel(copyDaNoticia(""), papeis, {
      eixo: "economia",
      asset: FOTO(0),
      motivoSemFoto: "",
    }).entradas;
    expect(semPalavra[semPalavra.length - 1].slidePronto!.highlight_text).toBe("");
  });

  it("a bolha nunca repete a foto do fundo", () => {
    const papeis = papeisPara("noticia_curta", 3, true);
    const { entradas } = entradasDoCarrossel(copyDaNoticia(""), papeis, {
      eixo: "economia",
      asset: FOTO(0),
      motivoSemFoto: "",
      fotosDoMiolo: [FOTO(1)],
      bolhasDoMiolo: [FOTO(1)],
    });
    expect(montarCapaDoPost(entradas[1]).slide.inset_image_url).toBe("");
  });
});

function ctx(): VariantContext {
  return { format: "noticia", tokens: DEFAULT_TOKENS, eyebrowLabel: "", ctaText: "", slideIndex: 2, total: 5 };
}

function slide(campos: Partial<InstagramSlide>): InstagramSlide {
  return {
    index: 2,
    type: "content",
    eyebrow: "",
    title: "",
    body: "",
    bullet_points: [],
    highlight_text: "",
    variant: "",
    cover_variant: "dark_speaker",
    headline_style: "clean",
    cover_image_prompt: "",
    bg_image_url: "",
    cta_text: "",
    ...campos,
  } as InstagramSlide;
}

describe("os desenhos novos", () => {
  it("o miolo desenha um parágrafo por bloco, a foto e a bolha", () => {
    const html = SLIDE_VARIANTS.content.miolo_noticia.render(
      slide({ eyebrow: "ECONOMIA", body: `${BLOCO_BOM}\n\n${BLOCO_BOM_2}`, bg_image_url: "data:image/png;base64,AAA", inset_image_url: "data:image/png;base64,BBB" }),
      ctx(),
    ).body;
    expect(html.match(/<p>/g)).toHaveLength(2);
    expect(html).toContain("j-chapeu");
    expect(html).toContain("j-bolha jn-bolha");
    expect(html).toContain('data-ajuste="encolher"');
  });

  it("o convite diz o que é, e não pede comentário sem palavra escutada", () => {
    const sem = SLIDE_VARIANTS.cta.cta_assinatura.render(slide({ type: "cta" }), ctx()).body;
    expect(sem).toContain("Assine a newsletter do");
    expect(sem).not.toContain("Comente");
    const com = SLIDE_VARIANTS.cta.cta_assinatura.render(slide({ type: "cta", highlight_text: "news" }), ctx()).body;
    expect(com).toContain("Comente NEWS e receba o link");
    expect(com).not.toMatch(/\u2014/);
  });
});

function resultado(url: string, entidade?: { nome: string; tipo: string }): ResultadoVisual {
  return {
    storyId: "x",
    entidade: entidade ? ({ nome: entidade.nome, tipo: entidade.tipo } as ResultadoVisual["entidade"]) : null,
    asset: { imageUrl: url, attribution: `crédito de ${url.split("/").pop()}` } as ResultadoVisual["asset"],
    assetSecundario: null,
    status: "SELECTED",
    motivo: null,
    fontesConsultadas: [],
    recusados: [],
    legenda: "",
  };
}

const PAUTA = {
  storyId: "u_1",
  titulo: "Raman tenta derrotar Karen Bass em Los Angeles",
  categoria: "politica",
  classificacao: { atores: ["Nithya Raman", "Karen Bass"], lugares: ["Los Angeles"], acontecimento: ["eleição"] },
};

describe("as fotos do carrossel", () => {
  it("pede ao resolvedor até encher, sem repetir a capa nem o mesmo arquivo em outro tamanho", async () => {
    const respostas = [
      resultado("https://upload.wikimedia.org/wikipedia/commons/a/ab/Raman_1.jpg", { nome: "Nithya Raman", tipo: "politician" }),
      resultado("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Raman_2.jpg/800px-Raman_2.jpg", { nome: "Nithya Raman", tipo: "politician" }),
      // O mesmo arquivo da anterior, em outro tamanho, duas vezes: a fonte acabou.
      resultado("https://upload.wikimedia.org/wikipedia/commons/a/ab/Raman_2.jpg", { nome: "Nithya Raman", tipo: "politician" }),
      resultado("https://upload.wikimedia.org/wikipedia/commons/a/ab/Raman_2.jpg?w=600", { nome: "Nithya Raman", tipo: "politician" }),
      // A cena, sem atores.
      resultado("https://upload.wikimedia.org/wikipedia/commons/a/ab/LA_City_Hall.jpg", { nome: "Los Angeles City Hall", tipo: "building" }),
      null,
    ];
    const resolver: ResolvedorDeFoto = vi.fn(async () => respostas.shift() ?? null);
    const r = await fotosDoCarrossel({
      pauta: PAUTA,
      quantas: 4,
      fotoDaCapa: { imageUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Raman_0.jpg", attribution: "" },
      pessoas: [],
      textos: ["", "", "", ""],
      resolver,
    });
    expect(r.origem).toEqual(["protagonista", "protagonista", "cena", "nenhuma"]);
    expect(r.fotos[3]).toBeNull();
    const chamadas = (resolver as ReturnType<typeof vi.fn>).mock.calls;
    // A cena é a mesma pauta sem os atores: nenhum rosto de outra pessoa no lugar do protagonista.
    expect(chamadas[4][0].classificacao.atores).toEqual([]);
    // A capa já entrou como usada antes da primeira pergunta.
    expect([...chamadas[0][1]]).toContain("https://upload.wikimedia.org/wikipedia/commons/a/ab/Raman_0.jpg");
  });

  it("com protagonista, a pergunta é o retrato DELE, e foto de outra pessoa encerra a rodada", async () => {
    const respostas = [
      resultado("https://x.org/raman1.jpg", { nome: "Nithya Raman", tipo: "politician" }),
      resultado("https://x.org/bass.jpg", { nome: "Karen Bass", tipo: "politician" }),
      null,
    ];
    const resolver: ResolvedorDeFoto = vi.fn(async () => respostas.shift() ?? null);
    const r = await fotosDoCarrossel({
      pauta: PAUTA,
      quantas: 2,
      fotoDaCapa: null,
      pessoas: ["Nithya Raman"],
      textos: ["", ""],
      resolver,
    });
    const primeira = (resolver as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(primeira.titulo).toBe("Nithya Raman");
    expect(primeira.classificacao.atores).toEqual(["Nithya Raman"]);
    expect(r.fotos.map((f) => f?.imageUrl ?? null)).toEqual(["https://x.org/raman1.jpg", null]);
  });

  it("o resolvedor de verdade acrescenta a foto escolhida ao conjunto, e isso não a torna repetida", async () => {
    // É o comportamento de `resolveVisualAsset` (usadosAgora.add), e foi ele
    // que fez o primeiro ensaio real sair sem foto nenhuma nos slides.
    const urls = ["https://x.org/raman1.jpg", "https://x.org/raman2.jpg"];
    const resolver: ResolvedorDeFoto = async (_alvo, jaUsadas) => {
      const url = urls.shift();
      if (!url) return null;
      jaUsadas.add(url);
      return resultado(url, { nome: "Nithya Raman", tipo: "politician" });
    };
    const r = await fotosDoCarrossel({
      pauta: PAUTA,
      quantas: 2,
      fotoDaCapa: null,
      pessoas: ["Nithya Raman"],
      textos: ["", ""],
      resolver,
    });
    expect(r.fotos.map((f) => f?.imageUrl)).toEqual(["https://x.org/raman1.jpg", "https://x.org/raman2.jpg"]);
  });

  it("a bolha vai para o slide em que o segundo personagem entra, e só com a foto DELE", async () => {
    const respostas = [
      resultado("https://x.org/raman1.jpg", { nome: "Nithya Raman", tipo: "politician" }),
      resultado("https://x.org/raman2.jpg", { nome: "Nithya Raman", tipo: "politician" }),
      resultado("https://x.org/bass.jpg", { nome: "Karen Bass", tipo: "politician" }),
    ];
    const r = await fotosDoCarrossel({
      pauta: PAUTA,
      quantas: 2,
      fotoDaCapa: null,
      pessoas: ["Nithya Raman", "Karen Bass"],
      textos: ["Raman é vereadora há dois mandatos.", "Ela tenta derrotar a prefeita Karen Bass em novembro."],
      resolver: async () => respostas.shift() ?? null,
    });
    expect(r.bolhas[0]).toBeNull();
    expect(r.bolhas[1]?.imageUrl).toBe("https://x.org/bass.jpg");
    expect(r.segundoPersonagem).toBe("Karen Bass");
    expect(r.creditos).toHaveLength(3);
  });

  it("foto de outra entidade não vira bolha do segundo personagem", async () => {
    const respostas = [
      resultado("https://x.org/raman1.jpg", { nome: "Nithya Raman", tipo: "politician" }),
      resultado("https://x.org/prefeitura.jpg", { nome: "Los Angeles City Hall", tipo: "building" }),
    ];
    const r = await fotosDoCarrossel({
      pauta: PAUTA,
      quantas: 1,
      fotoDaCapa: null,
      pessoas: ["Nithya Raman", "Karen Bass"],
      textos: ["Raman enfrenta Karen Bass."],
      resolver: async () => respostas.shift() ?? null,
    });
    expect(r.bolhas).toEqual([null]);
    expect(r.segundoPersonagem).toBeNull();
  });

  it("a identidade da foto é o arquivo, e o texto cita a pessoa pelo sobrenome", () => {
    expect(arquivoDaFoto("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X_y.jpg/640px-X_y.jpg")).toBe(
      arquivoDaFoto("https://upload.wikimedia.org/wikipedia/commons/a/ab/X_y.jpg?w=600"),
    );
    expect(citaPessoa("a prefeita Bass respondeu", "Karen Bass")).toBe(true);
    expect(citaPessoa("o bassista tocou", "Karen Bass")).toBe(false);
  });
});

describe("a capacidade carrossel_noticia", () => {
  const pacoteRico = pacote([LIDE, ESCALA, DETALHE, EXPLICACAO]);

  it("off devolve só o decisor do conteúdo permanente", () => {
    const permanente = vi.fn(() => null);
    expect(decisorDoDia(permanente, "off")).toBe(permanente);
    expect(decisorDoDia(null, "off")).toBeNull();
  });

  it("dry_run decide, anota e não muda o post", () => {
    const linhas: string[] = [];
    const d = decisorDoDia(null, "dry_run", (l) => linhas.push(l))!;
    expect(d({ storyId: "u_1" }, pacoteRico, true)).toBeNull();
    expect(linhas[0]).toContain("seria carousel");
  });

  it("enforce decide pela régua da notícia, e o permanente continua com a dele", () => {
    const d = decisorDoDia(null, "enforce")!;
    expect(d({ storyId: "u_1" }, pacoteRico, true)).toMatchObject({ formato: "carousel", slides: 5 });
    const permanente = vi.fn(() => ({ formato: "static" as const, slides: 1, motivo: "dele", fatosUteis: 0 }));
    expect(decisorDoDia(permanente, "enforce")!({ storyId: "evg:x" }, pacoteRico, true)?.motivo).toBe("dele");
  });
});

describe("o prompt do carrossel de notícia", () => {
  const marca = { nome: "eua.journal", nicho: "EUA", extra: "", keyword: "NEWS" };

  it("a notícia recebe o roteiro de blocos, e o permanente o de sempre", () => {
    const noticia = montarSystemDoCarrossel(marca, "noticia", papeisPara("noticia", 5, true));
    expect(noticia).toContain("COMO ESCREVER CADA SLIDE DE NOTÍCIA");
    expect(noticia).toContain("escala, detalhe, explicação e consequência");
    expect(noticia).not.toContain("COMO ESCREVER CADA SLIDE:");

    const permanente = montarSystemDoCarrossel(marca, "explainer", ESTRUTURAS.explainer);
    expect(permanente).toContain("COMO ESCREVER CADA SLIDE:");
    expect(permanente).not.toContain("COMO ESCREVER CADA SLIDE DE NOTÍCIA");
  });
});
