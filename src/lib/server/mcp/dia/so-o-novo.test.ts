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
