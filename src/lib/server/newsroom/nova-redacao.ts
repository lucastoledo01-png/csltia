import type { RankedCandidate } from "./ranker";

/**
 * A edição barrada pelo QA ganha redação nova antes de o dia ficar sem
 * newsletter (06/10/2026).
 *
 * ## O caso
 *
 * Na produção das 17:00 de 06/10/2026 a edição de 07/10 foi barrada com QA 94:
 * o título de uma matéria dizia que o padrão aberto para agentes de IA foi
 * criado "nos EUA", e o pacote não localizava o padrão; outra chamava de
 * "estaleiro de submarinos" uma fábrica de componentes. O laço de reparo de
 * `runNewsroomPipeline` gastou as duas tentativas reescrevendo "somente o
 * necessário" e o auditor manteve o risco. Posts e matérias do dia já estavam
 * na fila; só a newsletter não existiu.
 *
 * ## O que muda, e o que NÃO muda
 *
 * O portão não muda: o resultado de cada tentativa passa pelas MESMAS
 * conferências (ancoragem, conclusões, auditor), e só sai a edição que passou
 * nelas. O que muda é que, barrada, a edição é escrita DE NOVO, do zero, em
 * vez de o dia acabar. O reparo reescreve pouco e repete a frase; uma redação
 * nova é outro sorteio do mesmo modelo sobre o mesmo pacote.
 *
 * Quando o auditor aponta a matéria do problema (pelo título entre aspas, por
 * um trecho que só aparece nela, ou por "a segunda matéria"), ela sai da
 * próxima redação, se a edição continuar com o mínimo de pautas. É a regra de
 * 16/09 ("uma pauta ruim não derruba a edição") aplicada ao risco de
 * alucinação, que até aqui ficava de fora por não apontar matéria.
 *
 * Quem apontou UMA matéria tira essa matéria já na tentativa seguinte. Quem
 * apontou várias tira todas só na última, porque a lista do auditor mistura o
 * que é alucinação com o que é imprecisão, e cortar três matérias por uma
 * frase seria um preço alto demais para a primeira tentativa.
 */

/** Redações novas depois da primeira, por edição. Cada uma custa uma redação inteira (cerca de US$ 0,40). */
export const TENTATIVAS_EXTRAS_DA_EDICAO = 2;

/** Espera antes da tentativa `n` (1, 2...): instabilidade do fornecedor costuma passar em segundos. */
export function esperaDaTentativa(n: number): number {
  return 15_000 * n;
}

/** O que esta camada precisa do resultado da redação. */
export type ResultadoRedigivel = {
  aprovado: boolean;
  bloqueios: string[];
  qaResult: { score: number; hallucination_risk: boolean; issues: string[] };
  /** As pautas como o auditor as leu, na ordem dele, antes de qualquer retirada. */
  pautasAuditadas?: Array<{ url: string; titulo: string; texto: string }>;
  custosPorEtapa: { redacao: number; auditoria_qa: number; auditoria_claims: number };
  totalUsage: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUsd: number };
};

export type TentativaDaEdicao = {
  tentativa: number;
  aprovado: boolean;
  bloqueios: string[];
  score: number;
  /** Títulos das matérias que o auditor apontou nesta tentativa. */
  apontadas: string[];
  /** URLs retiradas ANTES desta tentativa. */
  retiradasAntes: string[];
};

export type EdicaoComNovasTentativas<R> = {
  resultado: R;
  tentativas: TentativaDaEdicao[];
  /** As pautas que saíram por terem sido apontadas, por título. */
  retiradas: string[];
};

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const ORDINAIS: Record<string, number> = {
  primeir: 0,
  segund: 1,
  terceir: 2,
  quart: 3,
  quint: 4,
  sext: 5,
};

const SUBSTANTIVOS = "(?:materia|pauta|historia|noticia|story|item)";

/**
 * As matérias que os apontamentos do auditor nomeiam, por índice.
 *
 * Três formas de apontar, e só elas, porque são as que não deixam dúvida:
 * o ordinal ("o título da segunda matéria", "pauta 3"), o título da matéria
 * citado inteiro, e um trecho entre aspas que aparece no texto de UMA matéria
 * só ("estaleiro de submarinos"). Trecho que aparece em duas não aponta
 * ninguém: a dúvida fica com a edição inteira, que é como era.
 */
export function pautasApontadas(
  issues: readonly string[],
  pautas: ReadonlyArray<{ titulo: string; texto: string }>,
): number[] {
  const textos = pautas.map((p) => normalizar(`${p.titulo} ${p.texto}`));
  const titulos = pautas.map((p) => normalizar(p.titulo));
  const apontadas = new Set<number>();

  for (const bruto of issues) {
    const issue = normalizar(bruto);

    for (const [radical, indice] of Object.entries(ORDINAIS)) {
      if (new RegExp(`\\b${radical}[ao]s? ${SUBSTANTIVOS}\\b`).test(issue) && indice < pautas.length) {
        apontadas.add(indice);
      }
    }
    for (const m of issue.matchAll(new RegExp(`\\b${SUBSTANTIVOS} (\\d)\\b`, "g"))) {
      const indice = Number(m[1]) - 1;
      if (indice >= 0 && indice < pautas.length) apontadas.add(indice);
    }

    titulos.forEach((t, i) => {
      if (t.split(" ").length >= 4 && issue.includes(t)) apontadas.add(i);
    });

    for (const m of bruto.matchAll(/["'“”‘’«»]([^"'“”‘’«»]{8,200})["'“”‘’«»]/g)) {
      const trecho = normalizar(m[1]);
      const onde = textos.map((t, i) => (t.includes(trecho) ? i : -1)).filter((i) => i >= 0);
      if (onde.length === 1) apontadas.add(onde[0]);
    }
  }

  return [...apontadas].sort((a, b) => a - b);
}

/**
 * Escreve a edição, e escreve de novo enquanto ela for barrada.
 *
 * `redigir` é `runNewsroomPipeline` com tudo fixado menos a lista de pautas.
 * O custo das tentativas é SOMADO no resultado final, para o livro do dia não
 * esconder o que a nova redação gastou. A decisão de publicar continua sendo
 * `resultado.aprovado`, que vem das conferências da última tentativa.
 */
export async function redigirComNovasTentativas<R extends ResultadoRedigivel>(
  ranked: RankedCandidate[],
  redigir: (lista: RankedCandidate[]) => Promise<R>,
  opcoes: {
    minimo: number;
    tentativasExtras?: number;
    dormir?: (ms: number) => Promise<void>;
    log?: (linha: string) => void;
  },
): Promise<EdicaoComNovasTentativas<R>> {
  const extras = Math.max(0, opcoes.tentativasExtras ?? TENTATIVAS_EXTRAS_DA_EDICAO);
  const dormir = opcoes.dormir ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  const log = opcoes.log ?? ((l: string) => console.warn(l));
  const piso = Math.max(opcoes.minimo, 2);

  let lista = ranked;
  const retiradasUrls: string[] = [];
  const retiradas: string[] = [];
  const tentativas: TentativaDaEdicao[] = [];
  const custos = { redacao: 0, auditoria_qa: 0, auditoria_claims: 0 };
  const uso = { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };

  for (let n = 0; ; n++) {
    const antes = [...retiradasUrls];
    const r = await redigir(lista);
    custos.redacao += r.custosPorEtapa.redacao;
    custos.auditoria_qa += r.custosPorEtapa.auditoria_qa;
    custos.auditoria_claims += r.custosPorEtapa.auditoria_claims;
    uso.promptTokens += r.totalUsage.promptTokens;
    uso.completionTokens += r.totalUsage.completionTokens;
    uso.totalTokens += r.totalUsage.totalTokens;
    uso.estimatedCostUsd += r.totalUsage.estimatedCostUsd;

    const auditadas = r.pautasAuditadas ?? [];
    const indices = r.aprovado ? [] : pautasApontadas(r.qaResult.issues ?? [], auditadas);
    tentativas.push({
      tentativa: n + 1,
      aprovado: r.aprovado,
      bloqueios: r.bloqueios,
      score: r.qaResult.score,
      apontadas: indices.map((i) => auditadas[i]?.titulo ?? `#${i + 1}`),
      retiradasAntes: antes,
    });

    if (r.aprovado || n >= extras) {
      // O custo e o uso passam a ser os de TODAS as tentativas.
      r.custosPorEtapa = custos;
      r.totalUsage = uso;
      return { resultado: r, tentativas, retiradas };
    }

    const ultima = n + 1 === extras;
    const sairao = indices.length === 1 || (ultima && indices.length > 1) ? indices : [];
    const urls = new Set(sairao.map((i) => auditadas[i]?.url).filter((u): u is string => Boolean(u)));
    const restante = lista.filter((c) => !urls.has(c.group.primary.url));

    const retira = urls.size > 0 && restante.length >= piso && restante.length < lista.length;
    if (retira) {
      for (const i of sairao) {
        if (auditadas[i]) {
          retiradas.push(auditadas[i].titulo);
          retiradasUrls.push(auditadas[i].url);
        }
      }
      lista = restante;
    }

    const espera = esperaDaTentativa(n + 1);
    const sobreAsPautas = retira
      ? `, sem: ${sairao.map((i) => `"${auditadas[i]?.titulo}"`).join(", ")}`
      : indices.length > 0
        ? ` (o auditor apontou ${indices.length} matéria(s), e a edição segue com todas)`
        : "";
    log(
      `[NEWSROOM] edição barrada (${r.bloqueios.join(" | ")}, QA ${r.qaResult.score}). ` +
        `Redação nova ${n + 2} de ${extras + 1} em ${Math.round(espera / 1000)}s${sobreAsPautas}.`,
    );
    await dormir(espera);
  }
}
