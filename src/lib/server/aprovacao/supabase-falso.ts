import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Um cliente do Supabase de mentira, para os testes da integração (05/10/2026).
 *
 * Os testes do portão único precisam provar o "não" no caminho inteiro (ler a
 * linha, perguntar à fila, escrever ou não escrever), e um mock por função
 * esconderia justamente a escrita que não devia acontecer. Este cliente anota
 * cada consulta, com tabela, tipo, valores e filtros, e responde pelo que o
 * teste decidir. O teste olha a lista de operações e vê, por exemplo, que
 * nenhum `update` em `articles` foi feito.
 *
 * Não é arquivo de teste (não termina em `.test.ts`) para poder ser importado
 * por mais de um; não é usado por código de produção.
 */

export type Operacao = {
  tabela: string;
  tipo: "select" | "update" | "insert" | "upsert" | "delete";
  colunas?: string;
  valores?: unknown;
  filtros: Array<[string, ...unknown[]]>;
  unico: boolean;
};

export type Resposta = { data?: unknown; error?: { message: string; code?: string } | null };

export function filtro(op: Operacao, metodo: string, coluna: string): unknown[] | undefined {
  const f = op.filtros.find((x) => x[0] === metodo && x[1] === coluna);
  return f ? f.slice(2) : undefined;
}

export function supabaseFalso(responder: (op: Operacao) => Resposta = () => ({ data: [] })) {
  const ops: Operacao[] = [];
  const client = {
    from(tabela: string) {
      const op: Operacao = { tabela, tipo: "select", filtros: [], unico: false };
      ops.push(op);
      const b: Record<string, unknown> = {};
      for (const m of ["eq", "neq", "in", "is", "lte", "gte", "lt", "gt", "like", "not", "order", "limit"]) {
        b[m] = (...args: unknown[]) => {
          op.filtros.push([m, ...args]);
          return b;
        };
      }
      b.select = (colunas?: string) => {
        if (op.tipo === "select" && op.colunas === undefined) op.colunas = colunas;
        return b;
      };
      for (const tipo of ["update", "insert", "upsert"] as const) {
        b[tipo] = (valores: unknown) => {
          op.tipo = tipo;
          op.valores = valores;
          return b;
        };
      }
      b.delete = () => {
        op.tipo = "delete";
        return b;
      };
      b.maybeSingle = () => {
        op.unico = true;
        return b;
      };
      b.single = b.maybeSingle;
      b.then = (ok: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => {
        const r = responder(op);
        return Promise.resolve({ data: r.data ?? (op.unico ? null : []), error: r.error ?? null }).then(ok, falhou);
      };
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient, ops };
}
