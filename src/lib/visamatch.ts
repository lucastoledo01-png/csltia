/**
 * Link do VisaMatch, o destino da análise de perfil.
 *
 * Fica num lugar só porque o mesmo destino aparece na newsletter, no CTA do
 * Instagram e na automação de direct, cada um com origem própria. Escrever a
 * URL à mão em três lugares é como a marca antiga sobreviveu em 121 pontos do
 * código depois da virada de vertical.
 *
 * Os parâmetros de afiliado identificam a publicação do lado do VisaMatch e
 * não mudam por canal. O que muda por canal é o UTM.
 */

export type OrigemDoLink = {
  /** utm_source: onde a pessoa estava. */
  fonte: string;
  /** utm_medium: o tipo de canal. */
  meio: string;
  /** utm_content: qual peça, dentro do canal. */
  conteudo: string;
};

export const VISAMATCH_BASE = "https://visamatch.imigrareua.com/";

export function linkDoVisaMatch(
  origem: OrigemDoLink,
  env: Record<string, string | undefined> = process.env
): string {
  const base = env.VISAMATCH_URL || VISAMATCH_BASE;
  const afiliado = env.VISAMATCH_AFFILIATE_NAME || "imigra-us";
  const campanha = env.VISAMATCH_UTM_CAMPAIGN || "imigra-us";

  const url = new URL(base);
  url.searchParams.set("affiliatetype", "external");
  url.searchParams.set("affiliatename", afiliado);
  url.searchParams.set("utm_source", origem.fonte);
  url.searchParams.set("utm_medium", origem.meio);
  url.searchParams.set("utm_campaign", campanha);
  url.searchParams.set("utm_content", origem.conteudo);
  return url.toString();
}

/** A edição do dia entra no utm_content, para separar o desempenho por edição. */
export function linkDaNewsletter(
  edicao: string,
  env: Record<string, string | undefined> = process.env
): string {
  return linkDoVisaMatch(
    { fonte: "newsletter", meio: "email", conteudo: `edicao-${edicao}` },
    env
  );
}

export function linkDoDirect(env: Record<string, string | undefined> = process.env): string {
  return linkDoVisaMatch(
    { fonte: "instagram", meio: "social", conteudo: "direct-automacao-posts" },
    env
  );
}
