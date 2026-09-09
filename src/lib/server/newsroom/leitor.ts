import type { EditionContent, EditionStory } from "./schemas";

/**
 * A newsletter é para quem quer morar nos EUA, não para quem advoga sobre isso.
 *
 * A edição de 09/09 saiu tecnicamente correta e ilegível para o público. Um
 * título real dela: "Na Califórnia, acordos nupciais geralmente não encerram o
 * I-864". Ninguém que está pensando em se mudar procura essa frase, e quem a
 * entende já não precisa da newsletter.
 *
 * As duas verificações aqui são determinísticas, e isso é escolha. Poderiam ser
 * uma pergunta ao modelo — "este texto está acessível?" —, e a resposta variaria
 * a cada execução, custaria uma chamada por edição e não diria O QUE consertar.
 * Contar termo técnico sem explicação e medir se a matéria diz para quem ela
 * importa dá um apontamento nominal, reproduzível e barato, que é o que o
 * reparo precisa para saber onde mexer.
 *
 * Nenhuma das duas BLOQUEIA a edição. Elas entram na lista de reparo, o gerador
 * tenta consertar duas vezes, e o que sobrar sobra registrado. Texto difícil é
 * defeito de redação, não fato inventado: derrubar a edição por causa dele
 * trocaria um problema de forma por um dia sem newsletter.
 */

/**
 * Termos que o público não conhece, e que a matéria precisa explicar na
 * primeira vez que usa.
 *
 * A lista é curta de propósito: é o vocabulário que apareceu de fato nas
 * edições, mais o que o dono do produto apontou. Uma lista enorme geraria
 * apontamento em toda edição e o reparo aprenderia a ignorar.
 */
export const TERMOS_TECNICOS = [
  "adjustment of status",
  "affidavit of support",
  "priority date",
  "public charge",
  "consular processing",
  "petitioner",
  "beneficiary",
  "injunction",
  "liminar",
  "writ",
  "waiver",
  "parole",
  "removal proceedings",
  "notice to appear",
  "request for evidence",
  "prima facie",
  "obrigação federal de suporte",
  "acordo pré-nupcial",
  "acordo pós-nupcial",
] as const;

/**
 * Número de formulário e sigla de visto: I-864, I-765, EB-2, H-1B, DS-160.
 *
 * Eles são o vocabulário diário desta vertical e não dá para proibir. O que dá
 * para exigir é que a primeira aparição venha com o que a coisa é.
 */
const CODIGO_TECNICO = /\b(?:[A-Z]{1,3}-\d{1,4}[A-Z]?\d?|NIW|EAD|USCIS|DHS|ICE|CBP)\b/g;

/**
 * O que conta como explicação logo depois do termo.
 *
 * Não se exige uma definição formal: basta o texto dizer, ali, o que aquilo é
 * ou para que serve. A janela é curta porque explicação que aparece três
 * parágrafos depois não ajuda quem travou na primeira leitura.
 */
const JANELA_DA_EXPLICACAO = 160;
const MARCAS_DE_EXPLICACAO = [
  "documento",
  "formulário",
  "formulario",
  "processo",
  "pedido",
  "visto",
  "autorização",
  "autorizacao",
  "permissão",
  "permissao",
  "que é",
  "que e",
  "ou seja",
  "isto é",
  "isto e",
  "usado para",
  "usada para",
  "serve para",
  "significa",
  "quando",
  "etapa",
  "regra",
  "decisão",
  "decisao",
  "agência",
  "agencia",
  "órgão",
  "orgao",
];

/**
 * O termo aparece e, na janela seguinte DENTRO DO MESMO CAMPO, nada diz o que
 * ele é.
 *
 * A restrição ao campo não é detalhe. A primeira versão procurava no texto
 * inteiro concatenado, e uma palavra como "autorização" no `practical_impact`
 * passava a "explicar" um `waiver` que apareceu no `summary` cem caracteres
 * antes. Explicação que o leitor só encontra dois blocos depois não ajuda quem
 * travou na primeira leitura, e o teste que pegou isso existia justamente para
 * medir o teto de termos.
 */
function semExplicacao(campo: string, termo: string, posicao: number): boolean {
  const inicio = posicao + termo.length;
  const depois = campo.slice(inicio, inicio + JANELA_DA_EXPLICACAO).toLowerCase();
  return !MARCAS_DE_EXPLICACAO.some((m) => depois.includes(m));
}

/** Os campos que o leitor lê, na ordem em que ele lê. */
function camposDaMateria(s: EditionStory): string[] {
  return [s.title, s.summary, s.context, s.why_it_matters, s.practical_impact].filter(Boolean);
}

/**
 * O termo é explicado em algum lugar onde ele aparece?
 *
 * Basta uma aparição vir acompanhada do que a coisa é. Exigir explicação em
 * TODAS as aparições faria a segunda menção do mesmo formulário na mesma
 * matéria virar apontamento, o que é o oposto de texto natural.
 */
function explicadoEmAlgumCampo(campos: string[], termo: string): boolean {
  for (const campo of campos) {
    const minusculo = campo.toLowerCase();
    let pos = minusculo.indexOf(termo);
    while (pos >= 0) {
      if (!semExplicacao(minusculo, termo, pos)) return true;
      pos = minusculo.indexOf(termo, pos + 1);
    }
  }
  return false;
}

export type AchadoDeLeitor = {
  indice: number;
  motivo: "LEGAL_JARGON_OVERLOAD" | "LOW_READER_RELEVANCE" | "HEADLINE_TOO_LONG";
  descricao: string;
};

/** Acima disto a matéria virou peça jurídica. */
const TETO_DE_TERMOS_SEM_EXPLICACAO = 2;

/**
 * Comprimento de título que o celular aguenta.
 *
 * A 390px de largura, com o corpo em 22px, cabem cerca de 30 caracteres por
 * linha. Um título de 90 caracteres ocupa três linhas; de 120, quatro. O teto
 * aqui é editorial e não de CSS: reduzir a fonte para caber é o que produziu
 * texto minúsculo, e a saída certa é o título ser mais curto.
 */
const TETO_DO_TITULO = 95;

export type AchadoSemIndice = Omit<AchadoDeLeitor, "indice">;

/**
 * A régua de leitor sobre um texto qualquer, em campos.
 *
 * Ela foi extraída de dentro do laço de matérias sem mudar uma linha do que
 * decide, porque o carrossel do social precisa exatamente destas três verificações
 * e duplicá-las seria manter duas definições de "termo explicado" que divergem
 * na primeira calibração. Quem chama diz o que são os campos, qual é o título e
 * onde mora a relevância; o resto é igual para newsletter e para slide.
 */
export function conferirLinguagemDeUmTexto(entrada: {
  campos: string[];
  titulo: string;
  relevancia: string;
  /**
   * Onde o autor deve escrever a relevância, no vocabulário de quem chama.
   *
   * A newsletter tem campos com nome, e o reparo funciona muito melhor dizendo
   * "escreva em why_it_matters" do que "escreva a relevância". O carrossel não
   * tem esses campos, e por isso o texto genérico é o padrão.
   */
  ondeEscreverRelevancia?: string;
}): AchadoSemIndice[] {
  const achados: AchadoSemIndice[] = [];
  const campos = entrada.campos.filter(Boolean);
  const texto = campos.join("\n");

  const semExplicar = new Set<string>();

  for (const termo of TERMOS_TECNICOS) {
    if (texto.toLowerCase().includes(termo) && !explicadoEmAlgumCampo(campos, termo)) {
      semExplicar.add(termo);
    }
  }

  for (const achado of texto.matchAll(CODIGO_TECNICO)) {
    const codigo = achado[0];
    if (!explicadoEmAlgumCampo(campos, codigo.toLowerCase())) semExplicar.add(codigo);
  }

  if (semExplicar.size > TETO_DE_TERMOS_SEM_EXPLICACAO) {
    achados.push({
      motivo: "LEGAL_JARGON_OVERLOAD",
      descricao:
        `${semExplicar.size} termos técnicos aparecem sem dizer o que são: ` +
        `${[...semExplicar].join(", ")}. Explique cada um na primeira vez, em linguagem comum, ` +
        `ou reescreva a frase sem o termo.`,
    });
  }

  /*
   * Relevância: o texto diz para QUEM aquilo importa?
   *
   * O que se confere é se ele fala do leitor — alguém que quer morar, trabalhar,
   * estudar ou construir vida nos EUA — em vez de repetir o fato em outras
   * palavras, que é o que acontece quando o modelo preenche o campo por
   * obrigação.
   */
  const relevancia = entrada.relevancia.toLowerCase();
  const falaDoLeitor = [
    "quem",
    "você",
    "voce",
    "brasileir",
    "candidat",
    "solicitant",
    "estudant",
    "trabalhador",
    "profissional",
    "famíli",
    "famili",
    "imigrant",
    "empregador",
    "aplicant",
    "titular",
    "beneficiári",
    "beneficiari",
  ].some((m) => relevancia.includes(m));

  if (relevancia.trim().length < 40 || !falaDoLeitor) {
    const onde = entrada.ondeEscreverRelevancia ? `Escreva em ${entrada.ondeEscreverRelevancia} ` : "Escreva ";
    achados.push({
      motivo: "LOW_READER_RELEVANCE",
      descricao:
        `o texto explica o acontecimento e não diz por que ele importa para quem quer morar, ` +
        `trabalhar ou estudar nos EUA. ${onde}quem é afetado e o que essa pessoa deve fazer ou ` +
        `observar agora.`,
    });
  }

  if (entrada.titulo.length > TETO_DO_TITULO) {
    achados.push({
      motivo: "HEADLINE_TOO_LONG",
      descricao:
        `o título tem ${entrada.titulo.length} caracteres e ocuparia ${Math.ceil(entrada.titulo.length / 30)} ` +
        `linhas num celular de 390px. Reescreva em até ${TETO_DO_TITULO} caracteres, sem perder o fato.`,
    });
  }

  return achados;
}

export function conferirLinguagemDoLeitor(edition: EditionContent): AchadoDeLeitor[] {
  const achados: AchadoDeLeitor[] = [];

  edition.stories.forEach((story, i) => {
    const doTexto = conferirLinguagemDeUmTexto({
      campos: camposDaMateria(story),
      titulo: story.title,
      relevancia: `${story.why_it_matters} ${story.practical_impact}`,
      ondeEscreverRelevancia: '"why_it_matters" e "practical_impact"',
    });
    for (const a of doTexto) achados.push({ indice: i, ...a });
  });

  return achados;
}
