import { describe, expect, it, vi } from "vitest";
import { POSICOES_DA_BOLHA } from "@/lib/carousel-templates/bolha";
import {
  FOLGA_DO_ROSTO,
  circuloComAnel,
  cruzaAlgumRosto,
  decidirBolha,
  escolherPosicaoDaBolha,
  type DeteccaoDeRostos,
  type PedidoDaBolha,
} from "./bolha-sem-rosto";

const CANVAS = { width: 1080, height: 1440 };

/*
 * As caixas de rosto abaixo são as que o detector devolveu em 06/10/2026 para
 * fotos reais de produção, e não números inventados: é com elas que a régua
 * tem que acertar.
 */
const BIDEN_RETRATO_OFICIAL = { x: 0.294, y: 0.094, largura: 0.411, altura: 0.477 };
const BIDEN_COMICIO_2019 = { x: 0.365, y: 0.005, largura: 0.34, altura: 0.34 };
const NOMEADO_DO_ICE = { x: 0.5, y: 0.18, largura: 0.36, altura: 0.41 };

describe("a conta do rosto", () => {
  it("o rosto no meio do retrato cruza a posição de sempre", () => {
    const padrao = circuloComAnel(POSICOES_DA_BOLHA[0], CANVAS);
    expect(cruzaAlgumRosto(padrao, [BIDEN_RETRATO_OFICIAL], CANVAS)).toBe(true);
  });

  it("a folga é o que separa encostar de passar perto", () => {
    // O rosto do nomeado começa em 50% da largura; a bolha padrão termina em
    // 48% mais o anel. Sem folga passa, com a folga de 3% cruza.
    const padrao = circuloComAnel(POSICOES_DA_BOLHA[0], CANVAS);
    expect(cruzaAlgumRosto(padrao, [NOMEADO_DO_ICE], CANVAS, 0)).toBe(false);
    expect(cruzaAlgumRosto(padrao, [NOMEADO_DO_ICE], CANVAS, FOLGA_DO_ROSTO)).toBe(true);
  });

  it("sem rosto, nada cruza", () => {
    expect(cruzaAlgumRosto(circuloComAnel(POSICOES_DA_BOLHA[0], CANVAS), [], CANVAS)).toBe(false);
  });
});

describe("a escolha da posição", () => {
  it("sem rosto, a posição de sempre, sem recusar nada", () => {
    expect(escolherPosicaoDaBolha([], CANVAS)).toEqual({ posicao: POSICOES_DA_BOLHA[0], recusadas: [] });
  });

  it("rosto no meio e alto: a bolha desce para o canto livre", () => {
    const escolha = escolherPosicaoDaBolha([BIDEN_COMICIO_2019], CANVAS);
    expect(escolha.posicao?.chave).toBe("media_esquerda_baixa");
    expect(escolha.recusadas[0]).toBe("padrao");
    // E a escolhida de fato não encosta no rosto.
    expect(cruzaAlgumRosto(circuloComAnel(escolha.posicao!, CANVAS), [BIDEN_COMICIO_2019], CANVAS)).toBe(false);
  });

  it("o retrato oficial de Biden, o caso que motivou a regra, fica sem posição", () => {
    const escolha = escolherPosicaoDaBolha([BIDEN_RETRATO_OFICIAL], CANVAS);
    expect(escolha.posicao).toBeNull();
    expect(escolha.recusadas).toHaveLength(POSICOES_DA_BOLHA.length);
    if (!escolha.posicao) expect(escolha.motivo).toMatch(/nenhuma das 12 posições/);
  });

  it("a ordem da lista é a preferência: a primeira livre vence", () => {
    // Rosto só no canto esquerdo alto: a padrão cruza, a direita é a próxima.
    const escolha = escolherPosicaoDaBolha([{ x: 0.05, y: 0.2, largura: 0.2, altura: 0.2 }], CANVAS);
    expect(escolha.posicao?.chave).toBe("direita");
  });
});

const SEM_ROSTO: DeteccaoDeRostos = { ok: true, rostos: [], custoUsd: 0.004, tokens: 1300, emCache: false, modelo: "m" };

function pedido(over: Partial<PedidoDaBolha> = {}): PedidoDaBolha {
  return {
    moldeLigado: true,
    anteriorTeveBolha: false,
    gramatica: "jornal",
    fotoDeFundo: "https://x/fundo.jpg",
    segundaFoto: { imageUrl: "https://x/bolha.jpg", attribution: "" },
    canvas: CANVAS,
    detectar: async () => SEM_ROSTO,
    ...over,
  };
}

describe("a decisão da peça", () => {
  it("na vez, sem rosto e com segunda foto: com bolha, na posição de sempre", async () => {
    const { decisao, asset } = await decidirBolha(pedido());
    expect(decisao).toMatchObject({
      vez: true,
      resultado: "com_bolha",
      posicao: "padrao",
      rostos: [],
      segundaFoto: { url: "https://x/bolha.jpg", origem: "resolvedor" },
      custoUsd: 0.004,
    });
    expect(asset?.imageUrl).toBe("https://x/bolha.jpg");
  });

  it("fora da vez não pergunta nada a ninguém, e não paga", async () => {
    const detectar = vi.fn(async () => SEM_ROSTO);
    const buscarSegunda = vi.fn();
    const { decisao, asset } = await decidirBolha(pedido({ anteriorTeveBolha: true, detectar, buscarSegunda }));
    expect(decisao).toMatchObject({ vez: false, resultado: "nao_era_a_vez", custoUsd: 0 });
    expect(asset).toBeNull();
    expect(detectar).not.toHaveBeenCalled();
    expect(buscarSegunda).not.toHaveBeenCalled();
  });

  it("nenhuma posição livre: sem bolha, com os rostos e as recusadas no registro", async () => {
    const { decisao, asset } = await decidirBolha(
      pedido({ detectar: async () => ({ ...SEM_ROSTO, rostos: [BIDEN_RETRATO_OFICIAL] }) }),
    );
    expect(asset).toBeNull();
    expect(decisao).toMatchObject({ vez: true, resultado: "sem_posicao_livre", posicao: null, rostos: [BIDEN_RETRATO_OFICIAL] });
    expect(decisao.posicoesRecusadas).toHaveLength(POSICOES_DA_BOLHA.length);
    expect(decisao.motivo).toMatch(/a vez passa/);
  });

  it("detector que falha é recusa: sem bolha, e o motivo diz que não deu para saber", async () => {
    const { decisao } = await decidirBolha(
      pedido({ detectar: async () => ({ ok: false, motivo: "sem credencial", custoUsd: 0, tokens: 0 }) }),
    );
    expect(decisao).toMatchObject({ resultado: "deteccao_falhou" });
    expect(decisao.motivo).toMatch(/sem credencial/);
  });

  it("detector que lança também é recusa, e não derruba a peça", async () => {
    const { decisao } = await decidirBolha(
      pedido({ detectar: async () => { throw new Error("timeout"); } }),
    );
    expect(decisao).toMatchObject({ resultado: "deteccao_falhou" });
  });

  it("sem detector configurado, sem bolha", async () => {
    const { decisao } = await decidirBolha(pedido({ detectar: undefined }));
    expect(decisao.resultado).toBe("deteccao_falhou");
  });

  it("rostos ANTES da busca extra: com rosto ocupando tudo, ninguém procura segunda foto", async () => {
    const buscarSegunda = vi.fn();
    await decidirBolha(
      pedido({
        segundaFoto: null,
        buscarSegunda,
        detectar: async () => ({ ...SEM_ROSTO, rostos: [{ x: 0, y: 0, largura: 1, altura: 1 }] }),
      }),
    );
    expect(buscarSegunda).not.toHaveBeenCalled();
  });

  it("sem vice, a busca extra entra, e a foto dela vira o círculo", async () => {
    const { decisao, asset } = await decidirBolha(
      pedido({
        segundaFoto: null,
        buscarSegunda: async () => ({ asset: { imageUrl: "https://x/extra.jpg", attribution: "" }, nota: "commons: 3" }),
      }),
    );
    expect(decisao).toMatchObject({ resultado: "com_bolha", segundaFoto: { url: "https://x/extra.jpg", origem: "busca_extra" } });
    expect(asset?.imageUrl).toBe("https://x/extra.jpg");
  });

  it("sem vice e a busca extra sem nada: sem bolha, e a vez passa", async () => {
    const { decisao } = await decidirBolha(
      pedido({ segundaFoto: null, buscarSegunda: async () => ({ asset: null, nota: "commons: 0" }) }),
    );
    expect(decisao).toMatchObject({ resultado: "sem_segunda_foto", notaDaBusca: "commons: 0" });
    expect(decisao.motivo).toMatch(/a vez passa/);
  });

  it("segunda foto igual à de fundo não vira bolha", async () => {
    const { decisao } = await decidirBolha(
      pedido({ segundaFoto: { imageUrl: "https://x/fundo.jpg", attribution: "" } }),
    );
    expect(decisao.resultado).toBe("sem_segunda_foto");
  });

  it("recorte e capa sem foto não desenham bolha: a vez passa sem custo", async () => {
    const detectar = vi.fn(async () => SEM_ROSTO);
    expect((await decidirBolha(pedido({ gramatica: "recorte", detectar }))).decisao.resultado).toBe("gramatica_sem_bolha");
    expect((await decidirBolha(pedido({ fotoDeFundo: null, detectar }))).decisao.resultado).toBe("sem_foto_de_fundo");
    expect(detectar).not.toHaveBeenCalled();
  });

  it("molde desligado no painel: nada, nem a vez", async () => {
    const { decisao } = await decidirBolha(pedido({ moldeLigado: false }));
    expect(decisao).toMatchObject({ vez: false, resultado: "molde_desligado" });
  });
});
