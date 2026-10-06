import type { EntidadeVisual, TipoDeEntidade } from "./tipos";
import { ehPessoa, normalizarEntidade } from "./tipos";
import { resolverEntidadeNoWikidata } from "./wikidata";
import { ehCodigoDeProgramaOuFormulario } from "./entidade-visual";

/**
 * O PROTAGONISTA da pauta, lido da manchete (06/10/2026, "imagem certeira").
 *
 * A regra é do dono, depois de ver a fila de 07/10/2026: "a gente precisa ser
 * 100% certeiro". Quando a manchete nomeia uma pessoa, a foto É essa pessoa,
 * com a identidade conferida. Quando nomeia uma empresa ou organização, a foto
 * é a MARCA (foto com o nome legível, o logotipo) ou quem a representa. Foto de
 * cena no lugar do protagonista nomeado não existe mais: sem foto conferida, a
 * pauta não vira conteúdo ("pauta sem foto não vira conteúdo", 05/10/2026).
 *
 * Por que da MANCHETE, e não dos atores do classificador. Os quatro erros da
 * fila tinham o protagonista na manchete e o perderam no caminho:
 *
 *   - "Caiado oficializa apoio a Flávio": os atores eram oito nomes, e a
 *     escolha da entidade consultava só os QUATRO MAIS LONGOS. "Ronaldo
 *     Caiado" ficou de fora, "Gracinha Caiado" entrou, empatou com o Flávio na
 *     centralidade (o "Caiado" da manchete casou com o sobrenome dela) e a
 *     pauta virou "sem entidade". Desceu a escada da cena e saiu com um salão
 *     de casamento em São Paulo.
 *   - "Anthropic expands Claude Startups": "Claude" virou Claude, a cidade do
 *     Texas, empatou com a Anthropic, e a pauta saiu com racks de servidor.
 *   - "Anduril lands $2.9 billion Navy contract": "Anduril" é curto, ficou
 *     fora dos quatro, e a foto foi do fundador num palco, sem marca nenhuma.
 *   - "Bret Taylor: ...": a foto dele foi recusada e, como a manchete DA FONTE
 *     ("Meta joins with group of companies...") não o nomeia, a pauta desceu
 *     para a cena e saiu com um túnel de dados.
 *
 * O protagonista é o ator da classificação que a manchete nomeia, na ordem em
 * que a manchete o nomeia. A manchete da PEÇA (quando já existe: refação,
 * script da fila) vem antes do título da fonte, porque é ela que vai ao ar.
 */

/** Tipos que fazem de um nome da manchete um protagonista com foto obrigatória. */
const TIPOS_DE_PROTAGONISTA: TipoDeEntidade[] = [
  "person",
  "politician",
  "public_official",
  "company",
  "institution",
  "government_agency",
];

export function ehTipoDeProtagonista(tipo: TipoDeEntidade): boolean {
  return TIPOS_DE_PROTAGONISTA.includes(tipo);
}

/** Pessoa ou organização: muda a régua de verificação. */
export function protagonistaEhPessoa(entidade: Pick<EntidadeVisual, "tipo">): boolean {
  return ehPessoa(entidade.tipo);
}

/**
 * Nomes que aparecem como ator e não são protagonista de foto. País inteiro
 * vira bandeira ou mapa, e veículo de imprensa é a fonte, não o assunto.
 */
const NAO_PROTAGONISTAS = new Set([
  "eua", "estados unidos", "brasil", "governo", "governo federal", "usa", "us", "united states", "america",
  "reuters", "ap", "associated press", "afp", "efe", "g1", "folha", "estadao", "cnn", "cnn brasil", "bbc",
  "cnbc", "bloomberg", "the new york times", "washington post", "axios", "infomoney",
]);

/** Partes de nome que não identificam ninguém sozinhas. */
const PARTES_FRACAS = new Set([
  "de", "da", "do", "das", "dos", "e", "the", "of", "and", "inc", "corp", "group", "grupo", "company",
  "silva", "santos", "junior", "filho", "neto", "jr", "sr", "new", "york", "news",
]);

export type ProtagonistaDaManchete = {
  /** O ator como a classificação o escreve: é o nome que vai ao Wikidata. */
  nome: string;
  /** Qual manchete o nomeia: 0 é a da peça, 1 é a da fonte. */
  titulo: number;
  /** Onde, na manchete normalizada. */
  posicao: number;
  /** "nome completo" ou "sobrenome" (parte forte do nome). */
  forma: "nome completo" | "parte do nome";
};

function posicaoDaPalavra(manchete: string, termo: string): number {
  if (!termo) return -1;
  const i = manchete.indexOf(` ${termo} `);
  return i;
}

/**
 * Os atores que a manchete nomeia, na ordem da manchete.
 *
 * Puro e sem rede: quem decide o TIPO é o Wikidata, depois. Um sobrenome que
 * casa com dois atores ("Caiado": Ronaldo e Gracinha) fica com o primeiro da
 * lista do classificador, que lista primeiro quem participa do fato; o nome
 * completo na manchete vence sempre o sobrenome.
 */
export function protagonistasDaManchete(titulos: Array<string | undefined | null>, atores: string[]): ProtagonistaDaManchete[] {
  const manchetes = titulos.map((t) => (t ? ` ${normalizarEntidade(t)} ` : ""));
  const limpos = atores
    .map((a) => a.trim())
    .filter((a) => a.length > 1 && !ehCodigoDeProgramaOuFormulario(a) && !NAO_PROTAGONISTAS.has(normalizarEntidade(a)));

  const achados: ProtagonistaDaManchete[] = [];
  /*
   * A parte de nome que já é de alguém não serve a mais ninguém. O nome
   * completo em QUALQUER manchete reserva as partes dele primeiro: com
   * "Ronaldo Caiado" na manchete da peça, o "Caiado" do título da fonte é dele,
   * e não da Gracinha.
   */
  const partesUsadas = new Set<string>();
  manchetes.forEach((manchete, titulo) => {
    if (!manchete.trim()) return;
    for (const nome of limpos) {
      const chave = normalizarEntidade(nome);
      const posicao = posicaoDaPalavra(manchete, chave);
      if (posicao < 0) continue;
      achados.push({ nome, titulo, posicao, forma: "nome completo" });
      for (const parte of chave.split(" ")) partesUsadas.add(parte);
    }
  });

  manchetes.forEach((manchete, titulo) => {
    if (!manchete.trim()) return;
    for (const nome of limpos) {
      const chave = normalizarEntidade(nome);
      const partes = chave.split(" ");
      if (partes.length < 2) continue;
      for (const parte of partes) {
        if (parte.length <= 3 || PARTES_FRACAS.has(parte)) continue;
        const posicao = posicaoDaPalavra(manchete, parte);
        if (posicao < 0) continue;
        // A mesma parte já pertence a outro ator (o nome completo, ou o primeiro da lista).
        const dono = achados.find((x) => normalizarEntidade(x.nome).split(" ").includes(parte));
        if (dono && normalizarEntidade(dono.nome) !== chave) break;
        if (partesUsadas.has(parte) && !dono) break;
        partesUsadas.add(parte);
        achados.push({ nome, titulo, posicao, forma: "parte do nome" });
        break;
      }
    }
  });

  achados.sort((a, b) => a.titulo - b.titulo || a.posicao - b.posicao);
  const vistos = new Set<string>();
  return achados.filter((p) => {
    const chave = normalizarEntidade(p.nome);
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

export type ProtagonistaResolvido = {
  /** A entidade do protagonista, quando ele foi resolvido como pessoa ou organização. */
  entidade: EntidadeVisual | null;
  /** O ator como a manchete o nomeia: é a chave para pular este protagonista na tentativa seguinte. */
  nomeNaManchete?: string;
  /** Quantos outros nomes da manchete ainda podem ser tentados depois deste. */
  restantes?: number;
  /**
   * A manchete nomeia alguém e não deu para saber quem é (o Wikidata não
   * respondeu). Sem saber, não se escolhe foto nenhuma: nem a dele, nem cena.
   */
  indeterminado: boolean;
  /** O que foi tentado, para `fontesConsultadas`. */
  notas: string[];
};

/** Quantos nomes da manchete vão ao Wikidata. O protagonista é quase sempre o primeiro. */
const MAXIMO_DE_TENTATIVAS = 3;

/**
 * Resolve o protagonista: o primeiro nome da manchete que o Wikidata diz ser
 * pessoa ou organização.
 *
 * Nome que o Wikidata resolve como lugar ou conceito ("Claude", a cidade do
 * Texas) não é protagonista, e a vez passa ao seguinte. Nome que o Wikidata não
 * conhece também passa. Já a FALHA de rede é diferente: a manchete nomeia
 * alguém e não deu para saber quem, e aí a pauta fica sem foto, porque a cena
 * no lugar de uma pessoa nomeada é o erro que esta regra existe para impedir.
 */
export async function resolverProtagonista(
  pauta: { titulo: string; manchete?: string; resumo?: string; atores: string[]; lugares?: string[]; pais?: string },
  opcoes: {
    env?: Record<string, string | undefined>;
    fetcher?: typeof fetch;
    resolver?: typeof resolverEntidadeNoWikidata;
    /**
     * Nomes já tentados sem foto verificada. A manchete "Douglas Ruas pode
     * vencer se votos de Garotinho forem anulados" nomeia os dois: sem foto
     * conferida do Ruas, a do Garotinho é a do protagonista seguinte.
     */
    excluir?: string[];
  } = {},
): Promise<ProtagonistaResolvido> {
  const resolver = opcoes.resolver ?? resolverEntidadeNoWikidata;
  const excluidos = new Set((opcoes.excluir ?? []).map(normalizarEntidade));
  const candidatos = protagonistasDaManchete([pauta.manchete, pauta.titulo], pauta.atores).filter(
    (c) => !excluidos.has(normalizarEntidade(c.nome)),
  );
  const notas: string[] = [];
  if (candidatos.length === 0) {
    return { entidade: null, indeterminado: false, notas: ["protagonista: a manchete não nomeia nenhum ator"] };
  }

  const contexto = [pauta.manchete ?? "", pauta.titulo, pauta.resumo ?? "", ...pauta.atores, ...(pauta.lugares ?? [])].join(" ");
  const tentaveis = candidatos.slice(0, Math.max(0, MAXIMO_DE_TENTATIVAS - excluidos.size));
  for (const [indice, c] of tentaveis.entries()) {
    const r = await resolver(c.nome, { env: opcoes.env, fetcher: opcoes.fetcher, paisDaPauta: pauta.pais, contexto });
    if (r.entidade && ehTipoDeProtagonista(r.entidade.tipo)) {
      notas.push(`protagonista da manchete: "${c.nome}" (${c.forma}) => ${r.nota}`);
      const e = r.entidade;
      return {
        entidade: {
          ...e,
          origem: `protagonista da manchete ("${c.nome}", ${c.forma}); ${e.origem}`,
          // A manchete nomeia: a centralidade é a máxima, e a confiança não cai por isso.
          confianca: Math.max(e.confianca, 80),
          evidencias: [...e.evidencias, `a manchete nomeia "${c.nome}" (${c.forma})`],
        },
        indeterminado: false,
        nomeNaManchete: c.nome,
        restantes: tentaveis.length - indice - 1,
        notas,
      };
    }
    if (!r.entidade && /falhou|respondeu \d/.test(r.nota)) {
      notas.push(`protagonista da manchete: "${c.nome}" não pôde ser resolvido (${r.nota}); sem saber quem é, sem foto`);
      return { entidade: null, indeterminado: true, notas };
    }
    notas.push(
      `"${c.nome}" está na manchete e não é protagonista de foto: ${r.entidade ? `${r.entidade.tipo} (${r.nota})` : r.nota}`,
    );
  }
  return { entidade: null, indeterminado: false, notas };
}
