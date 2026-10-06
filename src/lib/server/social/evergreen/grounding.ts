import { extrairTextoDeHtml } from "../../editorial/enriquecimento";
import { montarPacotesDasPautas } from "../../editorial/pacote-factual";
import type { PacoteFactual } from "../../editorial/pacote-factual";
import { identidadeDoItem } from "./tipos";
import type { ItemEvergreen } from "./tipos";

/**
 * Assunto permanente também precisa de lastro.
 *
 * A tentação do evergreen é obvia: o modelo "sabe" o que é um EB-2 NIW, então
 * bastaria pedir o texto. É exatamente aí que nasce o post que afirma um
 * requisito que não existe mais, ou que nunca existiu, com a confiança de quem
 * está lendo uma lei.
 *
 * O caminho aqui é o mesmo do News V2, e reaproveita o mesmo extrator: busca a
 * página oficial, extrai o texto, monta o pacote factual, e a copy só pode
 * afirmar o que está no pacote. A diferença é a origem — em vez de uma matéria
 * de hoje, a página do USCIS que descreve a categoria.
 *
 * Fonte oficial e nada mais. Notícia descreve o estado de um dia; o evergreen
 * afirma o que vale em geral, e ancorar regra permanente em manchete é como se
 * publica "o teto é 65 mil" seis meses depois de o teto mudar.
 */

/**
 * Domínios que ancoram conteúdo permanente. Fora desta lista, não ancora.
 *
 * Trocada inteira em 06/10/2026, com o catálogo novo. Saíram os domínios de
 * imigração (uscis.gov, travel.state.gov, state.gov, cbp.gov) e o
 * federalregister.gov, que hoje responde ao agente declarado com uma página
 * de desbloqueio. Entraram os órgãos que explicam como as coisas funcionam
 * nos EUA, os sites .gov dos estados que o catálogo cita e, só para o
 * contraste com o Brasil, gov.br (que cobre ibge.gov.br e bcb.gov.br).
 *
 * Domínio cobre os subdomínios: "treasury.gov" vale para home.treasury.gov e
 * fiscaldata.treasury.gov, "ed.gov" para nces.ed.gov, "ca.gov" para
 * cdtfa.ca.gov e boe.ca.gov.
 *
 * Alguns estão na lista e não no catálogo, porque hoje recusam o agente
 * declarado com 403 (investor.gov, ssa.gov, hud.gov, huduser.gov,
 * studentaid.gov). São fonte oficial do mesmo jeito, e a lista diz o que PODE
 * ancorar, não o que respondeu ontem.
 */
export const DOMINIOS_CANONICOS = [
  // Federal: dinheiro, juros e mercado
  "federalreserve.gov",
  "treasury.gov",
  "treasurydirect.gov",
  "sec.gov",
  "investor.gov",
  "fdic.gov",
  "consumerfinance.gov",
  "ftc.gov",
  // Federal: estatística
  "bls.gov",
  "bea.gov",
  "census.gov",
  "eia.gov",
  "usda.gov",
  // Federal: trabalho, imposto, empresa e aposentadoria
  "dol.gov",
  "doleta.gov",
  "opm.gov",
  "irs.gov",
  "ssa.gov",
  "sba.gov",
  "sbir.gov",
  // Federal: saúde, moradia e educação
  "healthcare.gov",
  "medicare.gov",
  "hud.gov",
  "huduser.gov",
  "ed.gov",
  "studentaid.gov",
  // Federal: tecnologia e energia
  "nist.gov",
  "uspto.gov",
  "nasa.gov",
  "energy.gov",
  "fueleconomy.gov",
  "cisa.gov",
  // Federal: governo e instituições
  "usa.gov",
  "archives.gov",
  "house.gov",
  "uscourts.gov",
  // Estados
  "texas.gov",
  "ca.gov",
  "ny.gov",
  "wa.gov",
  "tn.gov",
  // Brasil, só como contraste
  "gov.br",
] as const;

export function ehFonteCanonica(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return DOMINIOS_CANONICOS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** Texto mínimo para o extrator ter o que ler. Abaixo disto, a página não serve. */
export const MINIMO_DE_TEXTO = 400;

/** O agente honesto com que as fontes são lidas e conferidas. */
export const AGENTE_DO_EVERGREEN = "eua.journal/1.0 (+https://casaloti.ia.br)";

export type FonteLida = {
  url: string;
  ok: boolean;
  caracteres: number;
  motivo?: string;
};

export type LastroDoItem = {
  item: ItemEvergreen;
  /** Chave do pacote, igual à identidade do item. */
  storyId: string;
  pacote: PacoteFactual | null;
  fontes: FonteLida[];
  motivo?: string;
};

async function lerPagina(
  url: string,
  fetcher: typeof fetch,
  tetoMs: number,
): Promise<{ texto: string; motivo?: string }> {
  try {
    const r = await fetcher(url, {
      headers: {
        /*
         * Identificação real, e não um navegador de mentira.
         *
         * As páginas do USCIS e do Federal Register respondem a agente
         * declarado; fingir Chrome é o tipo de coisa que funciona até o dia em
         * que para de funcionar por bloqueio, e aí o motivo fica ilegível.
         */
        /*
         * Era "imigra.us/1.0 (contato@imigra.us)" até 06/10/2026, de uma marca
         * que não existe mais. O agente é o mesmo da triagem de assuntos em
         * alta, e foi com ele que cada URL do catálogo foi conferida.
         */
        "User-Agent": AGENTE_DO_EVERGREEN,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(tetoMs),
    });

    if (!r.ok) return { texto: "", motivo: `HTTP ${r.status}` };

    const texto = extrairTextoDeHtml(await r.text());
    if (texto.length < MINIMO_DE_TEXTO) {
      return { texto: "", motivo: `só ${texto.length} caracteres de texto útil` };
    }
    return { texto };
  } catch (err) {
    return { texto: "", motivo: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Monta o lastro de cada item, lendo as fontes canônicas do tópico.
 *
 * Item sem pacote não vira post. Isso é caro em oportunidade — um assunto bom
 * fica de fora porque a página oficial não respondeu — e é o preço de não
 * publicar afirmação sem fonte. O motivo fica no relatório para a próxima
 * passada trocar a URL.
 */
export async function montarLastro(
  itens: ItemEvergreen[],
  opcoes: {
    env?: Record<string, string | undefined>;
    fetcher?: typeof fetch;
    tetoMs?: number;
  } = {},
): Promise<{ lastros: LastroDoItem[]; custoUsd: number; tokens: number }> {
  const env = opcoes.env ?? process.env;
  const fetcher = opcoes.fetcher ?? fetch;
  const tetoMs = opcoes.tetoMs ?? 25_000;

  const lastros: LastroDoItem[] = [];
  const paraExtrair: Array<{ url: string; titulo: string; texto: string; urls: string[] }> = [];

  for (const item of itens) {
    const fontes: FonteLida[] = [];
    const textos: string[] = [];
    const usadas: string[] = [];

    for (const url of item.topico.fontesCanonicas) {
      if (!ehFonteCanonica(url)) {
        fontes.push({ url, ok: false, caracteres: 0, motivo: "domínio não é fonte oficial" });
        continue;
      }

      const leitura = await lerPagina(url, fetcher, tetoMs);
      fontes.push({
        url,
        ok: leitura.texto.length > 0,
        caracteres: leitura.texto.length,
        ...(leitura.motivo ? { motivo: leitura.motivo } : {}),
      });

      if (leitura.texto) {
        textos.push(leitura.texto);
        usadas.push(url);
      }
    }

    if (textos.length === 0) {
      lastros.push({
        item,
        storyId: identidadeDoItem(item),
        pacote: null,
        fontes,
        motivo: "nenhuma fonte canônica devolveu texto suficiente",
      });
      continue;
    }

    lastros.push({ item, storyId: identidadeDoItem(item), pacote: null, fontes });

    /*
     * A pergunta do ângulo entra como título do que se está extraindo.
     *
     * O extrator recebe "título + texto", e o título orienta o que ele
     * considera relevante. Passar o nome do tópico faria todos os ângulos do
     * mesmo tópico extraírem o mesmo pacote, e o post de evidência sairia igual
     * ao de "o que é".
     */
    paraExtrair.push({
      url: identidadeDoItem(item),
      titulo: `${item.topico.nome}: ${item.angulo.pergunta}`,
      texto: textos.join("\n\n"),
      urls: usadas,
    });
  }

  if (paraExtrair.length === 0) return { lastros, custoUsd: 0, tokens: 0 };

  const r = await montarPacotesDasPautas(paraExtrair, env, fetcher);

  for (const lastro of lastros) {
    const pacote = r.pacotes.get(lastro.storyId);
    if (pacote) lastro.pacote = pacote;
    else if (!lastro.motivo) lastro.motivo = "o extrator não devolveu pacote para este item";
  }

  return { lastros, custoUsd: r.custoUsd, tokens: r.tokens };
}
