import { carregarFunilPermanente } from "../prompt-system/funil-permanente";

/**
 * A palavra do CTA e a palavra que o listener escuta são a MESMA palavra.
 *
 * Elas não eram. O V2 lia `project.settings.instagram_keyword` com padrão
 * "VISA", o worker legado lia a mesma coluna com padrão "NEWS", e quem
 * realmente escuta é a automação do OpenReply, criada em
 * `garantirFunilPermanente` com `prompt_campaigns.keyword` da campanha
 * evergreen. Três lugares para um valor só.
 *
 * Hoje eles coincidem em produção, por sorte. O defeito é latente: basta
 * alguém editar a campanha, ou criar o projeto sem preencher `settings`, para o
 * post ir ao ar pedindo "Comente X" com o listener escutando Y — e um CTA que
 * não dispara nada é pior que nenhum CTA, porque quem comentou fica esperando.
 *
 * A fonte canônica é a campanha, e não a configuração do projeto, por uma razão
 * simples: é dela que sai o valor entregue ao OpenReply. Configuração que
 * ninguém consome não é fonte de verdade, é anotação.
 */

export type ResolucaoDaKeyword =
  | { ok: true; keyword: string; automacao: string }
  | { ok: false; motivo: string };

/** A campanha, no mínimo que esta decisão precisa. */
export type CampanhaDoFunil = {
  keyword?: unknown;
  openreply_automation_id?: unknown;
} | null;

/**
 * Normalização única, usada dos dois lados da comparação.
 *
 * Serve para COMPARAR, nunca para imprimir: o que vai para a arte é a palavra
 * como está gravada, byte a byte. Normalizar na impressão criaria uma quarta
 * versão do mesmo valor, que é exatamente o problema que este módulo existe
 * para acabar.
 */
export function normalizarKeyword(bruta: unknown): string {
  return String(bruta ?? "")
    .trim()
    .toUpperCase();
}

/** As duas palavras são a mesma, para efeito de listener. */
export function mesmaKeyword(a: unknown, b: unknown): boolean {
  const x = normalizarKeyword(a);
  return x !== "" && x === normalizarKeyword(b);
}

/**
 * Decide a keyword a partir da campanha, sem tocar no banco.
 *
 * Exigir `openreply_automation_id` é o ponto: ele é a prova de que a automação
 * existe do lado do OpenReply. Sem ele, a palavra está escrita numa linha do
 * banco e não está escutando nada, e imprimir "Comente VISA" nesse estado é
 * prometer uma resposta que ninguém vai dar.
 *
 * A primeira publicação de um projeto novo cai aqui e sai SEM_CTA, de
 * propósito: `garantirFunilPermanente` cria a automação depois de publicar, e a
 * partir do segundo post o CTA passa a valer. Um post sem CTA é uma perda
 * pequena; um CTA morto ensina o leitor que comentar não adianta.
 */
export function keywordDaCampanha(campanha: CampanhaDoFunil): ResolucaoDaKeyword {
  if (!campanha) {
    return { ok: false, motivo: "o projeto não tem funil permanente configurado" };
  }

  const keyword = String(campanha.keyword ?? "").trim();
  if (!keyword) {
    return { ok: false, motivo: "a campanha do funil permanente não tem keyword" };
  }

  const automacao = String(campanha.openreply_automation_id ?? "").trim();
  if (!automacao) {
    return {
      ok: false,
      motivo: `a keyword "${keyword}" ainda não tem automação no OpenReply: ninguém escutaria o comentário`,
    };
  }

  return { ok: true, keyword, automacao };
}

/** A mesma decisão, lendo a campanha do banco. */
export async function resolverKeywordCanonica(projectId: string): Promise<ResolucaoDaKeyword> {
  try {
    return keywordDaCampanha(await carregarFunilPermanente(projectId));
  } catch (err) {
    return {
      ok: false,
      motivo: `não consegui ler o funil permanente: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
