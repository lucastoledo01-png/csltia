import type { AvisoDaPeca, Ramo } from "./contrato";

/**
 * Os avisos da fila em português de gente (06/10/2026).
 *
 * O dono abriu a fila e leu, em caixa vermelha, "AVISO_DO_RAMO: APAGADO
 * pergunta.3: previsao sem lastro". Ao aprovar, a tela perguntou "Esta peça
 * tem aviso de QA. Aprovar assim mesmo?", e ele entendeu Q&A, o bloco de
 * perguntas e respostas, e que aquilo "iria como parte do conteúdo". Era o
 * contrário: a pergunta já tinha sido APAGADA da matéria pela poda, e nada
 * pedia a atenção dele.
 *
 * Por isso cada aviso ganha duas coisas: uma frase curta que diz o que
 * aconteceu, e uma gravidade que diz se há algo a fazer.
 *
 *   resolvido  a máquina já tratou (trecho apagado, assunto descartado,
 *              pauta retirada, texto reescrito). Informação, nada a fazer.
 *   confira    alguém precisa olhar antes de aprovar (risco de fato
 *              inventado, nome que não está na fonte, auditoria que não rodou).
 *
 * O código e o texto original continuam no objeto, para o "detalhes técnicos"
 * do painel. Puro de propósito: o cliente importa este arquivo, e o teste
 * prova cada tradução com o texto que a produção gravou.
 *
 * Os formatos traduzidos aqui saem de `ramos/artigo.ts` (`APAGADO <unidade>:`,
 * `nome não conferido`, `auditoria de conclusões não rodou`, `ASSUNTOS ABAIXO
 * DO MÍNIMO`), de `indexacao-do-artigo.ts` (`ASSUNTO DESCARTADO`), da redação
 * (`pauta retirada`), de `ramos/instagram.ts` (`reparado:`) e de
 * `integracao.ts`/`resumo-do-post.ts` (QA da newsletter e guarda do post).
 * Formato novo sem tradução cai em "confira", com o texto cru: na dúvida, o
 * dono olha, que é o lado seguro.
 */

export type GravidadeDoAviso = "resolvido" | "confira";

export type AvisoLegivel = {
  gravidade: GravidadeDoAviso;
  /** A frase que o dono lê. */
  frase: string;
  /** O código e o texto como foram gravados, para os detalhes técnicos. */
  codigo: string;
  original: string;
};

export type AvisosAgrupados = {
  confira: AvisoLegivel[];
  resolvidos: AvisoLegivel[];
};

/** Qual parte da matéria uma unidade da poda é, com o gênero para a frase concordar. */
function unidadeDaMateria(id: string): { nome: string; feminino: boolean } {
  if (/^pergunta\.\d+$/.test(id)) return { nome: "Uma pergunta do bloco de perguntas e respostas", feminino: true };
  if (/^essencial\.\d+$/.test(id)) return { nome: 'Um tópico de "O que você precisa saber"', feminino: false };
  if (/^abertura\.\d+$/.test(id)) return { nome: "Um parágrafo da abertura", feminino: false };
  if (/^secao\.\d+\.h$/.test(id)) return { nome: "Um intertítulo, com a seção dele", feminino: false };
  if (/^secao\.\d+\.\d+$/.test(id)) return { nome: "Um parágrafo do corpo", feminino: false };
  if (id === "tabela.h") return { nome: "A tabela", feminino: true };
  if (/^tabela\.\d+$/.test(id)) return { nome: "Uma linha da tabela", feminino: true };
  if (/^significado\.\d+$/.test(id)) return { nome: 'Um parágrafo de "O que isso significa"', feminino: false };
  if (id === "subtitulo") return { nome: "A linha fina", feminino: true };
  if (id === "descricao_seo") return { nome: "A descrição de busca", feminino: true };
  return { nome: "Um trecho", feminino: false };
}

/** Os tipos de conclusão do auditor semântico, como o leitor os chama. */
const TIPO_DA_CONCLUSAO: Record<string, string> = {
  previsao: "a previsão",
  previsão: "a previsão",
  impacto: "o efeito descrito",
  consequencia: "a consequência descrita",
  consequência: "a consequência descrita",
  comparacao: "a comparação",
  comparação: "a comparação",
  escopo: "o alcance afirmado",
  causa: "a causa afirmada",
  conclusao: "a conclusão",
  conclusão: "a conclusão",
};

const TIPO_DO_DADO: Record<string, string> = {
  numero: "um número",
  número: "um número",
  data: "uma data",
  nome: "um nome",
  moeda: "um valor",
  percentual: "um percentual",
};

/** Por que a poda apagou a unidade, em uma oração que começa com "porque". */
function razaoDaPoda(motivo: string): string {
  const m = motivo.trim();
  if (/^atribui[cç][aã]o sem lastro/i.test(m)) return "porque atribuía um número a uma fonte que não o traz";
  const dado = /^sem lastro:\s*(\w+)\s+"([^"]+)"/i.exec(m);
  if (dado) {
    const tipo = TIPO_DO_DADO[dado[1].toLowerCase()] ?? "um dado";
    return `porque citava ${tipo} ("${dado[2]}") que a fonte não traz`;
  }
  if (/^sem lastro/i.test(m)) return "porque citava um dado que a fonte não traz";
  const conclusao = /^(\S+) sem lastro/i.exec(m);
  if (conclusao) {
    const tipo = TIPO_DA_CONCLUSAO[conclusao[1].toLowerCase()];
    return tipo ? `porque a fonte não sustenta ${tipo}` : "porque a fonte não sustenta o que ele afirmava";
  }
  if (/^repete o corpo/i.test(m)) return "porque só repetia o que o texto já diz";
  if (/^resposta fora do corpo/i.test(m)) return "porque a resposta não estava no texto da matéria";
  if (/^corpo com \d+ palavras/i.test(m)) return "porque a matéria é curta demais para esse bloco";
  if (/^acima de \d+ t[oó]picos/i.test(m)) return "porque o bloco leva no máximo três tópicos";
  if (/^sobrou menos de/i.test(m)) return "porque sobraram poucos tópicos e o bloco saiu inteiro";
  if (/repete a abertura|abertura/i.test(m)) return "porque repetia a abertura";
  return "por uma regra de conferência";
}

const MOTIVO_DO_ASSUNTO: Record<string, string> = {
  "acima do teto": "passou do limite de assuntos da matéria (até cinco, com no máximo três nomes)",
  genérico: "é palavra genérica demais para virar assunto",
  "fora da lista": "não está na lista fechada de temas do portal",
  repetido: "repetia outro assunto",
};

function citar(termos: string[]): string {
  const q = termos.map((t) => `"${t}"`);
  if (q.length <= 1) return q.join("");
  return `${q.slice(0, -1).join(", ")} e ${q[q.length - 1]}`;
}

/** Traduz UM aviso. A ordem das regras importa: o formato mais específico primeiro. */
export function traduzirAviso(aviso: AvisoDaPeca, ramo?: Ramo): AvisoLegivel {
  const codigo = String(aviso.codigo ?? "");
  const original = String(aviso.detalhe ?? "");
  const d = original.trim();
  const base = { codigo, original };

  switch (codigo) {
    case "RISCO_DE_ALUCINACAO":
      return {
        ...base,
        gravidade: "confira",
        frase: "A revisão automática marcou risco de fato inventado. Confira números e nomes contra a fonte antes de aprovar.",
      };
    case "QA_REPROVOU": {
      const nota = /(\d+)\s*\/\s*100/.exec(d)?.[1];
      return {
        ...base,
        gravidade: "confira",
        frase: nota
          ? `A revisão automática deu nota ${nota} de 100, abaixo do mínimo. Leia com atenção.`
          : "A revisão automática reprovou o texto. Leia com atenção.",
      };
    }
    case "QA_APONTAMENTO":
      return { ...base, gravidade: "confira", frase: `A revisão automática apontou: ${d}` };
    case "SOCIAL_GUARD":
      return { ...base, gravidade: "confira", frase: "A conferência do post não aprovou de primeira. Leia a legenda e a arte com atenção." };
  }

  const apagado = /^APAGADO\s+(\S+):\s*([\s\S]*)$/.exec(d);
  if (apagado) {
    const u = unidadeDaMateria(apagado[1]);
    return {
      ...base,
      gravidade: "resolvido",
      frase: `${u.nome} foi ${u.feminino ? "apagada" : "apagado"} ${razaoDaPoda(apagado[2])}. Já saiu da matéria.`,
    };
  }

  const assunto = /^ASSUNTO DESCARTADO\s+"([^"]*)":\s*(.+)$/.exec(d);
  if (assunto) {
    const motivo = MOTIVO_DO_ASSUNTO[assunto[2].trim()] ?? assunto[2].trim();
    return { ...base, gravidade: "resolvido", frase: `Assunto "${assunto[1]}" descartado: ${motivo}.` };
  }

  const minimo = /^ASSUNTOS ABAIXO DO M[IÍ]NIMO:\s*(\d+)\s+de\s+(\d+)/i.exec(d);
  if (minimo) {
    return {
      ...base,
      gravidade: "resolvido",
      frase: `A matéria ficou com ${minimo[1]} ${minimo[1] === "1" ? "assunto" : "assuntos"}, abaixo do mínimo de ${minimo[2]}: o texto não sustenta mais, e o sistema não inventa.`,
    };
  }

  const nome = /^nome não conferido:\s*"([^"]+)"/.exec(d);
  if (nome) {
    return {
      ...base,
      gravidade: "confira",
      frase: `O nome "${nome[1]}" está no texto e não aparece na fonte. Confira se está certo.`,
    };
  }

  if (/^auditoria de conclus[oõ]es n[aã]o rodou/i.test(d)) {
    return {
      ...base,
      gravidade: "confira",
      frase: "A conferência das conclusões não rodou (falha técnica). Leia as conclusões do texto com atenção.",
    };
  }

  const retirada = /^pauta retirada:\s*"([^"]+)"\s*\(([\s\S]*)\)\s*$/.exec(d);
  if (retirada) {
    const porque = /^impacto:/i.test(retirada[2].trim())
      ? "o efeito sobre o leitor não estava na fonte"
      : retirada[2].trim();
    return { ...base, gravidade: "resolvido", frase: `A pauta "${retirada[1]}" saiu da edição: ${porque}.` };
  }

  const reparado = /^reparado:\s*(.+)$/.exec(d);
  if (reparado) {
    return {
      ...base,
      gravidade: "resolvido",
      frase: `O texto foi reescrito automaticamente para corrigir: ${reparado[1]}.`,
    };
  }

  // Apontamento da guarda do post, que chega com o motivo como código (PAIS_AMBIGUO, por exemplo).
  if (ramo === "post" && codigo && codigo !== "AVISO_DO_RAMO") {
    return { ...base, gravidade: "confira", frase: `A conferência do post apontou: ${d || codigo}.` };
  }

  return { ...base, gravidade: "confira", frase: d || codigo || "Aviso sem descrição." };
}

/**
 * Traduz e agrupa por gravidade, juntando os assuntos descartados pelo mesmo
 * motivo numa frase só: quatro linhas de "acima do teto" dizem uma coisa.
 */
export function agruparAvisos(avisos: readonly AvisoDaPeca[] | null | undefined, ramo?: Ramo): AvisosAgrupados {
  const confira: AvisoLegivel[] = [];
  const resolvidos: AvisoLegivel[] = [];
  const assuntosPorMotivo = new Map<string, { termos: string[]; avisos: AvisoLegivel[] }>();

  for (const bruto of avisos ?? []) {
    const t = traduzirAviso(bruto, ramo);
    const assunto = /^ASSUNTO DESCARTADO\s+"([^"]*)":\s*(.+)$/.exec(t.original.trim());
    if (assunto) {
      const motivo = assunto[2].trim();
      const grupo = assuntosPorMotivo.get(motivo) ?? { termos: [], avisos: [] };
      grupo.termos.push(assunto[1]);
      grupo.avisos.push(t);
      assuntosPorMotivo.set(motivo, grupo);
      continue;
    }
    (t.gravidade === "confira" ? confira : resolvidos).push(t);
  }

  for (const [motivo, g] of assuntosPorMotivo) {
    if (g.avisos.length === 1) {
      resolvidos.push(g.avisos[0]);
      continue;
    }
    const porque = MOTIVO_DO_ASSUNTO[motivo] ?? motivo;
    resolvidos.push({
      gravidade: "resolvido",
      frase: `${g.termos.length} assuntos descartados (${citar(g.termos)}): ${porque}.`,
      codigo: g.avisos[0].codigo,
      original: g.avisos.map((a) => a.original).join("\n"),
    });
  }

  return { confira, resolvidos };
}

/** Quantos avisos pedem o olhar do dono. É isto, e não a contagem total, que pede confirmação ao aprovar. */
export function contarParaConferir(avisos: readonly AvisoDaPeca[] | null | undefined, ramo?: Ramo): number {
  return (avisos ?? []).filter((a) => traduzirAviso(a, ramo).gravidade === "confira").length;
}
