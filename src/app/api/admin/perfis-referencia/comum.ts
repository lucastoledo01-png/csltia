import { NextResponse } from "next/server";
import { getProjectBySlug } from "@/lib/server/projects";
import type { Project } from "@/lib/server/projects";

/**
 * O que as rotas de perfis de referência dividem.
 *
 * O projeto chega pelo SLUG, que é o que a URL do painel carrega
 * (`/admin/<slug>/perfis-de-referencia`). Toda escrita filtra por
 * `project_id` além do id do perfil, para um id de outro projeto nunca ser
 * alterado por engano a partir desta tela.
 */
export async function projetoDoPedido(
  slug: string | null | undefined,
): Promise<{ projeto: Project } | { resposta: NextResponse }> {
  const s = String(slug ?? "").trim();
  if (!s) {
    return { resposta: NextResponse.json({ ok: false, error: "informe o projeto" }, { status: 400 }) };
  }
  const projeto = await getProjectBySlug(s);
  if (!projeto) {
    return { resposta: NextResponse.json({ ok: false, error: `projeto "${s}" não encontrado` }, { status: 404 }) };
  }
  return { projeto };
}

/**
 * Erro de banco com o motivo que o operador consegue resolver.
 *
 * Antes de o dono rodar a migration, a tabela não existe e o PostgREST
 * responde com um código de esquema. Mostrar "relation does not exist" cru não
 * diz o que fazer; esta mensagem diz.
 */
export function falhaDoBanco(erro: unknown): NextResponse {
  const msg = erro instanceof Error ? erro.message : String(erro);
  const semTabela = /does not exist|PGRST205|schema cache/i.test(msg);
  return NextResponse.json(
    {
      ok: false,
      error: semTabela
        ? "As tabelas de perfis de referência ainda não existem. Rode a migration 20261005150000_perfis_de_referencia.sql no SQL Editor."
        : msg,
    },
    { status: semTabela ? 503 : 500 },
  );
}
