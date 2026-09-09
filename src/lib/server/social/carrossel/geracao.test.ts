import { describe, expect, it, vi } from "vitest";
import { gerarPostDaPauta } from "../gerador";
import { determinarFormatoEvergreen } from "./formato";
import type { PautaAvaliada } from "../../editorial/guarda";
import type { PacoteFactual } from "../../editorial/pacote-factual";
import type { CandidataPersistida } from "../../editorial/candidatos-store";
import type { ItemEvergreen } from "../evergreen/tipos";

/**
 * A geração do carrossel de ponta a ponta, sem rede.
 *
 * O que estes testes exercitam é o caminho inteiro: decisão de formato, copy em
 * slides, guarda por slide, laço de reparo e a saída quando o reparo não
 * resolve. O modelo é substituído no `fetcher`, e a guarda roda de verdade,
 * porque a guarda é o que não se pode errar.
 *
 * E protegem o contrário também, que é o que a fase pediu: sem o gancho de
 * decisão, o gerador se comporta EXATAMENTE como antes. É assim que a notícia
 * continua estática sem nenhuma condição nova no caminho dela.
 */

const FATOS = [
  "O ajuste de status permite pedir o green card sem sair dos Estados Unidos.",
  "O processamento consular acontece no consulado do pais onde a pessoa mora.",
  "A peticao imigratoria precisa ser aprovada antes do pedido de green card.",
  "O Formulario I-485 so pode ser enviado quando ha visto disponivel na categoria.",
  "A USCIS pode agendar biometria, pedir evidencia adicional ou marcar entrevista.",
  "Algumas categorias permitem enviar a peticao e o pedido ao mesmo tempo.",
];

const PACOTE: PacoteFactual = {
  verified_facts: FATOS,
  people: [],
  organizations: ["USCIS", "Department of State"],
  places: ["Estados Unidos"],
  dates: [],
  numbers: [],
  gaps: ["A pagina nao informa prazo de analise."],
  source_urls: ["https://www.uscis.gov/green-card"],
  texto_de_origem: FATOS.join(" "),
} as PacoteFactual;

const PAUTA: PautaAvaliada = {
  storyId: "evg:dar-entrada-dentro-ou-fora:esperar-nos-eua-ou-no-brasil",
  grupo: {
    primary: {
      id: "x",
      url: "https://www.uscis.gov/green-card",
      title: "Green Card: ajuste ou processamento consular",
      source_name: "USCIS",
      priority: 1,
      published_at: "2026-09-09T00:00:00Z",
      description: "Dois caminhos.",
      content: PACOTE.texto_de_origem,
      category: "comparison",
      score: 50,
      dedupe_key: "x",
      window_hours: 0,
    },
    secondary_sources: [],
    secondary_urls: [],
  },
  classificacao: {
    id: "x",
    pais: "EUA",
    imigracao: true,
    leitura: "neutra",
    eixo: "processo",
    natureza: "official_action",
    relevancia: 5,
    atores: [],
    lugares: ["Estados Unidos"],
    acontecimento: ["Ajuste de status"],
    justificativa: "conteudo permanente",
  },
  enriquecimento: { texto: PACOTE.texto_de_origem },
  pontuacao: { total: 50 },
} as unknown as PautaAvaliada;

const CONFIRMADA = {
  status: "approved",
  verificacao: { status: "confirm", motivo: "lastro na fonte canônica" },
} as unknown as CandidataPersistida;

const ITEM: ItemEvergreen = {
  topico: {
    id: "dar-entrada-dentro-ou-fora",
    nome: "Dar entrada dentro ou fora",
    familia: "comparison",
    resumo: "A diferença entre pedir o green card dentro dos EUA e no consulado.",
    fontesCanonicas: ["https://www.uscis.gov/green-card"],
    angulos: [{ id: "esperar-nos-eua-ou-no-brasil", pergunta: "Qual a diferença entre esperar nos EUA e no Brasil?" }],
  },
  angulo: { id: "esperar-nos-eua-ou-no-brasil", pergunta: "Qual a diferença entre esperar nos EUA e no Brasil?" },
};

const MARCA = { nome: "imigra.us", nicho: "imigração", extra: "", keyword: "VISA" };

/** Uma resposta de carrossel que o pacote sustenta inteira. */
function carrosselBom(over: Record<string, unknown> = {}) {
  return {
    headline: "Green Card dentro ou fora dos EUA",
    destaque: "dentro ou fora",
    gancho: "A USCIS descreve dois caminhos para o mesmo pedido.",
    fato_principal: "Quem está nos Estados Unidos pode pedir sem sair; quem está fora passa pelo consulado.",
    contexto: "",
    informacao_util: "",
    ressalva: "A pagina nao informa prazo de analise.",
    cta: "",
    hashtags: ["#GreenCard", "#ImigracaoEUA", "#EstadosUnidos", "#Consulado"],
    slides: [
      {
        papel: "lado A",
        titulo: "Pedir sem sair dos EUA",
        corpo: "O ajuste de status permite pedir o green card sem sair dos Estados Unidos.",
        bullets: [],
        lado_a: "",
        lado_b: "",
      },
      {
        papel: "lado B",
        titulo: "Pedir pelo consulado",
        corpo: "O processamento consular acontece no consulado do pais onde a pessoa mora.",
        bullets: [],
        lado_a: "",
        lado_b: "",
      },
      {
        papel: "diferença 1",
        titulo: "Onde a pessoa espera",
        corpo: "",
        bullets: [],
        lado_a: "O ajuste de status permite pedir sem sair dos Estados Unidos",
        lado_b: "O processamento consular acontece no consulado",
      },
      {
        papel: "diferença 2",
        titulo: "O que vem antes",
        corpo: "",
        bullets: [],
        lado_a: "A peticao imigratoria precisa ser aprovada antes",
        lado_b: "Algumas categorias permitem enviar ao mesmo tempo",
      },
      {
        papel: "resumo",
        titulo: "O que decide o caminho",
        corpo: "Quem está nos Estados Unidos e é elegível pode pedir sem sair; quem está fora usa o consulado.",
        bullets: [],
        lado_a: "",
        lado_b: "",
      },
    ],
    ...over,
  };
}

/** O post de imagem única, para o caminho da notícia. */
const COPY_ESTATICA = {
  headline: "USCIS descreve dois caminhos para o green card",
  destaque: "dois caminhos",
  gancho: "A USCIS descreve dois caminhos para o mesmo pedido.",
  fato_principal: "O ajuste de status permite pedir o green card sem sair dos Estados Unidos.",
  contexto: "O processamento consular acontece no consulado do pais onde a pessoa mora.",
  informacao_util: "A peticao imigratoria precisa ser aprovada antes do pedido de green card.",
  ressalva: "A pagina nao informa prazo de analise.",
  cta: "",
  hashtags: ["#GreenCard", "#ImigracaoEUA", "#EstadosUnidos"],
};

/**
 * O modelo, de mentira, com uma resposta por chamada.
 *
 * A lista permite exercitar o laço de reparo: primeira resposta com defeito,
 * segunda corrigida. Quando a lista acaba, a última resposta se repete, que é o
 * caso do modelo que insiste no mesmo erro.
 */
function modelo(respostas: unknown[]) {
  const chamadas: unknown[] = [];
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const corpo = JSON.parse(String(init?.body ?? "{}"));
    chamadas.push(corpo);
    const i = Math.min(chamadas.length - 1, respostas.length - 1);
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(respostas[i]) } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;

  return { fetcher, chamadas };
}

function opcoes(fetcher: typeof fetch, comCarrossel: boolean) {
  return {
    marca: MARCA,
    pacotes: new Map([[PAUTA.storyId, PACOTE]]),
    candidatas: new Map([[PAUTA.storyId, CONFIRMADA]]),
    env: { OPENAI_API_KEY: "chave" } as Record<string, string | undefined>,
    fetcher,
    ...(comCarrossel
      ? {
          decidirCarrossel: (_p: unknown, pacote: PacoteFactual | null, comCta: boolean) =>
            determinarFormatoEvergreen(ITEM, pacote ?? PACOTE, { comCta }),
        }
      : {}),
  };
}

describe("formato: o que vira carrossel", () => {
  it("comparação com pacote suficiente vira carrossel de slides", async () => {
    const { fetcher } = modelo([carrosselBom()]);
    const r = await gerarPostDaPauta(PAUTA, 0, opcoes(fetcher, true));

    expect(r.descarte).toBeNull();
    expect(r.post?.carrossel).toBeTruthy();
    expect(r.post!.carrossel!.estrutura).toBe("comparison");
    expect(r.post!.carrossel!.slides).toHaveLength(5);
    // A capa entra nos papéis desenhados, e é o código que a monta.
    expect(r.post!.carrossel!.papeis[0].tipo).toBe("cover");
    expect(r.post!.carrossel!.papeis[0].escritoEmCodigo).toBe(true);
  });

  it("pacote curto não vira carrossel: o gerador nem pergunta ao modelo por slides", async () => {
    const pacoteCurto = { ...PACOTE, verified_facts: [FATOS[0]] } as PacoteFactual;
    const { fetcher, chamadas } = modelo([COPY_ESTATICA]);

    const r = await gerarPostDaPauta(PAUTA, 0, {
      ...opcoes(fetcher, false),
      pacotes: new Map([[PAUTA.storyId, pacoteCurto]]),
      decidirCarrossel: (_p: unknown, _pacote: unknown, comCta: boolean) =>
        determinarFormatoEvergreen(ITEM, pacoteCurto, { comCta }),
    });

    expect(r.post?.carrossel).toBeUndefined();
    expect(JSON.stringify(chamadas[0])).not.toContain("CARROSSEL");
  });

  it("sem pacote factual não existe carrossel, por mais que a família prefira", async () => {
    /*
     * Sem pacote, a ancoragem por slide não tem contra o que conferir: seriam
     * seis slides sem verificação nenhuma, que é o oposto do que o formato
     * exige.
     */
    const { fetcher } = modelo([COPY_ESTATICA]);
    const r = await gerarPostDaPauta(PAUTA, 0, {
      ...opcoes(fetcher, true),
      pacotes: new Map(),
    });

    expect(r.post?.carrossel).toBeUndefined();
  });
});

describe("grounding: cada slide precisa de lastro", () => {
  it("número inventado num slide obrigatório derruba o carrossel", async () => {
    /*
     * "540 dias" não está no pacote. O slide é obrigatório na comparação, então
     * remover não é opção: sem um dos lados, não há comparação.
     */
    const comInvencao = carrosselBom();
    comInvencao.slides[0].corpo = "O ajuste de status leva 540 dias em media.";

    const { fetcher } = modelo([comInvencao]);
    const r = await gerarPostDaPauta(PAUTA, 0, { ...opcoes(fetcher, true), maximoDeReparos: 0 });

    expect(r.post).toBeNull();
    expect(r.descarte?.problemas.map((p) => p.motivo)).toContain("SOCIAL_REJECT_SLIDE_GROUNDING");
    expect(r.descarte?.problemas.find((p) => p.motivo === "SOCIAL_REJECT_SLIDE_GROUNDING")?.detalhe).toContain(
      "540",
    );
  });

  it("o apontamento nomeia a POSIÇÃO do slide na peça, contando a capa", async () => {
    const comInvencao = carrosselBom();
    comInvencao.slides[1].corpo = "O consulado cobra US$ 9.999 pela entrevista.";

    const { fetcher } = modelo([comInvencao]);
    const r = await gerarPostDaPauta(PAUTA, 0, { ...opcoes(fetcher, true), maximoDeReparos: 0 });

    const problema = r.descarte?.problemas.find((p) => p.motivo === "SOCIAL_REJECT_SLIDE_GROUNDING");
    // "lado B" é o terceiro papel da comparação: capa, lado A, lado B.
    expect(problema?.detalhe).toContain("slide 3");
    expect(problema?.detalhe).toContain("lado B");
  });

  it("o reparo recebe o problema nomeado e a segunda resposta passa", async () => {
    const comInvencao = carrosselBom();
    comInvencao.slides[0].corpo = "O ajuste de status leva 540 dias em media.";

    const { fetcher, chamadas } = modelo([comInvencao, carrosselBom()]);
    const r = await gerarPostDaPauta(PAUTA, 0, opcoes(fetcher, true));

    expect(r.post).toBeTruthy();
    expect(r.post!.tentativas).toBeGreaterThan(0);

    const pedidoDeReparo = JSON.stringify(chamadas[1]);
    expect(pedidoDeReparo).toContain("SOCIAL_REJECT_SLIDE_GROUNDING");
    expect(pedidoDeReparo).toContain("540");
  });

  it("slide OPCIONAL sem lastro é removido, e o carrossel sobrevive", async () => {
    /*
     * É a saída que o item 6 do pedido pede: remover ou reestruturar o slide, e
     * só descartar o post se a forma não se sustentar. Descartar quatro slides
     * bons por causa do quarto, opcional, seria jogar a peça fora.
     */
    const comInvencao = carrosselBom();
    comInvencao.slides[3].lado_a = "A taxa e de US$ 3.271 desde 2024";

    const { fetcher } = modelo([comInvencao]);
    const r = await gerarPostDaPauta(PAUTA, 0, { ...opcoes(fetcher, true), maximoDeReparos: 0 });

    expect(r.post).toBeTruthy();
    /* Cinco slides menos o opcional sem lastro. */
    expect(r.post!.carrossel!.slides).toHaveLength(4);
    expect(r.post!.carrossel!.slides.map((s) => s.papel)).not.toContain("diferença 2");
  });

  it("slide de comparação com uma coluna vazia é apontado pela forma", async () => {
    const meiaComparacao = carrosselBom();
    meiaComparacao.slides[2].lado_b = "";

    const { fetcher } = modelo([meiaComparacao]);
    const r = await gerarPostDaPauta(PAUTA, 0, { ...opcoes(fetcher, true), maximoDeReparos: 0 });

    const motivos = (r.descarte?.problemas ?? r.post?.veredicto.issues ?? []).map((p) => p.motivo);
    expect(motivos).toContain("SOCIAL_REJECT_SLIDE_SHAPE");
  });

  it("contagem de slides diferente da estrutura é apontada", async () => {
    const faltando = carrosselBom({ slides: carrosselBom().slides.slice(0, 2) });

    const { fetcher } = modelo([faltando]);
    const r = await gerarPostDaPauta(PAUTA, 0, { ...opcoes(fetcher, true), maximoDeReparos: 0 });

    const motivos = (r.descarte?.problemas ?? r.post?.veredicto.issues ?? []).map((p) => p.motivo);
    expect(motivos).toContain("SOCIAL_REJECT_SLIDE_SHAPE");
  });
});

describe("a legenda do carrossel é curta, e isso é garantido em código", () => {
  it("contexto e informação útil não entram na legenda, mesmo se o modelo escrever", async () => {
    const teimoso = carrosselBom({
      contexto: "ISTO NAO DEVERIA APARECER NA LEGENDA",
      informacao_util: "NEM ISTO",
    });

    const { fetcher } = modelo([teimoso]);
    const r = await gerarPostDaPauta(PAUTA, 0, opcoes(fetcher, true));

    expect(r.post).toBeTruthy();
    expect(r.post!.veredicto.legendaFinal).not.toContain("NAO DEVERIA APARECER");
    expect(r.post!.veredicto.legendaFinal).not.toContain("NEM ISTO");
    expect(r.post!.copy.contexto).toBe("");
    expect(r.post!.copy.informacao_util).toBe("");
  });
});

describe("a notícia não muda", () => {
  it("sem o gancho de decisão, o post sai estático e o prompt é o de imagem única", async () => {
    const { fetcher, chamadas } = modelo([COPY_ESTATICA]);
    const r = await gerarPostDaPauta(PAUTA, 0, opcoes(fetcher, false));

    expect(r.post).toBeTruthy();
    expect(r.post!.carrossel).toBeUndefined();

    const system = JSON.stringify(chamadas[0]);
    expect(system).toContain("POST DE IMAGEM ÚNICA");
    expect(system).not.toContain("CARROSSEL");
  });

  it("a legenda do estático continua com contexto e informação útil", async () => {
    const { fetcher } = modelo([COPY_ESTATICA]);
    const r = await gerarPostDaPauta(PAUTA, 0, opcoes(fetcher, false));

    expect(r.post!.veredicto.legendaFinal).toContain("O processamento consular acontece");
    expect(r.post!.veredicto.legendaFinal).toContain("A peticao imigratoria precisa ser aprovada");
  });

  it("decisão que devolve static usa o caminho de imagem única", async () => {
    const { fetcher, chamadas } = modelo([COPY_ESTATICA]);
    const r = await gerarPostDaPauta(PAUTA, 0, {
      ...opcoes(fetcher, false),
      decidirCarrossel: () => ({ formato: "static" as const, slides: 1, motivo: "teste", fatosUteis: 6 }),
    });

    expect(r.post!.carrossel).toBeUndefined();
    expect(JSON.stringify(chamadas[0])).toContain("POST DE IMAGEM ÚNICA");
  });
});
