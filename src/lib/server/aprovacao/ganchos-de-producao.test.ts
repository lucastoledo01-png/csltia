import { describe, expect, it, vi } from "vitest";
import type { Project } from "../projects";
import type { ResultadoDoArtigo } from "../ramos/artigo";
import type { OrigemDoArtigo } from "../ramos/portal";
import type { ResultadoVisual } from "../visual/tipos";
import type { Aprovacao } from "./contrato";
import { criarGanchosDeProducao, instrucaoDaRefacao, type MundoDosGanchos } from "./ganchos-de-producao";
import { GANCHOS_DE_PRODUCAO } from "./integracao";
import { executarRefacao } from "./refazer";
import { ETAPAS_DO_RAMO, RAMOS } from "./contrato";
import { supabaseFalso, type Operacao, type Resposta } from "./supabase-falso";

/**
 * Os ganchos de refação de verdade (integração de 05/10/2026). Cada um tem o
 * seu "não": sem a pauta gravada, reescrita reprovada no auditor, a mesma foto
 * de volta, carrossel. E a etapa que continua sem gancho continua dizendo isso.
 */

const ORIGEM: OrigemDoArtigo = {
  storyId: "s1",
  titulo: "Fed cuts rates",
  resumo: "The Fed cut rates.",
  eixo: "economia",
  pais: "EUA",
  atores: ["Fed"],
  lugares: [],
  acontecimento: ["corte de juros"],
  fonteNome: "Fonte",
  fonteUrl: "https://fonte.com/fed",
  pacote: { verified_facts: ["O Fed cortou os juros."], source_urls: [], texto_de_origem: "" } as never,
};

function aprovacao(ramo: Aprovacao["ramo"], origem: OrigemDoArtigo | null = ORIGEM): Aprovacao {
  return {
    id: "ap-1",
    projectId: "proj-1",
    ramo,
    pecaId: ramo === "artigo" ? "art-1" : "post-1",
    hashArtefato: "h",
    publicarEm: null,
    estado: "refazendo",
    automatica: false,
    decididoPor: null,
    decididoEm: null,
    motivo: null,
    etapaCulpada: null,
    refazimentos: 1,
    avisos: [],
    resumo: { origemDoArtigo: origem },
    avisadoEm: null,
    liberadoEm: null,
    createdAt: "",
    updatedAt: "",
  };
}

const PROJETO = { id: "proj-1", slug: "desbuguei", name: "eua", niche: "EUA", editorialPromptExtra: "", brand: { displayName: "eua.journal" } } as unknown as Project;

const ARTIGO_BOM: ResultadoDoArtigo = {
  artigo: {
    titulo: "Fed corta juros nos EUA de novo",
    subtitulo: "",
    titulo_seo: "Fed corta juros nos EUA",
    descricao_seo: "O banco central americano cortou os juros.",
    secoes: [{ intertitulo: "", paragrafos: ["O Fed cortou os juros."] }],
    perguntas: [],
  },
  veredicto: { aprovado: true, bloqueios: [], avisos: [], ancoragem: { conferidos: 1, naoSustentadas: [] }, conclusoesSemLastro: [] },
  tentativas: 1,
  erro: null,
};

function visual(url: string): ResultadoVisual {
  return { storyId: "s1", status: "SELECTED", asset: { imageUrl: url, metadata: {} } } as unknown as ResultadoVisual;
}

/** O que o resolvedor devolve quando só sobrou a bandeira (status recusado). */
function soBandeira(): ResultadoVisual {
  return {
    storyId: "s1",
    status: "NO_VALID_IMAGE",
    motivo: "VISUAL_CHECK_FAILED",
    asset: {
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/c/c8/New_York_Stock_Exchange_Building_2010.jpg",
      metadata: { ultimoRecurso: true },
    },
  } as unknown as ResultadoVisual;
}

function mundo(responder: (op: Operacao) => Resposta, extra: Partial<MundoDosGanchos> = {}) {
  const banco = supabaseFalso(responder);
  const m: MundoDosGanchos = {
    client: () => banco.client,
    projeto: async () => PROJETO,
    vozDoArtigo: async () => "VOZ DO ARTIGO",
    escrever: vi.fn(async () => ARTIGO_BOM),
    renderizarHtml: () => "<p>novo</p>",
    imagem: vi.fn(async () => visual("https://x/nova.jpg")),
    congelar: vi.fn(async () => ({
      ok: true as const,
      artefato: { url: "https://x/arte.png", path: "p", filename: "f", mime: "image/png", sha256: "a".repeat(64), bytes: 1, largura: 1, altura: 1, otimizado: false },
    })),
    agora: () => 1_000,
    ...extra,
  };
  return { m, ops: banco.ops };
}

const escritas = (ops: Operacao[]) => ops.filter((o) => o.tipo !== "select");
const ctx = (a: Aprovacao, etapa: "texto" | "imagem" | "arte") => ({ aprovacao: a, etapa, motivo: "título com sigla", naoRepetir: "NÃO REPETIR: sigla" });

describe("refação do texto do artigo", () => {
  it("sem a pauta gravada na fila: não refaz, e diz por quê", async () => {
    const { m, ops } = mundo(() => ({ data: [{ id: "art-1" }] }));
    const r = await criarGanchosDeProducao(m).artigo!.texto!(ctx(aprovacao("artigo", null), "texto"));
    expect(r.ok).toBe(false);
    expect(escritas(ops)).toHaveLength(0);
    expect(m.escrever).not.toHaveBeenCalled();
  });

  it("reescrita reprovada no auditor do ramo: nada é gravado", async () => {
    const reprovada: ResultadoDoArtigo = {
      ...ARTIGO_BOM,
      veredicto: { ...ARTIGO_BOM.veredicto, aprovado: false, bloqueios: ["REJECT_UNGROUNDED_CLAIM: numero"] },
    };
    const { m, ops } = mundo(() => ({ data: [{ id: "art-1" }] }), { escrever: vi.fn(async () => reprovada) });
    const r = await criarGanchosDeProducao(m).artigo!.texto!(ctx(aprovacao("artigo"), "texto"));
    expect(r).toMatchObject({ ok: false });
    expect(escritas(ops)).toHaveLength(0);
  });

  it("reescreve com a memória e o motivo do editor na voz, e grava sem mexer no slug, no horário e na capa", async () => {
    const { m, ops } = mundo(() => ({ data: [{ id: "art-1" }] }));
    const r = await criarGanchosDeProducao(m).artigo!.texto!(ctx(aprovacao("artigo"), "texto"));
    expect(r).toEqual({ ok: true, resumo: { titulo: ARTIGO_BOM.artigo!.titulo, texto: ARTIGO_BOM.artigo!.titulo } });
    const marca = (m.escrever as ReturnType<typeof vi.fn>).mock.calls[0][2] as { voz: string };
    expect(marca.voz).toContain("VOZ DO ARTIGO");
    expect(marca.voz).toContain("NÃO REPETIR: sigla");
    expect(marca.voz).toContain("título com sigla");
    const [escrita] = escritas(ops);
    expect(escrita.valores).toMatchObject({ title: ARTIGO_BOM.artigo!.titulo, content_html: "<p>novo</p>" });
    for (const campo of ["slug", "published_at", "cover_image", "status"]) {
      expect(escrita.valores as Record<string, unknown>).not.toHaveProperty(campo);
    }
  });
});

describe("refação da imagem do artigo", () => {
  it("o resolvedor devolveu a MESMA foto: não é refação, a peça fica esperando", async () => {
    const { m, ops } = mundo((op) => (op.tipo === "select" ? { data: { id: "art-1", cover_image: "https://x/velha.jpg" } } : {}), {
      imagem: vi.fn(async () => visual("https://x/velha.jpg")),
    });
    const r = await criarGanchosDeProducao(m).artigo!.imagem!(ctx(aprovacao("artigo"), "imagem"));
    expect(r.ok).toBe(false);
    expect(escritas(ops)).toHaveLength(0);
  });

  /*
   * Pauta sem foto não vira conteúdo (05/10/2026): a bandeira não é foto da
   * pauta, e a refação que só achou a bandeira não troca a capa por ela.
   */
  it("o resolvedor só achou a bandeira: não troca a capa, a peça fica esperando", async () => {
    const { m, ops } = mundo((op) => (op.tipo === "select" ? { data: { id: "art-1", cover_image: "https://x/velha.jpg" } } : {}), {
      imagem: vi.fn(async () => soBandeira()),
    });
    const r = await criarGanchosDeProducao(m).artigo!.imagem!(ctx(aprovacao("artigo"), "imagem"));
    expect(r.ok).toBe(false);
    expect(escritas(ops)).toHaveLength(0);
  });

  it("foto nova: troca só a capa, e pede ao resolvedor para evitar a reprovada", async () => {
    const { m, ops } = mundo((op) => (op.tipo === "select" ? { data: { id: "art-1", cover_image: "https://x/velha.jpg" } } : {}));
    const r = await criarGanchosDeProducao(m).artigo!.imagem!(ctx(aprovacao("artigo"), "imagem"));
    expect(r).toEqual({ ok: true, resumo: { imagens: ["https://x/nova.jpg"] } });
    expect((m.imagem as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ evitar: ["https://x/velha.jpg"] });
    // A capa nova leva a legenda neutra e o crédito dela; os da foto velha saem (06/10/2026).
    const valores = escritas(ops)[0].valores as Record<string, string>;
    expect(valores.cover_image).toBe("https://x/nova.jpg");
    expect(valores.updated_at).toBe(new Date(1_000).toISOString());
    expect(valores.content_html).toMatch(/^<p class="legenda-da-capa">Imagem ilustrativa\.<\/p>/);
  });
});

describe("refação da imagem e da arte do post", () => {
  const POST = {
    id: "post-1",
    story_id: null,
    title: "t",
    edition_date: "2026-10-06",
    content_json: { copy: { headline: "Fed corta juros nos EUA" }, arte: { eixo: "economia" }, visual: { imageUrl: "https://x/velha.jpg" } },
    asset_paths: ["a"],
  };

  it("carrossel: recusa com o motivo, sem resolver nem congelar nada", async () => {
    const { m, ops } = mundo(() => ({ data: { ...POST, asset_paths: ["a", "b", "c"] } }));
    const g = criarGanchosDeProducao(m);
    expect((await g.post!.imagem!(ctx(aprovacao("post"), "imagem"))).ok).toBe(false);
    expect((await g.post!.arte!(ctx(aprovacao("post"), "arte"))).ok).toBe(false);
    expect(m.imagem).not.toHaveBeenCalled();
    expect(m.congelar).not.toHaveBeenCalled();
    expect(escritas(ops)).toHaveLength(0);
  });

  it("imagem e arte em sequência: a foto nova vai para a linha, e a arte é recongelada num caminho NOVO", async () => {
    let linha: Record<string, unknown> = { ...POST };
    const { m, ops } = mundo((op) => {
      if (op.tipo === "select") return { data: linha };
      if (op.tipo === "update" && op.tabela === "social_posts") linha = { ...linha, ...(op.valores as Record<string, unknown>) };
      return {};
    });
    const r = await executarRefacao(
      { aprovacao: aprovacao("post"), etapa: "imagem", motivo: "foto errada", naoRepetir: "" },
      criarGanchosDeProducao(m),
    );
    expect(r).toMatchObject({ ok: true, executadas: ["imagem", "arte"] });
    const congelar = (m.congelar as ReturnType<typeof vi.fn>).mock.calls[0][0] as { capa: { asset: { imageUrl: string } }; path: string };
    expect(congelar.capa.asset.imageUrl).toBe("https://x/nova.jpg");
    expect(congelar.path).toBe("desbuguei/2026-10-06/refeito-post-1-1000");
    const arte = escritas(ops).at(-1)!;
    expect((arte.valores as { slides_manifest: Array<{ sha256: string }> }).slides_manifest[0].sha256).toBe("a".repeat(64));
    // Nunca mexe no status: em `enforce` o post continua `draft` até a fila liberar.
    expect(arte.valores as Record<string, unknown>).not.toHaveProperty("status");
  });
});

describe("toda etapa de todo ramo tem refação (06/10/2026)", () => {
  /*
   * Até 05/10/2026 este bloco provava o contrário: texto do post, newsletter e
   * seleção ficavam em `refazendo` para sempre. A fila vale a partir de
   * 06/10/2026 com aprovação manual nos três ramos, e nenhuma reprovação pode
   * deixar a peça sem desfecho.
   */
  it("GANCHOS_DE_PRODUCAO cobre cada etapa de ETAPAS_DO_RAMO", () => {
    for (const ramo of RAMOS) {
      for (const etapa of ETAPAS_DO_RAMO[ramo]) {
        expect(typeof GANCHOS_DE_PRODUCAO[ramo]?.[etapa], `${ramo}.${etapa}`).toBe("function");
      }
    }
  });

  it("e um mundo sem as funções novas continua só com os ganchos antigos, sem fingir que refaz", () => {
    const { m } = mundo(() => ({ data: [] }));
    const g = criarGanchosDeProducao(m);
    expect(Object.keys(g.post ?? {}).sort()).toEqual(["arte", "imagem"]);
    expect(g.newsletter).toBeUndefined();
  });

  it("o bloco da refação omite a memória vazia", () => {
    expect(instrucaoDaRefacao({ naoRepetir: "", motivo: "sigla" })).toBe(
      "ESTA MATÉRIA FOI REPROVADA PELO EDITOR, e é isto que precisa mudar: sigla",
    );
  });
});
