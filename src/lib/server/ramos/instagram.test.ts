import { describe, expect, it } from "vitest";
import { criarLivroDeCustos } from "./custos";
import { lancarCustosDoInstagram } from "./instagram";
import type { ResultadoDoSocialDoDia } from "../social/ciclo-do-dia";

describe("o custo do Instagram no livro do dia", () => {
  it("a pergunta dos rostos da bolha entra no ramo do post", () => {
    const livro = criarLivroDeCustos();
    lancarCustosDoInstagram(livro, {
      conferencia: null,
      ciclo: { previews: [], custoDaBolha: { usd: 0.0091, tokens: 2700 } },
    } as unknown as Pick<ResultadoDoSocialDoDia, "ciclo" | "conferencia">);

    expect(livro.lancamentos()).toContainEqual({ etapa: "bolha", ramo: "post", custoUsd: 0.0091, tokens: 2700 });
    expect(livro.porRamo().post).toBeCloseTo(0.0091, 6);
  });

  it("ciclo sem render (dry-run) não lança a etapa da bolha", () => {
    const livro = criarLivroDeCustos();
    lancarCustosDoInstagram(livro, {
      conferencia: null,
      ciclo: { previews: [] },
    } as unknown as Pick<ResultadoDoSocialDoDia, "ciclo" | "conferencia">);
    expect(livro.lancamentos().map((l) => l.etapa)).not.toContain("bolha");
  });
});
