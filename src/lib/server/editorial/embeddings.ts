import { getOpenAIKey } from "../env";

/**
 * Comparação semântica de pautas.
 *
 * Título parecido pega manchete reescrita. Não pega o caso que mais aparece
 * aqui: dois veículos contando o mesmo fato com palavras completamente
 * diferentes ("USCIS amplia prazo do EAD" e "Renovação automática de permissão
 * de trabalho vai a 540 dias"). Jaccard dá zero nesse par. Embedding não.
 *
 * ## Por que não pgvector agora
 *
 * O volume é de poucas dezenas de pautas por janela de 30 dias. Trazer os
 * vetores e comparar em memória custa uma consulta e alguns milissegundos, e
 * evita instalar extensão, criar índice ivfflat e ter que reconstruí-lo.
 *
 * O acoplamento fica todo em `RepositorioDeVetores`: quem procura vizinho não
 * sabe se a busca aconteceu em JS ou no banco. Migrar para pgvector é trocar a
 * implementação dessa interface e mover a coluna `embedding` de jsonb para
 * vector, sem tocar em quem chama.
 */

/** Vetor unitário. O gerador já normaliza, então cosseno vira produto interno. */
export type Vetor = number[];

export type ProvedorDeEmbedding = {
  modelo: string;
  gerar(textos: string[]): Promise<Vetor[]>;
};

const MODELO_PADRAO = "text-embedding-3-small";
const TEMPO_LIMITE_MS = 60_000;
/** A API aceita mais, mas lote grande demais estoura o limite de tokens. */
const TAMANHO_DO_LOTE = 64;

type RespostaOpenAI = {
  data: Array<{ index: number; embedding: number[] }>;
};

export function normalizar(v: Vetor): Vetor {
  let soma = 0;
  for (const x of v) soma += x * x;
  const norma = Math.sqrt(soma);
  if (norma === 0) return v.slice();
  return v.map((x) => x / norma);
}

/**
 * Cosseno entre dois vetores.
 *
 * Devolve 0 quando os tamanhos divergem em vez de calcular com o menor dos
 * dois. Tamanho diferente significa modelo diferente, e comparar vetor de
 * modelos diferentes produz um número que parece válido e não quer dizer nada.
 */
export function cosseno(a: Vetor, b: Vetor): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let produto = 0;
  let normaA = 0;
  let normaB = 0;
  for (let i = 0; i < a.length; i += 1) {
    produto += a[i] * b[i];
    normaA += a[i] * a[i];
    normaB += b[i] * b[i];
  }
  if (normaA === 0 || normaB === 0) return 0;
  return produto / (Math.sqrt(normaA) * Math.sqrt(normaB));
}

/** Texto que representa a pauta para o modelo. Título e resumo, nesta ordem. */
export function textoParaVetor(titulo: string, resumo = ""): string {
  return [titulo.trim(), resumo.trim()].filter(Boolean).join(". ").slice(0, 2000);
}

export function criarProvedorOpenAI(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): ProvedorDeEmbedding {
  const modelo = env.OPENAI_MODEL_EMBEDDING || MODELO_PADRAO;

  return {
    modelo,
    async gerar(textos: string[]): Promise<Vetor[]> {
      if (textos.length === 0) return [];
      const apiKey = getOpenAIKey(env);
      const saida: Vetor[] = [];

      for (let i = 0; i < textos.length; i += TAMANHO_DO_LOTE) {
        const lote = textos.slice(i, i + TAMANHO_DO_LOTE);
        const resposta = await fetcher("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: modelo, input: lote }),
          signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        });

        if (!resposta.ok) {
          const erro = await resposta.text().catch(() => "");
          throw new Error(`OpenAI embeddings (${resposta.status}): ${erro}`);
        }

        const json = (await resposta.json()) as RespostaOpenAI;
        const ordenado = [...(json.data ?? [])].sort((a, b) => a.index - b.index);
        if (ordenado.length !== lote.length) {
          throw new Error(
            `OpenAI devolveu ${ordenado.length} vetores para ${lote.length} textos.`
          );
        }
        for (const item of ordenado) saida.push(normalizar(item.embedding));
      }

      return saida;
    },
  };
}

export type VetorConhecido<T> = {
  vetor: Vetor;
  registro: T;
};

export type Vizinho<T> = {
  registro: T;
  score: number;
};

export type RepositorioDeVetores<T> = {
  /** O mais parecido acima do limiar, ou null. O score sempre volta no log. */
  vizinhoMaisProximo(vetor: Vetor, limiar: number): Promise<Vizinho<T> | null>;
};

/**
 * Busca linear sobre vetores já carregados.
 *
 * É o suficiente enquanto o histórico cabe numa consulta. Quando não couber,
 * outra implementação de `RepositorioDeVetores` faz a busca no banco.
 */
export function repositorioEmMemoria<T>(
  conhecidos: Array<VetorConhecido<T>>
): RepositorioDeVetores<T> {
  return {
    async vizinhoMaisProximo(vetor: Vetor, limiar: number): Promise<Vizinho<T> | null> {
      let melhor: Vizinho<T> | null = null;
      for (const item of conhecidos) {
        const score = cosseno(vetor, item.vetor);
        if (score >= limiar && (melhor === null || score > melhor.score)) {
          melhor = { registro: item.registro, score };
        }
      }
      return melhor;
    },
  };
}

/** Score do par mais próximo, mesmo abaixo do limiar. Serve para calibrar. */
export function melhorScore<T>(vetor: Vetor, conhecidos: Array<VetorConhecido<T>>): number {
  let melhor = 0;
  for (const item of conhecidos) {
    const score = cosseno(vetor, item.vetor);
    if (score > melhor) melhor = score;
  }
  return melhor;
}
