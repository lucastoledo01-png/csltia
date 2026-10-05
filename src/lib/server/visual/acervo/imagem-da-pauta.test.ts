import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { esquecerImagensDasPautas, imagemDaPauta } from "./imagem-da-pauta";
import type { PautaParaImagem } from "../resolver";
import type { ResultadoVisual } from "../tipos";
import type { Acervo } from "./acervo";
import { agregarFaltas } from "./lista-de-compras";
import { resumirPrateleiras } from "./situacao";

/**
 * Uma pauta, uma imagem, todos os ramos. E com a capacidade desligada, nada
 * disso existe: o resolvedor roda quantas vezes rodava antes.
 */

const PAUTA: PautaParaImagem = {
  storyId: "pauta-1",
  titulo: "Aluguel sobe nos EUA",
  categoria: "custo_de_vida",
  classificacao: { atores: [], lugares: [], acontecimento: [] },
};

function resultado(url: string): ResultadoVisual {
  return {
    storyId: "pauta-1",
    entidade: null,
    asset: { imageUrl: url, source: "acervo_proprio" } as ResultadoVisual["asset"],
    assetSecundario: null,
    status: "SELECTED",
    motivo: null,
    fontesConsultadas: [],
    recusados: [],
    legenda: "",
  };
}

const ACERVO = { modo: "enforce" } as unknown as Acervo;

function projeto(acervo: string | undefined) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    settings: acervo ? { capacidades: { acervo } } : {},
  };
}

/** Cliente que só sabe responder `imagem_da_pauta`, guardando o que foi gravado. */
function clienteFalso(gravado: ResultadoVisual | null = null) {
  const gravacoes: unknown[] = [];
  const cliente = {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: gravado ? { resultado: gravado } : null, error: null }) }) }),
      }),
      upsert: async (linha: unknown) => {
        gravacoes.push(linha);
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
  return { cliente, gravacoes };
}

beforeEach(() => esquecerImagensDasPautas());

describe("a imagem da pauta, resolvida uma vez", () => {
  it("capacidade desligada: repasse puro, o resolvedor roda toda vez e nada é gravado", async () => {
    const resolver = vi.fn(async () => resultado("https://x/a.jpg"));
    const { cliente, gravacoes } = clienteFalso();

    await imagemDaPauta(PAUTA, { projeto: projeto(undefined), client: cliente, resolver });
    await imagemDaPauta(PAUTA, { projeto: projeto(undefined), client: cliente, resolver });

    expect(resolver).toHaveBeenCalledTimes(2);
    // E sem acervo nas opções: o resolvedor nem sabe que ele existe.
    expect((resolver.mock.calls[0] as unknown[])[1]).not.toHaveProperty("acervo");
    expect(gravacoes).toHaveLength(0);
  });

  it("ensaio: o acervo vai para o resolvedor, mas nada é reusado nem gravado", async () => {
    const resolver = vi.fn(async () => resultado("https://x/a.jpg"));
    const { cliente, gravacoes } = clienteFalso();

    await imagemDaPauta(PAUTA, { projeto: projeto("dry_run"), client: cliente, resolver, acervo: ACERVO });
    await imagemDaPauta(PAUTA, { projeto: projeto("dry_run"), client: cliente, resolver, acervo: ACERVO });

    expect(resolver).toHaveBeenCalledTimes(2);
    expect((resolver.mock.calls[0] as unknown[])[1]).toHaveProperty("acervo", ACERVO);
    expect(gravacoes).toHaveLength(0);
  });

  it("enforce: o segundo ramo recebe a mesma imagem sem resolver de novo", async () => {
    const resolver = vi.fn(async () => resultado("https://x/a.jpg"));
    const { cliente, gravacoes } = clienteFalso();

    const a = await imagemDaPauta(PAUTA, { projeto: projeto("enforce"), client: cliente, resolver, acervo: ACERVO });
    const b = await imagemDaPauta(PAUTA, { projeto: projeto("enforce"), client: cliente, resolver, acervo: ACERVO });

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(gravacoes).toHaveLength(1);
  });

  it("enforce: duas chamadas simultâneas resolvem uma vez só", async () => {
    const resolver = vi.fn(async () => resultado("https://x/a.jpg"));
    const ctx = { projeto: projeto("enforce"), client: clienteFalso().cliente, resolver, acervo: ACERVO };

    await Promise.all([imagemDaPauta(PAUTA, ctx), imagemDaPauta(PAUTA, ctx)]);
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it("enforce: o que outro contêiner gravou é reusado, e conta para a edição de quem pergunta", async () => {
    const resolver = vi.fn(async () => resultado("https://x/outra.jpg"));
    const { cliente } = clienteFalso(resultado("https://x/gravada.jpg"));
    const jaUsadosNestaEdicao = new Set<string>();

    const r = await imagemDaPauta(PAUTA, {
      projeto: projeto("enforce"),
      client: cliente,
      resolver,
      acervo: ACERVO,
      opcoes: { jaUsadosNestaEdicao },
    });

    expect(resolver).not.toHaveBeenCalled();
    expect(r.asset?.imageUrl).toBe("https://x/gravada.jpg");
    expect(jaUsadosNestaEdicao.has("https://x/gravada.jpg")).toBe(true);
  });

  it("enforce em ensaio da redação (somenteLeitura): reusa na memória, mas não grava no banco", async () => {
    const resolver = vi.fn(async () => resultado("https://x/a.jpg"));
    const { cliente, gravacoes } = clienteFalso();

    await imagemDaPauta(PAUTA, {
      projeto: projeto("enforce"),
      client: cliente,
      resolver,
      acervo: ACERVO,
      opcoes: { somenteLeitura: true },
    });
    expect(gravacoes).toHaveLength(0);
  });

  it("resolução que falhou não fica guardada: a próxima chamada tenta de novo", async () => {
    const resolver = vi
      .fn<() => Promise<ResultadoVisual>>()
      .mockRejectedValueOnce(new Error("rede fora"))
      .mockResolvedValueOnce(resultado("https://x/a.jpg"));
    const ctx = { projeto: projeto("enforce"), client: clienteFalso().cliente, resolver, acervo: ACERVO };

    await expect(imagemDaPauta(PAUTA, ctx)).rejects.toThrow("rede fora");
    await expect(imagemDaPauta(PAUTA, ctx)).resolves.toMatchObject({ status: "SELECTED" });
  });
});

describe("a lista de compras", () => {
  const linha = (story: string, chave: string, motivo: "vazio" | "janela", quando: string) => ({
    story_id: story,
    tipo: "cena" as const,
    chave,
    pais: "eua",
    motivo,
    titulo: `pauta ${story}`,
    criado_em: quando,
  });

  it("ordena por número de pautas, e a mesma pauta não conta duas vezes", () => {
    const itens = agregarFaltas([
      linha("a", "moradia/rua_residencial", "vazio", "2026-10-01"),
      linha("a", "moradia/rua_residencial", "vazio", "2026-10-01"),
      linha("b", "moradia/rua_residencial", "janela", "2026-10-02"),
      linha("c", "tecnologia/chip", "vazio", "2026-10-03"),
    ]);

    expect(itens.map((i) => [i.chave, i.pautas, i.vazio, i.janela])).toEqual([
      ["moradia/rua_residencial", 2, 1, 1],
      ["tecnologia/chip", 1, 1, 0],
    ]);
    expect(itens[0].exemplo).toBe("pauta b");
  });
});

describe("as prateleiras do painel", () => {
  it("conta o que está livre na janela e põe a mais vazia primeiro", () => {
    const agora = Date.parse("2026-10-05T12:00:00Z");
    const p = resumirPrateleiras(
      [
        { tag: "a/x", pais: "eua", ultimo_uso_em: null },
        { tag: "a/x", pais: "eua", ultimo_uso_em: "2026-10-04T00:00:00Z" },
        { tag: "b/y", pais: "eua", ultimo_uso_em: "2026-10-04T00:00:00Z" },
      ],
      30,
      agora,
    );
    expect(p).toEqual([
      { tag: "b/y", pais: "eua", fotos: 1, livres: 0 },
      { tag: "a/x", pais: "eua", fotos: 2, livres: 1 },
    ]);
  });
});

/*
 * 05/10/2026, integração: a refação de imagem da fila de aprovação pede foto
 * NOVA. Sem `ignorarReuso`, a pauta reprovada pela imagem ganharia de volta a
 * mesma foto do cache, e a refação seria um carimbo.
 */
describe("a imagem da pauta na refação (ignorarReuso)", () => {
  it("enforce: ignora memória e tabela, resolve de novo e SUBSTITUI o gravado", async () => {
    const resolver = vi.fn(async () => resultado("https://x/nova.jpg"));
    const opcoesDoUpsert: unknown[] = [];
    const cliente = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { resultado: resultado("https://x/gravada.jpg") }, error: null }) }),
          }),
        }),
        upsert: async (_linha: unknown, opcoes: unknown) => {
          opcoesDoUpsert.push(opcoes);
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;

    const ctx = { projeto: projeto("enforce"), client: cliente, resolver, acervo: ACERVO };
    const r = await imagemDaPauta(PAUTA, { ...ctx, ignorarReuso: true });
    expect(r.asset?.imageUrl).toBe("https://x/nova.jpg");
    expect(opcoesDoUpsert).toEqual([{ onConflict: "project_id,story_id", ignoreDuplicates: false }]);

    // A chamada seguinte, sem refação, reusa a foto NOVA, e não a que estava gravada.
    const depois = await imagemDaPauta(PAUTA, ctx);
    expect(depois.asset?.imageUrl).toBe("https://x/nova.jpg");
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it("capacidade desligada: ignorarReuso não muda nada, é o repasse de sempre", async () => {
    const resolver = vi.fn(async () => resultado("https://x/a.jpg"));
    const { cliente, gravacoes } = clienteFalso();
    await imagemDaPauta(PAUTA, { projeto: projeto(undefined), client: cliente, resolver, ignorarReuso: true });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(gravacoes).toHaveLength(0);
  });
});
