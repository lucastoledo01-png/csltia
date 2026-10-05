import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverCapacidade, type EstadoDaCapacidade, type ProjetoComCapacidades } from "./capacidades";

/**
 * A instrução editorial de cada etapa, editável no painel (RF-26, 05/10/2026).
 *
 * Cada prompt de modelo deste repositório mistura duas coisas de natureza
 * oposta: o JULGAMENTO editorial (para quem se escreve, o que é relevante, como
 * soa a voz) e o CONTRATO de saída (os campos do JSON, os tetos que a guarda
 * confere, a assinatura). O dono precisa ajustar o primeiro sem deploy. O
 * segundo não pode ser editado por ninguém no painel, porque quem lê o JSON é
 * código: um campo renomeado no painel derrubaria o dia sem erro de compilação.
 *
 * Então os prompts foram cortados em dois, e só o trecho editorial passa por
 * aqui. O padrão continua morando no código, ao lado do prompt que o usa, e é
 * ele que vale enquanto o projeto não tiver uma versão ativa.
 *
 * ## Por que a leitura é síncrona
 *
 * Os montadores de prompt são funções síncronas chamadas em dez lugares, a
 * maioria sem saber de que projeto é a pauta. Tornar todos assíncronos e passar
 * o projeto por cada um seria mexer em metade da esteira por causa de um texto.
 * Em vez disso, o ciclo carrega as versões ativas UMA vez, no começo
 * (`comInstrucoesDoProjeto`), e as guarda num contexto assíncrono; o montador
 * pergunta ao contexto (`instrucaoVigente`). Fora de um ciclo, que é o caso dos
 * scripts e das rotas de preview, não há contexto e o padrão vale.
 *
 * ## O contrato com a separação dos ramos (para o merge)
 *
 * `instrucaoDaEtapa(projetoId, etapa, padrao)` é síncrona e devolve string.
 * Com o mesmo nome e a mesma assinatura da versão "só padrão" que a separação
 * dos ramos criou, e por ser síncrona serve aos dois jeitos de chamar: direto,
 * ou com `await` na frente.
 */

/** As etapas com trecho editorial editável, na ordem em que a esteira as usa. */
export const ETAPAS_EDITORIAIS = [
  "linha_editorial_leitor",
  "linha_editorial_relevancia",
  "newsletter_redacao",
  "newsletter_assunto",
  "manchete",
  "social_copy",
  "carrossel_copy",
  "voz_social",
] as const;

export type EtapaEditorial = (typeof ETAPAS_EDITORIAIS)[number];

export function ehEtapaEditorial(etapa: string): etapa is EtapaEditorial {
  return (ETAPAS_EDITORIAIS as readonly string[]).includes(etapa);
}

export type InstrucaoAtiva = { texto: string; versao: number };

export type Contexto = {
  projetoId: string;
  modo: EstadoDaCapacidade;
  instrucoes: Map<string, InstrucaoAtiva>;
};

const contexto = new AsyncLocalStorage<Contexto>();

/** Abaixo disto, o texto gravado é acidente e não instrução. */
export const TAMANHO_MINIMO = 40;
/** O maior trecho editorial do código tem uns 14 mil caracteres. Folga de 3x. */
export const TAMANHO_MAXIMO = 40_000;

/**
 * Por que um texto não pode virar instrução, ou `null` se pode.
 *
 * A guarda do painel e a da leitura são a MESMA função: uma versão que passou
 * no painel e depois foi recusada na leitura seria a pior forma de surpresa.
 */
export function motivoParaRecusarTexto(texto: unknown): string | null {
  if (typeof texto !== "string") return "o texto precisa ser uma string";
  const limpo = texto.trim();
  if (limpo.length < TAMANHO_MINIMO) return `o texto tem ${limpo.length} caracteres; o mínimo é ${TAMANHO_MINIMO}`;
  if (limpo.length > TAMANHO_MAXIMO) return `o texto tem ${limpo.length} caracteres; o máximo é ${TAMANHO_MAXIMO}`;
  // O contrato de saída é do código. Instrução que pede JSON está tentando
  // reescrever o contrato por dentro do trecho editorial.
  if (/"\w+"\s*:\s*["[{]/.test(limpo)) return "o texto parece trazer estrutura de JSON; o contrato de saída não é editável";
  return null;
}

/**
 * A instrução vigente de uma etapa, dentro do ciclo em curso.
 *
 * Fora de ciclo, ou com a capacidade fora de `enforce`, devolve o padrão sem
 * tocar em nada: é o que mantém o ciclo das 06:03 byte a byte igual enquanto
 * ninguém ligar a capacidade.
 */
export function instrucaoVigente(etapa: EtapaEditorial, padrao: string): string {
  const atual = contexto.getStore();
  if (!atual || atual.modo !== "enforce") return padrao;
  return atual.instrucoes.get(etapa)?.texto ?? padrao;
}

/**
 * A instrução da etapa para um projeto: a versão ativa, ou o padrão.
 *
 * Só devolve a versão gravada quando o ciclo em curso é DESTE projeto. Um
 * contexto de outro projeto devolvendo o próprio texto seria a voz de uma
 * marca vazando para a outra.
 */
export function instrucaoDaEtapa(projetoId: string, etapa: string, padrao: string): string {
  const atual = contexto.getStore();
  if (!atual || atual.projetoId !== projetoId || !ehEtapaEditorial(etapa)) return padrao;
  return instrucaoVigente(etapa, padrao);
}

/** Qual versão está valendo agora, para o diagnóstico do ciclo. */
export function versoesVigentes(): Record<string, number> {
  const atual = contexto.getStore();
  if (!atual || atual.modo !== "enforce") return {};
  return Object.fromEntries([...atual.instrucoes].map(([etapa, i]) => [etapa, i.versao]));
}

export const TABELA = "instrucoes_editoriais";

type LinhaAtiva = { etapa: string; texto: string; versao: number };

/**
 * As versões ativas do projeto, numa leitura só.
 *
 * Falha de leitura vira mapa VAZIO, e não erro: a instrução do código é
 * publicável por definição, já que é a que vinha rodando. Derrubar o dia porque
 * o banco não respondeu sobre um texto opcional seria trocar um risco pequeno
 * por um dia sem edição, que é a troca que este projeto já pagou caro.
 */
export async function carregarInstrucoesAtivas(
  cliente: Pick<SupabaseClient, "from">,
  projetoId: string,
): Promise<{ instrucoes: Map<string, InstrucaoAtiva>; erro: string | null }> {
  const instrucoes = new Map<string, InstrucaoAtiva>();
  try {
    const { data, error } = await cliente
      .from(TABELA)
      .select("etapa, texto, versao")
      .eq("project_id", projetoId)
      .eq("ativo", true);

    if (error) return { instrucoes, erro: error.message };

    for (const linha of (data ?? []) as LinhaAtiva[]) {
      if (!ehEtapaEditorial(linha.etapa)) continue;
      // Linha que a guarda recusaria não vale, mesmo que alguém a tenha
      // gravado por fora do painel.
      if (motivoParaRecusarTexto(linha.texto)) continue;
      instrucoes.set(linha.etapa, { texto: linha.texto, versao: linha.versao });
    }
    return { instrucoes, erro: null };
  } catch (e) {
    return { instrucoes, erro: e instanceof Error ? e.message : String(e) };
  }
}

export type DependenciasDasInstrucoes = {
  cliente?: () => Pick<SupabaseClient, "from">;
};

/**
 * Monta o contexto de instruções do projeto, sem ainda entrar nele.
 *
 * Em `off`, que é o padrão de todo projeto que não declara a capacidade, nem
 * consulta o banco: a tabela pode nem existir ainda, e o ciclo das 06:03 não
 * ganha leitura nova nenhuma. Em `dry_run` carrega e loga quais versões
 * valeriam, e usa o padrão.
 */
export async function prepararInstrucoesDoProjeto(
  projeto: ProjetoComCapacidades & { id: string },
  deps: DependenciasDasInstrucoes = {},
): Promise<Contexto> {
  const modo = resolverCapacidade("instrucoes", () => "off", projeto);
  if (modo === "off" || !deps.cliente) return { projetoId: projeto.id, modo: "off", instrucoes: new Map() };

  const { instrucoes, erro } = await carregarInstrucoesAtivas(deps.cliente(), projeto.id);
  if (erro) console.warn(`[INSTRUCOES] leitura falhou, valendo o texto do código: ${erro}`);
  const resumo = [...instrucoes].map(([e, i]) => `${e} v${i.versao}`).join(", ") || "nenhuma";
  console.log(`[INSTRUCOES] ${modo}: versões ativas do projeto: ${resumo}`);

  return { projetoId: projeto.id, modo, instrucoes };
}

/**
 * Entra no contexto pelo resto da função assíncrona que chamou.
 *
 * Existe para o ciclo da redação, que é uma função de 1.100 linhas: envolvê-la
 * inteira num `run` seria reindentar o arquivo e garantir conflito com quem
 * mais mexe nele. `enterWith` vale da chamada em diante dentro da MESMA função
 * assíncrona e das que ela aguarda, e não vaza para quem a chamou: o `await`
 * do chamador restaura o contexto dele. Há teste disso.
 */
export function entrarNasInstrucoes(ctx: Contexto): void {
  contexto.enterWith(ctx);
}

/** Roda `fn` com as instruções do projeto valendo. */
export async function comInstrucoesDoProjeto<T>(
  projeto: ProjetoComCapacidades & { id: string },
  fn: () => Promise<T>,
  deps: DependenciasDasInstrucoes = {},
): Promise<T> {
  const ctx = await prepararInstrucoesDoProjeto(projeto, deps);
  return contexto.run(ctx, fn);
}

/**
 * Preenche os marcadores `{{nome}}` de um trecho editorial.
 *
 * Existe para a manchete, cujo texto cita os tetos que a guarda confere. Os
 * números são contrato e vêm do código; o texto em volta é editorial. Marcador
 * desconhecido fica como está, para aparecer no preview em vez de sumir.
 */
export function preencherMarcadores(texto: string, valores: Record<string, string | number>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (inteiro, nome: string) =>
    nome in valores ? String(valores[nome]) : inteiro,
  );
}
