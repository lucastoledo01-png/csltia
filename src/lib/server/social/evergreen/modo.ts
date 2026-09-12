/**
 * Em que estado o evergreen roda.
 *
 * Mesma disciplina do `SOCIAL_PIPELINE_V2`, e pelo mesmo motivo: subir código
 * não pode trocar o comportamento do perfil. Valor irreconhecível cai em `off`,
 * nunca em `enforce`.
 *
 *   off       o evergreen não existe. O News V2 roda exatamente como hoje.
 *   dry_run   seleciona, ancora, escreve, audita e agenda, e não grava nada.
 *   enforce   grava em social_posts como o News grava, e o worker publica.
 */

import { resolverCapacidade } from "../../capacidades";
import type { ProjetoComCapacidades } from "../../capacidades";

export type ModoEvergreen = "off" | "dry_run" | "enforce";

export function modoDoEvergreen(
  env: Record<string, string | undefined> = process.env,
  projeto?: ProjetoComCapacidades | null,
): ModoEvergreen {
  return resolverCapacidade("evergreen", () => doAmbiente(env), projeto);
}

function doAmbiente(env: Record<string, string | undefined>): ModoEvergreen {
  const bruto = (env.SOCIAL_EVERGREEN_V2 || "").trim().toLowerCase();
  if (bruto === "enforce") return "enforce";
  if (bruto === "dry_run") return "dry_run";
  return "off";
}

export function descreverModoEvergreen(modo: ModoEvergreen): string {
  if (modo === "enforce") return "no comando, preenche as vagas que a notícia deixou";
  if (modo === "dry_run") return "em observação, calcula tudo e não publica nada";
  return "desligado, só o News V2 alimenta o feed";
}
