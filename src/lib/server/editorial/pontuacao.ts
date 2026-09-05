import type { Classificacao } from "./classificador";
import type { ConfigEditorial } from "./config";

/**
 * Nota da pauta.
 *
 * O ranker anterior somava ocorrência de palavra: "model", "gpt", "claude",
 * "gemini", "benchmark", "open source". Numa publicação de imigração nenhuma
 * pauta contém essas palavras, então todas empatavam no mesmo piso e a
 * seleção virava, na prática, a ordem em que o feed devolveu. Trocar a lista
 * de palavras por outra lista repetiria o problema na próxima virada de
 * vertical.
 *
 * As quatro dimensões aqui não dependem do assunto:
 *
 *   relevância   o quanto o fato muda o plano do leitor, dita pelo classificador
 *   ineditismo   distância do que já publicamos
 *   credibilidade quem contou, e se mais de um contou
 *   frescor      quando aconteceu
 *
 * Trocar a vertical não pede tocar neste arquivo. Pede trocar o briefing do
 * classificador, que é onde o assunto mora.
 */

export type EntradaDePontuacao = {
  classificacao: Classificacao;
  /** 1 = fonte de primeira linha. */
  prioridadeDaFonte: 1 | 2;
  quantasFontesConfirmam: number;
  publicadoEm: string;
  /** Maior semelhança encontrada contra o histórico, de 0 a 1. */
  semelhancaComHistorico: number;
};

export type Pontuacao = {
  total: number;
  partes: {
    relevancia: number;
    ineditismo: number;
    credibilidade: number;
    frescor: number;
  };
  explicacao: string;
};

const PESO = { relevancia: 40, ineditismo: 20, credibilidade: 20, frescor: 20 };

export function pontuarPauta(entrada: EntradaDePontuacao): Pontuacao {
  const relevancia = (Math.max(0, Math.min(10, entrada.classificacao.relevancia)) / 10) * PESO.relevancia;

  // Semelhança alta que ainda não bateu o limiar de rejeição não é motivo para
  // descartar, mas é motivo para ficar atrás de uma pauta realmente inédita.
  const distancia = 1 - Math.max(0, Math.min(1, entrada.semelhancaComHistorico));
  const ineditismo = distancia * PESO.ineditismo;

  let credibilidade = entrada.prioridadeDaFonte === 1 ? 14 : 9;
  // Dois veículos contando o mesmo fato é o sinal mais barato de que o fato
  // existe. Vale mais do que a reputação de um só.
  if (entrada.quantasFontesConfirmam >= 2) credibilidade += 6;
  else if (entrada.quantasFontesConfirmam === 1) credibilidade += 3;
  credibilidade = Math.min(PESO.credibilidade, credibilidade);

  const horas = idadeEmHoras(entrada.publicadoEm);
  let frescor = PESO.frescor;
  if (horas > 12) frescor = 16;
  if (horas > 24) frescor = 11;
  if (horas > 48) frescor = 5;
  if (horas > 96) frescor = 0;

  const partes = {
    relevancia: Math.round(relevancia),
    ineditismo: Math.round(ineditismo),
    credibilidade: Math.round(credibilidade),
    frescor,
  };
  const total = partes.relevancia + partes.ineditismo + partes.credibilidade + partes.frescor;

  return {
    total,
    partes,
    explicacao:
      `${total} = rel ${partes.relevancia} + ined ${partes.ineditismo} + ` +
      `cred ${partes.credibilidade} + fresc ${partes.frescor}`,
  };
}

function idadeEmHoras(publicadoEm: string): number {
  const t = new Date(publicadoEm).getTime();
  if (!Number.isFinite(t)) return 0;
  return (Date.now() - t) / (1000 * 60 * 60);
}

export type PautaOrdenavel<T> = {
  item: T;
  pontuacao: Pontuacao;
  classificacao: Classificacao;
  dominio: string;
};

/**
 * Ordena e limita a repetição de ator e de veículo dentro da mesma edição.
 *
 * Sem isso, um dia movimentado no USCIS vira uma edição inteira sobre o USCIS.
 * O limite é por ator principal e por domínio, não por assunto: assunto
 * parecido já foi tratado pela camada de repetição.
 */
export function ordenarESelecionar<T>(
  pautas: Array<PautaOrdenavel<T>>,
  config: ConfigEditorial,
  maximoPorAtor = 2,
  maximoPorDominio = 2
): Array<PautaOrdenavel<T>> {
  const ordenadas = [...pautas].sort((a, b) => b.pontuacao.total - a.pontuacao.total);

  const porAtor: Record<string, number> = {};
  const porDominio: Record<string, number> = {};
  const escolhidas: Array<PautaOrdenavel<T>> = [];

  for (const p of ordenadas) {
    if (escolhidas.length >= config.maximoDePautas) break;

    const ator = (p.classificacao.atores[0] || "").toLowerCase();
    const dominio = p.dominio.toLowerCase();

    if (ator && (porAtor[ator] ?? 0) >= maximoPorAtor) continue;
    if (dominio && (porDominio[dominio] ?? 0) >= maximoPorDominio) continue;

    if (ator) porAtor[ator] = (porAtor[ator] ?? 0) + 1;
    if (dominio) porDominio[dominio] = (porDominio[dominio] ?? 0) + 1;
    escolhidas.push(p);
  }

  return escolhidas;
}

/**
 * A edição fecha com o que tem?
 *
 * O pipeline exigia 4 pautas e quebrava com 3. Exigir número fixo depois de um
 * filtro editorial é garantir que, num dia de pauta ruim, ou a edição não sai
 * ou o filtro é ignorado. O mínimo passa a ser 2, e a edição sai menor.
 */
export function edicaoViavel(
  quantas: number,
  config: ConfigEditorial
): { viavel: boolean; motivo: string } {
  if (quantas < config.minimoDePautas) {
    return {
      viavel: false,
      motivo: `${quantas} pauta(s) aprovada(s), mínimo ${config.minimoDePautas}`,
    };
  }
  return { viavel: true, motivo: `${quantas} pauta(s), dentro de ${config.minimoDePautas} a ${config.maximoDePautas}` };
}
