/**
 * A instrução de uma etapa do pipeline, por projeto.
 *
 * Existe como função, e não como constante importada, por causa de uma
 * mudança que está sendo feita em paralelo (05/10/2026): as instruções de cada
 * etapa vão morar no banco, versionadas e editáveis pelo painel. Quem escreve
 * um prompt chama ESTA função com o texto padrão, e quem construir a leitura
 * do banco troca só o corpo daqui. Nenhum chamador precisa mudar.
 *
 * Hoje ela devolve `padrao` e nada mais. Isso é o contrato, não um atalho:
 * sem instrução gravada para a etapa, vale o texto do código, exatamente como
 * antes de o banco existir. Quando a leitura entrar, a regra continua a mesma
 * para a etapa que não tiver versão publicada.
 *
 * Assíncrona desde já para a troca não mudar a assinatura.
 */
export async function instrucaoDaEtapa(
  projetoId: string,
  etapa: string,
  padrao: string,
): Promise<string> {
  void projetoId;
  void etapa;
  return padrao;
}
