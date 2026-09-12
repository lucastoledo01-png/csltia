/**
 * O que cada projeto liga, e quem decide.
 *
 * Até aqui, todo interruptor do sistema era variável de ambiente:
 * `SOCIAL_PIPELINE_V2`, `SOCIAL_EVERGREEN_V2`, `EDITORIAL_GUARD`,
 * `VISUAL_RESOLVER_V2`, `NEWSLETTER_AUTO_SEND`, `INSTAGRAM_AUTO_POST`.
 * Variável de ambiente é global ao deploy, então ligar o social no projeto A
 * ligava no projeto B junto. Com um projeto só isso nunca doeu; com dois, é o
 * bloqueio que impede a plataforma de existir.
 *
 * Aqui a capacidade passa a morar no projeto. E mora em `projects.settings`,
 * que já é jsonb e já é lido em produção, então isto NÃO exige migration: a
 * primeira fase da plataforma multi-projeto custa zero mudança de schema.
 *
 * A forma no banco:
 *
 *   settings: { "capacidades": { "social": "enforce", "evergreen": "dry_run" } }
 *
 * ## A regra que torna isto seguro de subir
 *
 * Capacidade NÃO declarada devolve `null`, e quem chama cai na variável de
 * ambiente. Um projeto que não declara nada se comporta exatamente como antes
 * desta mudança, byte a byte. É o que permite subir o alicerce sem alterar o
 * ciclo de amanhã.
 *
 * ## E a regra que a torna segura de usar
 *
 * Valor declarado e irreconhecível vira `off`, nunca `enforce` e nunca
 * fallback. É o mesmo contrato das flags de ambiente, e pelo mesmo motivo: um
 * erro de digitação no painel não pode ligar publicação. Cair no ambiente
 * seria pior ainda, porque o operador veria um valor na tela e outro valendo.
 */

export const CAPACIDADES = [
  /** Coleta automática de notícias das fontes do projeto. */
  "coleta",
  /** Composição e disparo da newsletter. */
  "newsletter",
  /** Posts de social media a partir da notícia do dia. */
  "social",
  /** Conteúdo permanente, que preenche o dia sem notícia. */
  "evergreen",
  /** Resolvedor de imagem com licença verificada. */
  "visual",
  /** Funil de keyword. */
  "keyword",
  /** Landing page do funil. */
  "landing",
] as const;

export type Capacidade = (typeof CAPACIDADES)[number];

export type EstadoDaCapacidade = "off" | "dry_run" | "enforce";

/**
 * O mínimo que este módulo precisa saber de um projeto.
 *
 * Estrutural de propósito: importar o tipo `Project` criaria dependência de
 * ciclo com `projects.ts`, e este módulo é lido por resolvedores que vivem
 * abaixo dele.
 */
export type ProjetoComCapacidades = {
  settings?: Record<string, unknown> | null;
};

function normalizar(bruto: unknown): EstadoDaCapacidade | null {
  if (typeof bruto !== "string") return null;
  const t = bruto.trim().toLowerCase();
  if (t === "enforce") return "enforce";
  if (t === "dry_run") return "dry_run";
  if (t === "off") return "off";
  // Declarado e irreconhecível. Ver o comentário do topo: vira `off`.
  return "off";
}

function mapaDeCapacidades(projeto: ProjetoComCapacidades | null | undefined): Record<string, unknown> {
  const settings = projeto?.settings;
  if (!settings || typeof settings !== "object") return {};
  const bruto = (settings as Record<string, unknown>).capacidades;
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  return bruto as Record<string, unknown>;
}

/**
 * O estado que o PROJETO declara, ou `null` quando ele não declara nada.
 *
 * `null` é informação, não ausência de resposta: significa "este projeto não
 * opina, pergunte ao ambiente".
 */
export function capacidadeDeclarada(
  projeto: ProjetoComCapacidades | null | undefined,
  capacidade: Capacidade,
): EstadoDaCapacidade | null {
  const mapa = mapaDeCapacidades(projeto);
  if (!(capacidade in mapa)) return null;
  return normalizar(mapa[capacidade]);
}

/** Tudo o que o projeto declara, já normalizado. Para o painel e o diagnóstico. */
export function capacidadesDeclaradas(
  projeto: ProjetoComCapacidades | null | undefined,
): Partial<Record<Capacidade, EstadoDaCapacidade>> {
  const mapa = mapaDeCapacidades(projeto);
  const saida: Partial<Record<Capacidade, EstadoDaCapacidade>> = {};
  for (const c of CAPACIDADES) {
    if (c in mapa) saida[c] = normalizar(mapa[c]) ?? "off";
  }
  return saida;
}

/**
 * A resolução completa: projeto primeiro, ambiente depois.
 *
 * É a única função que os resolvedores de modo precisam chamar. Ela existe
 * para que a ordem de precedência seja escrita UMA vez: seis resolvedores
 * repetindo a mesma condicional é seis lugares para ela divergir.
 */
export function resolverCapacidade(
  capacidade: Capacidade,
  doAmbiente: () => EstadoDaCapacidade,
  projeto?: ProjetoComCapacidades | null,
): EstadoDaCapacidade {
  const declarada = capacidadeDeclarada(projeto, capacidade);
  return declarada ?? doAmbiente();
}
