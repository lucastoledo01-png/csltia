/**
 * O texto inteiro de um erro de banco ou de rede, para gravar e ler depois.
 *
 * Em 06/10/2026 o Instagram ficou sem post de notícia porque a camada de
 * candidatas falhou, e nenhum registro guardou o erro do banco: só se soube o
 * motivo por eliminação. Parte disso era o formato. O erro do PostgREST traz
 * `code`, `details` e `hint` além de `message`, e é no `details` que mora o
 * nome da constraint ou do valor recusado; o `fetch failed` do Node esconde a
 * causa de verdade (tempo esgotado, conexão fechada) em `cause`. Guardar só o
 * `message` jogava fora exatamente a parte que diz o que aconteceu.
 */
export function textoDoErro(erro: unknown, limite = 600): string {
  const partes: string[] = [];
  const visto = new Set<unknown>();

  const juntar = (e: unknown, profundidade: number) => {
    if (e == null || visto.has(e) || profundidade > 3) return;
    visto.add(e);
    if (typeof e === "string") {
      partes.push(e);
      return;
    }
    if (typeof e !== "object") {
      partes.push(String(e));
      return;
    }
    const o = e as Record<string, unknown>;
    const mensagem = typeof o.message === "string" ? o.message : "";
    if (mensagem) partes.push(mensagem);
    for (const campo of ["code", "details", "hint"] as const) {
      const v = o[campo];
      if (typeof v === "string" && v.trim() && v !== mensagem) partes.push(`${campo}: ${v.trim()}`);
    }
    if (!mensagem && partes.length === 0) {
      try {
        partes.push(JSON.stringify(e));
      } catch {
        partes.push(String(e));
      }
    }
    if ("cause" in o && o.cause) {
      partes.push("causa:");
      juntar(o.cause, profundidade + 1);
    }
  };

  juntar(erro, 0);
  const texto = partes.join(" ").replace(/\s+/g, " ").trim() || "erro sem texto";
  return texto.length > limite ? `${texto.slice(0, limite - 3)}...` : texto;
}
