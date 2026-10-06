import type { Classificacao } from "./classificador";
import { MOTIVOS } from "./config";
import { entidadeNaWikipedia, type EntidadeNaWikipedia } from "./calor-do-dia";
import { agenteDaWikimedia } from "../visual/wikidata";

/**
 * O piso de ALCANCE NACIONAL das pautas centradas em gente (06/10/2026).
 *
 * ## O caso
 *
 * A abertura eleitoral (`politica_brasileira: eleicao`) aprovou "Douglas Ruas
 * pode vencer no primeiro turno se votos de Garotinho forem anulados no RJ".
 * O dono: "pensando na massa, muito segmentada, muito específica; candidato
 * pouco conhecido". A abertura é para a eleição que o PAÍS acompanha:
 * Presidência, figuras nacionais (governador de estado grande, ministro, STF,
 * comando do Congresso, candidato forte), instituição nacional ou mercado.
 * Disputa regional e candidato pouco conhecido ficam fora, salvo quando uma
 * figura nacional é a protagonista.
 *
 * ## A régua, e de onde saiu o número
 *
 * Em quantas Wikipédias o protagonista tem artigo, a mesma medida que o calor
 * usa (`entidadeNaWikipedia`). Medido em 06/10/2026 com a busca de produção:
 *
 *   passam: Lula 128, Flávio Bolsonaro 29, Haddad 28, Simone Tebet 17,
 *           Moraes 16, Erika Hilton 16, Caiado 11, Tarcísio 10,
 *           Alcolumbre 10, Cláudio Castro 9, Zema 8, Nikolas Ferreira 7
 *   caem:   Douglas Ruas 5, Anthony Garotinho 5, Washington Reis 4,
 *           Rodrigo Bacellar 2
 *
 * O piso é 6: o menor nome nacional da lista do dono (Nikolas, 7) passa, e os
 * dois do caso (5) caem. A margem é curta, e por isso a medida é só um piso:
 * a regra de texto "alcance nacional" no classificador continua sendo a
 * primeira peneira. As visualizações da Wikipédia em português NÃO servem de
 * régua no período eleitoral: Douglas Ruas teve 88 mil em 30 dias, mais que
 * Moraes (78 mil), porque o segundo turno do Rio põe qualquer candidato em
 * evidência por algumas semanas.
 *
 * A exceção medida: Hugo Motta, presidente da Câmara, tem 5 Wikipédias. É o
 * comando do Congresso, que o dono listou como nacional, e entra pelo cargo,
 * numa lista curta e datada (`NACIONAIS_ABAIXO_DO_PISO`). O cargo no Wikidata
 * (P39) não serve para isso: Garotinho aparece como governador "atual".
 *
 * ## A citação de famoso
 *
 * O formato vive do rosto e do nome que o leitor reconhece. Bret Taylor
 * (presidente do conselho da OpenAI) tem 10 Wikipédias e 60 visitas em 30 dias
 * na Wikipédia em português: o leitor brasileiro não sabe quem é, e a citação
 * só funcionaria apresentada pela empresa, e aí o fato é da empresa, não da
 * fala. Por isso o piso da citação é mais alto, 20: passam Musk 164, Bezos
 * 101, Altman 66, Nadella 56, Huang 48, Powell 39, Bessent 32, Warsh 24; cai
 * Bret Taylor. A pauta não some do mundo: sem o formato, a fala dele volta à
 * régua de sempre de declaração, e a notícia da OpenAI entra pelo fato.
 */

export const PISO_DE_ALCANCE_DA_POLITICA = 6;
export const PISO_DE_ALCANCE_DA_CITACAO = 20;

/**
 * Nome de alcance nacional pelo CARGO, que a Wikipédia ainda não mede.
 * Normalizado (sem acento, minúsculo). Revisar quando o cargo mudar de mãos.
 */
export const NACIONAIS_ABAIXO_DO_PISO = new Set([
  // Presidente da Câmara dos Deputados desde fevereiro de 2025; 5 Wikipédias em 06/10/2026.
  "hugo motta",
  // Ministros do STF: Nunes Marques tem 4 Wikipédias (06/10/2026), e o STF é nacional por definição.
  "nunes marques",
  "kassio nunes marques",
  "cristiano zanin",
  "flavio dino",
  "andre mendonca",
  "dias toffoli",
  "luiz fux",
  "gilmar mendes",
  "carmen lucia",
  "edson fachin",
  "fachin",
]);

/**
 * Instituição NACIONAL, pelo nome que o classificador escreve. Lista e não
 * medida, de propósito: medido em 06/10/2026, a sigla vai para a página de
 * desambiguação ("TSE" 12, "STF" 8, "CNJ" 5, todas sem tipo) ou não acha nada
 * ("PL", "PT"). Partido com bancada nacional entra: "o PL trata o impeachment
 * de Moraes como inegociável" é notícia do país.
 */
export const INSTITUICOES_NACIONAIS = new Set([
  "tse", "tribunal superior eleitoral", "stf", "supremo", "supremo tribunal federal", "stj", "tst", "tcu", "cnj", "conselho da justica federal", "cjf",
  "pgr", "procuradoria-geral da republica", "agu", "advocacia-geral da uniao", "senado", "senado federal",
  "camara", "camara dos deputados", "congresso", "congresso nacional", "planalto", "palacio do planalto",
  "governo federal", "governo lula", "presidencia da republica", "banco central", "itamaraty", "receita federal",
  "policia federal", "pf", "petrobras", "ibge", "bndes",
  "pl", "pt", "psd", "mdb", "uniao brasil", "pp", "republicanos", "psol", "psb", "pdt", "novo", "podemos", "psdb",
  "partido liberal", "partido dos trabalhadores",
]);

/** Instituição encontrada na Wikipédia com pelo menos isto de línguas conta como nacional (Petrobras 48, CNN Brasil 10). */
export const PISO_DE_ALCANCE_DA_INSTITUICAO = 10;

function instituicaoNacional(nome: string): boolean {
  const n = normalizar(nome).replace(/^(o|a|os|as)\s+/, "");
  return INSTITUICOES_NACIONAIS.has(n) || /^ministerio d[aoe]s?\s/.test(n);
}

export type BuscaDeEntidade = (nome: string) => Promise<EntidadeNaWikipedia | null>;

export type VereditoDoAlcance =
  | { confere: false }
  | { confere: true; passa: true; protagonista: string | null }
  | { confere: true; passa: false; motivo: string; explicacao: string; protagonista: string };

function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function nacionalPeloCargo(nome: string, achado: EntidadeNaWikipedia | null): boolean {
  return NACIONAIS_ABAIXO_DO_PISO.has(normalizar(nome)) || (achado ? NACIONAIS_ABAIXO_DO_PISO.has(normalizar(achado.nome)) : false);
}

/**
 * O alcance de UMA pauta aprovada.
 *
 * Só confere o que depende de gente: política brasileira aprovada pela
 * abertura eleitoral e citação de famoso. O resto passa sem consulta.
 *
 * Política: passa quando, entre os três primeiros atores (o classificador põe
 * quem está no centro primeiro), há uma figura ou instituição nacional: da
 * lista (`INSTITUICOES_NACIONAIS`, `NACIONAIS_ABAIXO_DO_PISO`), pessoa com 6
 * Wikipédias ou mais, ou organização com 10 ou mais. Sem nenhuma, cai, e a
 * explicação diz o número de cada ator. Ator sem artigo conta como regional.
 *
 * Erro de rede LANÇA: quem chama decide (a guarda deixa passar e registra,
 * porque a Wikipédia fora do ar não pode custar a eleição inteira do dia, e a
 * regra de texto continua valendo).
 */
export async function conferirAlcance(
  pauta: { classificacao: Pick<Classificacao, "atores" | "quem_fala">; motivo: string },
  buscar: BuscaDeEntidade,
): Promise<VereditoDoAlcance> {
  if (pauta.motivo === MOTIVOS.APROVADO_CITACAO_DE_FAMOSO) {
    const quem = String(pauta.classificacao.quem_fala ?? "").trim();
    const achado = quem ? await buscar(quem) : null;
    if (nacionalPeloCargo(quem, achado)) return { confere: true, passa: true, protagonista: quem };
    const n = achado?.sitelinks ?? 0;
    if (!achado || (achado.tipo === "pessoa" && n < PISO_DE_ALCANCE_DA_CITACAO)) {
      return {
        confere: true,
        passa: false,
        motivo: MOTIVOS.REJEITADO_ALCANCE,
        protagonista: quem,
        explicacao: achado
          ? `citação de ${quem}: ${n} Wikipédias, abaixo do piso ${PISO_DE_ALCANCE_DA_CITACAO} do formato`
          : `citação de ${quem || "alguém sem nome"}: sem artigo na Wikipédia, desconhecido do leitor`,
      };
    }
    return { confere: true, passa: true, protagonista: quem };
  }

  if (pauta.motivo !== MOTIVOS.APROVADO_POLITICA_BRASIL) return { confere: false };

  const atores = (pauta.classificacao.atores ?? []).map((a) => String(a ?? "").trim()).filter(Boolean).slice(0, 3);
  if (atores.length === 0) return { confere: true, passa: true, protagonista: null };

  /*
   * A ordem das perguntas é a regra.
   *
   * 1. Pessoa nacional em qualquer das três posições salva: "Ruas contra Lula"
   *    é notícia do país.
   * 2. Pessoa REGIONAL entre os atores, sem nenhuma nacional, derruba, mesmo
   *    com instituição nacional na lista. Medido no ensaio de 06/10/2026:
   *    "RJ: 204 mil eleitores votaram 13 para governador" vinha com TSE,
   *    TSE e Garotinho, e "MPE defende desistência de Garotinho" com MPE, TSE
   *    e Garotinho. O TSE ali é árbitro, e a notícia é a disputa do Rio.
   * 3. Sem pessoa nenhuma, a instituição nacional como PROTAGONISTA (primeiro
   *    ator) salva: "Mulheres são 37% das candidaturas" (TSE, Câmara, IBGE).
   */
  const achados: Array<{ nome: string; achado: EntidadeNaWikipedia | null; daLista: boolean }> = [];
  for (const nome of atores) {
    const daLista = instituicaoNacional(nome) || nacionalPeloCargo(nome, null);
    achados.push({ nome, daLista, achado: daLista ? null : await buscar(nome) });
  }

  const nacional = achados.find(
    (a) =>
      nacionalPeloCargo(a.nome, a.achado) ||
      (a.achado?.tipo === "pessoa" && a.achado.sitelinks >= PISO_DE_ALCANCE_DA_POLITICA),
  );
  if (nacional) return { confere: true, passa: true, protagonista: nacional.nome };

  const regional = achados.some((a) => a.achado?.tipo === "pessoa");
  const primeiro = achados[0];
  const instituicaoNoCentro =
    (primeiro.daLista && instituicaoNacional(primeiro.nome)) ||
    (primeiro.achado?.tipo === "organizacao" && primeiro.achado.sitelinks >= PISO_DE_ALCANCE_DA_INSTITUICAO);
  if (!regional && instituicaoNoCentro) return { confere: true, passa: true, protagonista: primeiro.nome };

  return {
    confere: true,
    passa: false,
    motivo: MOTIVOS.REJEITADO_ALCANCE,
    protagonista: atores[0],
    explicacao:
      "sem figura nacional entre os atores: " +
      achados
        .map((a) => `${a.nome} ${a.daLista ? "(instituição nacional)" : a.achado ? `${a.achado.sitelinks} (${a.achado.tipo})` : "sem artigo"}`)
        .join(", ") +
      `; pisos ${PISO_DE_ALCANCE_DA_POLITICA} para pessoa e ${PISO_DE_ALCANCE_DA_INSTITUICAO} para instituição`,
  };
}

const memoria = new Map<string, Promise<EntidadeNaWikipedia | null>>();

/** A busca de produção, com memória no processo: o mesmo nome aparece em dezenas de pautas da eleição. */
export function buscaDeEntidadePadrao(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): BuscaDeEntidade {
  return (nome: string) => {
    const chave = normalizar(nome);
    let p = memoria.get(chave);
    if (!p) {
      p = entidadeNaWikipedia(nome, fetcher, agenteDaWikimedia(env));
      // Falha não fica guardada: a próxima pauta pergunta de novo.
      p.catch(() => memoria.delete(chave));
      memoria.set(chave, p);
    }
    return p;
  };
}
