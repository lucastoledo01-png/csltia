/**
 * O custo do dia, por etapa e por ramo (RNF-14).
 *
 * Até 05/10/2026 o dia tinha UM número: `newsroom_runs.cost_estimate_usd`, que
 * somava só a redação e a auditoria da newsletter. A classificação, o pacote
 * factual, o verificador e a copy do Instagram gastavam e não apareciam em
 * lugar nenhum. Com três ramos escrevendo, um número só deixa de responder a
 * pergunta que importa: qual canal custa quanto, e em que etapa.
 *
 * O livro é só memória. Quem grava é `registro.ts`, em `platform_events`, que
 * não pede DDL.
 */
export type RamoDoCusto = "comum" | "newsletter" | "artigo" | "post";

export type LancamentoDeCusto = {
  etapa: string;
  ramo: RamoDoCusto;
  custoUsd: number;
  tokens: number;
};

export type LivroDeCustos = {
  lancar(etapa: string, ramo: RamoDoCusto, custoUsd: number, tokens?: number): void;
  lancamentos(): LancamentoDeCusto[];
  total(): number;
  porRamo(): Record<RamoDoCusto, number>;
};

export function criarLivroDeCustos(): LivroDeCustos {
  const itens: LancamentoDeCusto[] = [];

  return {
    lancar(etapa, ramo, custoUsd, tokens = 0) {
      // Custo zero também entra: "a etapa rodou e não gastou" é diferente de
      // "a etapa não rodou", e só o lançamento separa os dois.
      const valor = Number.isFinite(custoUsd) ? custoUsd : 0;
      itens.push({ etapa, ramo, custoUsd: valor, tokens: Number.isFinite(tokens) ? tokens : 0 });
    },
    lancamentos() {
      return [...itens];
    },
    total() {
      return itens.reduce((s, i) => s + i.custoUsd, 0);
    },
    porRamo() {
      const saida: Record<RamoDoCusto, number> = { comum: 0, newsletter: 0, artigo: 0, post: 0 };
      for (const i of itens) saida[i.ramo] += i.custoUsd;
      return saida;
    },
  };
}
