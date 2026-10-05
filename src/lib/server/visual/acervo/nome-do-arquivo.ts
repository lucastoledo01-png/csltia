import {
  GRUPO_DE_RETRATOS,
  PAISES_DA_COBERTURA,
  ehGrupo,
  tagDe,
  tagDoCatalogo,
  type GrupoDoAcervo,
} from "./catalogo-de-cenas";

/**
 * O nome do arquivo É o metadado (decisão do dono, 29/09/2026).
 *
 *   grupo-pais-assunto-detalhe-numero.jpg
 *   moradia-eua-rua_residencial-outono-03.jpg
 *   pessoas-eua-donald_trump-retrato-01.jpg
 *
 * O hífen separa campos; dentro de um campo as palavras se ligam por "_". O
 * detalhe pode ter mais de um pedaço (`casa_suburbio-neve-manha-02`), porque
 * ele é o último campo antes do número e tudo o que sobra cai nele.
 *
 * O que NÃO entra no nome é tom e orientação. Os dois são medidos nos pixels
 * (`medida.ts`), com precisão maior que a do olho, e escrever à mão criaria
 * contradição entre o nome e o arquivo.
 */

export type NomeLido = {
  arquivo: string;
  grupo: GrupoDoAcervo;
  pais: string;
  assunto: string;
  detalhe: string;
  numero: number;
  /** `grupo/assunto`. Para retrato, é o nome da pessoa e não uma cena. */
  tag: string;
  /** A tag está no cardápio que o modelo escolhe? Fora dele, só a entidade alcança. */
  noCatalogo: boolean;
};

export type LeituraDoNome = { ok: true; nome: NomeLido } | { ok: false; motivo: string };

const EXTENSOES = /\.(jpe?g|png|webp|tiff?|heic)$/i;
const CAMPO = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export function lerNomeDoArquivo(arquivo: string): LeituraDoNome {
  const base = arquivo.split(/[\\/]/).pop() ?? arquivo;
  if (!EXTENSOES.test(base)) return { ok: false, motivo: "extensão não é de imagem" };

  const semExtensao = base.replace(EXTENSOES, "");
  const partes = semExtensao.split("-");
  if (partes.length < 5) {
    return { ok: false, motivo: "faltam campos: o formato é grupo-pais-assunto-detalhe-numero" };
  }

  for (const p of partes) {
    if (!CAMPO.test(p)) {
      return { ok: false, motivo: `campo "${p}" fora do formato: minúsculas, números e "_", sem acento nem espaço` };
    }
  }

  const [grupo, pais, assunto] = partes;
  const numeroBruto = partes[partes.length - 1];
  const detalhe = partes.slice(3, -1).join("-");

  if (!ehGrupo(grupo)) return { ok: false, motivo: `grupo "${grupo}" não existe no catálogo` };
  if (!/^\d{1,4}$/.test(numeroBruto)) return { ok: false, motivo: `o último campo tem de ser o número, veio "${numeroBruto}"` };

  /*
   * A régua de país vale para cena e lugar, não para pessoa (29/09/2026).
   *
   * Retrato é da pessoa onde quer que tenha sido feito. Cena de terceiro país
   * é recusada aqui, na porta, e não na hora de publicar: o acervo só guarda o
   * que pode sair.
   */
  const cobertura = (PAISES_DA_COBERTURA as readonly string[]).includes(pais);
  if (grupo !== GRUPO_DE_RETRATOS && !cobertura) {
    return {
      ok: false,
      motivo: `país "${pais}" fora da cobertura (${PAISES_DA_COBERTURA.join(", ")}): cena de terceiro país é recusada`,
    };
  }

  /*
   * Grupo brasileiro com país americano é contradição no próprio nome.
   * Melhor recusar do que adivinhar qual dos dois o designer quis dizer.
   */
  if (grupo.startsWith("brasil_") && pais !== "br") {
    return { ok: false, motivo: `grupo "${grupo}" exige país "br", veio "${pais}"` };
  }

  const tag = tagDe(grupo, assunto);
  return {
    ok: true,
    nome: {
      arquivo: base,
      grupo,
      pais,
      assunto,
      detalhe,
      numero: Number(numeroBruto),
      tag,
      noCatalogo: tagDoCatalogo(tag),
    },
  };
}

/** O assunto como texto comparável com o nome normalizado de uma entidade. */
export function assuntoComoNome(assunto: string): string {
  return assunto.replace(/_/g, " ");
}
