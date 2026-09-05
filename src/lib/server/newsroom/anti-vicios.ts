/**
 * Remove os sinais que denunciam texto de IA, depois da geração.
 *
 * O prompt já pede. Isto garante. É a mesma divisão de sempre neste projeto:
 * pedido reduz a frequência, código fecha o caminho. E aqui a diferença
 * importa, porque o travessão é o tell mais visível de todos. Uma edição
 * inteira bem escrita perde credibilidade em uma frase que abre com traço
 * longo.
 *
 * O que este módulo NÃO faz: reescrever. Estrutura como "não é X, é Y" exige
 * refazer a frase, e uma substituição automática produziria texto pior que o
 * original. Isso fica com o prompt e com a revisão humana.
 */

/**
 * Traço longo (—) e médio (–) viram pontuação de gente.
 *
 * A escolha entre vírgula e ponto não é arbitrária: travessão em português
 * costuma fazer um de dois papéis, e cada um pede uma pontuação diferente.
 *
 * - Par de travessões cercando um trecho: é aposto, vira vírgula.
 * - Travessão solto no meio da frase: é pausa forte, vira vírgula também, que
 *   preserva a leitura sem cortar o período em dois pedaços truncados.
 *
 * Cortar em ponto seria mais "limpo" e produziria frases órfãs começando com
 * minúscula. Vírgula erra menos.
 */
export function semTravessao(texto: string): string {
  if (!texto) return texto;

  return (
    texto
      // Travessão com espaço dos dois lados: pausa. Vira vírgula.
      .replace(/\s+[—–]\s+/g, ", ")
      // Colado na palavra (intervalo, "2020—2024"): vira hífen.
      .replace(/(\S)[—–](\S)/g, "$1-$2")
      // Sobras nas pontas.
      .replace(/^[—–]\s*/gm, "")
      .replace(/\s*[—–]$/gm, "")
      .replace(/[—–]/g, "-")
      // A troca pode gerar ", ," ou " ,". Limpa.
      .replace(/,\s*,/g, ",")
      .replace(/\s+,/g, ",")
      .replace(/,\s*\./g, ".")
      // E pode gerar ".," quando o travessão vinha logo depois de um ponto,
      // que é o caso da assinatura: "Até amanhã. — imigra.us" virava
      // "Até amanhã., imigra.us" e ia assim para a caixa de entrada.
      .replace(/\.\s*,\s*/g, ". ")
  );
}

/** Percorre um objeto aplicando a limpeza em toda string. */
export function limparVicios<T>(valor: T): T {
  if (typeof valor === "string") return semTravessao(valor) as unknown as T;

  if (Array.isArray(valor)) {
    return valor.map((v) => limparVicios(v)) as unknown as T;
  }

  if (valor && typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      saida[k] = limparVicios(v);
    }
    return saida as T;
  }

  return valor;
}
