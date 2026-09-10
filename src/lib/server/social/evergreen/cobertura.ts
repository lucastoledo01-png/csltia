/**
 * A fonte fala do assunto que o tópico prometeu?
 *
 * O preview encontrou o caso que motivou esta régua. O tópico é "B-1 e B-2
 * (negócios e turismo)", as três fontes canônicas responderam (1.637, 3.933 e
 * 19.012 caracteres), o extrator devolveu 37 fatos, e NENHUM deles menciona
 * B-1, B-2, negócios ou turismo: eram fatos sobre inspeção da CBP, ESTA, I-94 e
 * o domínio .gov. O grounding funcionou perfeitamente, e o post que saiu foi
 * "A fonte não define B-1 e B-2".
 *
 * Isso é diagnóstico interno, não conteúdo. Post sobre a ausência de informação
 * não interessa a quem quer morar nos Estados Unidos, e a régua certa não é
 * proibir a frase: é descartar a pauta antes de escrever qualquer coisa.
 *
 * A conferência é determinística e mede uma coisa só: quantos fatos do pacote
 * falam do assunto declarado pelo tópico. Nenhum modelo é chamado, porque a
 * pergunta não é de sentido, é de presença.
 */

import type { PacoteFactual } from "../../editorial/pacote-factual";
import type { ItemEvergreen } from "./tipos";

export const MOTIVO_SEM_COBERTURA = "SOURCE_TOPIC_COVERAGE_INSUFFICIENT";

/**
 * Quantos fatos precisam falar do assunto.
 *
 * Dois, e não um. Um fato solto que menciona o termo costuma ser a referência
 * de passagem ("veja também a classificação B-2"), e um post inteiro apoiado
 * numa menção de passagem é o mesmo problema por outro caminho. Dois fatos é o
 * piso em que a fonte está tratando do assunto, e não só citando o nome dele.
 */
export const MINIMO_DE_FATOS_DO_TOPICO = 2;

const IRRELEVANTES = new Set([
  "para",
  "como",
  "quem",
  "onde",
  "quando",
  "porque",
  "sobre",
  "entre",
  "dentro",
  "fora",
  "mais",
  "menos",
  "cada",
  "pelo",
  "pela",
  "seus",
  "suas",
  "esse",
  "essa",
  "isso",
  "aquele",
  "muito",
  "pouco",
  "todo",
  "toda",
  "outro",
  "outra",
  "mesmo",
  "mesma",
  "ainda",
  "depois",
  "antes",
  "sempre",
  "nunca",
  "voce",
  "seu",
  "sua",
  "que",
  "com",
  "sem",
  "por",
  "dos",
  "das",
  "nos",
  "nas",
  "aos",
  "num",
  "numa",
  "ser",
  "ter",
  "vai",
  "faz",
  "pode",
  "deve",
  "precisa",
  "existe",
  "acontece",
  "funciona",
  "significa",
  "realmente",
]);

function normalizar(t: string): string {
  return (t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Os termos que IDENTIFICAM o assunto do tópico.
 *
 * Saem do programa e do nome, e não da pergunta do ângulo: a pergunta é escrita
 * em linguagem de gente e usa palavras genéricas ("o que cada uma dessas letras
 * deixa você fazer") que casariam com quase qualquer fato. O que identifica o
 * assunto é como ele se chama.
 *
 * O gloss entre parênteses do nome entra também, porque é ali que mora a
 * palavra comum: "B-1 e B-2 (negocios e turismo)" identifica-se tanto por
 * "B-1" quanto por "turismo".
 */
export function termosDoTopico(item: ItemEvergreen): string[] {
  const doPrograma = (item.topico.programa ?? "")
    .split(/[\s/,]+/)
    .map((t) => normalizar(t).trim())
    .filter((t) => t.length >= 2);

  const doNome = normalizar(item.topico.nome)
    .replace(/[()]/g, " ")
    .split(/[\s,]+/)
    .map((t) => t.replace(/[^a-z0-9-]/g, "").trim())
    .filter((t) => t.length >= 4 && !IRRELEVANTES.has(t));

  return [...new Set([...doPrograma, ...doNome])].filter(Boolean);
}

export type Cobertura = {
  ok: boolean;
  /** Quantos fatos do pacote falam do assunto declarado. */
  fatosNoAssunto: number;
  termos: string[];
  motivo: string;
};

export function conferirCobertura(item: ItemEvergreen, pacote: PacoteFactual): Cobertura {
  const termos = termosDoTopico(item);
  const fatos = pacote.verified_facts ?? [];

  /*
   * Tópico sem termo identificável passa.
   *
   * Não é permissividade: é não inventar reprovação. Um tópico cujo nome é só
   * palavra comum não tem como ser conferido por presença, e reprovar por não
   * ter o que conferir descartaria pauta boa por defeito da régua, não da
   * fonte.
   */
  if (termos.length === 0) {
    return {
      ok: true,
      fatosNoAssunto: fatos.length,
      termos,
      motivo: "o tópico não tem termo identificável, e a cobertura não pôde ser medida",
    };
  }

  const noAssunto = fatos.filter((f) => {
    const n = normalizar(f);
    return termos.some((t) => n.includes(t));
  });

  if (noAssunto.length >= MINIMO_DE_FATOS_DO_TOPICO) {
    return {
      ok: true,
      fatosNoAssunto: noAssunto.length,
      termos,
      motivo: `${noAssunto.length} de ${fatos.length} fato(s) falam do assunto`,
    };
  }

  return {
    ok: false,
    fatosNoAssunto: noAssunto.length,
    termos,
    motivo:
      `${MOTIVO_SEM_COBERTURA}: ${noAssunto.length} de ${fatos.length} fato(s) mencionam o assunto ` +
      `(${termos.slice(0, 5).join(", ")}), e o piso é ${MINIMO_DE_FATOS_DO_TOPICO}. ` +
      `As fontes canônicas do tópico responderam, mas não tratam do que o tópico promete.`,
  };
}
