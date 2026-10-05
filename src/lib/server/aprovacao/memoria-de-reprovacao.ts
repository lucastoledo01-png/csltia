import { getSupabaseAdminClient } from "../supabase-admin";
import { REPETICOES_PARA_PROPOR_REGRA, ROTULO_DA_ETAPA, type Etapa } from "./contrato";
import { criarFilaStore, type FilaStore, type Reprovacao } from "./fila-store";

/**
 * A memória de reprovação (RF-29), de 05/10/2026.
 *
 * Toda reprovação grava a etapa culpada, o motivo escrito pelo editor e o texto
 * reprovado. Isso serve a duas coisas:
 *
 *   1. Quando a etapa é refeita, e nas pautas seguintes, os erros recentes dela
 *      entram no prompt como "não repetir". É `errosRecentesDaEtapa`, e é a
 *      função que as outras frentes chamam dos seus redatores.
 *   2. O mesmo erro três vezes vira PROPOSTA de regra fixa. Proposta, nunca
 *      regra: nada entra no prompt como regra permanente sem o dono aprovar no
 *      painel. Um editor cansado escrevendo três vezes a mesma reclamação não é
 *      política editorial até alguém decidir que é.
 */

/** Quantos erros recentes entram no bloco, por padrão. Mais que isso vira ruído no prompt. */
export const LIMITE_PADRAO_DE_ERROS = 5;

/** O trecho reprovado é citado curto: o modelo precisa do padrão, não da peça inteira. */
const TAMANHO_DO_TRECHO = 220;

function cortar(texto: string, limite: number): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length <= limite ? t : `${t.slice(0, limite - 3)}...`;
}

/**
 * Monta o bloco de prompt a partir do que já foi lido. Pura, para teste.
 *
 * Devolve string vazia quando não há nada a dizer: um bloco "não repetir"
 * vazio no prompt é instrução sem conteúdo, e o modelo tende a inventar o que
 * evitar.
 */
export function montarBlocoNaoRepetir(
  etapa: Etapa,
  erros: Pick<Reprovacao, "motivo" | "textoReprovado">[],
  regrasAprovadas: string[] = [],
): string {
  const linhas: string[] = [];

  if (regrasAprovadas.length > 0) {
    linhas.push(`REGRAS FIXAS DA ETAPA "${ROTULO_DA_ETAPA[etapa]}", aprovadas pelo dono:`);
    for (const r of regrasAprovadas) linhas.push(`- ${r}`);
  }

  if (erros.length > 0) {
    if (linhas.length > 0) linhas.push("");
    linhas.push(`NÃO REPETIR. Erros recentes apontados pelo editor na etapa "${ROTULO_DA_ETAPA[etapa]}":`);
    for (const e of erros) {
      const trecho = e.textoReprovado.trim()
        ? ` Trecho reprovado: "${cortar(e.textoReprovado, TAMANHO_DO_TRECHO)}"`
        : "";
      linhas.push(`- ${cortar(e.motivo, 300)}.${trecho}`);
    }
  }

  return linhas.join("\n");
}

/**
 * Os erros recentes da etapa como bloco de prompt.
 *
 * Assinatura pedida pelo PRD: `errosRecentesDaEtapa(projeto, etapa, limite)`.
 * O quarto parâmetro é só para teste. Falha de leitura devolve string vazia e
 * não derruba quem chama: escrever sem a memória é o comportamento de antes, e
 * perder a pauta do dia porque a memória não respondeu seria trocar um defeito
 * pequeno por um grande.
 */
export async function errosRecentesDaEtapa(
  projeto: { id: string } | string,
  etapa: Etapa,
  limite: number = LIMITE_PADRAO_DE_ERROS,
  store?: FilaStore,
): Promise<string> {
  const projectId = typeof projeto === "string" ? projeto : projeto.id;
  try {
    const s = store ?? criarFilaStore(getSupabaseAdminClient());
    const [erros, regras] = await Promise.all([
      s.reprovacoesDaEtapa(projectId, etapa, Math.max(0, limite)),
      s.regras(projectId, { etapa, estado: "aprovada" }),
    ]);
    return montarBlocoNaoRepetir(
      etapa,
      erros,
      regras.map((r) => r.regra),
    );
  } catch (erro) {
    console.warn(
      `[FILA] memória de reprovação indisponível para ${etapa}: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
    return "";
  }
}

// ---------------------------------------------------------------------------
// Repetição: quando três reprovações dizem a mesma coisa.
// ---------------------------------------------------------------------------

const PALAVRAS_VAZIAS = new Set([
  "a", "o", "as", "os", "um", "uma", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas",
  "que", "para", "por", "com", "sem", "se", "nao", "mais", "muito", "ja", "foi", "esta", "isso", "isto",
  "ao", "aos", "como", "mas", "ou", "tem", "ser", "sao", "pra", "pelo", "pela", "essa", "esse", "texto",
]);

/** As palavras que carregam o sentido do motivo, sem acento e sem as vazias. */
export function palavrasDoMotivo(motivo: string): string[] {
  const limpas = motivo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p));
  return [...new Set(limpas)];
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  let comum = 0;
  for (const p of b) if (sa.has(p)) comum += 1;
  return comum / (sa.size + b.length - comum);
}

/**
 * Limiar de semelhança entre dois motivos para contarem como o mesmo erro.
 *
 * Escolhido em 05/10/2026 sem dado de produção, porque a memória nasce vazia:
 * 0.5 junta "manchete com sigla em inglês" e "sigla em inglês na manchete de
 * novo", e separa "sigla em inglês" de "número sem fonte". Quando houver
 * reprovações reais, medir contra elas antes de mexer.
 */
export const LIMIAR_DE_MESMO_ERRO = 0.5;

export type ErroRepetido = {
  chave: string;
  regra: string;
  ocorrencias: number;
  exemplos: string[];
};

/**
 * Agrupa reprovações da MESMA etapa por semelhança de motivo.
 *
 * O representante do grupo é o motivo mais antigo, e é dele que sai a chave:
 * assim a chave de uma proposta não muda a cada reprovação nova do mesmo erro,
 * e a unicidade (projeto, etapa, chave) segura a proposta duplicada.
 */
export function errosRepetidos(
  reprovacoes: Pick<Reprovacao, "motivo" | "createdAt">[],
  minimo: number = REPETICOES_PARA_PROPOR_REGRA,
): ErroRepetido[] {
  const ordenadas = reprovacoes
    .filter((r) => r.motivo.trim())
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const grupos: Array<{ palavras: string[]; motivos: string[] }> = [];

  for (const r of ordenadas) {
    const palavras = palavrasDoMotivo(r.motivo);
    if (palavras.length === 0) continue;
    const grupo = grupos.find((g) => jaccard(g.palavras, palavras) >= LIMIAR_DE_MESMO_ERRO);
    if (grupo) grupo.motivos.push(r.motivo.trim());
    else grupos.push({ palavras, motivos: [r.motivo.trim()] });
  }

  return grupos
    .filter((g) => g.motivos.length >= minimo)
    .map((g) => ({
      chave: g.palavras.slice().sort().join("-").slice(0, 200),
      regra: `Não repetir: ${cortar(g.motivos[0], 280)}`,
      ocorrencias: g.motivos.length,
      exemplos: g.motivos.slice(-5),
    }));
}

/**
 * Depois de cada reprovação: o erro já se repetiu o bastante para virar proposta?
 *
 * Lê as últimas 50 da etapa. É janela, e não histórico inteiro, de propósito:
 * um erro que parou de acontecer há meses não precisa de regra.
 */
export async function proporRegrasDaEtapa(store: FilaStore, projectId: string, etapa: Etapa): Promise<ErroRepetido[]> {
  const recentes = await store.reprovacoesDaEtapa(projectId, etapa, 50);
  const repetidos = errosRepetidos(recentes);
  for (const r of repetidos) {
    await store.proporRegra({ projectId, etapa, ...r });
  }
  return repetidos;
}
