import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  chaveDaSoNewsletter,
  produzirNaVespera,
  produzirSoANewsletter,
  type DependenciasDaSoNewsletter,
} from "./producao-vespera";
import type { Project } from "./projects";
import { comMotivo, MOTIVO_QA_BLOQUEOU, type RunNewsroomOptions } from "./newsroom/newsroom-service";
import { ligacoesDoCiclo } from "./newsroom/ligacoes-do-ciclo";
import { destravarEscritasDoBanco, escritasBloqueadas, somenteLeitura, travarEscritasDoBanco } from "./supabase-admin";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Só a newsletter de uma edição (06/10/2026).
 *
 * A produção das 17:00 de 06/10 fez posts e matérias de 07/10 e teve só a
 * edição barrada pelo QA. O caminho que refaz a edição não pode criar post nem
 * matéria em dobro, e o ensaio dele não pode escrever nada. Cada `it` abaixo é
 * uma dessas promessas.
 */

function projeto(): Project {
  return {
    id: "proj-1",
    slug: "desbuguei",
    timezone: "America/Sao_Paulo",
    settings: { capacidades: { producao_vespera: "enforce", aprovacao: "enforce", perfis_referencia: "enforce" } },
  } as unknown as Project;
}

function deps(extra: Partial<DependenciasDaSoNewsletter> = {}) {
  const chamadas: Array<{ options: RunNewsroomOptions; env: Record<string, string | undefined> }> = [];
  const ligacoes = vi.fn(async () => ({
    aoProduzirPeca: async () => {},
    candidatasExtrasDoInstagram: [{ storyId: "perfil" }] as never,
  }));
  const d: DependenciasDaSoNewsletter = {
    carregarProjeto: async () => projeto(),
    rodarRedacao: vi.fn(async (options, env) => {
      chamadas.push({ options, env });
      return { ok: true };
    }),
    ligacoes,
    edicaoExistente: async () => ({ existe: false }),
    newsletterNaFila: async () => ({ existe: false }),
    env: {},
    ...extra,
  };
  return { d, chamadas, ligacoes };
}

describe("produzirSoANewsletter", () => {
  it("ensaio por padrão: dry-run, nada de portal, campanha, fila nem perfis", async () => {
    const { d, chamadas, ligacoes } = deps();
    const r = await produzirSoANewsletter({ data: "2026-10-07" }, d);
    expect(r.ok).toBe(true);
    const { options, env } = chamadas[0];
    expect(options).toMatchObject({
      dryRun: true,
      publishToPortal: false,
      createNewsletterCampaign: false,
      autoSend: false,
      somenteNewsletter: true,
      editionDate: "2026-10-07",
      idempotencyKey: "daily-edition-2026-10-07#so-newsletter",
    });
    expect(options.aoProduzirPeca).toBeUndefined();
    expect(options.candidatasExtrasDoInstagram).toBeUndefined();
    expect(ligacoes).not.toHaveBeenCalled();
    expect(env.SOCIAL_POSTS_MAX_PER_DAY).toBe("0");
  });

  it("o envio é o da cadência: quarta, 07/10, às 06:07 de Brasília", async () => {
    const { d, chamadas } = deps();
    const r = await produzirSoANewsletter({ data: "2026-10-07" }, d);
    expect(chamadas[0].options.agendamento?.newsletterEm).toBe("2026-10-07T09:07:00.000Z");
    expect(r.agendamento?.newsletterEm).toBe("2026-10-07T09:07:00.000Z");
  });

  it("--aplicar grava e enfileira como a véspera, mas leva SÓ a fila, nunca as candidatas do Instagram", async () => {
    const { d, chamadas, ligacoes } = deps();
    await produzirSoANewsletter({ data: "2026-10-07", aplicar: true }, d);
    expect(ligacoes).toHaveBeenCalledTimes(1);
    const { options } = chamadas[0];
    expect(options).toMatchObject({
      dryRun: false,
      publishToPortal: false,
      createNewsletterCampaign: true,
      somenteNewsletter: true,
    });
    expect(typeof options.aoProduzirPeca).toBe("function");
    expect(options.candidatasExtrasDoInstagram).toBeUndefined();
  });

  it("--aplicar recusa quando a edição do dia já está gravada, e não chama a redação", async () => {
    const { d, chamadas } = deps({ edicaoExistente: async () => ({ existe: true }) });
    const r = await produzirSoANewsletter({ data: "2026-10-07", aplicar: true }, d);
    expect(r.ok).toBe(false);
    expect(r.recusa).toContain("já está gravada");
    expect(chamadas).toHaveLength(0);
  });

  it("--aplicar recusa quando já há newsletter do dia na fila de aprovação, e confere o dia no fuso do projeto", async () => {
    const janela: string[] = [];
    const { d, chamadas } = deps({
      newsletterNaFila: async (_p, inicio, fim) => {
        janela.push(inicio, fim);
        return { existe: true };
      },
    });
    const r = await produzirSoANewsletter({ data: "2026-10-07", aplicar: true }, d);
    expect(r.ok).toBe(false);
    expect(r.recusa).toContain("na fila de aprovação");
    expect(janela).toEqual(["2026-10-07T03:00:00.000Z", "2026-10-08T03:00:00.000Z"]);
    expect(chamadas).toHaveLength(0);
  });

  it("--aplicar recusa com a fila fora de enforce: sem ela a redação enviaria sem aprovação", async () => {
    const semFila = { ...projeto(), settings: { capacidades: { aprovacao: "dry_run" } } } as unknown as Project;
    const { d, chamadas } = deps({ carregarProjeto: async () => semFila });
    const r = await produzirSoANewsletter({ data: "2026-10-07", aplicar: true }, d);
    expect(r.recusa).toContain("não está em enforce");
    expect(chamadas).toHaveLength(0);
  });

  it("--aplicar recusa quando não dá para conferir a edição: não conseguir olhar não é 'não existe'", async () => {
    const { d, chamadas } = deps({ edicaoExistente: async () => ({ existe: false, erro: "Gateway Timeout" }) });
    const r = await produzirSoANewsletter({ data: "2026-10-07", aplicar: true }, d);
    expect(r.recusa).toContain("Gateway Timeout");
    expect(chamadas).toHaveLength(0);
  });

  it("data torta e dia sem newsletter na cadência são recusados antes de qualquer custo", async () => {
    const { d, chamadas } = deps();
    expect((await produzirSoANewsletter({ data: "07/10/2026" }, d)).recusa).toContain("data inválida");
    // Segunda, 05/10: a cadência do PRD não publica newsletter.
    expect((await produzirSoANewsletter({ data: "2026-10-05" }, d)).recusa).toContain("não publica newsletter");
    expect(chamadas).toHaveLength(0);
  });

  it("a edição barrada volta como erro com o detalhe, sem lançar", async () => {
    const { d } = deps({
      rodarRedacao: async () => {
        throw comMotivo(new Error("Edição bloqueada: REJECT_EDITORIAL_QA: hallucination_risk"), MOTIVO_QA_BLOQUEOU);
      },
    });
    const r = await produzirSoANewsletter({ data: "2026-10-07" }, d);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("hallucination_risk");
  });

  it("a chave do run tem o prefixo do dia, para os leitores por prefixo, e não é a canônica", () => {
    expect(chaveDaSoNewsletter("2026-10-07")).toBe("daily-edition-2026-10-07#so-newsletter");
  });
});

describe("as ligações sem os perfis", () => {
  it("semPerfis não lê os perfis de referência, e a fila continua ligada", async () => {
    const candidatos = vi.fn(async () => []);
    const fabricar = vi.fn(() => async () => {});
    const l = await ligacoesDoCiclo(
      { id: "proj-1", timezone: "America/Sao_Paulo", settings: { capacidades: { perfis_referencia: "enforce", aprovacao: "enforce" } } },
      { semPerfis: true, deps: { candidatos, aoProduzirPeca: fabricar } },
    );
    expect(candidatos).not.toHaveBeenCalled();
    expect(l.candidatasExtrasDoInstagram).toBeUndefined();
    expect(typeof l.aoProduzirPeca).toBe("function");
  });
});

describe("o ensaio não escreve no banco", () => {
  function clienteFalso() {
    const escritas: string[] = [];
    const consulta = (tabela: string) => ({
      select: () => ({ eq: () => Promise.resolve({ data: [{ tabela }], error: null }) }),
      insert: () => {
        escritas.push(`insert ${tabela}`);
        return Promise.resolve({ data: null, error: null });
      },
      upsert: () => {
        escritas.push(`upsert ${tabela}`);
        return { select: () => ({ single: () => Promise.resolve({ data: { id: "x" }, error: null }) }) };
      },
      update: () => {
        escritas.push(`update ${tabela}`);
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
      delete: () => {
        escritas.push(`delete ${tabela}`);
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
    });
    const storage = {
      from: (bucket: string) => ({
        upload: () => {
          escritas.push(`upload ${bucket}`);
          return Promise.resolve({ data: null, error: null });
        },
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x/${bucket}/${p}` } }),
      }),
    };
    return {
      client: { from: consulta, storage, rpc: () => Promise.resolve({ data: 1, error: null }) } as unknown as SupabaseClient,
      escritas,
    };
  }

  it("insert, upsert encadeado, update, delete, rpc e upload são recusados como erro; leitura passa", async () => {
    destravarEscritasDoBanco();
    const { client, escritas } = clienteFalso();
    const c = somenteLeitura(client);
    const leitura = await c.from("news_editions").select("id").eq("x", 1);
    expect(leitura.data).toEqual([{ tabela: "news_editions" }]);

    const a = await c.from("platform_events").insert({});
    const b = await c.from("news_editions").upsert({}).select("id").single();
    const u = await c.from("articles").update({}).eq("id", 1);
    const del = await c.from("social_posts").delete().eq("id", 1);
    const rpc = await c.rpc("qualquer");
    const up = await c.storage.from("public_assets").upload("a.png", new Blob());
    for (const r of [a, b, u, del, rpc, up]) expect(r.error?.message).toContain("SOMENTE_LEITURA");
    expect(b.data).toBeNull();
    expect(escritas).toEqual([]);
    expect(c.storage.from("public_assets").getPublicUrl("a.png").data.publicUrl).toBe("https://x/public_assets/a.png");
    expect(escritasBloqueadas()).toEqual([
      "insert platform_events",
      "upsert news_editions",
      "update articles",
      "delete social_posts",
      "rpc qualquer",
      "upload storage:public_assets",
    ]);
    destravarEscritasDoBanco();
  });

  it("a trava é de processo, e o script só a liga fora do --aplicar", () => {
    const script = fs.readFileSync(path.resolve(__dirname, "../../scripts/produzir-newsletter.ts"), "utf-8");
    const i = script.indexOf("travarEscritasDoBanco();");
    expect(i).toBeGreaterThan(0);
    expect(script.slice(i - 60, i)).toContain("if (!aplicar) {");
    expect(script).toContain("delete process.env.TELEGRAM_BOT_TOKEN;");
    travarEscritasDoBanco();
    destravarEscritasDoBanco();
  });
});

/*
 * O modo só newsletter na redação, conferido no fonte, como em
 * `ramos-no-servico.test.ts`: `runNewsroom` não roda em teste sem meio banco
 * falso, e o que importa é que TODO escritor de post e de matéria esteja atrás
 * de `somenteNewsletter`.
 */
describe("o modo só newsletter na redação", () => {
  const servico = fs.readFileSync(path.resolve(__dirname, "newsroom/newsroom-service.ts"), "utf-8");

  it("o ciclo do Instagram não roda", () => {
    const i = servico.indexOf("const social = await rodarSocialDoDia(");
    expect(servico.slice(i - 400, i)).toContain("if (somenteNewsletter) {");
    expect(servico.slice(i - 400, i)).toContain("} else try {");
  });

  it("o diagnóstico do social não é gravado por cima do da produção", () => {
    const i = servico.indexOf("const naoGravado = await gravarDiagnosticoDoSocial(");
    expect(servico.slice(i - 80, i)).toContain("if (!somenteNewsletter) {");
  });

  it("o ramo do portal não roda, e a edição não vira artigo", () => {
    const i = servico.indexOf("resultadoDoPortal = await rodarRamoDoPortal({");
    expect(servico.slice(i - 250, i)).toContain("if (somenteNewsletter) {");
    expect(servico).toContain("const publishToPortal = somenteNewsletter ? false : (options.publishToPortal ?? !dryRun);");
  });

  it("o agendador legado de posts não roda", () => {
    const i = servico.indexOf("scheduledPosts = await scheduleEditionPosts({");
    const portao = servico.lastIndexOf("if (!dryRun && !legadoCede) {", i);
    expect(portao).toBeGreaterThan(0);
    expect(servico.slice(portao, i)).toContain("if (somenteNewsletter) {");
    expect(servico.slice(portao, i)).toContain("} else try {");
  });

  it("nunca fala com o Listmonk: a campanha nasce só na liberação da fila", () => {
    const i = servico.indexOf("const listmonk = createListmonkClient(");
    const portao = servico.lastIndexOf("if (createNewsletterCampaign", i);
    expect(servico.slice(portao, i)).toContain("!somenteNewsletter && redacaoDisparaNewsletter(modoDaFilaDoDia)");
    expect([...servico.matchAll(/createListmonkClient\(/g)]).toHaveLength(1);
  });

  it("só a peça da newsletter chega à fila", () => {
    expect(servico).toContain('if (somenteNewsletter && peca.ramo !== "newsletter") return;');
  });

  it("os únicos escritores de social_posts e articles na redação ficam atrás das portas acima", () => {
    // social_posts só nasce do ciclo social e do agendador legado; articles, do ramo do portal e da edição-artigo.
    expect(servico).not.toMatch(/from\("social_posts"\)/);
    const artigos = [...servico.matchAll(/from\("articles"\)/g)].map((m) => m.index ?? 0);
    expect(artigos).toHaveLength(1);
    expect(servico.lastIndexOf("if (publishToPortal && !ramosNoComando) {", artigos[0])).toBeGreaterThan(0);
  });
});

describe("a véspera com SÓ a newsletter barrada", () => {
  const base = {
    agora: () => new Date("2026-10-06T20:00:00Z"),
    carregarProjeto: async () => projeto(),
    existeLinha: async () => true,
    gravarLinha: async () => {},
    ligacoes: async () => ({}),
    env: {},
  };

  it("barrada pelo QA: desfecho parcial, com a newsletter que falta e o motivo", async () => {
    const r = await produzirNaVespera("proj-1", {
      ...base,
      rodarRedacao: async () => {
        throw comMotivo(new Error("Edição bloqueada (QA 94): REJECT_EDITORIAL_QA: hallucination_risk"), MOTIVO_QA_BLOQUEOU);
      },
    });
    expect(r.ok).toBe(true);
    expect(r.newsletterAusente).toEqual({ data: "2026-10-07", motivo: expect.stringContaining("hallucination_risk") });
  });

  it("qualquer outra falha continua sendo falha da produção", async () => {
    const r = await produzirNaVespera("proj-1", {
      ...base,
      rodarRedacao: async () => {
        throw new Error("Gateway Timeout");
      },
    });
    expect(r.ok).toBe(false);
    expect(r.newsletterAusente).toBeUndefined();
  });
});
