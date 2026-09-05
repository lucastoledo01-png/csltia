/**
 * Em que estado a guarda editorial roda.
 *
 * Três estados, e o padrão é o que não muda produção. Um deploy de código não
 * pode habilitar publicação com lógica ainda não validada editorialmente: a
 * ativação é uma decisão explícita, tomada numa variável de ambiente, não um
 * efeito colateral de subir código.
 *
 *   off       fluxo antigo, a guarda nem roda.
 *   dry_run   a guarda roda inteira, registra tudo, e a publicação sai pelo
 *             fluxo antigo. É o padrão.
 *   enforce   a guarda decide o que é publicado e grava o histórico.
 *
 * Valor irreconhecível cai em dry_run, e não em enforce, pelo mesmo motivo:
 * erro de digitação numa variável não pode ligar a publicação.
 */

export type ModoDaGuarda = "off" | "dry_run" | "enforce";

export function modoDaGuarda(env: Record<string, string | undefined> = process.env): ModoDaGuarda {
  const bruto = (env.EDITORIAL_GUARD || "").trim().toLowerCase();
  if (bruto === "off") return "off";
  if (bruto === "enforce") return "enforce";
  return "dry_run";
}

export function descreverModo(modo: ModoDaGuarda): string {
  if (modo === "off") return "desligada, seleção pelo ranker antigo";
  if (modo === "enforce") return "no comando, decide o que é publicado";
  return "em observação, roda e registra sem interferir na publicação";
}
