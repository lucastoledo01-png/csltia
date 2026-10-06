/**
 * A forma do assunto do e-mail, conferida em código (06/10/2026).
 *
 * O método veio da leitura de 40 assuntos do The News, aprovada pelo dono: caixa
 * baixa, de 2 a 7 palavras, uns 40 caracteres no máximo, sem ponto final, sobre
 * UMA história. Os nossos saíam descritivos ("o depósito de imigração rende
 * juros", "a lista dos US$ 30 bilhões") e um deles saiu com maiúscula ("O Alasca
 * entrou na conta"): o prompt pedia caixa baixa "como padrão", e padrão não é
 * regra.
 *
 * O que é FORMA mora aqui e não depende do modelo: caixa, ponto final,
 * travessão e espaços são consertados sem pedir nada a ninguém. O que é TAMANHO
 * não tem conserto determinístico, porque cortar um assunto muda o que ele diz;
 * então a escolha cai na primeira opção da própria redação que cabe, e só sem
 * nenhuma que caiba fica a mais curta, com o problema registrado.
 *
 * A caixa baixa é inteira, nomes próprios e siglas incluídos ("stf", "lula",
 * "nike"), porque é o que a referência faz. A exceção são os símbolos de moeda,
 * "R$" e "US$": o The News escreve "R$ 5 bi", e "r$" não é caixa baixa de nada,
 * é um símbolo quebrado.
 */

/*
 * O ALVO é o que o prompt pede; o TETO é o que o código recusa. Os dois são
 * diferentes de propósito, e o teto saiu da própria referência: "o advogado
 * que apostou R$ 5 bi no tigrinho" tem 9 palavras e 42 caracteres, e "a balada
 * com 20 homens e 120 mulheres" tem 8. Um teto em 7 e 40 recusaria os exemplos
 * que ensinam o método.
 */
export const FORMA_DO_ASSUNTO = {
  minimoDePalavras: 2,
  alvoDePalavras: 7,
  maximoDePalavras: 9,
  alvoDeCaracteres: 40,
  maximoDeCaracteres: 45,
} as const;

export type ProblemaDoAssunto =
  | "VAZIO"
  | "POUCAS_PALAVRAS"
  | "PALAVRAS_DEMAIS"
  | "CARACTERES_DEMAIS"
  | "MAIUSCULA"
  | "PONTO_FINAL"
  | "TRAVESSAO"
  | "DOIS_PONTOS";

/** Os problemas que a normalização resolve sozinha. */
const DE_FORMA: ProblemaDoAssunto[] = ["MAIUSCULA", "PONTO_FINAL", "TRAVESSAO"];

/** Caixa baixa inteira, com os símbolos de moeda devolvidos ao que são. */
function caixaBaixa(texto: string): string {
  return texto
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[^a-z0-9])(us|r)\$/g, (_m, antes: string, moeda: string) => `${antes}${moeda.toUpperCase()}$`);
}

/**
 * O assunto na forma da casa, sem mudar uma palavra do que ele diz.
 *
 * Travessão e meia-risca viram vírgula, que é o que a frase falada faz no lugar
 * deles. Ponto final e reticências no fim saem; interrogação e exclamação
 * ficam, porque a pergunta é uma das cinco formas.
 */
export function normalizarAssunto(bruto: string): string {
  let t = String(bruto ?? "")
    .replace(/[\u2014\u2013]/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/,(?=\S)/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  t = t.replace(/(?:\.\s*|…\s*)+$/u, "").trim();
  t = t.replace(/,\s*$/, "").trim();
  return caixaBaixa(t);
}

function palavras(texto: string): string[] {
  return texto
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p && /[\p{L}\p{N}]/u.test(p));
}

/** O que está fora da forma, sem consertar nada. */
export function problemasDoAssunto(assunto: string): ProblemaDoAssunto[] {
  const t = String(assunto ?? "").trim();
  if (!t) return ["VAZIO"];

  const problemas: ProblemaDoAssunto[] = [];
  const n = palavras(t).length;
  if (n < FORMA_DO_ASSUNTO.minimoDePalavras) problemas.push("POUCAS_PALAVRAS");
  if (n > FORMA_DO_ASSUNTO.maximoDePalavras) problemas.push("PALAVRAS_DEMAIS");
  if (t.length > FORMA_DO_ASSUNTO.maximoDeCaracteres) problemas.push("CARACTERES_DEMAIS");
  if (caixaBaixa(t) !== t) problemas.push("MAIUSCULA");
  if (/[.…]\s*$/u.test(t)) problemas.push("PONTO_FINAL");
  if (/[\u2014\u2013]/.test(t)) problemas.push("TRAVESSAO");
  if (/:/.test(t)) problemas.push("DOIS_PONTOS");
  return problemas;
}

export type AssuntoEscolhido = {
  subject: string;
  subject_options: string[];
  /** O assunto mudou de opção, e não só de forma. */
  trocado: boolean;
  /** O que ficou fora da forma mesmo depois da escolha. Vazio é o normal. */
  problemas: ProblemaDoAssunto[];
};

/**
 * Normaliza o assunto e as opções, e escolhe o primeiro que cabe.
 *
 * A ordem de preferência é a da redação: o `subject` que ela escolheu, depois
 * as opções na ordem em que vieram. Opção repetida depois de normalizada sai,
 * porque "O Alasca" e "o alasca" são a mesma linha.
 */
export function escolherAssunto(subject: string, opcoes: string[]): AssuntoEscolhido {
  const normalizadas: string[] = [];
  for (const o of opcoes ?? []) {
    const n = normalizarAssunto(o);
    if (n && !normalizadas.includes(n)) normalizadas.push(n);
  }

  const original = normalizarAssunto(subject);
  const candidatos = [original, ...normalizadas.filter((o) => o !== original)].filter(Boolean);
  const semProblema = candidatos.find((c) => problemasDoAssunto(c).length === 0);

  if (semProblema) {
    return {
      subject: semProblema,
      subject_options: normalizadas,
      trocado: semProblema !== original,
      problemas: [],
    };
  }

  /*
   * Nenhuma cabe. Fica a mais curta, e não a primeira: o defeito que sobra é
   * de tamanho, e a mais curta é a que menos estoura. Cortar para caber está
   * fora de questão, porque "a balada com 20 homens e" não diz nada.
   */
  const reserva = [...candidatos].sort((a, b) => a.length - b.length)[0] ?? original;
  return {
    subject: reserva,
    subject_options: normalizadas,
    trocado: reserva !== original,
    problemas: problemasDoAssunto(reserva).filter((p) => !DE_FORMA.includes(p)),
  };
}

/** Aplica a forma à edição, devolvendo o que precisou mudar para o log. */
export function aplicarFormaDoAssunto<T extends { subject: string; subject_options: string[] }>(
  edicao: T,
): { edicao: T; mudou: boolean; problemas: ProblemaDoAssunto[]; antes: string } {
  const antes = edicao.subject;
  const escolha = escolherAssunto(edicao.subject, edicao.subject_options);
  return {
    edicao: { ...edicao, subject: escolha.subject, subject_options: escolha.subject_options },
    mudou: escolha.subject !== antes,
    problemas: escolha.problemas,
    antes,
  };
}
