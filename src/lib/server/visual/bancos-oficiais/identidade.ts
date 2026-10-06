import { normalizarEntidade } from "../tipos";
import { pessoasDeclaradasNaImagem } from "../temporalidade";
import type { FotoDoBanco } from "./tipos";

/**
 * Quem está na foto, segundo a legenda do banco (06/10/2026).
 *
 * Mora fora do `index.ts` porque os adaptadores também perguntam (o do Senado
 * filtra pela protagonista ANTES de pagar o detalhe de cada foto), e o
 * `index.ts` importa os adaptadores pelo registro.
 */

/**
 * Cargo seguido do sobrenome também é o nome: "Chairman Warsh" na galeria do
 * Fed, "presidente Lula", "ministro Haddad". O cargo é o que torna o sobrenome
 * sozinho uma prova, e não um homônimo qualquer na legenda.
 */
export const CARGOS =
  "presidente|presidenta|vice presidente|ministro|ministra|senador|senadora|deputado|deputada|governador|governadora|" +
  "prefeito|prefeita|chairman|chair|president|vice president|secretary|senator|governor|speaker|representative|leader|" +
  "administrator|justice|chief justice|mayor";

/**
 * Apelido de uma palavra só ("Lula", "Tarcísio") precisa de uma ocorrência que
 * NÃO seja o começo de outro nome. Medido em 06/10/2026: no banco da Câmara,
 * "Lula" acha o deputado Lula da Fonte e "Tarcísio" o deputado Tarcísio Motta;
 * na Agência Brasil, o fotógrafo Lula Marques. A ocorrência vale quando o que
 * vem depois não é nome próprio, ou é nome próprio que está no nome completo
 * da entidade ("Lula da Silva").
 */
export function apelidoSemOutroSobrenome(textoBruto: string, apelido: string, completo: Set<string>): boolean {
  const re = new RegExp(`(^|[^\\p{L}])${apelido.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "giu");
  for (const m of textoBruto.matchAll(re)) {
    const depois = textoBruto.slice((m.index ?? 0) + m[0].length);
    const seguinte = depois.match(/^\s+(?:(?:da|de|do|dos|das)\s+)?(\p{Lu}[\p{L}]+)/u);
    if (!seguinte) return true;
    if (completo.has(normalizarEntidade(seguinte[1]))) return true;
  }
  return false;
}

/**
 * A legenda sem os trechos que falam do ASSUNTO, e não de quem está na foto.
 *
 * Medido na Agência Senado (06/10/2026): "Parlamentares da oposição conversam
 * com jornalistas sobre julgamento que analisa a abertura de investigação
 * envolvendo o ministro Alexandre de Moraes [...] Senador Jorge Seif (PL-SC)
 * durante entrevista." O ministro é o tema; quem está na foto é o senador, na
 * segunda frase. O nome que vem depois de "sobre", "envolvendo", "contra" (e
 * "about", "regarding", "against"), até o fim da frase, não conta como prova
 * de que a pessoa está na foto.
 */
export function semTrechosDeAssunto(texto: string): string {
  return texto.replace(
    /\b(sobre|envolvendo|contra|acerca d[eoa]s?|a respeito d[eoa]s?|em rela[çc][ãa]o a|about|regarding|against|concerning)\b[^.;\n]*/gi,
    " ",
  );
}

/** A legenda cita a entidade por algum dos nomes dela, com fronteira de palavra? */
export function legendaCita(foto: Pick<FotoDoBanco, "titulo" | "descricao">, nomes: string[]): boolean {
  const bruto = semTrechosDeAssunto(`${foto.titulo} ${foto.descricao}`);
  const texto = ` ${normalizarEntidade(bruto)} `;
  const completo = new Set(normalizarEntidade(nomes[0] ?? "").split(" "));
  const porNome = nomes.some((n) => {
    const alvo = normalizarEntidade(n);
    if (alvo.length < 4 || !texto.includes(` ${alvo} `)) return false;
    if (alvo.includes(" ")) return true;
    return apelidoSemOutroSobrenome(bruto, n, completo);
  });
  if (porNome) return true;
  if (nomes.length === 0) return false;
  const sobrenome = normalizarEntidade(nomes[0]).split(" ").pop() ?? "";
  if (sobrenome.length < 4 || normalizarEntidade(nomes[0]).split(" ").length < 2) return false;
  return new RegExp(` (${CARGOS}) ${sobrenome} `).test(texto);
}

const PALAVRAS_DE_CARGO = new Set(
  `${CARGOS}|secretario|secretaria|ministro|ministra|first|lady|primeira|dama|former|ex|acting|interino|interina|dep|sen`
    .split(/[| ]/)
    .filter(Boolean),
);

/**
 * A entidade é a PROTAGONISTA da legenda: a primeira pessoa que ela nomeia.
 *
 * Medido no primeiro replay (06/10/2026), olhando a folha de contato: citar
 * não basta. A Agência Senado legenda "entrevista do senador Fulano sobre o
 * ministro Alexandre de Moraes", e a foto é do senador; a Câmara legenda
 * "Hugo Motta e Lula", e o centro da foto é o Hugo Motta. A legenda de banco
 * oficial abre por quem está na foto, e é essa abertura que vale.
 *
 * Quem decide se a primeira pessoa é a entidade é o nome dela, sem os cargos:
 * cada palavra de quatro letras ou mais tem que estar no nome completo, com
 * uma falta tolerada a cada três palavras ("Luis Inácio Lula", com S, ainda é
 * "Luiz Inácio Lula da Silva"). "Jair Bolsonaro" não é "Flávio Bolsonaro", e
 * "Lula da Fonte" não é Lula. Legenda sem nome de gente nenhum não tem
 * protagonista, e fica valendo só a citação.
 */
/**
 * Foto de grupo não é retrato de ninguém (06/10/2026, terceira rodada da folha).
 *
 * A legenda da Agência Senado lista quem está na foto em bloco: "Mesa:",
 * "Participam:", "da esquerda para a direita". Foi assim que a pauta de Fachin
 * ganhou a mesa de uma posse com sete pessoas, e a de Moraes uma coletiva de
 * doze senadores. O pedido do dono é a pessoa como assunto claro da foto, e
 * três ou mais pessoas nomeadas, ou uma lista, não é isso.
 */
export function fotoDeGrupo(foto: Pick<FotoDoBanco, "titulo" | "descricao">): boolean {
  const texto = `${foto.titulo}\n${foto.descricao}`;
  if (/\b(mesa|participam|participantes|presentes|comp[õo]em a mesa|integrantes)\s*:/i.test(texto)) return true;
  if (/da esquerda para a direita|from left|\(e\s*[/-]\s*d\)|\(l\s*[/-]\s*r\)/i.test(texto)) return true;
  const pessoas = pessoasDeclaradasNaImagem({ sourceAssetId: "", metadata: { descricao: semTrechosDeAssunto(foto.descricao) } });
  return pessoas.length >= 3;
}

export function protagonistaDaLegenda(foto: Pick<FotoDoBanco, "titulo" | "descricao">, nomes: string[]): boolean {
  if (nomes.length === 0) return false;
  if (fotoDeGrupo(foto)) return false;
  const pessoas = pessoasDeclaradasNaImagem({ sourceAssetId: "", metadata: { descricao: semTrechosDeAssunto(foto.descricao) } });
  const primeira =
    pessoas[0] ?? pessoasDeclaradasNaImagem({ sourceAssetId: "", metadata: { descricao: semTrechosDeAssunto(foto.titulo) } })[0];
  if (!primeira) return true;
  const completo = new Set(nomes.flatMap((n) => normalizarEntidade(n).split(" ")));
  const palavras = normalizarEntidade(primeira)
    .split(" ")
    .filter((p) => p.length >= 4 && !PALAVRAS_DE_CARGO.has(p));
  if (palavras.length === 0) return false;
  const faltas = palavras.filter((p) => !completo.has(p)).length;
  return palavras.some((p) => completo.has(p)) && faltas <= Math.floor(palavras.length / 3);
}

