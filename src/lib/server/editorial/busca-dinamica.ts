/**
 * As buscas que o dia cria, e que não estão cadastradas em lugar nenhum.
 *
 * As 32 fontes do banco são fixas: elas respondem "o que estas publicações
 * publicaram?". Isso deixa dois buracos, e os dois são de tempo.
 *
 * O primeiro é o FUTURO. Black Friday é daqui a três semanas e nenhuma fonte
 * escreveu sobre ela ainda; quando escreverem, faltarão dois dias e a pauta
 * boa já terá passado. Quem sabe a data é o calendário, e ele sabe hoje.
 *
 * O segundo é o AGORA. O assunto do país pode não estar em nenhuma das 32,
 * porque elas publicam no ritmo delas. Quem sabe o que está sendo procurado é
 * a tendência.
 *
 * Nos dois casos a saída é a mesma: virar uma fonte de busca por termo, com a
 * mesma forma das fontes cadastradas, para atravessar a mesma coleta, a mesma
 * deduplicação, a mesma classificação e a mesma guarda. Nada aqui publica
 * nada. Isto só abre a porta; quem decide continua sendo a linha editorial.
 */

import type { NewsSourceConfig } from "../newsroom/news-sources";
import { agenda, type DataNaAgenda } from "./calendario";
import type { TendenciaTriada } from "./tendencias";

export type OrigemDaBusca = "calendario" | "tendencia";

/**
 * Uma fonte de busca no Google News.
 *
 * Prioridade 2 sempre, e isto é regra: agregador não tem a credibilidade de
 * uma fonte primária, e uma pauta que chegou por busca não pode entrar na
 * edição com o mesmo peso de um comunicado do Federal Reserve. A janela de 24h
 * que `janelaDaFonte` aplica a news.google.com também vale, e é o que se quer:
 * busca é sobre o que é de agora.
 */
export function fonteDeBusca(
  consulta: string,
  idioma: "en" | "pt",
  origem: OrigemDaBusca,
  identificador: string,
): NewsSourceConfig {
  const parametros =
    idioma === "en" ? "hl=en-US&gl=US&ceid=US:en" : "hl=pt-BR&gl=BR&ceid=BR:pt-419";

  /*
   * `when:1d` no fim da consulta, e não é economia de banda.
   *
   * O coletor já corta em 24h tudo que vem de news.google.com, então sem o
   * operador a busca baixa cem itens para o filtro descartar noventa. Com ele,
   * o próprio Google devolve só o que é do dia, e o que chega já é o que vale.
   * Medido: uma busca sem filtro devolveu 100 itens, com filtro devolveu 48, e
   * os 48 eram os únicos que sobreviveriam à janela.
   */
  const comJanela = `${consulta} when:1d`;

  return {
    id: `busca-${origem}-${identificador}`,
    name: `Busca ${origem === "calendario" ? "de calendário" : "de tendência"}: ${consulta}`,
    type: "rss",
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(comJanela)}&${parametros}`,
    enabled: true,
    priority: 2,
    category: idioma === "en" ? "us_media" : "br_media",
    region: idioma === "en" ? "global" : "br",
  };
}

/** Só letras, números e hífen, para o id não depender do texto da consulta. */
function apelido(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export type LimitesDaBuscaDinamica = {
  /** Quantas datas do calendário viram busca hoje. */
  doCalendario: number;
  /** Quantas tendências viram busca hoje. */
  deTendencia: number;
};

/**
 * O teto existe por causa do custo, e o número não é chute.
 *
 * Cada busca traz até uma dezena de candidatas, e cada candidata que sobrevive
 * à deduplicação é classificada por um modelo. Seis buscas somam algo como
 * sessenta itens no topo do funil, que é da ordem do que as 32 fontes já
 * trazem: dobra a largura da entrada sem dobrar o custo do dia.
 */
export const LIMITES_PADRAO: LimitesDaBuscaDinamica = { doCalendario: 3, deTendencia: 3 };

/**
 * As buscas de hoje.
 *
 * A data manda no calendário, e a tendência vem pronta de quem triou. As duas
 * listas entram na mesma saída porque, para a coleta, elas são a mesma coisa:
 * uma fonte a mais para ler.
 */
export function buscasDoDia(entrada: {
  hoje: string;
  tendencias?: TendenciaTriada[];
  limites?: LimitesDaBuscaDinamica;
}): { fontes: NewsSourceConfig[]; doCalendario: DataNaAgenda[]; deTendencia: TendenciaTriada[] } {
  const limites = entrada.limites ?? LIMITES_PADRAO;
  const fontes: NewsSourceConfig[] = [];

  /*
   * Do calendário, as datas de maior peso primeiro.
   *
   * `agenda` já ordena pelo que está mais perto, e perto nem sempre é o que
   * mais interessa: o relatório de emprego de depois de amanhã vale mais que
   * o Columbus Day de amanhã. Aqui a ordem é por peso, e a distância desempata.
   */
  const doCalendario = agenda(entrada.hoje)
    .filter((d) => d.pesoParaOBrasileiro >= 2 && d.termosDeBusca.length > 0)
    .sort((a, b) => b.pesoParaOBrasileiro - a.pesoParaOBrasileiro || a.faltam - b.faltam)
    .slice(0, limites.doCalendario);

  for (const data of doCalendario) {
    const consulta = data.termosDeBusca[0];
    // Data do Brasil se busca em português; o resto, em inglês, que é onde a
    // notícia americana nasce.
    const idioma = data.pais === "brasil" ? "pt" : "en";
    fontes.push(fonteDeBusca(consulta, idioma, "calendario", apelido(data.id)));
  }

  const deTendencia = (entrada.tendencias ?? []).slice(0, limites.deTendencia);
  for (const t of deTendencia) {
    fontes.push(fonteDeBusca(t.consulta, "en", "tendencia", apelido(t.termo)));
  }

  return { fontes, doCalendario, deTendencia };
}
