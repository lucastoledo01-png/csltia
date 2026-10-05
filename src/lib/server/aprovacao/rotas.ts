import type { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "../admin-auth";
import { getAdminSessionSecret } from "../env";
import { getProjectBySlug, type Project } from "../projects";
import type { ProjetoDaFila } from "./fila";

/**
 * O que as rotas da fila têm em comum: achar o projeto e dizer quem decidiu.
 *
 * O painel tem um login só, que é o do dono (mais de um editor está fora do
 * escopo do MVP). Ainda assim a decisão grava QUAL sessão a tomou: é o que
 * permite separar, no registro, uma aprovação feita no painel de uma feita
 * pela máquina, e uma sessão de outra se um dia houver mais de uma.
 */
export function quemDecide(req: NextRequest): string {
  try {
    const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
    const sessao = verifyAdminSessionToken(getAdminSessionSecret(), token);
    if (sessao) return `dono:sessao-${sessao.sessionId.slice(0, 8)}`;
  } catch {
    // Sem segredo configurado `requireAdmin` já teria recusado; isto é só a etiqueta.
  }
  return "dono:painel";
}

export async function projetoPeloSlug(slug: unknown): Promise<Project | null> {
  if (typeof slug !== "string" || !slug.trim()) return null;
  return getProjectBySlug(slug.trim());
}

export function comoProjetoDaFila(p: Project): ProjetoDaFila {
  return { id: p.id, timezone: p.timezone, settings: p.settings };
}
