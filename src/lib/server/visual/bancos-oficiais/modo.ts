/**
 * O interruptor dos bancos oficiais (06/10/2026).
 *
 * Mora em `settings.imagens.bancos_oficiais` do projeto, e não em
 * `settings.capacidades`, porque não há ensaio a fazer: ligado, o resolvedor
 * pergunta também aos bancos públicos; desligado, ele não sabe que eles
 * existem, e a resolução é byte a byte a de antes.
 *
 * Só o `true` booleano liga. Ausente, nulo, a string "true" ou qualquer outra
 * coisa é desligado: o valor vem de um jsonb que outras mãos editam, e o lado
 * seguro do erro aqui é o caminho que já está em produção.
 */

export type ProjetoComImagens = { settings?: Record<string, unknown> | null } | null | undefined;

export function bancosOficiaisLigados(projeto: ProjetoComImagens): boolean {
  const imagens = projeto?.settings?.imagens;
  if (!imagens || typeof imagens !== "object") return false;
  return (imagens as Record<string, unknown>).bancos_oficiais === true;
}
