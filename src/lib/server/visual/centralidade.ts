import type { EntidadeVisual } from "./tipos";
import { normalizarEntidade } from "./tipos";

/**
 * O quanto a entidade é o assunto da matéria, e não só um nome citado nela.
 *
 * Dois erros reais motivaram isto. Na pauta do dólar, o Datafolha venceu por
 * ser uma instituição bem documentada, embora só aparecesse no corpo como
 * causa do movimento. Na pauta "A crise institucional que alcançou STF, PF e
 * Congresso", o Palácio do Planalto venceu pelo mesmo motivo, embora o título
 * aponte para outras três.
 *
 * A régua não é correspondência textual com o título, é CENTRALIDADE:
 *
 *   100  citada no título
 *    60  primeira da lista de atores da classificação
 *    20  citada em algum lugar do texto
 *     0  não aparece
 *
 * O agente do fato entra pela ordem dos atores, e não pela posição na frase.
 * Tentei medir posição e ela não separa os dois casos: em "Uma juíza federal,
 * Deborah Boardman, suspendeu a ordem" e em "Ministros divergiram e o Palácio
 * do Planalto acompanhou", a entidade está na mesma altura da frase, e só uma
 * delas é o agente. Quem já leu o texto e sabe disso é o classificador, que
 * lista primeiro quem participa do fato.
 */

export const CENTRALIDADE = {
  TITULO: 100,
  ATOR_PRINCIPAL: 60,
  CITADA: 20,
  AUSENTE: 0,
} as const;

/** Abaixo disto, a entidade é contexto e não vira o rosto da matéria. */
export const CENTRALIDADE_MINIMA = 50;

export type ContextoDaPauta = {
  titulo: string;
  resumo: string;
  atores: string[];
};

function contem(texto: string, nome: string): boolean {
  const alvo = normalizarEntidade(texto);
  const chave = normalizarEntidade(nome);
  if (!alvo || !chave) return false;
  if (alvo.includes(chave)) return true;

  // Wikidata devolve nome longo ("Serviço de Imigração e Controle de Aduanas
  // dos Estados Unidos da América") onde o texto traz a sigla ou parte dele.
  // A sigla do nome longo. "Supremo Tribunal Federal" vira STF, e é assim que
  // o título escreve. Sem isto, a entidade do título não é reconhecida como
  // sendo do título, que foi como o Congresso venceu STF e PF numa manchete
  // que citava os três.
  const sigla = chave
    .split(" ")
    .filter((p) => p.length > 2 && !["dos", "das", "com", "por"].includes(p))
    .map((p) => p[0])
    .join("");
  if (sigla.length >= 2 && new RegExp(`\\b${sigla}\\b`).test(alvo)) return true;

  const palavras = chave.split(" ").filter((p) => p.length > 4);
  if (palavras.length === 0) return false;
  const casadas = palavras.filter((p) => alvo.includes(p)).length;
  return casadas / palavras.length >= 0.5;
}

export type NotaDeCentralidade = {
  valor: number;
  motivo: string;
};

export function centralidadeDaEntidade(
  entidade: EntidadeVisual,
  contexto: ContextoDaPauta
): NotaDeCentralidade {
  if (contem(contexto.titulo, entidade.nome)) {
    return { valor: CENTRALIDADE.TITULO, motivo: "citada no título" };
  }

  if (contexto.atores.length > 0 && contem(contexto.atores[0], entidade.nome)) {
    return { valor: CENTRALIDADE.ATOR_PRINCIPAL, motivo: "ator principal da classificação" };
  }

  if (contem(contexto.resumo, entidade.nome)) {
    return { valor: CENTRALIDADE.CITADA, motivo: "citada no corpo do texto" };
  }

  return { valor: CENTRALIDADE.AUSENTE, motivo: "não aparece no título nem no texto" };
}

export type EscolhaPorCentralidade = {
  escolhida: EntidadeVisual | null;
  nota: NotaDeCentralidade | null;
  /** Empate no topo entre entidades diferentes, sem nada que desempate. */
  ambigua: boolean;
  detalhe: string;
};

/**
 * A entidade mais central, ou a admissão de que não há uma.
 *
 * Empate no topo é ambiguidade de verdade: "Crise institucional alcança STF,
 * PF e Congresso" tem três donos e nenhum é O dono. Escolher um dos três seria
 * arbitrário, e escolher uma quarta entidade do corpo seria pior. A matéria
 * sai sem foto.
 */
export function escolherPorCentralidade(
  candidatas: EntidadeVisual[],
  contexto: ContextoDaPauta
): EscolhaPorCentralidade {
  if (candidatas.length === 0) {
    return { escolhida: null, nota: null, ambigua: false, detalhe: "nenhuma entidade resolvida" };
  }

  const comNota = candidatas
    .map((e) => ({ e, nota: centralidadeDaEntidade(e, contexto) }))
    .sort((a, b) => b.nota.valor - a.nota.valor);

  const topo = comNota[0];

  if (topo.nota.valor < CENTRALIDADE_MINIMA) {
    return {
      escolhida: null,
      nota: topo.nota,
      ambigua: false,
      detalhe:
        `a melhor candidata é "${topo.e.nome}" e ela ${topo.nota.motivo}; ` +
        "entidade de contexto não vira o rosto da matéria",
    };
  }

  const empatadas = comNota.filter((c) => c.nota.valor === topo.nota.valor);
  if (empatadas.length > 1) {
    return {
      escolhida: null,
      nota: topo.nota,
      ambigua: true,
      detalhe:
        `${empatadas.length} entidades igualmente centrais (${empatadas
          .map((c) => c.e.nome)
          .join(", ")}), e nenhuma domina`,
    };
  }

  return {
    escolhida: topo.e,
    nota: topo.nota,
    ambigua: false,
    detalhe: `${topo.e.nome}: ${topo.nota.motivo}`,
  };
}
