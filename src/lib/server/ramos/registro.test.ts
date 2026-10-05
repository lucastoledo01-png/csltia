import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { EVENTO_CUSTOS, EVENTO_VEREDITO, gravarCustos, gravarVeredito, vereditoDaPeca } from "./registro";
import { montarPeca } from "./peca";
import { criarLivroDeCustos } from "./custos";

/**
 * O veredito do auditor é gravado quando passa E quando bloqueia (RF-10), e o
 * custo do dia vai junto, por ramo e por etapa (RNF-14).
 */

function bancoFalso(erro: string | null = null) {
  const linhas: Array<Record<string, unknown>> = [];
  const client = {
    from: (tabela: string) => ({
      insert: (linha: Record<string, unknown>) => {
        linhas.push({ tabela, ...linha });
        return Promise.resolve({ error: erro ? { message: erro } : null });
      },
    }),
  };
  return { client: client as never, linhas };
}

const CONTEXTO = { data: "2026-10-06", dryRun: false, modo: "enforce" };

function peca(aprovada: boolean) {
  return montarPeca({
    ramo: "newsletter",
    referenciaId: "edicao-2026-10-06",
    storyIds: ["s1", "s2"],
    titulo: "o fed mexeu nos juros",
    conteudo: { subject: "o fed mexeu nos juros" },
    avisos: aprovada ? ["QA_LOW_SCORE: nota 70 abaixo de 85 (aviso, não bloqueia)"] : [],
    aprovadaPeloAuditor: aprovada,
    bloqueios: aprovada ? [] : ["REJECT_EDITORIAL_QA: hallucination_risk"],
  });
}

describe("veredito do ramo", () => {
  it("grava o que PASSOU, com o aviso de nota baixa", async () => {
    const { client, linhas } = bancoFalso();
    await gravarVeredito(client, "p", vereditoDaPeca(peca(true), { nota: 70, riscoDeAlucinacao: false }), CONTEXTO);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].tabela).toBe("platform_events");
    expect(linhas[0].event_type).toBe(EVENTO_VEREDITO);
    const payload = linhas[0].payload as Record<string, unknown>;
    expect(payload.aprovado).toBe(true);
    expect(payload.nota).toBe(70);
    expect(String(payload.avisos)).toContain("QA_LOW_SCORE");
    expect(payload.hashDoArtefato).toMatch(/^[0-9a-f]{64}$/);
  });

  it("grava o que BLOQUEOU, com o motivo", async () => {
    const { client, linhas } = bancoFalso();
    await gravarVeredito(client, "p", vereditoDaPeca(peca(false), { nota: 98, riscoDeAlucinacao: true }), CONTEXTO);
    const payload = linhas[0].payload as Record<string, unknown>;
    expect(payload.aprovado).toBe(false);
    expect(String(payload.bloqueios)).toContain("hallucination_risk");
  });

  it("falha ao gravar devolve o motivo e não derruba ninguém", async () => {
    const { client } = bancoFalso("permission denied");
    await expect(gravarVeredito(client, "p", vereditoDaPeca(peca(true)), CONTEXTO)).resolves.toBe("permission denied");
  });

  it("o serviço grava o veredito da newsletter nos dois desfechos", () => {
    const fonte = fs.readFileSync(
      path.join(path.resolve(__dirname, "../../../.."), "src/lib/server/newsroom/newsroom-service.ts"),
      "utf-8",
    );
    // Uma chamada no caminho do bloqueio, antes do throw, e uma no de sucesso.
    expect(fonte.split("await registrarVereditoDaNewsletter(peca);").length - 1).toBe(2);
    const bloqueio = fonte.indexOf('if (!pipelineResult.aprovado && modo === "enforce") {');
    const throwDoQa = fonte.indexOf("throw comDetalheDoBloqueio(", bloqueio);
    expect(fonte.slice(bloqueio, throwDoQa)).toContain("await registrarVereditoDaNewsletter(peca);");
  });
});

describe("custos do dia", () => {
  it("vão por ramo e por etapa", async () => {
    const livro = criarLivroDeCustos();
    livro.lancar("classificacao", "comum", 0.01);
    livro.lancar("redacao", "artigo", 0.02);
    livro.lancar("redacao", "artigo", 0.03);
    const { client, linhas } = bancoFalso();
    await gravarCustos(client, "p", livro, CONTEXTO);
    expect(linhas[0].event_type).toBe(EVENTO_CUSTOS);
    const payload = linhas[0].payload as { porEtapa: Record<string, number>; totalUsd: number };
    expect(payload.porEtapa["artigo:redacao"]).toBeCloseTo(0.05);
    expect(payload.totalUsd).toBeCloseTo(0.06);
  });
});
