import { describe, expect, it } from "vitest";
import { candidatosEmMemoria, inicioDosSugeridos, type CandidatoDeReel } from "@/lib/server/social/reels/candidatos";
import { blocoDoPerfil, linhaDoReel, reelsDoPlano } from "./plano";

/*
 * 10/11/2026: o plano propôs dois vídeos de 28/10 (Flávio Bolsonaro chegando
 * aos EUA), que já tinham virado Reel no perfil. A Bruna reprovou o dia.
 */

const AGORA = Date.parse("2026-11-10T16:00:00Z");

function candidato(id: string, publicadoEm: string | null, nota = 60): CandidatoDeReel {
  return {
    id,
    projectId: "p1",
    fonte: "instagram",
    origemId: id,
    permalink: `https://instagram.com/reel/${id}`,
    urlVideo: null,
    autor: "exame",
    titulo: `vídeo ${id}`,
    legenda: null,
    publicadoEm,
    metricas: {},
    nota,
    estado: "nova",
    motivo: null,
    preparo: null,
    texto: null,
    socialPostId: null,
    criadaEm: "2026-10-28T20:00:00Z",
    atualizadaEm: "2026-10-28T20:00:00Z",
  };
}

describe("os vídeos sugeridos são só de hoje ou de ontem", () => {
  it("o vídeo de 28/10 não volta, mesmo com nota maior; o sem data também não", async () => {
    const store = candidatosEmMemoria([
      candidato("flavio-28-10", "2026-10-28T14:21:03Z", 80),
      candidato("sem-data", null, 90),
      candidato("hegseth-hoje", "2026-11-10T15:27:33Z", 60),
      candidato("huang-ontem", "2026-11-09T19:03:59Z", 60),
    ]);
    const lista = await store.sugeridos("p1", 10, inicioDosSugeridos(AGORA));
    expect(lista.map((c) => c.id)).toEqual(["hegseth-hoje", "huang-ontem"]);
  });

  it("a janela é de 36 horas", () => {
    expect(inicioDosSugeridos(AGORA)).toBe("2026-11-09T04:00:00.000Z");
  });

  it("o plano vê a data de cada vídeo", () => {
    const [r] = reelsDoPlano([candidato("hegseth-hoje", "2026-11-10T15:27:33Z")]);
    expect(linhaDoReel(r)).toContain("publicado 2026-11-10 15:27 UTC");
  });
});

describe("o plano sabe o que já saiu no perfil", () => {
  it("lista as manchetes e proíbe repetir o fato", () => {
    const bloco = blocoDoPerfil(["2026-11-06 | Flávio Bolsonaro ao New York Times: \"Eu já sei que o resultado final será minha prisão\""]);
    expect(bloco).toContain("JÁ SAIU NO PERFIL");
    expect(bloco).toContain("Flávio Bolsonaro ao New York Times");
    expect(bloco).toContain("nenhuma pauta nem vídeo pode repetir");
  });

  it("sem feed, sem bloco", () => {
    expect(blocoDoPerfil([])).toBe("");
    expect(blocoDoPerfil(undefined)).toBe("");
  });
});

describe("o plano reprovado volta com os vídeos e o feed de agora", () => {
  it("troca os vídeos velhos da tarefa pelos relidos", async () => {
    const { tarefasEmMemoria } = await import("../tarefas-store");
    const { planosEmMemoria } = await import("./plano-store");
    const { reabrirPlano } = await import("./plano");
    const tarefas = tarefasEmMemoria();
    const planos = planosEmMemoria();
    const plano = await planos.doDia("p1", "2026-11-10");
    const velho = reelsDoPlano([candidato("flavio-28-10", "2026-10-28T14:21:03Z")]);
    const tarefa = await tarefas.abrir({
      projectId: "p1",
      editionDate: "2026-11-10",
      tipo: "propor_plano",
      chave: "plano-2026-11-10",
      instrucao: {},
      material: { data: "2026-11-10", volumes: { newsletter: { minimo: 2, maximo: 4 }, artigos: 3, instagram: 5 }, reels: velho, pautas: [], jaUsadas: { newsletter: [], artigos: [], instagram: [] } },
      esquema: {},
    });
    await planos.atualizar(plano.id, { tarefaId: tarefa.id });
    const comTarefa = (await planos.porId(plano.id))!;
    const novos = reelsDoPlano([candidato("hegseth-hoje", "2026-11-10T15:27:33Z")]);
    const reaberta = await reabrirPlano(comTarefa, "vídeos velhos", {
      tarefas,
      planos,
      renovar: async () => ({ reels: novos, noPerfil: ["2026-11-06 | Flávio ao NYT"] }),
    });
    const material = reaberta!.material as { reels: Array<{ id: string }>; noPerfil: string[]; reprovacao: string };
    expect(material.reels.map((r) => r.id)).toEqual(["hegseth-hoje"]);
    expect(material.noPerfil).toEqual(["2026-11-06 | Flávio ao NYT"]);
    expect(material.reprovacao).toBe("vídeos velhos");
    expect(String(reaberta!.instrucao.user)).not.toContain("flavio-28-10");
  });
});
