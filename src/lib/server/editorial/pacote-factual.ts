import { z } from "zod";
import { callOpenAIJSON } from "../newsroom/ai-provider";

/**
 * O que o redator pode afirmar.
 *
 * A edição de validação inventou uma operação policial com nome próprio e o
 * sobrenome de um banqueiro. Nenhum dos dois estava no material. O QA pegou,
 * e pegar depois é a última linha de defesa, não a primeira.
 *
 * A primeira é esta: o redator recebe uma lista fechada de fatos, nomes,
 * organizações, lugares, datas e números extraídos da matéria, e a instrução
 * de que fora dessa lista não existe fato. Contexto e transição ele escreve;
 * fato, não inventa.
 */

const listaDeTexto = z.preprocess(
  (v) => {
    if (typeof v === "string") return v.trim() ? [v] : [];
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
    return [];
  },
  z.array(z.string()).default([])
);

export const PacoteFactualSchema = z.object({
  /** Frases do que aconteceu, cada uma sustentada pela matéria. */
  verified_facts: listaDeTexto,
  people: listaDeTexto,
  organizations: listaDeTexto,
  places: listaDeTexto,
  dates: listaDeTexto,
  numbers: listaDeTexto,
  /** O que a matéria explicitamente NÃO diz. Serve para o redator não supor. */
  gaps: listaDeTexto,
});

export type PacoteFactual = z.infer<typeof PacoteFactualSchema> & {
  source_urls: string[];
  /** Texto de origem, guardado para a verificação de ancoragem. */
  texto_de_origem: string;
};

export function montarSystemDoExtrator(): string {
  return `
Você extrai fatos de uma matéria jornalística. Não resume, não interpreta, não completa.

Devolva JSON com:

verified_facts: frases curtas, cada uma afirmando algo que ESTÁ ESCRITO na matéria. Uma informação por frase. Não junte duas informações numa frase. Não escreva nada que exija conhecimento externo.

people: nomes de pessoas citados, exatamente como aparecem.
organizations: órgãos, empresas, tribunais e entidades citados, exatamente como aparecem.
places: cidades, estados e países citados.
dates: datas e períodos citados, como aparecem ("31 de agosto", "2026", "nesta quinta-feira").
numbers: números citados com o que eles medem ("540 dias", "1,2 milhão de pedidos", "US$ 3 mil").
gaps: o que a matéria NÃO informa e um leitor perguntaria. Só liste lacuna real.

Regras:
- Se um nome, número ou data não está na matéria, ele não entra. Não deduza, não converta, não estime.
- Não traduza nomes próprios de órgãos: mantenha como está escrito.
- Lista vazia é uma resposta válida e correta quando a matéria não traz aquilo.
`.trim();
}

export async function montarPacoteFactual(
  pauta: { titulo: string; texto: string; urls: string[] },
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<{ pacote: PacoteFactual; custoUsd: number; tokens: number }> {
  const modelo = env.OPENAI_MODEL_TRIAGE || "gpt-4o-mini";

  const { data, usage } = await callOpenAIJSON<unknown>(
    [
      { role: "system", content: montarSystemDoExtrator() },
      {
        role: "user",
        content: `Título: ${pauta.titulo}\n\nMatéria:\n${pauta.texto.slice(0, 8000)}`,
      },
    ],
    modelo,
    env,
    fetcher
  );

  const parsed = PacoteFactualSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Extrator devolveu formato inválido: ${parsed.error.issues[0]?.message ?? ""}`);
  }

  // As listas aceitam formato torto e viram vazio quando o modelo erra a
  // forma. Isso é bom para não perder o resto do pacote e péssimo se passar
  // despercebido: pacote sem fato nenhum faz TODA afirmação do texto parecer
  // não sustentada, e a edição inteira é recusada por um erro de extração.
  // Melhor falhar aqui, onde o motivo ainda é legível.
  if (parsed.data.verified_facts.length === 0) {
    throw new Error("Extrator não devolveu nenhum fato verificado para esta pauta.");
  }

  return {
    pacote: { ...parsed.data, source_urls: pauta.urls, texto_de_origem: pauta.texto },
    custoUsd: usage.estimatedCostUsd,
    tokens: usage.totalTokens,
  };
}

/* ------------------------------------------------------------------ */
/* Ancoragem                                                           */
/* ------------------------------------------------------------------ */

export type ClaimNaoSustentada = {
  tipo: "numero" | "data" | "nome";
  valor: string;
  onde: string;
  /**
   * Bloqueio ou aviso.
   *
   * Número, data e nome composto bloqueiam: foi assim que apareceram
   * "Operação Compliance Zero" e um sobrenome que não existia no material.
   *
   * Palavra isolada com inicial maiúscula fica em aviso, porque português
   * capitaliza no meio da frase o que não é nome de ninguém. A conferência
   * acusou "duas Casas" como entidade inventada; bloquear a edição por causa
   * disso seria trocar um erro por outro.
   */
  severidade: "bloqueio" | "aviso";
};

export type ResultadoDaAncoragem = {
  /** Falso só quando há claim de bloqueio. Aviso não derruba a edição. */
  ancorado: boolean;
  naoSustentadas: ClaimNaoSustentada[];
  conferidos: number;
};

function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MESES = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * Palavras institucionais e genéricas que o português capitaliza sem nomear
 * ninguém em específico.
 *
 * Elas só chegam a ser conferidas quando NÃO estão no material: se a matéria
 * fala em Senado, "Senado" no texto casa e nada acontece. O que esta lista
 * decide é a severidade quando não casa. "Casas do Congresso" numa matéria que
 * dizia "Câmara e Senado" é paráfrase, não invenção; "Operação Compliance
 * Zero" numa matéria que não nomeia operação nenhuma é invenção.
 */
const GENERICAS = new Set([
  "casa", "casas", "congresso", "camara", "senado", "governo", "presidencia",
  "ministerio", "tribunal", "corte", "justica", "estado", "estados", "uniao",
  "republica", "federal", "lei", "projeto", "programa", "norte", "sul", "leste",
  "oeste", "pais", "paises", "cidade", "capital", "regiao", "poder", "poderes",
  "executivo", "legislativo", "judiciario", "operacao", "decreto", "portaria",
  "medida", "regra", "regras", "agencia", "orgao", "departamento", "servico",
]);

/**
 * Palavras que começam frase, viram título ou são o vocabulário da própria
 * publicação. Capitalizadas, e não são nome de nada.
 */
const IGNORAR = new Set([
  "a", "o", "as", "os", "um", "uma", "e", "ou", "mas", "se", "para", "por", "com", "sem",
  "no", "na", "nos", "nas", "do", "da", "dos", "das", "ao", "aos", "que", "quando", "onde",
  "isso", "isto", "ele", "ela", "eles", "elas", "este", "esta", "esse", "essa", "aquele",
  "bom", "boa", "dia", "hoje", "ontem", "amanha", "fonte", "leia", "veja", "segundo",
  "quem", "como", "porque", "ja", "ainda", "agora", "entao", "assim", "tambem", "so",
  "acompanhe", "confirme", "responda", "compartilhe", "nao", "sim", "the", "of", "in",
]);

/**
 * O texto gerado afirma só o que o pacote sustenta?
 *
 * Confere três classes, e cada uma erra de um jeito diferente:
 *
 *   números e datas   exatos. "540 dias" ou está no material ou foi inventado.
 *   nomes próprios    aceita casamento parcial, porque o redator escreve em
 *                     português sobre matéria em inglês e "Departamento de
 *                     Segurança Interna" é o "Department of Homeland Security"
 *                     da fonte. Exigir literalidade acusaria tradução como
 *                     invenção.
 *
 * O material de comparação é o pacote MAIS o texto de origem. O pacote é uma
 * extração e pode ter deixado algo de fora; o texto é o que existe.
 */
export function validarAncoragem(
  textoGerado: string,
  pacote: PacoteFactual
): ResultadoDaAncoragem {
  const palheiro = normalizar(
    [
      pacote.texto_de_origem,
      ...pacote.verified_facts,
      ...pacote.people,
      ...pacote.organizations,
      ...pacote.places,
      ...pacote.dates,
      ...pacote.numbers,
    ].join(" ")
  );

  const naoSustentadas: ClaimNaoSustentada[] = [];
  let conferidos = 0;

  // Números: dígitos com separador, incluindo o que vem colado a "mil" ou
  // "milhão", que é como número grande aparece em português.
  for (const m of textoGerado.matchAll(/\b\d[\d.,]*\b(\s*(?:mil|milh[õo]es|milh[ãa]o|bilh[õo]es|bilh[ãa]o))?/gi)) {
    const bruto = m[0].trim();
    conferidos += 1;
    if (!numeroSustentado(bruto, palheiro)) {
      naoSustentadas.push({
        tipo: "numero",
        valor: bruto,
        onde: trecho(textoGerado, m.index ?? 0),
        severidade: "bloqueio",
      });
    }
  }

  // Datas por extenso.
  for (const m of textoGerado.matchAll(
    new RegExp(`\\b(\\d{1,2}\\s+de\\s+(?:${MESES.join("|")})|(?:${MESES.join("|")})\\s+de\\s+\\d{4})\\b`, "gi")
  )) {
    conferidos += 1;
    const valor = m[0];
    if (!palheiro.includes(normalizar(valor)) && !parteDaDataSustentada(valor, palheiro)) {
      naoSustentadas.push({
        tipo: "data",
        valor,
        onde: trecho(textoGerado, m.index ?? 0),
        severidade: "bloqueio",
      });
    }
  }

  // Nomes próprios: sequências de palavras capitalizadas, siglas incluídas.
  for (const m of textoGerado.matchAll(
    /\b([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\wÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\wÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç]+)*|[A-Z]{2,}(?:-\d+)?)\b/g
  )) {
    const bruto = m[0].trim();
    const chave = normalizar(bruto);
    if (IGNORAR.has(chave)) continue;
    if (chave.length < 3) continue;
    // Início de frase capitaliza qualquer palavra. "Brasileiros que acompanham"
    // e "Desde a decisão" viraram avisos na conferência, e nenhum dos dois é
    // nome de coisa nenhuma.
    if (!chave.includes(" ") && comecaFrase(textoGerado, m.index ?? 0)) continue;

    conferidos += 1;
    if (!nomeSustentado(chave, palheiro)) {
      naoSustentadas.push({
        tipo: "nome",
        valor: bruto,
        onde: trecho(textoGerado, m.index ?? 0),
        severidade: severidadeDoNome(chave),
      });
    }
  }

  const bloqueios = naoSustentadas.filter((c) => c.severidade === "bloqueio");
  return { ancorado: bloqueios.length === 0, naoSustentadas, conferidos };
}

/**
 * O número aparece no material, e aparece como NÚMERO.
 *
 * As três buscas eram `includes` sem fronteira, e isso é o que faz uma
 * verificação de número virar uma verificação de substring de dígito. Medido:
 * com a fonte dizendo "Foram 1540 pedidos", o texto "a espera chega a 540 dias"
 * passava, porque "540" está dentro de "1540"; e com a fonte citando
 * "8 CFR 245.1", "o processo leva 245 dias" passava, porque o número da norma
 * serve de âncora para qualquer prazo inventado.
 *
 * Isso é grave em qualquer pauta e é pior no conteúdo permanente, onde o
 * palheiro é a página inteira de um manual oficial, cheia de número de seção,
 * de formulário e de taxa. Cada um deles autoriza um prazo que ninguém escreveu.
 *
 * A busca agora exige fronteira: o dígito não pode ter dígito colado antes nem
 * depois. "1.440" continua sustentando "1,440" e "1440", porque a comparação por
 * dígitos puros continua existindo; o que deixa de valer é "440" dentro de
 * "1.440".
 */
function comFronteira(palheiro: string, agulha: string): boolean {
  if (!agulha) return false;

  let de = 0;
  for (;;) {
    const i = palheiro.indexOf(agulha, de);
    if (i < 0) return false;

    const antes = palheiro[i - 1];
    const depois = palheiro[i + agulha.length];
    const digitoAntes = antes !== undefined && /[\d.,]/.test(antes);
    const digitoDepois = depois !== undefined && /\d/.test(depois);

    if (!digitoAntes && !digitoDepois) return true;
    de = i + 1;
  }
}

function numeroSustentado(bruto: string, palheiro: string): boolean {
  const so = normalizar(bruto);
  if (comFronteira(palheiro, so)) return true;

  // "1,2 milhão" na fonte e "1.2 milhão" no texto são o mesmo número.
  const digitos = so.replace(/[^\d]/g, "");
  if (digitos && palheiro.replace(/[^\d ]/g, "").split(/\s+/).includes(digitos)) return true;

  // Número solto dentro de outra grafia ("540" em "540 dias").
  const soDigito = so.match(/^\d[\d.,]*/)?.[0]?.replace(/[.,]$/, "");
  return Boolean(soDigito && comFronteira(palheiro, soDigito));
}

function parteDaDataSustentada(valor: string, palheiro: string): boolean {
  const partes = normalizar(valor).split(/\s+de\s+/);
  return partes.every((p) => palheiro.includes(p));
}

/**
 * Palavra isolada é aviso: o português capitaliza no meio da frase o que não é
 * nome de ninguém, e a conferência chegou a acusar "duas Casas" como entidade
 * inventada. Nome composto é bloqueio, a menos que todas as suas palavras
 * sejam genéricas, que é o caso de "Casas do Congresso".
 */
function severidadeDoNome(chave: string): "bloqueio" | "aviso" {
  const palavras = chave.split(" ").filter((p) => p.length > 2 && !IGNORAR.has(p));
  if (palavras.length <= 1) return "aviso";
  return palavras.every((p) => GENERICAS.has(p)) ? "aviso" : "bloqueio";
}

function nomeSustentado(chave: string, palheiro: string): boolean {
  if (palheiro.includes(chave)) return true;

  // Casamento parcial para nome composto: o redator traduz e reordena. Basta
  // uma palavra significativa aparecer na origem.
  const palavras = chave.split(" ").filter((p) => p.length > 3 && !IGNORAR.has(p));
  if (palavras.length === 0) return true;
  return palavras.some((p) => palheiro.includes(p));
}

function comecaFrase(texto: string, indice: number): boolean {
  const antes = texto.slice(0, indice).trimEnd();
  if (antes.length === 0) return true;
  return /[.!?:;]$/.test(antes) || antes.endsWith("\n");
}

function trecho(texto: string, indice: number): string {
  return texto.slice(Math.max(0, indice - 40), indice + 60).replace(/\s+/g, " ").trim();
}

/**
 * Um pacote por pauta selecionada.
 *
 * Roda só sobre o punhado que vai ser escrito, então é sequencial de
 * propósito: paralelizar duas ou três chamadas economiza segundos e complica
 * o tratamento de erro.
 *
 * Falha em uma pauta não derruba as outras. A pauta sem pacote chega ao
 * redator sem lista fechada de fatos e sem conferência de ancoragem, e quem
 * chama precisa tratar isso como risco, não como aprovação.
 */
export async function montarPacotesDasPautas(
  pautas: Array<{ url: string; titulo: string; texto: string; urls: string[] }>,
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch
): Promise<{
  pacotes: Map<string, PacoteFactual>;
  custoUsd: number;
  tokens: number;
  falhas: string[];
}> {
  const pacotes = new Map<string, PacoteFactual>();
  const falhas: string[] = [];
  let custoUsd = 0;
  let tokens = 0;

  for (const pauta of pautas) {
    try {
      const r = await montarPacoteFactual(
        { titulo: pauta.titulo, texto: pauta.texto, urls: pauta.urls },
        env,
        fetcher
      );
      pacotes.set(pauta.url, r.pacote);
      custoUsd += r.custoUsd;
      tokens += r.tokens;
    } catch (erro) {
      falhas.push(`${pauta.titulo.slice(0, 60)}: ${(erro as Error).message}`);
    }
  }

  return { pacotes, custoUsd, tokens, falhas };
}
