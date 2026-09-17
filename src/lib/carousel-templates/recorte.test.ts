import { describe, expect, it } from "vitest";
import { assembleSlide } from "./assemble";
import { DEFAULT_TOKENS } from "./tokens";
import { CAPACIDADE_DO_RECORTE, cabeNoRecorte, primeiraFrase, SLIDE_VARIANTS } from "./variants";
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
   * O CORPO NÃO NEGOCIA, e é a regra central deste desenho.
   *
   * O carrossel é lido em sequência, arrastando. Tipo que muda de tamanho de
   * um slide para o outro denuncia peça montada por máquina, e foi o que o
   * dono apontou em 16/09/2026: "precisa ter um padrão de tamanho de fonte,
   * não pode cada slide ter um tamanho".
   *
   * Por isso o bloco NÃO carrega `data-ajuste`: o script de encolher não pode
   * encostar nele.
   */
  it("o corpo do tipo é fixo, com foto e sem foto", () => {
    const com = montar({ title: "t", bg_image_url: "https://upload.wikimedia.org/a.jpg" });
    const sem = montar({ title: "t" });

    expect(com).toContain('class="r-texto"');
    expect(sem).toContain('class="r-texto"');
    /*
     * O script de ajuste só enxerga `.lay-texto[data-ajuste]`. Manter o bloco
     * fora dessa classe é o que garante que ninguém encoste no corpo do tipo.
     * A string `data-ajuste` aparece no próprio script, embutido em toda
     * página, então o que se afirma aqui é a ausência da COMBINAÇÃO.
     */
    expect(com).not.toContain("r-texto lay-texto");
    expect(sem).not.toContain("r-texto lay-texto");
    expect(com).toContain(".r-texto{flex:0 0 76%");
    expect(com).toContain("font-size:46px");
  });

  /**
   * Nada no pé da peça: nem convite de arraste, nem marca repetida.
   *
   * O convite saiu por evidência, medida nas referências. A marca saiu por
   * redundância: ela já está no topo, no avatar e no nome do perfil, que é
   * justamente o que esta gramática copia da rede social.
   */
  it("não convida a arrastar em tela nenhuma", () => {
    expect(montar({ title: "t" }, { total: 5, indice: 1 })).not.toContain("Arrasta");
    expect(montar({ title: "t" }, { total: 1, indice: 1 })).not.toContain("Arrasta");
    expect(montar({ title: "t" }, { total: 5, indice: 3 })).not.toContain("Arrasta");
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

describe("o orçamento de texto", () => {
  /**
   * Os números saíram de medição no navegador, por busca binária, com frase de
   * português real e no pior caso de divisão entre os dois parágrafos: 216
   * caracteres com foto e 474 sem. O orçamento desconta cerca de 7 por cento,
   * porque a medição usa uma frase e a redação escreve outra.
   */
  it("conhece a capacidade medida", () => {
    expect(CAPACIDADE_DO_RECORTE.comFoto).toBe(200);
    expect(CAPACIDADE_DO_RECORTE.semFoto).toBe(440);
  });

  it("aceita o texto que cabe e recusa o que não cabe", () => {
    const curto = { titulo: "a".repeat(80), corpo: "b".repeat(80), temFoto: true };
    const longo = { titulo: "a".repeat(180), corpo: "b".repeat(180), temFoto: true };

    expect(cabeNoRecorte(curto)).toBe(true);
    expect(cabeNoRecorte(longo)).toBe(false);
  });

  it("sem foto cabe mais do que o dobro, porque o cartão de mídia sai", () => {
    const texto = { titulo: "a".repeat(200), corpo: "b".repeat(200) };
    expect(cabeNoRecorte({ ...texto, temFoto: true })).toBe(false);
    expect(cabeNoRecorte({ ...texto, temFoto: false })).toBe(true);
  });

  it("conta o chapéu e os itens, que também ocupam a caixa", () => {
    const base = { titulo: "a".repeat(190), temFoto: true };
    expect(cabeNoRecorte(base)).toBe(true);
    // Mais o chapéu e os dois pontos, e já não cabe.
    expect(cabeNoRecorte({ ...base, chapeu: "Custo de vida" })).toBe(false);
  });
});

describe("a peça que não cabe sai de jornal", () => {
  /**
   * Três saídas existiam para o texto que estoura o orçamento: encolher o
   * tipo, que desfaz a regra do tamanho único; cortar a frase, que foi o
   * defeito que a primeira renderização mostrou, com a peça terminando em "a
   * conta de morar pesa mais que a de comer no"; ou desenhar na gramática de
   * jornal, que se vira com texto de qualquer tamanho.
   *
   * A terceira é a única sem mentira.
   */
  it("texto que não cabe no recorte volta para a capa de jornal", async () => {
    const { montarCapaDoPost } = await import("@/lib/server/social/arte");
    const foto = { imageUrl: "https://upload.wikimedia.org/a.jpg", attribution: "" };

    const cabe = montarCapaDoPost({
      headline: "O Fed cortou os juros nesta quarta.",
      corpo: "O dólar responde a essa taxa antes de qualquer outra coisa:",
      gramatica: "recorte",
      asset: foto,
    });
    expect(cabe.variante).toBe("recorte_post");

    const naoCabe = montarCapaDoPost({
      headline: "O Fed cortou os juros nesta quarta e sinalizou mais dois cortes até o fim do ano, num movimento que o mercado esperava desde julho.",
      corpo: "Quem acha que isso é só assunto de mercado não entendeu o tamanho da mudança, porque o dólar, a passagem e a prestação da casa nos Estados Unidos respondem a essa taxa:",
      gramatica: "recorte",
      asset: foto,
    });
    expect(naoCabe.variante).toBe("capa_jornal");
  });

  it("o corpo só é impresso na gramática que sabe desenhá-lo", async () => {
    const { montarCapaDoPost } = await import("@/lib/server/social/arte");

    const recorte = montarCapaDoPost({ headline: "Curto.", corpo: "Uma leitura curta:", gramatica: "recorte", asset: null });
    const jornal = montarCapaDoPost({ headline: "Curto.", corpo: "Uma leitura curta:", gramatica: "jornal", asset: null });

    expect(recorte.slide.body).toBe("Uma leitura curta:");
    // Na capa de jornal o parágrafo entraria na MESMA caixa da manchete, com o
    // mesmo corpo de tipo, e a peça viraria um bloco só.
    expect(jornal.slide.body).toBe("");
  });
});
