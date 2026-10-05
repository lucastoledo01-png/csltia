import { describe, expect, it, vi } from "vitest";
import { montarPeca, type PecaPronta } from "../ramos/peca";
import type { ConteudoDoArtigo } from "../ramos/portal";
import type { AdaptadorDePecas, ProjetoDaFila } from "./fila";
import { criarFilaEmMemoria } from "./fila-memoria";
import { hashDoArtigo } from "./hash";
import { levarPecaDoRamoAFila, localizadorSupabase } from "./ramos-na-fila";
import { supabaseFalso } from "./supabase-falso";

/**
 * As peças dos ramos entrando na fila (integração de 05/10/2026). O que mais
 * importa aqui é o "não": não enfileirar duas vezes, não enfileirar com a
 * fila desligada, e nunca tocar numa peça que já está na fila, porque um hash
 * diferente devolveria a peça a `aguardando` e apagaria uma aprovação.
 */

const PROJ = "proj-1";

function projeto(aprovacao?: string): ProjetoDaFila {
  return { id: PROJ, timezone: "America/Sao_Paulo", settings: aprovacao ? { capacidades: { aprovacao } } : {} };
}

const HASH_DA_LINHA = hashDoArtigo("Fed corta juros nos EUA", "<p>linha</p>", "https://x/capa.jpg");

function adaptador(): AdaptadorDePecas {
  return {
    ler: async () => ({ hashAtual: HASH_DA_LINHA, texto: "Fed corta juros nos EUA", titulo: "Fed corta juros nos EUA", material: [] }),
    gravarTexto: async () => ({ hashNovo: "" }),
    despachar: async () => ({ ok: true, detalhe: "" }),
    retirar: async () => {},
  };
}

function artigo(aprovada = true, avisos: string[] = []): PecaPronta<ConteudoDoArtigo> {
  return montarPeca({
    ramo: "artigo",
    referenciaId: "fed-corta-juros-2026-10-06",
    storyIds: ["s1"],
    titulo: "Fed corta juros nos EUA",
    conteudo: {
      origem: {
        storyId: "s1",
        titulo: "Fed cuts rates",
        resumo: "",
        eixo: "economia",
        pais: "EUA",
        atores: ["Fed"],
        lugares: [],
        acontecimento: [],
        fonteNome: "Fonte",
        fonteUrl: "https://fonte.com/fed",
        pacote: { verified_facts: ["O Fed cortou os juros."], source_urls: [], texto_de_origem: "" } as never,
      },
      artigo: {
        titulo: "Fed corta juros nos EUA",
        subtitulo: "",
        titulo_seo: "Fed corta juros nos EUA",
        descricao_seo: "O banco central americano cortou os juros.",
        secoes: [{ intertitulo: "", paragrafos: ["O Fed cortou os juros."] }],
        perguntas: [],
      },
      html: "<p>ramo</p>",
      categoria: "Economia",
      fonte: { nome: "Fonte", url: "https://fonte.com/fed" },
      sourceUrls: [],
      capa: "https://x/capa.jpg",
      publicarEm: "2026-10-06T15:00:00.000Z",
      slug: "fed-corta-juros-2026-10-06",
    },
    avisos,
    aprovadaPeloAuditor: aprovada,
    bloqueios: [],
  });
}

describe("a peça do ramo entrando na fila", () => {
  it("fila desligada: nada é lido, nada é gravado", async () => {
    const fila = criarFilaEmMemoria();
    const localizar = vi.fn(async () => "art-1");
    const r = await levarPecaDoRamoAFila(projeto(), artigo(), { store: fila, pecas: adaptador(), localizar });
    expect(r.acao).toBe("fila_desligada");
    expect(localizar).not.toHaveBeenCalled();
    expect(fila.aprovacoes).toHaveLength(0);
  });

  it("artigo: entra uma vez, pelo id da linha, com o hash DA LINHA, o horário e a origem para a refação", async () => {
    const fila = criarFilaEmMemoria();
    const r = await levarPecaDoRamoAFila(projeto("enforce"), artigo(true, ["nome não conferido"]), {
      store: fila,
      pecas: adaptador(),
      localizar: async () => "art-1",
    });
    expect(r).toEqual({ acao: "enfileirada", pecaId: "art-1" });
    const [a] = fila.aprovacoes;
    expect(a.pecaId).toBe("art-1");
    expect(a.hashArtefato).toBe(HASH_DA_LINHA);
    expect(a.publicarEm).toBe("2026-10-06T15:00:00.000Z");
    expect(a.avisos).toEqual([{ codigo: "AVISO_DO_RAMO", detalhe: "nome não conferido" }]);
    expect(a.resumo.origemDoArtigo?.storyId).toBe("s1");
    expect(a.resumo.slug).toBe("fed-corta-juros-2026-10-06");
  });

  it("a mesma peça duas vezes NÃO duplica, e NÃO toca a aprovação que já existe", async () => {
    const fila = criarFilaEmMemoria();
    const deps = { store: fila, pecas: adaptador(), localizar: async () => "art-1" };
    await levarPecaDoRamoAFila(projeto("enforce"), artigo(), deps);
    await fila.atualizar(fila.aprovacoes[0].id, { estado: "aprovada", decididoPor: "dono:teste" });

    const segunda = await levarPecaDoRamoAFila(projeto("enforce"), artigo(), deps);
    expect(segunda).toEqual({ acao: "ja_na_fila", pecaId: "art-1" });
    expect(fila.aprovacoes).toHaveLength(1);
    expect(fila.aprovacoes[0].estado).toBe("aprovada");
  });

  it("post já enfileirado pelo store do Social V2: não entra de novo", async () => {
    const fila = criarFilaEmMemoria();
    await fila.inserir({ projectId: PROJ, ramo: "post", pecaId: "post-1", hashArtefato: "h", publicarEm: null, avisos: [], resumo: {} });
    const post = montarPeca({
      ramo: "post",
      referenciaId: "social-v2-2026-10-06-s1",
      storyIds: ["s1"],
      titulo: "t",
      conteudo: { legenda: "l", imagem: null, vaga: { quandoIso: "2026-10-06T11:00:00.000Z" } },
      avisos: [],
      aprovadaPeloAuditor: true,
      bloqueios: [],
    });
    const r = await levarPecaDoRamoAFila(projeto("enforce"), post, { store: fila, pecas: adaptador(), localizar: async () => "post-1" });
    expect(r.acao).toBe("ja_na_fila");
    expect(fila.aprovacoes).toHaveLength(1);
  });

  it("newsletter: ignorada, porque a redação a enfileira com o resumo completo", async () => {
    const fila = criarFilaEmMemoria();
    const peca = montarPeca({
      ramo: "newsletter",
      referenciaId: "ed-1",
      storyIds: [],
      titulo: "t",
      conteudo: {},
      avisos: [],
      aprovadaPeloAuditor: true,
      bloqueios: [],
    });
    const localizar = vi.fn(async () => "ed-1");
    const r = await levarPecaDoRamoAFila(projeto("enforce"), peca, { store: fila, pecas: adaptador(), localizar });
    expect(r.acao).toBe("ignorada");
    expect(localizar).not.toHaveBeenCalled();
    expect(fila.aprovacoes).toHaveLength(0);
  });

  it("peça barrada pelo auditor do ramo não entra na fila", async () => {
    const fila = criarFilaEmMemoria();
    const r = await levarPecaDoRamoAFila(projeto("enforce"), artigo(false), {
      store: fila,
      pecas: adaptador(),
      localizar: async () => "art-1",
    });
    expect(r.acao).toBe("ignorada");
    expect(fila.aprovacoes).toHaveLength(0);
  });

  it("sem linha gravada (o upsert falhou): não inventa peça na fila", async () => {
    const fila = criarFilaEmMemoria();
    const r = await levarPecaDoRamoAFila(projeto("enforce"), artigo(), { store: fila, pecas: adaptador(), localizar: async () => null });
    expect(r.acao).toBe("sem_linha");
    expect(fila.aprovacoes).toHaveLength(0);
  });
});

describe("o localizador", () => {
  it("artigo pelo slug, post pela chave de idempotência", async () => {
    const { client, ops } = supabaseFalso(() => ({ data: { id: "x" } }));
    const localizar = localizadorSupabase(client, PROJ);
    await localizar("artigo", "slug-1");
    await localizar("post", "chave-1");
    expect(ops.map((o) => [o.tabela, o.filtros.find((f) => f[1] !== "project_id")])).toEqual([
      ["articles", ["eq", "slug", "slug-1"]],
      ["social_posts", ["eq", "idempotency_key", "chave-1"]],
    ]);
  });

  it("erro de leitura sobe como erro, e não vira 'não existe'", async () => {
    const { client } = supabaseFalso(() => ({ error: { message: "timeout" } }));
    await expect(localizadorSupabase(client, PROJ)("artigo", "slug-1")).rejects.toThrow(/timeout/);
  });
});
