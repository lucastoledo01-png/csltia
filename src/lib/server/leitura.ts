/**
 * Releitura para as consultas que decidem se o dia acontece.
 *
 * Três dias seguidos o ciclo diário morreu nos primeiros sete segundos, sempre
 * numa leitura do Supabase, sempre com `Gateway Timeout`:
 *
 *   13/09  getProjectById          "Projeto ... não encontrado"
 *   14/09  getProjectNewsSources   "Falha ao carregar fontes do projeto"
 *
 * Em 13/09 eu blindei a primeira leitura com uma segunda tentativa, e no dia
 * seguinte o problema andou uma casa. Consertar o caso em vez da classe é o
 * erro que este módulo existe para não repetir: são três leituras no começo do
 * ciclo, cada uma capaz de custar newsletter, artigo e post sozinha.
 *
 * ## Por que releitura é seguro aqui, e não é "esconder falha"
 *
 * Estas são leituras puras. Reler não grava, não cobra, não duplica nada: o
 * único custo é latência. A medição que motivou isto: a PRIMEIRA consulta do
 * dia leva 2,2s e as seguintes 0,6s. Às 09:03 o banco está há dez horas sem
 * tráfego, e a conexão fria é o que estoura o gateway.
 *
 * Indisponibilidade real continua derrubando o dia, porque as tentativas
 * acabam e o erro sobe com o motivo. O que muda é que soluço de rede deixa de
 * ter o mesmo efeito que banco fora do ar.
 */

/**
 * Falha de INFRAESTRUTURA numa leitura.
 *
 * Separada de propósito do resultado vazio. Os dois casos pedem reações
 * opostas: ausência é configuração e ninguém deve insistir; falha de leitura é
 * infraestrutura e insistir resolve. Colapsar os dois num `null` foi o que
 * custou 13/09 e mandou procurar o defeito na configuração, que estava certa.
 */
export class LeituraFalhou extends Error {}

export type OpcoesDaReleitura = {
  /** Total de tentativas, contando a primeira. */
  tentativas?: number;
  /** Pausa antes de cada nova tentativa. Cresce a cada rodada. */
  pausaBaseMs?: number;
  /** Injetável para o teste não esperar de verdade. */
  dormir?: (ms: number) => Promise<void>;
};

const PADRAO = { tentativas: 3, pausaBaseMs: 1200 };

export async function comRetentativa<T>(
  descricao: string,
  ler: () => Promise<T>,
  opcoes: OpcoesDaReleitura = {},
): Promise<T> {
  const tentativas = Math.max(1, opcoes.tentativas ?? PADRAO.tentativas);
  const pausaBase = opcoes.pausaBaseMs ?? PADRAO.pausaBaseMs;
  const dormir = opcoes.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let ultima: unknown;

  for (let i = 1; i <= tentativas; i += 1) {
    try {
      return await ler();
    } catch (erro) {
      /*
       * Só falha de leitura é relida.
       *
       * Erro de regra ("o projeto não tem fonte habilitada") e erro de
       * programação não melhoram com insistência: a resposta seria a mesma, e
       * repetir só atrasaria o alerta de algo que precisa de ação humana.
       */
      if (!(erro instanceof LeituraFalhou)) throw erro;

      ultima = erro;
      if (i === tentativas) break;

      const pausa = pausaBase * i;
      console.warn(
        `[LEITURA] ${descricao} falhou na tentativa ${i} de ${tentativas}: ${(erro as Error).message}. ` +
          `Relendo em ${pausa}ms.`,
      );
      await dormir(pausa);
    }
  }

  throw ultima;
}
