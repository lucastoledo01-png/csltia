import { describe, expect, it } from "vitest";
import type { ContextoDaRefacao, GanchosDeRefazer } from "@/lib/server/aprovacao/refazer";
import { comImagemDoClaude } from "./refacao";

describe("a foto reprovada no motor Claude", () => {
  const ctx = { aprovacao: { projectId: "p1" }, etapa: "imagem", naoRepetir: "", motivo: "foto sem a marca" } as unknown as ContextoDaRefacao;
  let rodouOResolvedor = 0;
  const base: GanchosDeRefazer = {
    artigo: {
      imagem: async () => {
        rodouOResolvedor++;
        return { ok: false, motivo: "o resolvedor não achou outra foto" };
      },
    },
  };

  it("volta ao Claude, sem rodar o resolvedor, com o motivo do dono", async () => {
    rodouOResolvedor = 0;
    const g = comImagemDoClaude(base, async () => true);
    const r = await g.artigo!.imagem!(ctx);
    expect(rodouOResolvedor).toBe(0);
    expect(r.ok && r.assincrona).toContain("foto sem a marca");
  });

  it("no motor da OpenAI segue com o resolvedor de sempre", async () => {
    rodouOResolvedor = 0;
    const g = comImagemDoClaude(base, async () => false);
    const r = await g.artigo!.imagem!(ctx);
    expect(rodouOResolvedor).toBe(1);
    expect(r.ok).toBe(false);
  });
});
