import { describe, expect, it } from "vitest";
import { alternarFormatos, determinarFormatoEvergreen, fatosQueViramSlide, preferenciaDaFamilia } from "./formato";
import { ESTRUTURAS, MAXIMO_DE_SLIDES, MINIMO_DE_SLIDES, papeisPara, minimoDaEstrutura } from "./estrutura";
import { CATALOGO_EVERGREEN } from "../evergreen/catalogo";
import type { FamiliaEvergreen, ItemEvergreen, TopicoEvergreen } from "../evergreen/tipos";
import type { PacoteFactual } from "../../editorial/pacote-factual";

/**
 * O defeito que este módulo existe para impedir: um fato virando seis slides.
 *
 * O carrossel só ganha do estático quando cada slide tem o que dizer. Sem essa
 * régua, a família "prefere carrossel" bastaria, e um glossário com uma frase
 * de definição sairia com cinco slides de paráfrase.
 */

function pacote(fatos: string[], over: Partial<PacoteFactual> = {}): PacoteFactual {
  return {
    verified_facts: fatos,
    people: [],
    organizations: ["USCIS"],
    places: ["Estados Unidos"],
    dates: [],
    numbers: [],
    gaps: [],
    source_urls: ["https://www.uscis.gov/x"],
    texto_de_origem: fatos.join(" "),
    ...over,
  } as PacoteFactual;
}

/** Fatos longos o bastante para virar slide, e distintos entre si. */
function fatosDeVerdade(quantos: number): string[] {
  const base = [
    "O ajuste de status permite pedir o green card sem sair dos Estados Unidos.",
    "O processamento consular acontece no consulado do pais onde a pessoa mora.",
    "A peticao imigratoria precisa ser aprovada antes do pedido de green card.",
    "O Formulario I-485 so pode ser enviado quando ha visto disponivel na categoria.",
    "A USCIS pode agendar biometria, pedir evidencia adicional ou marcar entrevista.",
    "Algumas categorias permitem enviar a peticao e o pedido ao mesmo tempo.",
    "O exame medico entra no pedido de ajuste de status em muitos casos.",
    "A taxa do pedido varia conforme a idade e a categoria do solicitante.",
  ];
  return base.slice(0, quantos);
}

function topico(over: Partial<TopicoEvergreen> = {}): TopicoEvergreen {
  return {
    id: "t",
    nome: "Tema",
    familia: "visa_explainer",
    resumo: "Resumo do tema.",
    fontesCanonicas: ["https://www.uscis.gov/x"],
    angulos: [{ id: "a", pergunta: "O que e isso?" }],
    ...over,
  };
}

function item(familia: FamiliaEvergreen, pergunta = "O que e isso?"): ItemEvergreen {
  const t = topico({ familia });
  return { topico: t, angulo: { id: "a", pergunta } };
}

/** As sete famílias, escritas à mão para o teste falhar se uma nova aparecer sem preferência. */
const PREFERENCIAS: FamiliaEvergreen[] = [
  "visa_explainer",
  "glossary",
  "faq",
  "comparison",
  "process_explainer",
  "evidence_education",
  "professional_education",
];

const COM_CTA = { comCta: true };
const SEM_CTA = { comCta: false };

describe("fato que serve de slide", () => {
  it("fragmento curto não conta", () => {
    const uteis = fatosQueViramSlide(pacote(["Formulario I-485", "USCIS", "Green card"]));
    expect(uteis).toEqual([]);
  });

  it("o mesmo fato em duas formulações conta uma vez", () => {
    /*
     * A página oficial repete a mesma informação em seções diferentes, e o
     * extrator a devolve duas vezes. Contar duas autorizaria um carrossel que
     * diz a mesma coisa em dois slides seguidos.
     */
    const uteis = fatosQueViramSlide(
      pacote([
        "O ajuste de status permite pedir o green card sem sair dos Estados Unidos.",
        "O ajuste de status permite pedir o green card sem deixar o territorio americano.",
        "O processamento consular acontece no consulado do pais onde a pessoa mora.",
      ]),
    );
    expect(uteis).toHaveLength(2);
  });

  it("acento não faz o mesmo fato contar duas vezes", () => {
    const uteis = fatosQueViramSlide(
      pacote([
        "A petição imigratória precisa ser aprovada antes do pedido de green card.",
        "A peticao imigratoria precisa ser aprovada antes do pedido de green card.",
      ]),
    );
    expect(uteis).toHaveLength(1);
  });
});

describe("não criar carrossel vazio", () => {
  it("um fato só vira estático, mesmo em família que prefere carrossel", () => {
    const d = determinarFormatoEvergreen(item("visa_explainer"), pacote(fatosDeVerdade(1)), COM_CTA);
    expect(d.formato).toBe("static");
    expect(d.slides).toBe(1);
    expect(d.motivo).toContain("carrossel vazio");
  });

  it("pacote sem nenhum fato útil vira estático", () => {
    const d = determinarFormatoEvergreen(item("comparison"), pacote(["USCIS", "EB-5"]), COM_CTA);
    expect(d.formato).toBe("static");
    expect(d.fatosUteis).toBe(0);
  });

  it("comparação com material suficiente vira carrossel", () => {
    const d = determinarFormatoEvergreen(item("comparison"), pacote(fatosDeVerdade(6)), COM_CTA);
    expect(d.formato).toBe("carousel");
    expect(d.estrutura).toBe("comparison");
    expect(d.slides).toBeGreaterThanOrEqual(5);
  });

  it("explainer com material suficiente vira carrossel", () => {
    const d = determinarFormatoEvergreen(item("visa_explainer"), pacote(fatosDeVerdade(5)), COM_CTA);
    expect(d.formato).toBe("carousel");
    expect(d.estrutura).toBe("explainer");
  });

  it("processo com material suficiente vira carrossel de etapas", () => {
    const d = determinarFormatoEvergreen(item("process_explainer"), pacote(fatosDeVerdade(5)), COM_CTA);
    expect(d.formato).toBe("carousel");
    expect(d.estrutura).toBe("process");
  });
});

describe("glossário e FAQ são estáticos por padrão", () => {
  it("glossário com só a definição fica estático", () => {
    const d = determinarFormatoEvergreen(item("glossary"), pacote(fatosDeVerdade(1)), COM_CTA);
    expect(d.formato).toBe("static");
    expect(d.motivo).toContain("estática por padrão");
  });

  it("glossário com três fatos ainda fica estático: o piso é quatro", () => {
    /*
     * A medição de sete dias com lastro real deu 96% do evergreen em carrossel,
     * e a régua antiga ("um fato além do essencial") era satisfeita por
     * qualquer página oficial. O pedido diz SOMENTE com contexto REALMENTE
     * útil, e o piso declarado é o que dá sentido a essa palavra.
     */
    const d = determinarFormatoEvergreen(item("glossary"), pacote(fatosDeVerdade(3)), COM_CTA);
    expect(d.formato).toBe("static");
    expect(d.motivo).toContain("piso de 4");
  });

  it("glossário com quatro fatos vira carrossel de 2 ou 3 slides", () => {
    const d = determinarFormatoEvergreen(item("glossary"), pacote(fatosDeVerdade(4)), COM_CTA);
    expect(d.formato).toBe("carousel");
    expect(d.slides).toBeGreaterThanOrEqual(2);
    expect(d.slides).toBeLessThanOrEqual(3);
  });

  it("FAQ de pergunta simples fica estático, por rica que seja a fonte", () => {
    /*
     * FAQ não vira carrossel por quantidade de fato. Uma resposta direta
     * continua sendo direta por mais material que a página tenha; o que muda a
     * forma é a pergunta pedir uma sequência.
     */
    for (const fatos of [1, 4, 8]) {
      const d = determinarFormatoEvergreen(item("faq"), pacote(fatosDeVerdade(fatos)), COM_CTA);
      expect(d.formato, `${fatos} fatos`).toBe("static");
    }
  });

  it("FAQ que exige explicação em etapas vira carrossel de processo", () => {
    const d = determinarFormatoEvergreen(
      item("faq", "Quais são as etapas depois que a petição é aprovada?"),
      pacote(fatosDeVerdade(5)),
      COM_CTA,
    );
    expect(d.formato).toBe("carousel");
    expect(d.estrutura).toBe("process");
  });
});

describe("a pergunta manda na forma", () => {
  it("ângulo de etapas dentro de um explainer vira processo", () => {
    const d = determinarFormatoEvergreen(
      item("visa_explainer", "Em que ordem as etapas acontecem?"),
      pacote(fatosDeVerdade(6)),
      COM_CTA,
    );
    expect(d.estrutura).toBe("process");
  });

  it("ângulo de diferença vira comparação", () => {
    const d = determinarFormatoEvergreen(
      item("visa_explainer", "Qual a diferença entre os dois pedidos?"),
      pacote(fatosDeVerdade(6)),
      COM_CTA,
    );
    expect(d.estrutura).toBe("comparison");
  });

  it('pergunta com "ou" não é tratada como comparação', () => {
    /*
     * A régua larga transformaria "o que é isso ou como funciona" em duas
     * colunas para um assunto que tem um lado só. Comparação de verdade nomeia
     * os dois lados.
     */
    const d = determinarFormatoEvergreen(
      item("visa_explainer", "O que é o EB-2 NIW ou como ele funciona?"),
      pacote(fatosDeVerdade(6)),
      COM_CTA,
    );
    expect(d.estrutura).toBe("explainer");
  });
});

describe("limites", () => {
  it("nenhuma família passa de sete slides, nem com material de sobra", () => {
    for (const familia of PREFERENCIAS) {
      const d = determinarFormatoEvergreen(item(familia), pacote(fatosDeVerdade(8)), COM_CTA);
      expect(d.slides).toBeLessThanOrEqual(MAXIMO_DE_SLIDES);
    }
  });

  it("carrossel nunca sai com menos de dois slides", () => {
    for (const familia of PREFERENCIAS) {
      for (let fatos = 0; fatos <= 8; fatos += 1) {
        const d = determinarFormatoEvergreen(item(familia), pacote(fatosDeVerdade(fatos)), COM_CTA);
        if (d.formato === "carousel") expect(d.slides).toBeGreaterThanOrEqual(MINIMO_DE_SLIDES);
      }
    }
  });

  it("a contagem produzida cabe na faixa que a família declara", () => {
    /*
     * A faixa de cada família veio do pedido do dono do produto. Este teste
     * existe para a faixa declarada e a forma implementada não divergirem em
     * silêncio: se uma estrutura mudar de tamanho, é aqui que aparece.
     */
    for (const familia of PREFERENCIAS) {
      const faixa = preferenciaDaFamilia(familia);
      const d = determinarFormatoEvergreen(item(familia), pacote(fatosDeVerdade(8)), COM_CTA);
      if (d.formato !== "carousel") continue;
      expect(d.slides, `${familia} passou do máximo declarado`).toBeLessThanOrEqual(faixa.max);
      expect(d.slides, `${familia} ficou abaixo do mínimo declarado`).toBeGreaterThanOrEqual(faixa.min);
    }
  });

  it("sem CTA o carrossel não reserva slide de fechamento", () => {
    const com = determinarFormatoEvergreen(item("visa_explainer"), pacote(fatosDeVerdade(6)), COM_CTA);
    const sem = determinarFormatoEvergreen(item("visa_explainer"), pacote(fatosDeVerdade(6)), SEM_CTA);
    expect(papeisPara(com.estrutura!, com.slides, true).some((p) => p.tipo === "cta")).toBe(true);
    expect(papeisPara(sem.estrutura!, sem.slides, false).some((p) => p.tipo === "cta")).toBe(false);
  });
});

describe("papéis da estrutura", () => {
  it("papeisPara devolve exatamente a quantidade pedida", () => {
    for (const estrutura of Object.keys(ESTRUTURAS) as Array<keyof typeof ESTRUTURAS>) {
      for (const comCta of [true, false]) {
        const piso = minimoDaEstrutura(estrutura) + (comCta ? 1 : 0);
        /*
         * O teto depende do CTA, e é isso que o laço errado media.
         *
         * O fechamento é um dos papéis da estrutura. Sem ele, o máximo
         * alcançável é a estrutura MENOS um, e pedir o comprimento cheio sem
         * CTA cobrava um slide que não existe.
         */
        const semFechamento = ESTRUTURAS[estrutura].filter((p) => !p.escritoEmCodigo).length;
        const teto = comCta ? semFechamento + 1 : semFechamento;
        for (let n = piso; n <= teto; n += 1) {
          const papeis = papeisPara(estrutura, n, comCta);
          expect(papeis, `${estrutura} com ${n} slides e cta=${comCta}`).toHaveLength(n);
        }
      }
    }
  });

  it("a capa é sempre o primeiro papel", () => {
    for (const estrutura of Object.keys(ESTRUTURAS) as Array<keyof typeof ESTRUTURAS>) {
      const papeis = papeisPara(estrutura, 4, true);
      expect(papeis[0].tipo).toBe("cover");
    }
  });

  it("o fechamento, quando existe, é sempre o último", () => {
    for (const estrutura of Object.keys(ESTRUTURAS) as Array<keyof typeof ESTRUTURAS>) {
      const papeis = papeisPara(estrutura, 5, true);
      expect(papeis[papeis.length - 1].tipo).toBe("cta");
      expect(papeis.filter((p) => p.tipo === "cta")).toHaveLength(1);
    }
  });

  it("os papéis obrigatórios nunca são cortados", () => {
    for (const estrutura of Object.keys(ESTRUTURAS) as Array<keyof typeof ESTRUTURAS>) {
      const piso = minimoDaEstrutura(estrutura) + 1;
      const papeis = papeisPara(estrutura, piso, true);
      for (const obrigatorio of ESTRUTURAS[estrutura].filter((p) => p.obrigatorio)) {
        expect(papeis, `${estrutura} cortou ${obrigatorio.papel}`).toContain(obrigatorio);
      }
    }
  });

  it("os papéis saem na ordem declarada, e não na ordem de escolha", () => {
    /*
     * Os obrigatórios são escolhidos primeiro para não serem cortados, o que
     * embaralha a ordem. O leitor vê sempre a sequência da estrutura.
     */
    const papeis = papeisPara("explainer", 5, true);
    const posicoes = papeis
      .filter((p) => !p.escritoEmCodigo)
      .map((p) => ESTRUTURAS.explainer.indexOf(p));
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
  });

  it("a comparação desenha as diferenças com a variante de duas colunas", () => {
    const papeis = papeisPara("comparison", 7, true);
    const diferencas = papeis.filter((p) => p.papel.startsWith("diferença"));
    expect(diferencas.length).toBeGreaterThanOrEqual(1);
    for (const d of diferencas) expect(d.variante).toBe("comparacao_duas_colunas");
  });
});

describe("o catálogo real", () => {
  it("toda família do catálogo tem preferência declarada", () => {
    for (const t of CATALOGO_EVERGREEN) {
      expect(preferenciaDaFamilia(t.familia), `família ${t.familia} sem preferência`).toBeTruthy();
    }
  });

  it("com material rico, a maior parte do catálogo vira carrossel", () => {
    /*
     * A proporção de 60 a 70% em carrossel é meta de observação, não regra de
     * publicação, e aqui ela é medida com material rico de propósito: o que se
     * confere é que as preferências por família somam nessa direção, não que
     * um dia real bata a porcentagem.
     */
    let carrossel = 0;
    let total = 0;
    for (const t of CATALOGO_EVERGREEN) {
      for (const a of t.angulos) {
        const d = determinarFormatoEvergreen({ topico: t, angulo: a }, pacote(fatosDeVerdade(6)), COM_CTA);
        total += 1;
        if (d.formato === "carousel") carrossel += 1;
      }
    }
    const proporcao = carrossel / total;
    expect(proporcao).toBeGreaterThan(0.5);
    expect(proporcao).toBeLessThanOrEqual(1);
  });
});

describe("intercalar formatos é desempate, não quota", () => {
  type Fake = { id: number; f: "static" | "carousel" };
  const fmt = (x: Fake) => x.f;
  const lista = (padrao: string): Fake[] =>
    padrao.split("").map((c, i) => ({ id: i, f: c === "C" ? "carousel" : "static" }));
  const desenho = (xs: Fake[]) => xs.map((x) => (x.f === "carousel" ? "C" : "S")).join("");

  const CASOS = ["C", "CS", "CCC", "CCCS", "CSSS", "CCCCSSSS", "CCCCCSS", "SSSSC", "CCSSCC"];

  it("nada é perdido, nada é duplicado, em nenhum caso", () => {
    /*
     * A régua é de ORDEM. Perder ou duplicar um post aqui seria transformar
     * diversidade de formato em quota, que é exatamente o que o pedido proíbe.
     */
    for (const padrao of CASOS) {
      const entrada = lista(padrao);
      const saida = alternarFormatos(entrada, fmt);

      expect(saida, padrao).toHaveLength(entrada.length);
      expect(new Set(saida.map((x) => x.id)).size, padrao).toBe(entrada.length);
      expect(saida.filter((x) => x.f === "carousel").length, padrao).toBe(
        entrada.filter((x) => x.f === "carousel").length,
      );
    }
  });

  it("é determinística: duas chamadas devolvem a mesma ordem", () => {
    for (const padrao of CASOS) {
      const entrada = lista(padrao);
      expect(desenho(alternarFormatos(entrada, fmt)), padrao).toBe(desenho(alternarFormatos(entrada, fmt)));
    }
  });

  it("um formato só volta exatamente como veio", () => {
    for (const padrao of ["CCCC", "SSSS"]) {
      const entrada = lista(padrao);
      expect(alternarFormatos(entrada, fmt).map((x) => x.id)).toEqual(entrada.map((x) => x.id));
    }
  });

  it("espalha a minoria em vez de alternar cegamente", () => {
    /*
     * Com quatro carrosséis e um estático, alternar daria C S C C C, com bloco
     * de três no fim. Espalhar dá C C S C C, que é o que se quer.
     */
    expect(desenho(alternarFormatos(lista("CCCCS"), fmt))).toBe("CCSCC");
  });

  it("nenhum caso produz sequência do mesmo formato maior que a entrada permite", () => {
    for (const padrao of CASOS) {
      const saida = alternarFormatos(lista(padrao), fmt);
      const c = saida.filter((x) => x.f === "carousel").length;
      const s = saida.length - c;

      /*
       * O piso teórico da maior sequência é `ceil(maioria / (minoria + 1))`:
       * com m da maioria e k da minoria há k+1 blocos, e o maior deles não pode
       * ser menor que isso. A saída não precisa ser ótima, mas não pode ser
       * pior que dois blocos acima do piso, senão a intercalação não está
       * intercalando.
       */
      const maioria = Math.max(c, s);
      const minoria = Math.min(c, s);
      const piso = minoria === 0 ? maioria : Math.ceil(maioria / (minoria + 1));

      let maior = 0;
      let corrente = 0;
      let anterior = "";
      for (const x of saida) {
        corrente = x.f === anterior ? corrente + 1 : 1;
        anterior = x.f;
        maior = Math.max(maior, corrente);
      }

      expect(maior, `${padrao} -> ${desenho(saida)} (piso ${piso})`).toBeLessThanOrEqual(piso + 1);
    }
  });
});
