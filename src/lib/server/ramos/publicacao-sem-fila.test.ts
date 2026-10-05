import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicarArtigosAprovados, revisaoExigidaPeloProjeto } from "./portal";

/**
 * Ramos em `enforce` com a fila de aprovação fora de `enforce` (05/10/2026).
 *
 * A matéria do ramo nasce `scheduled` e `needs_review`. Quem grava `approved`
 * é a liberação da fila, e ela só despacha em `enforce`. O relógio do portal
 * exigia `approved` sempre, então com a fila em `off` ou `dry_run` a matéria
 * ficava agendada para sempre. Estes testes rodam o relógio contra uma tabela
 * de verdade em memória, que aplica os filtros, e provam os dois lados.
 */

type Linha = { slug: string; status: string; manual_review_status: string; published_at: string };

/** Uma tabela `articles` em memória que entende eq, neq e lte, e aplica o update. */
function tabela(linhas: Linha[]) {
  const client = {
    from() {
      const filtros: Array<(l: Linha) => boolean> = [];
      let valores: Partial<Linha> | null = null;
      const b = {
        update(v: Partial<Linha>) {
          valores = v;
          return b;
        },
        select() {
          return b;
        },
        eq(c: keyof Linha | "project_id", v: string) {
          if (c !== "project_id") filtros.push((l) => l[c as keyof Linha] === v);
          return b;
        },
        neq(c: keyof Linha, v: string) {
          filtros.push((l) => l[c] !== v);
          return b;
        },
        lte(c: keyof Linha, v: string) {
          filtros.push((l) => l[c] <= v);
          return b;
        },
        then(ok: (r: unknown) => unknown) {
          const alvo = linhas.filter((l) => filtros.every((f) => f(l)));
          if (valores) for (const l of alvo) Object.assign(l, valores);
          return Promise.resolve({ data: alvo.map((l) => ({ slug: l.slug })), error: null }).then(ok);
        },
      };
      return b;
    },
  };
  return client as unknown as SupabaseClient;
}

const MEIO_DIA = "2026-10-06T15:00:00.000Z";
const SEIS_DA_TARDE = "2026-10-06T21:00:00.000Z";

function linhasDoDia(): Linha[] {
  return [
    { slug: "aguardando-meio-dia", status: "scheduled", manual_review_status: "needs_review", published_at: MEIO_DIA },
    { slug: "aprovada-meio-dia", status: "scheduled", manual_review_status: "approved", published_at: MEIO_DIA },
    { slug: "bloqueada-meio-dia", status: "scheduled", manual_review_status: "blocked", published_at: MEIO_DIA },
    { slug: "aguardando-seis-da-tarde", status: "scheduled", manual_review_status: "needs_review", published_at: SEIS_DA_TARDE },
  ];
}

const projeto = (aprovacao?: string) => ({ settings: { capacidades: { ramos: "enforce", ...(aprovacao ? { aprovacao } : {}) } } });

describe("o relógio do portal com os ramos em enforce", () => {
  it("fila em enforce: só sai o que alguém aprovou, e só no horário", async () => {
    const linhas = linhasDoDia();
    const r = await publicarArtigosAprovados(tabela(linhas), "p", new Date(MEIO_DIA), undefined, revisaoExigidaPeloProjeto(projeto("enforce")));

    expect(r.publicados).toEqual(["aprovada-meio-dia"]);
    expect(linhas.find((l) => l.slug === "aguardando-meio-dia")?.status).toBe("scheduled");
  });

  for (const aprovacao of [undefined, "off", "dry_run"]) {
    it(`fila em ${aprovacao ?? "ausente"}: a matéria sai no horário dela, sem gente no meio`, async () => {
      const linhas = linhasDoDia();
      const revisao = revisaoExigidaPeloProjeto(projeto(aprovacao));

      // Antes do horário, nada.
      const cedo = await publicarArtigosAprovados(tabela(linhas), "p", new Date("2026-10-06T14:59:00.000Z"), undefined, revisao);
      expect(cedo.publicados).toEqual([]);

      // No horário do meio-dia, as duas do meio-dia; a das 18:00 espera, e a bloqueada não sai nunca.
      const r = await publicarArtigosAprovados(tabela(linhas), "p", new Date(MEIO_DIA), undefined, revisao);
      expect(r.publicados.sort()).toEqual(["aguardando-meio-dia", "aprovada-meio-dia"]);
      expect(linhas.find((l) => l.slug === "aguardando-seis-da-tarde")?.status).toBe("scheduled");
      expect(linhas.find((l) => l.slug === "bloqueada-meio-dia")?.status).toBe("scheduled");

      const tarde = await publicarArtigosAprovados(tabela(linhas), "p", new Date(SEIS_DA_TARDE), undefined, revisao);
      expect(tarde.publicados).toEqual(["aguardando-seis-da-tarde"]);
    });
  }

  it("quem chama sem dizer a revisão recebe a regra mais restrita", async () => {
    const linhas = linhasDoDia();
    const r = await publicarArtigosAprovados(tabela(linhas), "p", new Date(MEIO_DIA));
    expect(r.publicados).toEqual(["aprovada-meio-dia"]);
  });
});
