/**
 * As fotos do carrossel de notícia: uma por slide, sem repetir (06/10/2026).
 *
 * No método do Not Journal todo slide é foto sangrando, e quando a história tem
 * um PROTAGONISTA a mesma pessoa aparece em fotos diferentes, slide a slide. O
 * que este módulo faz é pedir ao resolvedor que já existe, de novo e de novo,
 * com a lista do que já foi usado crescendo: cada resposta passa pelas mesmas
 * barreiras da capa (identidade, licença, temporalidade e a conferência que
 * abre a imagem), e nenhuma barreira nova foi inventada aqui.
 *
 * A ordem das tentativas é a regra do dono:
 *
 *   1. a entidade da pauta, que é o protagonista quando há pessoa;
 *   2. sem fotos dela, a CENA: a mesma pauta sem os atores, para o resolvedor
 *      cair no lugar, no órgão ou no conceito;
 *   3. sem nada, o slide fica sem foto, no fundo azul-marinho da gramática.
 *
 * ATUALIZADO no mesmo dia, por decisão do dono: o passo 3 não publica mais
 * slide de texto sobre azul-marinho. O slide sem foto SAI do carrossel
 * (`podarMioloSemFoto`, abaixo), e o carrossel que fica menor que o mínimo
 * vira peça única.
 *
 * Rosto de outra pessoa nunca entra como "foto relacionada": a cena tira os
 * atores justamente para não haver rosto nenhum no lugar do protagonista, e o
 * banco conceitual já proíbe pessoa identificável.
 *
 * O que NÃO é recusado, também por decisão do dono (06/10/2026): outras
 * pessoas aparecendo junto do protagonista na foto do slide, como o Not
 * Journal faz (Sanders num palco com gente em volta, Trump numa mesa de
 * reunião). O que continua valendo é que a foto do protagonista mostra o
 * PROTAGONISTA (a entidade resolvida tem que ser ele, `entidadeEhAPessoa`) e
 * que a bolha nunca cobre um rosto.
 *
 * E a bolha: só no slide em que um SEGUNDO personagem nomeado entra no texto, e
 * só com uma foto cuja entidade resolvida é ELE. Sem essa correspondência, sem
 * bolha. O lugar da bolha na peça é de outra frente (feat/bolha-sem-rosto);
 * daqui só sai qual foto e em qual slide.
 */

import type { PautaParaImagem } from "../../visual/resolver";
import type { ResultadoVisual } from "../../visual/tipos";
import { TIPOS_DE_PESSOA } from "../../visual/tipos";
import { temFotoDaPauta } from "../../ramos/sem-foto";
import type { FotoDaCapa } from "../arte";
import type { SlideDeTexto } from "./copy";
import { ESTRUTURAS, papeisDoModelo, type PapelDeSlide } from "./estrutura";

/** Quem resolve UMA foto, com a lista do que já saiu. É o resolvedor de sempre. */
export type ResolvedorDeFoto = (
  pauta: PautaParaImagem,
  jaUsadas: Set<string>,
) => Promise<ResultadoVisual | null>;

/**
 * A identidade de uma foto é o ARQUIVO, não o endereço.
 *
 * O Commons serve o mesmo arquivo como original e como miniatura
 * ("/thumb/.../800px-Arquivo.jpg"), e comparar URL inteira acharia duas fotos
 * onde há uma. É a lição de "A capa e, logo abaixo, a mesma foto de novo".
 */
export function arquivoDaFoto(url: string): string {
  const limpa = String(url ?? "").trim();
  if (!limpa) return "";
  let caminho = limpa.split("?")[0];
  try {
    caminho = new URL(limpa).pathname;
  } catch {
    /* fica o que veio, sem consulta */
  }
  const nome = decodeURIComponent(caminho.split("/").filter(Boolean).pop() ?? "");
  return nome.replace(/^\d+px-/, "").toLowerCase();
}

function normalizar(texto: string): string {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** O sobrenome, que é como o texto do slide costuma chamar a pessoa. */
function sobrenome(nome: string): string {
  const partes = normalizar(nome).split(" ").filter((p) => p.length > 2);
  return partes[partes.length - 1] ?? "";
}

/** O texto do slide cita esta pessoa? Pelo nome inteiro ou pelo sobrenome. */
export function citaPessoa(texto: string, pessoa: string): boolean {
  const t = ` ${normalizar(texto)} `;
  const inteiro = normalizar(pessoa);
  const ultimo = sobrenome(pessoa);
  return Boolean((inteiro && t.includes(` ${inteiro} `)) || (ultimo && t.includes(` ${ultimo} `)));
}

/** A entidade resolvida é esta pessoa? Compara pelo sobrenome, que sobrevive a "Donald J. Trump". */
function entidadeEhAPessoa(r: ResultadoVisual | null, pessoa: string): boolean {
  const nome = r?.entidade?.nome ?? "";
  if (!nome || !r?.entidade || !TIPOS_DE_PESSOA.includes(r.entidade.tipo)) return false;
  const a = sobrenome(nome);
  return Boolean(a && a === sobrenome(pessoa));
}

export type FotosDoCarrossel = {
  /** Uma por slide de conteúdo, na ordem; `null` é slide sem foto. */
  fotos: Array<FotoDaCapa | null>;
  /** A bolha de cada slide de conteúdo; quase todas nulas. */
  bolhas: Array<FotoDaCapa | null>;
  /** De onde veio cada foto, para o relatório: "protagonista", "cena" ou "nenhuma". */
  origem: Array<"protagonista" | "cena" | "nenhuma">;
  /** Os créditos que a licença exige, sem repetição, para o fim da legenda. */
  creditos: string[];
  /** Quem é o segundo personagem que ganhou bolha, se algum ganhou. */
  segundoPersonagem: string | null;
};

const PARA_FOTO = (r: ResultadoVisual): FotoDaCapa => ({
  imageUrl: r.asset!.imageUrl,
  attribution: r.asset!.attribution,
  // Para a linha curta do crédito na legenda (06/10/2026).
  author: r.asset!.author,
  license: r.asset!.license,
});

/**
 * Resolve as fotos dos slides de conteúdo.
 *
 * `fotoDaCapa` entra na lista do que já foi usado antes de tudo: nenhum slide
 * repete a capa. `textos` são os textos dos slides de conteúdo, na ordem, e
 * servem para achar o slide em que o segundo personagem entra.
 */
export async function fotosDoCarrossel(entrada: {
  pauta: PautaParaImagem;
  quantas: number;
  fotoDaCapa: FotoDaCapa | null;
  pessoas: string[];
  textos: string[];
  resolver: ResolvedorDeFoto;
}): Promise<FotosDoCarrossel> {
  const { pauta, quantas, resolver } = entrada;
  const usadas = new Set<string>();
  const arquivos = new Set<string>();
  const marcar = (url: string) => {
    usadas.add(url);
    const a = arquivoDaFoto(url);
    if (a) arquivos.add(a);
  };
  if (entrada.fotoDaCapa?.imageUrl) marcar(entrada.fotoDaCapa.imageUrl);

  const fotos: Array<FotoDaCapa | null> = [];
  const origem: FotosDoCarrossel["origem"] = [];
  let protagonista = "";

  /*
   * Uma rodada pede fotos até encher ou o resolvedor parar de achar foto NOVA.
   *
   * Parar na primeira repetição, e não insistir, é de propósito: o resolvedor
   * já pulou o que estava em `usadas`, então se ele devolveu algo repetido ou
   * nada, é porque a fonte acabou para aquela entidade.
   */
  const rodada = async (alvo: PautaParaImagem, rotulo: "protagonista" | "cena", exigePessoa: string | null = null) => {
    /*
     * Uma repetição é tolerada uma vez: a mesma foto às vezes volta com outro
     * endereço (original contra miniatura, com e sem parâmetros), o resolvedor
     * não a reconhece, e marcar o endereço novo como usado basta para a
     * próxima pergunta trazer outra. Duas seguidas é a fonte acabando.
     */
    let repetidas = 0;
    while (fotos.length < quantas && repetidas < 2) {
      /*
       * Uma CÓPIA do conjunto, e isso é a correção de um defeito real: o
       * resolvedor acrescenta a foto escolhida ao conjunto que recebe
       * (`usadosAgora.add`), e com o conjunto original na mão toda foto nova
       * voltava parecendo repetida. O primeiro ensaio real saiu com três slides
       * sem foto e duas fotos de Trump aprovadas no log.
       */
      const r = await resolver(alvo, new Set(usadas));
      if (!temFotoDaPauta(r)) return;
      // O retrato tem que ser DELE: foto de outra entidade nunca entra no lugar.
      if (exigePessoa && !entidadeEhAPessoa(r, exigePessoa)) return;
      if (rotulo === "protagonista" && !protagonista && r?.entidade && TIPOS_DE_PESSOA.includes(r.entidade.tipo)) {
        protagonista = r.entidade.nome;
      }
      const url = r!.asset!.imageUrl;
      if (usadas.has(url) || arquivos.has(arquivoDaFoto(url))) {
        usadas.add(url);
        repetidas += 1;
        continue;
      }
      repetidas = 0;
      marcar(url);
      fotos.push(PARA_FOTO(r!));
      origem.push(rotulo);
    }
  };

  /*
   * Quem é o protagonista: o primeiro ator da classificação que o pacote cita
   * como PESSOA. Com ele, a pergunta ao resolvedor é o retrato dele, e não a
   * manchete: o primeiro ensaio real (06/10/2026, Camp David) mostrou a
   * conferência visual recusando toda foto de Trump que não fosse daquela
   * reunião, porque ela pergunta se a foto sustenta a MANCHETE. No slide de
   * conteúdo a pergunta certa é outra, "é esta pessoa?", e é a que o método
   * pede: a mesma pessoa em fotos diferentes. A conferência continua abrindo
   * cada imagem; o que muda é o que ela confere.
   */
  const provavel = pauta.classificacao.atores.find((a) =>
    entrada.pessoas.some((p) => sobrenome(p) && sobrenome(p) === sobrenome(a)),
  );
  const alvoDoProtagonista: PautaParaImagem = provavel
    ? {
        ...pauta,
        storyId: `${pauta.storyId}#retrato`,
        titulo: provavel,
        resumo: "",
        classificacao: { ...pauta.classificacao, atores: [provavel], acontecimento: [] },
      }
    : pauta;
  if (provavel) protagonista = provavel;

  if (quantas > 0) await rodada(alvoDoProtagonista, "protagonista", provavel ?? null);
  if (fotos.length < quantas) {
    await rodada(
      {
        ...pauta,
        storyId: `${pauta.storyId}#cena`,
        classificacao: { ...pauta.classificacao, atores: [] },
      },
      "cena",
    );
  }
  while (fotos.length < quantas) {
    fotos.push(null);
    origem.push("nenhuma");
  }

  /*
   * O segundo personagem: a segunda pessoa do pacote que o texto de algum
   * slide cita. A primeira é o protagonista, que já está nas fotos.
   */
  const bolhas: Array<FotoDaCapa | null> = fotos.map(() => null);
  let segundoPersonagem: string | null = null;
  // Nome de uma palavra só vale quando é sobrenome de verdade ("Vance"), não sigla.
  const nomeadas = entrada.pessoas.filter((p) => normalizar(p).replace(/ /g, "").length >= 4);
  const doProtagonista = sobrenome(protagonista || nomeadas[0] || "");
  const outras = nomeadas.filter((p) => sobrenome(p) !== doProtagonista);
  for (const pessoa of outras) {
    const indice = entrada.textos.findIndex((t) => citaPessoa(t, pessoa));
    if (indice < 0 || !fotos[indice]) continue;
    const r = await resolver(
      {
        ...pauta,
        storyId: `${pauta.storyId}#${normalizar(pessoa).replace(/ /g, "-")}`,
        titulo: pessoa,
        resumo: "",
        classificacao: { ...pauta.classificacao, atores: [pessoa], lugares: [], acontecimento: [] },
      },
      new Set(usadas),
    );
    if (!temFotoDaPauta(r) || !entidadeEhAPessoa(r, pessoa)) continue;
    const url = r!.asset!.imageUrl;
    if (usadas.has(url) || arquivos.has(arquivoDaFoto(url))) continue;
    marcar(url);
    bolhas[indice] = PARA_FOTO(r!);
    segundoPersonagem = pessoa;
    break;
  }

  const creditos = [
    ...new Set(
      [...fotos, ...bolhas]
        .map((f) => (f?.attribution ?? "").trim())
        .filter(Boolean),
    ),
  ];

  return { fotos, bolhas, origem, creditos, segundoPersonagem };
}


/* ------------------------------------------------------------------ */
/* O slide sem foto sai (06/10/2026)                                   */
/* ------------------------------------------------------------------ */

/**
 * O menor carrossel de notícia: capa, um passo e o convite. É a estrutura
 * `noticia_curta`, e abaixo dela a notícia é peça única.
 */
export const MINIMO_DE_SLIDES_DA_NOTICIA = ESTRUTURAS.noticia_curta.length;

export type MioloPodado =
  | {
      formato: "carousel";
      papeis: PapelDeSlide[];
      slides: SlideDeTexto[];
      fotos: Array<FotoDaCapa | null>;
      bolhas: Array<FotoDaCapa | null>;
      /** Os créditos só das fotos que ficaram. */
      creditos: string[];
      /** Os papéis que saíram por falta de foto, para o log e o registro. */
      tirados: string[];
    }
  | { formato: "static"; motivo: string; tirados: string[] };

/**
 * Tira do carrossel de notícia todo slide de conteúdo sem foto.
 *
 * A decisão do dono, com estas palavras: o carrossel usa menos slides, e
 * nunca um slide de texto chapado sobre azul-marinho. No método do Not Journal
 * todo slide é foto, e o slide sem foto era a única tela da peça que não
 * seguia o método. Se o que sobra fica abaixo do mínimo
 * (`MINIMO_DE_SLIDES_DA_NOTICIA`), a pauta sai como peça única, que tem a capa
 * com foto e a legenda inteira.
 *
 * `fotos` nulo é "não houve resolução de foto nenhuma" (a busca falhou ou não
 * foi ligada): todos os slides ficam sem foto, e a notícia vira peça única.
 *
 * Puro: a ordem dos slides que ficam é a do modelo, e o texto de cada um não
 * muda.
 */
export function podarMioloSemFoto(entrada: {
  papeis: PapelDeSlide[];
  slides: SlideDeTexto[];
  fotos: Array<FotoDaCapa | null> | null | undefined;
  bolhas?: Array<FotoDaCapa | null> | null;
}): MioloPodado {
  const doModelo = papeisDoModelo(entrada.papeis);
  const temFoto = (i: number) => Boolean((entrada.fotos?.[i]?.imageUrl ?? "").trim());

  const tirados = doModelo.filter((_, i) => !temFoto(i)).map((p) => p.papel);
  const papeis = entrada.papeis.filter((p) => {
    const i = doModelo.indexOf(p);
    return i < 0 || temFoto(i);
  });

  if (papeis.length < MINIMO_DE_SLIDES_DA_NOTICIA) {
    return {
      formato: "static",
      tirados,
      motivo:
        `${tirados.length} de ${doModelo.length} slide(s) de conteúdo sem foto; ` +
        `sobrariam ${papeis.length} slide(s), abaixo do mínimo de ${MINIMO_DE_SLIDES_DA_NOTICIA}: vira peça única`,
    };
  }

  const ficam = doModelo.map((_, i) => i).filter(temFoto);
  const fotos = ficam.map((i) => entrada.fotos![i]);
  const bolhas = ficam.map((i) => entrada.bolhas?.[i] ?? null);
  const creditos = [
    ...new Set(
      [...fotos, ...bolhas]
        .map((f) => (f?.attribution ?? "").trim())
        .filter(Boolean),
    ),
  ];

  return {
    formato: "carousel",
    papeis,
    slides: ficam.map((i) => entrada.slides[i]).filter(Boolean),
    fotos,
    bolhas,
    creditos,
    tirados,
  };
}
