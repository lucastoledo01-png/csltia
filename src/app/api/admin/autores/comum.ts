import { NextResponse } from "next/server";

export { projetoDoPedido } from "../perfis-referencia/comum";

/**
 * Erro de banco com o motivo que o dono consegue resolver.
 *
 * Antes da migration, a tabela `autores` e a coluna `articles.author_id` não
 * existem, e o PostgREST responde com código de esquema. A mensagem diz qual
 * arquivo rodar, em vez de "relation does not exist".
 */
export function falhaDoBanco(erro: unknown): NextResponse {
  const msg = erro instanceof Error ? erro.message : String(erro);
  const semTabela = /does not exist|PGRST205|PGRST204|schema cache|author_id/i.test(msg);
  if (/duplicate key|23505/i.test(msg)) {
    return NextResponse.json({ ok: false, error: "já existe um autor com este endereço (slug) neste projeto" }, { status: 409 });
  }
  return NextResponse.json(
    {
      ok: false,
      error: semTabela
        ? "A tabela de autores ainda não existe. Rode a migration 20261006120000_autores.sql no SQL Editor."
        : msg,
    },
    { status: semTabela ? 503 : 500 },
  );
}
