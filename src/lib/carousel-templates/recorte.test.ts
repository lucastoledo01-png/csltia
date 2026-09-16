import { describe, expect, it } from "vitest";
import { assembleSlide } from "./assemble";
import { DEFAULT_TOKENS } from "./tokens";
import { primeiraFrase, SLIDE_VARIANTS } from "./variants";
import type { InstagramSlide } from "./types";

/**
 * O recorte de post é a segunda gramática de capa, ao lado da capa de jornal.
 *
 * A diferença entre as duas não é de gosto. O jornal AFIRMA: foto sangrando,
 * chapéu de editoria, manchete em caixa alta. O recorte COMENTA: fundo branco,
 * autor no topo, texto corrido em caixa baixa, com a foto como cartão no meio
 * da fala. Uma serve ao fato do dia, a outra à leitura do fato.
 *
 * O desenho veio de uma referência enviada pelo dono em 16/09/2026, remedida
 * para 1080 por 1440.
 */

function montar(slide: Partial<InstagramSlide>, opts: { total?: number; indice?: number; tipo?: string; variante?: string } = {}): string {
  const tipo = opts.tipo ?? "cover";
  return assembleSlide(
    { index: opts.indice ?? 1, type: tipo, body: "", bullet_points: [], title: "", ...slide } as InstagramSlide,
    {
      format: "noticia",
      tokens: DEFAULT_TOKENS,
      formatConfig: {
        variantBySlideType: { [tipo]: opts.variante ?? "recorte_post" },
        eyebrowLabel: null,
        ctaText: null,
      },
      slideIndex: opts.indice ?? 1,
      total: opts.total ?? 1,
      molduraDiscreta: true,
    },
  );
}

describe("a primeira frase", () => {
  it("separa a tese do resto", () => {
    const r = primeiraFrase("O número forte tira pressão do Fed. Para quem ganha em dólar, muda tudo.");
    expect(r.tese).toBe("O número forte tira pressão do Fed.");
    expect(r.resto).toBe("Para quem ganha em dólar, muda tudo.");
  });

  /**
   * O ponto de sigla e o de número não encerram frase, e tratá-los como fim
   * cortaria a tese no meio: "o visto E." em vez de "o visto EB-2 mudou."
   */
  it("não corta em ponto que não termina frase", () => {
    const r = primeiraFrase("A regra do H-1B vale a partir de 1.º de outubro para todos.");
    expect(r.tese).toBe("A regra do H-1B vale a partir de 1.º de outubro para todos.");
    expect(r.resto).toBe("");
  });

  it("texto de uma frase só vira tese inteira, sem resto", () => {
    expect(primeiraFrase("O desconto já está na vitrine:")).toEqual({
      tese: "O desconto já está na vitrine:",
      resto: "",
    });
  });

  it("texto vazio não quebra", () => {
    expect(primeiraFrase("   ")).toEqual({ tese: "", resto: "" });
  });
});

describe("o recorte de post", () => {
  it("está registrado para capa e para miolo", () => {
    expect(SLIDE_VARIANTS.cover.recorte_post).toBeTruthy();
    expect(SLIDE_VARIANTS.content.miolo_recorte).toBeTruthy();
  });

  it("imprime o autor com o handle real do perfil", () => {
    const html = montar({ title: "Uma manchete qualquer" });
    expect(html).toContain("usa.journal");
    expect(html).toContain("@usa.journal.ai");
  });

  /**
   * Sem selo de verificado, e não é esquecimento.
   *
   * A referência tem um, porque aquele perfil é verificado. O nosso não é, e
   * desenhar o selo seria afirmar que é.
   */
  it("não desenha selo de verificado", () => {
    const html = montar({ title: "Uma manchete qualquer" });
    expect(html).not.toContain('class="s-check"');
  });

  it("o chapéu entra dentro da frase, colado em dois-pontos", () => {
    const html = montar({ eyebrow: "Fed", title: "o banco central cortou os juros." });
    // Na capa de jornal o chapéu é sobrancelha solta; aqui ele é o começo da
    // fala, que é o que faz a peça ler como comentário e não como manchete.
    expect(html).toContain("<b>Fed:</b> o banco central cortou os juros.");
  });

  it("sem chapéu, a própria manchete vira o negrito de abertura", () => {
    const html = montar({ title: "O banco central cortou os juros." });
    expect(html).toContain("<b>O banco central cortou os juros.</b>");
  });

  it("põe a tese do segundo parágrafo em negrito e o resto em peso normal", () => {
    const html = montar({
      title: "o Fed cortou os juros.",
      body: "Isso muda o câmbio. Quem manda dinheiro para o Brasil sente primeiro:",
    });
    expect(html).toContain("<b>Isso muda o câmbio.</b> Quem manda dinheiro para o Brasil sente primeiro:");
  });

  it("desenha o cartão de mídia só quando há foto", () => {
    const com = montar({ title: "t", bg_image_url: "https://upload.wikimedia.org/a.jpg" });
    const sem = montar({ title: "t" });
    // O CSS do cartão está em toda página; o que muda é o ELEMENTO existir.
    expect(com).toContain('class="r-midia"');
    expect(sem).not.toContain('class="r-midia"');
  });

  /**
   * Sem foto o tipo cresce, pela mesma regra da capa sem foto: quando não há
   * imagem, o texto É a arte. Com o teto fixo em 46 a peça de texto puro saía
   * com 45 por cento de branco embaixo, que não é respiro, é sobra.
   */
  it("cresce o teto do tipo quando não há foto", () => {
    expect(montar({ title: "t", bg_image_url: "https://upload.wikimedia.org/a.jpg" })).toContain('data-max="46"');
    expect(montar({ title: "t" })).toContain('data-max="60"');
  });

  /**
   * A caixa que encolhe precisa de altura DEFINIDA antes de qualquer fonte
   * carregar, senão o script de ajuste mede a altura do conteúdo herdado e
   * conclui que só cabem duas linhas. Foi o que derrubou a capa sem foto para
   * 44px numa faixa de 871px.
   */
  it("o bloco que encolhe tem altura por flex-basis, e o script o encontra", () => {
    const html = montar({ title: "t" });
    expect(html).toContain('class="r-texto lay-texto"');
    expect(html).toContain('data-ajuste="encolher"');
    expect(html).toContain(".r-texto{flex:0 0 76%");
  });

  it("o convite de arrastar sai só na capa de peça com mais de um slide", () => {
    expect(montar({ title: "t" }, { total: 5, indice: 1 })).toContain("Arrasta que eu te explico");
    // Peça única não promete slide que não existe.
    expect(montar({ title: "t" }, { total: 1, indice: 1 })).not.toContain("Arrasta que eu te explico");
    // No miolo o convite já foi aceito: ali entra a marca.
    expect(montar({ title: "t" }, { total: 5, indice: 3 })).toContain("r-marca");
  });

  it("escapa o que vem do texto, para manchete com sinal não virar marcação", () => {
    const html = montar({ title: '<script>alert("x")</script>' });
    expect(html).not.toContain("<script>alert");
  });
});

describe("a escolha da gramática", () => {
  it("jornal continua sendo o padrão, e o recorte é pedido", async () => {
    const { varianteDaCapa } = await import("@/lib/server/social/arte");

    expect(varianteDaCapa(true)).toBe("capa_jornal");
    expect(varianteDaCapa(false)).toBe("noticia_sem_foto");
    expect(varianteDaCapa(true, "recorte")).toBe("recorte_post");
    // O recorte não tem versão sem foto separada: ele já é peça de texto.
    expect(varianteDaCapa(false, "recorte")).toBe("recorte_post");
  });

  it("a capa montada com gramática de recorte sai na variante certa", async () => {
    const { montarCapaDoPost } = await import("@/lib/server/social/arte");

    const capa = montarCapaDoPost({
      headline: "Uma manchete",
      gramatica: "recorte",
      asset: { imageUrl: "https://upload.wikimedia.org/a.jpg", attribution: "" },
    });

    expect(capa.variante).toBe("recorte_post");
    expect(capa.slide.variant).toBe("recorte_post");
  });
});
