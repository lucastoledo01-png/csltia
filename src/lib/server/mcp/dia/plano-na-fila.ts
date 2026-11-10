import { ItensDoPlanoSchema } from "./plano";
import { PLANO_VAZIO, type ItensDoPlano } from "./plano-store";

/**
 * O plano editado no painel (29/10/2026). O dono edita o JSON do plano como
 * texto, e a regra é uma só: ele pode TIRAR item, não pode pôr pauta que o
 * Claude não propôs (ela não passou pela triagem, pela foto nem pelo porquê).
 */
export function itensEditados(anteriorBruto: unknown, novoTexto: string): ItensDoPlano {
  const anterior: ItensDoPlano = { ...PLANO_VAZIO, ...((anteriorBruto ?? {}) as Partial<ItensDoPlano>) };
  let bruto: unknown;
  try {
    bruto = JSON.parse(novoTexto);
  } catch {
    throw new Error("o plano editado não é JSON válido");
  }
  const lido = ItensDoPlanoSchema.safeParse(bruto);
  if (!lido.success) throw new Error(`o plano editado não cabe no formato: ${lido.error.issues[0]?.message ?? ""}`);
  const novo = lido.data;
  for (const canal of ["newsletter", "artigos", "posts", "reels"] as const) {
    const novos = novo[canal].filter((id) => !anterior[canal].includes(id));
    if (novos.length) throw new Error(`${canal}: só dá para tirar item do plano, e ${novos.join(", ")} não estava nele`);
  }
  /*
   * Os extras (link e complemento) não estão no esquema do plano, e o parse os
   * jogava fora: em 10/11/2026 tirar dois vídeos velhos no painel apagou as
   * pautas por link da Anthropic e da Ring. Sem a chave no texto, ficam todos;
   * com ela, ficam os que o dono deixou (só tirar, nunca pôr).
   */
  const extrasDoTexto = (bruto as { extras?: unknown }).extras;
  const extras = Array.isArray(extrasDoTexto)
    ? (anterior.extras ?? []).filter((id) => extrasDoTexto.includes(id))
    : (anterior.extras ?? []);
  // As cenas, os porquês e os formatos dos extras ficam os do Claude; a edição só escolhe quais itens seguem.
  return {
    ...novo,
    ...(extras.length ? { extras } : {}),
    formatos: { ...Object.fromEntries(extras.filter((id) => anterior.formatos?.[id]).map((id) => [id, anterior.formatos![id]])), ...(novo.formatos ?? {}) },
    porque: anterior.porque,
    cenas: anterior.cenas,
  };
}
