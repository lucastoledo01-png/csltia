/**
 * Etapa 3 — guardrail de propriedade intelectual.
 *
 * O Sistema PROMPT vive de pegar carona em tendência cultural, e tendência
 * cultural quase sempre pertence a alguém. A linha que não pode ser cruzada é
 * estreita e vale escrever:
 *
 * **Pode** — inspirar-se em características visuais gerais: paleta, tipo de
 * iluminação, gênero de composição, atmosfera, época. "Retrato com paleta neon
 * e grão de filme dos anos 80" não pertence a ninguém.
 *
 * **Não pode** — reproduzir logotipo, key art, pôster, personagem ou peça
 * protegida; nem enquadrar a imagem gerada como material oficial, vazamento,
 * anúncio ou colaboração. O segundo é pior que o primeiro: uma imagem parecida
 * é discutível, mas dizer que é oficial é afirmação falsa sobre a marca de
 * outro.
 *
 * ## A lição que a primeira versão ensinou
 *
 * A versão anterior barrava por substring, e barrou os dois primeiros
 * conceitos reais gerados — ambos por **mencionar** o que estavam proibindo.
 * Um dizia "não inserir logos, marcas ou personagens reconhecíveis"; o outro,
 * "sem marcas ou logotipos visíveis". São exatamente as instruções que a gente
 * quer, e o guardrail as tratava como violação.
 *
 * Um guardrail que reprova a boa prática é pior que nenhum: além de travar o
 * trabalho, ensina a não escrever a restrição, que é o oposto do objetivo.
 *
 * Daí as duas mudanças: **negação conta a favor**, e os termos ficaram
 * específicos. "logo" sozinho saiu — em português também é advérbio ("logo
 * depois") — e no lugar entraram "logotipo", "logomarca" e "logo d[aeo]".
 */

/**
 * Termos que indicam reprodução de peça protegida, e não inspiração.
 *
 * O sufixo `*` marca radical, para o português flexionar sem escapar do
 * casador: `patrocinad*` pega patrocinado e patrocinada. Sem `*`, o termo é
 * casado com fronteira de palavra nas duas pontas.
 */
const REPRODUCAO = [
  "logotipo*",
  "logomarca*",
  "logo da",
  "logo do",
  "logo de",
  "key art",
  "keyart",
  "poster oficial",
  "capa oficial",
  "arte oficial",
  "marca registrada",
  "trademark",
  "personagem oficial",
];

/** Termos que afirmam ser material oficial — o risco mais grave. */
const FALSA_OFICIALIDADE = [
  "material oficial",
  "anuncio oficial",
  "vazamento",
  "em parceria com",
  "colaboracao oficial",
  "patrocinad*",
  "autorizad*",
  "licenciad*",
];

/**
 * Marcadores de negação. Quando um deles aparece pouco antes do termo, o texto
 * está **excluindo** a peça protegida, não pedindo — e isso conta a favor.
 */
const NEGACOES = [
  "nao inserir",
  "nao insira",
  "nao usar",
  "nao use",
  "nao incluir",
  "nao inclua",
  "nao aparece",
  "nao reconhecivel",
  "nenhum",
  "nenhuma",
  "sem ",
  "evite",
  "evitar",
  "exclua",
  "excluir",
  "proibido",
  "jamais",
  // "nunca" é a negação mais comum do português falado, e ficou de fora na
  // primeira versão junto com "jamais" — que é a variante rara. O conceito
  // das miniaturas dizia "aparência de recriação autoral, nunca de material
  // oficial": a frase que declara a boa prática era exatamente a que barrava
  // o conceito.
  "nunca",
  "livre de",
  "isento de",
  // "em vez de"/"no lugar de" negam por substituição: "estética inspirada, em
  // vez de material oficial" diz a mesma coisa que "não é material oficial".
  "em vez de",
  "no lugar de",
  "nada de",
];

/** Quantos caracteres antes do termo são olhados em busca de negação. */
const JANELA_DE_NEGACAO = 60;

/** Tira o marcador de radical antes de mostrar o termo a quem opera. */
function limparRotulo(termo: string): string {
  return termo.replace(/\*$/, "");
}

export type VeredictoPI = {
  aprovado: boolean;
  motivos: string[];
  correcoes: string[];
  /** Restrições que o conceito já declara — contam a favor. */
  restricoesDeclaradas: string[];
  verificadoEm: string;
};

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Verdadeiro quando a ocorrência do termo está sob negação.
 *
 * Olha só para trás, e numa janela curta: "sem marcas ou logotipos" nega, mas
 * "sem pressa, use o logotipo da marca" não deveria — e não nega, porque o
 * "sem" está longe demais do termo.
 */
function estaNegado(texto: string, posicao: number): boolean {
  const antes = texto.slice(Math.max(0, posicao - JANELA_DE_NEGACAO), posicao);
  return NEGACOES.some((n) => antes.includes(n));
}

function escaparRegex(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Casa o termo com fronteira de palavra.
 *
 * Substring simples fazia "logo depois do amanhecer" casar com "logo de" — e
 * "logo" como advérbio é uso comum em português, sem nenhuma relação com
 * marca. Fronteira resolve: "logo de" só casa quando "de" termina ali.
 *
 * Radical (`termo*`) mantém a fronteira só no início, porque o fim é
 * justamente o que varia.
 */
function regexDoTermo(termo: string): RegExp {
  const radical = termo.endsWith("*");
  const base = escaparRegex(radical ? termo.slice(0, -1) : termo);
  return new RegExp(radical ? `\\b${base}` : `\\b${base}\\b`, "g");
}

/** Ocorrências do termo que **não** estão sob negação. */
function ocorrenciasAfirmativas(texto: string, termo: string): number {
  let total = 0;

  for (const m of texto.matchAll(regexDoTermo(termo))) {
    if (m.index !== undefined && !estaNegado(texto, m.index)) total += 1;
  }

  return total;
}

/** O termo aparece no texto, negado ou não. */
function aparece(texto: string, termo: string): boolean {
  return regexDoTermo(termo).test(texto);
}

export function checarPropriedadeIntelectual(entrada: {
  conceito: string;
  hook?: string;
  aplicacoes?: string[];
  direcaoVisual?: Record<string, unknown>;
}): VeredictoPI {
  const alvo = normalizar(
    [
      entrada.conceito,
      entrada.hook ?? "",
      ...(entrada.aplicacoes ?? []),
      JSON.stringify(entrada.direcaoVisual ?? {}),
    ].join(" \n "),
  );

  const motivos: string[] = [];
  const correcoes: string[] = [];
  const restricoesDeclaradas: string[] = [];

  const reproduz = REPRODUCAO.filter((t) => ocorrenciasAfirmativas(alvo, normalizar(t)) > 0);
  const negados = [...REPRODUCAO, ...FALSA_OFICIALIDADE].filter(
    (t) => aparece(alvo, normalizar(t)) && ocorrenciasAfirmativas(alvo, normalizar(t)) === 0,
  );
  restricoesDeclaradas.push(...negados.map(limparRotulo));

  if (reproduz.length) {
    motivos.push(`Pede reprodução de peça protegida: ${reproduz.map(limparRotulo).join(", ")}.`);
    correcoes.push(
      "Troque a referência à peça por características visuais gerais — paleta, " +
        "iluminação, gênero de composição, atmosfera, época.",
    );
  }

  const finge = FALSA_OFICIALIDADE.filter((t) => ocorrenciasAfirmativas(alvo, normalizar(t)) > 0);
  if (finge.length) {
    motivos.push(`Enquadra o resultado como oficial ou autorizado: ${finge.map(limparRotulo).join(", ")}.`);
    correcoes.push(
      "Remova qualquer afirmação de oficialidade, parceria, licença ou vazamento. " +
        "O conteúdo é uma recriação autoral inspirada numa estética, e precisa se " +
        "apresentar como tal.",
    );
  }

  return {
    aprovado: motivos.length === 0,
    motivos,
    correcoes,
    restricoesDeclaradas,
    verificadoEm: new Date().toISOString(),
  };
}

/**
 * Instrução que entra no prompt da etapa 2.
 *
 * Pede a restrição explícita de propósito: além de produzir conceito melhor,
 * a restrição declarada agora **conta a favor** no guardrail em vez de contra.
 */
export const INSTRUCAO_PI = `
LIMITE DE PROPRIEDADE INTELECTUAL — obrigatório:
- Você pode se inspirar em características visuais GERAIS de uma obra ou marca:
  paleta, tipo de iluminação, gênero de composição, atmosfera, época, textura.
- Você NÃO pode pedir reprodução de logotipo, key art, pôster, capa, personagem
  reconhecível ou qualquer peça protegida.
- Você NÃO pode enquadrar o resultado como material oficial, vazamento,
  anúncio, parceria, licença ou colaboração. O conteúdo é recriação autoral
  inspirada numa estética, e tem que se apresentar como tal.
- Quando a tendência envolver franquia, artista ou marca, descreva a ESTÉTICA,
  nunca a peça. "Retrato com paleta neon saturada e grão de filme dos anos 80"
  serve; "no estilo do pôster do filme X" não serve.
- Escreva a restrição dentro da aplicação quando fizer sentido ("sem marcas ou
  logotipos visíveis", "personagem original, não reconhecível"). Isso é
  desejável e conta a favor.
`.trim();
