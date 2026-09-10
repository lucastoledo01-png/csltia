/**
 * Um número não é só um valor: é um valor com uma unidade e um papel na frase.
 *
 * A conferência de ancoragem comparava dígito com dígito, e o efeito medido foi
 * este: com "INA 245(a)" no material, a frase inventada "o processo leva 245
 * dias" passava, porque o 245 estava lá. Está mesmo, e é o número de uma norma,
 * não um prazo. O mesmo vale para "Form I-864" sustentando "US$ 864", e para
 * "60 dias" sustentando "60%".
 *
 * Este módulo classifica cada número pelo que ele É, lendo a vizinhança dele na
 * frase, e a compatibilidade passa a exigir valor E tipo. A regra que interessa
 * mais: identificador jurídico, de formulário ou de seção NUNCA sustenta
 * quantidade, duração, percentual ou moeda. Um manual oficial é cheio deles, e
 * cada um era uma âncora livre para qualquer número que o modelo inventasse.
 *
 * Deliberadamente determinístico e deliberadamente pequeno. Não é um parser de
 * linguagem natural: é uma leitura de vizinhança com nove tipos, e o que ela
 * precisa acertar é a diferença entre "número de norma" e "quantidade".
 */

export const TIPOS_DE_NUMERO = [
  "duration",
  "currency",
  "percentage",
  "count",
  "date_year",
  "legal_identifier",
  "form_identifier",
  "section_identifier",
  "generic_number",
] as const;

export type TipoDeNumero = (typeof TIPOS_DE_NUMERO)[number];

export type ClaimNumerica = {
  /** Como aparece no texto, com a grafia original. */
  bruto: string;
  /** Só os dígitos, para comparar 1.440 com 1,440 e com 1440. */
  valor: string;
  /** A unidade que a vizinhança revelou. Vazia quando não há. */
  unidade: string;
  tipo: TipoDeNumero;
  /** A vizinhança que decidiu o tipo, para o apontamento poder citá-la. */
  contexto: string;
  posicao: number;
};

/** Os tipos que identificam uma coisa, e nunca medem nada. */
const IDENTIFICADORES: TipoDeNumero[] = ["legal_identifier", "form_identifier", "section_identifier"];

export function ehIdentificador(tipo: TipoDeNumero): boolean {
  return IDENTIFICADORES.includes(tipo);
}

/**
 * O número, com o que vem colado nele.
 *
 * A captura leva o prefixo alfabético com hífen (`I-864`, `EB-2`, `N-400`)
 * porque é ele que faz um número ser identificador de formulário sem depender de
 * nenhuma palavra antes. E leva o sufixo de moeda e de porcentagem porque em
 * português os dois ficam colados de lados diferentes: "US$ 40" e "40%".
 */
const NUMERO = /(?:\b([A-Z]{1,3})-)?(\d[\d.,]*)/g;

const JANELA_ANTES = 34;
const JANELA_DEPOIS = 26;

function semAcento(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Marcadores de seção e de norma que aparecem ANTES do número. */
const ANTES_DE_SECAO =
  /\b(?:secao|section|sec|§|artigo|art|capitulo|chapter|cap|parte|part|volume|vol|anexo|apendice|appendix|item|inciso|paragrafo|paragraph)\.?\s*$/;
const ANTES_DE_NORMA =
  /\b(?:ina|usc|u\.s\.c|cfr|public\s+law|pub\.?\s*l|lei|decreto|portaria|resolucao|emenda|regra|rule|title|titulo)\.?\s*(?:no\.?|n\.?º?|number)?\s*$/;
const ANTES_DE_FORMULARIO = /\b(?:form|formulario|formularios|forms|peticao|petition)\.?\s*$/;
const ANTES_DE_MOEDA = /(?:us\$|u\$|r\$|\$|usd|brl|eur)\s*$/;
const ANTES_DE_CONTAGEM = /\b(?:cerca\s+de|mais\s+de|menos\s+de|aproximadamente|quase|ate|total\s+de|foram|sao|ha)\s*$/;

/** Unidades de tempo. A lista é fechada porque é a que decide "duration". */
const DEPOIS_DE_DURACAO =
  /^\s*(dias?|uteis|meses|mes|anos?|semanas?|horas?|minutos?|dias\s+corridos|dias\s+uteis)\b/;
const DEPOIS_DE_MOEDA = /^\s*(dolares?|reais|usd|milhoes\s+de\s+dolares|mil\s+dolares)\b/;
const DEPOIS_DE_PERCENTUAL = /^\s*(%|por\s*cento)/;
const DEPOIS_DE_SUBSECAO = /^\s*\([a-z0-9]{1,3}\)/;
const DEPOIS_DE_SECAO_PONTUADA = /^\.\d/;

/**
 * Substantivos que fazem um número ser contagem.
 *
 * Aberta de propósito, com um piso: qualquer substantivo no plural depois do
 * número conta. O que se quer distinguir é "1.440 pedidos" de "US$ 1.440", e
 * para isso basta saber que há um substantivo contável ali.
 */
const DEPOIS_DE_CONTAGEM = /^\s*[a-zà-ú]{4,}(s|es|ns|is|res)\b/;

function classificar(
  prefixo: string | undefined,
  digitos: string,
  antes: string,
  depois: string,
): { tipo: TipoDeNumero; unidade: string } {
  /*
   * Prefixo com hífen é identificador de formulário, e vem primeiro.
   *
   * `I-864`, `N-400`, `DS-260`. Não depende de nenhuma palavra antes, e é o
   * caso que mais aparece num manual oficial. `EB-2` e `H-1B` caem aqui
   * também, o que é correto: são classificações, não quantidades.
   */
  if (prefixo) return { tipo: "form_identifier", unidade: `${prefixo}-` };

  const a = semAcento(antes);
  const d = semAcento(depois);

  if (ANTES_DE_FORMULARIO.test(a)) return { tipo: "form_identifier", unidade: "" };
  if (ANTES_DE_NORMA.test(a)) return { tipo: "legal_identifier", unidade: "" };
  if (ANTES_DE_SECAO.test(a)) return { tipo: "section_identifier", unidade: "" };

  /*
   * Subseção depois do número também marca norma: "245(a)" e "103.2(b)".
   *
   * É o caso do "INA 245(a)" quando a citação chega sem a sigla antes, que
   * acontece toda vez que o texto de origem quebra linha no meio da referência.
   */
  if (DEPOIS_DE_SUBSECAO.test(d) || DEPOIS_DE_SECAO_PONTUADA.test(d)) {
    return { tipo: "section_identifier", unidade: "" };
  }

  if (DEPOIS_DE_PERCENTUAL.test(d)) return { tipo: "percentage", unidade: "%" };
  if (ANTES_DE_MOEDA.test(a) || DEPOIS_DE_MOEDA.test(d)) return { tipo: "currency", unidade: "moeda" };

  const duracao = DEPOIS_DE_DURACAO.exec(d);
  if (duracao) return { tipo: "duration", unidade: duracao[1] };

  /*
   * Ano: quatro dígitos numa faixa plausível e sem unidade nenhuma.
   *
   * Vem depois de duração e moeda de propósito: "2026 dias" é duração, e
   * "US$ 2.026" é moeda, mesmo parecendo ano.
   */
  const n = Number(digitos);
  if (digitos.length === 4 && n >= 1900 && n <= 2100) return { tipo: "date_year", unidade: "ano" };

  if (DEPOIS_DE_CONTAGEM.test(d) || ANTES_DE_CONTAGEM.test(a)) return { tipo: "count", unidade: "" };

  return { tipo: "generic_number", unidade: "" };
}

/** Todos os números de um texto, com tipo e vizinhança. */
export function extrairNumeros(texto: string): ClaimNumerica[] {
  const achados: ClaimNumerica[] = [];
  const t = texto ?? "";

  for (const m of t.matchAll(NUMERO)) {
    const prefixo = m[1];
    const grafia = m[2];
    const posicao = m.index ?? 0;

    const digitos = grafia.replace(/[^\d]/g, "");
    if (!digitos) continue;

    const antes = t.slice(Math.max(0, posicao - JANELA_ANTES), posicao);
    const depois = t.slice(posicao + m[0].length, posicao + m[0].length + JANELA_DEPOIS);

    const { tipo, unidade } = classificar(prefixo, digitos, antes, depois);

    achados.push({
      bruto: m[0],
      valor: digitos,
      unidade,
      tipo,
      contexto: `${antes}${m[0]}${depois}`.replace(/\s+/g, " ").trim(),
      posicao,
    });
  }

  return achados;
}

export type Compatibilidade = { ok: true } | { ok: false; motivo: string };

/**
 * Este número gerado tem lastro em algum número do material?
 *
 * Exige valor igual E tipo compatível. As duas regras de compatibilidade:
 *
 *   1. Identificador nunca cruza. Nem sustenta quantidade, nem é sustentado por
 *      quantidade. É a regra que fecha o furo do "INA 245(a)" virando prazo.
 *
 *   2. Tipo não marcado sustenta e é sustentado. Um número solto no material,
 *      sem unidade e sem marcador, pode ser qualquer coisa, e recusá-lo
 *      derrubaria o caso legítimo do número que aparece numa tabela sem
 *      unidade. O mesmo do lado do texto gerado.
 *
 * Duas quantidades de tipos DIFERENTES não se sustentam: "60 dias" não vale
 * para "60%", e "US$ 1.440" não vale para "1.440 pedidos".
 */
export function numeroCompativel(gerado: ClaimNumerica, doMaterial: ClaimNumerica[]): Compatibilidade {
  const mesmoValor = doMaterial.filter((f) => f.valor === gerado.valor);

  if (mesmoValor.length === 0) {
    return { ok: false, motivo: `o valor ${gerado.bruto} não aparece no material` };
  }

  for (const fonte of mesmoValor) {
    if (fonte.tipo === gerado.tipo) return { ok: true };
    if (ehIdentificador(fonte.tipo) || ehIdentificador(gerado.tipo)) continue;
    if (fonte.tipo === "generic_number" || gerado.tipo === "generic_number") return { ok: true };
  }

  const tipos = [...new Set(mesmoValor.map((f) => f.tipo))].join(", ");
  const comoIdentificador = mesmoValor.every((f) => ehIdentificador(f.tipo));

  return {
    ok: false,
    motivo: comoIdentificador
      ? `${gerado.bruto} aparece no material como identificador (${tipos}), e aqui está usado como ${gerado.tipo}: ` +
        `número de norma, de formulário ou de seção não sustenta quantidade`
      : `${gerado.bruto} aparece no material como ${tipos}, e aqui está usado como ${gerado.tipo}`,
  };
}

/** Os números do material, extraídos peça por peça para a vizinhança valer. */
export function numerosDoMaterial(pedacos: string[]): ClaimNumerica[] {
  return pedacos.flatMap((p) => extrairNumeros(p ?? ""));
}
