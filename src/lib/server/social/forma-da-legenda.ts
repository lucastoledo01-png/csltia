import type { PacoteFactual } from "../editorial/pacote-factual";
import { atribuicaoSemLastro } from "../ramos/artigo";
import { extrairNumeros } from "../editorial/numeros-com-sentido";

/**
 * A forma da legenda no método do Not Journal (06/10/2026), conferida em
 * código.
 *
 * As faixas saíram das sete legendas de referência que o dono mandou: lide de
 * uma ou duas frases, de 2 a 5 parágrafos de 2 a 4 frases, de 120 a 300
 * palavras no total. A guarda confere o TETO de cada coisa, e não o piso: a
 * regra do dono é "nunca enchimento", e um piso de palavras empurraria o
 * modelo a encher justamente a pauta de pacote fino. Os tetos têm folga sobre o
 * alvo do prompt, para a reescrita paga ser o caso do texto que passou do
 * ponto, e não do que encostou na faixa.
 */
export const FORMA_DA_LEGENDA = {
  /** O lide: uma ou duas frases. O prompt pede de 25 a 60 palavras. */
  lide: { maximoDeFrases: 2, maximoDePalavras: 70 },
  /** Depois do lide. O prompt pede de 2 a 5. */
  maximoDeParagrafos: 5,
  /** Cada parágrafo. O prompt pede de 2 a 4 frases. */
  paragrafo: { maximoDeFrases: 5, maximoDePalavras: 95 },
  /** A legenda inteira, sem o fecho. O prompt pede de 120 a 300. */
  alvo: { minimo: 120, maximo: 300 },
  tetoDePalavras: 340,
} as const;

export type ProblemaDeLegenda = {
  tipo: "forma" | "atribuicao";
  detalhe: string;
};

function palavras(texto: string): string[] {
  return (texto || "").split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p));
}

/**
 * Frases de um parágrafo. Ponto entre dígitos ("1.250", "4,2") e abreviação de
 * uma letra ("J. Powell") não terminam frase.
 */
function frases(texto: string): string[] {
  return (texto || "")
    .replace(/(\d)\.(\d)/g, "$1\u2024$2")
    .replace(/\b([A-Z])\.\s/g, "$1\u2024 ")
    .split(/(?<=[.!?…])\s+(?=["“(\p{Lu}\d])/u)
    .map((f) => f.trim())
    .filter(Boolean);
}

function normalizar(texto: string): string {
  return ` ${(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

const EMOJI = /\p{Extended_Pictographic}/u;
const LINK = /\bhttps?:\/\/|\bwww\.[a-z0-9-]+\./i;
// Sem \b no fim: "Olá" termina em letra acentuada, que \b não reconhece como letra.
const SAUDACAO = /^\s*(ol[aá]|oi|bom dia|boa tarde|boa noite|fala|e a[ií]|pessoal|galera)(?=[\s,!.:])/i;

/**
 * O corpo da legenda (lide e parágrafos, sem o fecho) tem a forma do método?
 *
 * Tudo aqui é reparável: é forma, e a reescrita com o problema nomeado resolve.
 */
export function conferirFormaDaLegenda(corpo: string, headline: string): ProblemaDeLegenda[] {
  const problemas: ProblemaDeLegenda[] = [];
  const blocos = (corpo || "")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocos.length === 0) return [{ tipo: "forma", detalhe: "a legenda está vazia" }];

  const [lide, ...resto] = blocos;
  const F = FORMA_DA_LEGENDA;

  const frasesDoLide = frases(lide);
  if (frasesDoLide.length > F.lide.maximoDeFrases) {
    problemas.push({
      tipo: "forma",
      detalhe: `o lide tem ${frasesDoLide.length} frases; ele é uma ou duas frases com ator, verbo, fato e quando, e o resto vai nos parágrafos`,
    });
  }
  const palavrasDoLide = palavras(lide).length;
  if (palavrasDoLide > F.lide.maximoDePalavras) {
    problemas.push({
      tipo: "forma",
      detalhe: `o lide tem ${palavrasDoLide} palavras; o teto é ${F.lide.maximoDePalavras} (alvo de 25 a 60)`,
    });
  }
  if (/\?\s*$/.test(lide) || frasesDoLide.some((f) => /\?$/.test(f))) {
    problemas.push({ tipo: "forma", detalhe: "o lide é afirmação, não pergunta: a legenda abre com o fato" });
  }
  if (SAUDACAO.test(lide)) {
    problemas.push({ tipo: "forma", detalhe: "a legenda abre direto no lide, sem saudação" });
  }

  if (resto.length > F.maximoDeParagrafos) {
    problemas.push({
      tipo: "forma",
      detalhe: `${resto.length} parágrafos depois do lide; o teto é ${F.maximoDeParagrafos}, cada um com UMA camada nova`,
    });
  }
  resto.forEach((p, i) => {
    const n = frases(p).length;
    const w = palavras(p).length;
    if (n > F.paragrafo.maximoDeFrases || w > F.paragrafo.maximoDePalavras) {
      problemas.push({
        tipo: "forma",
        detalhe: `o parágrafo ${i + 2} tem ${n} frases e ${w} palavras; parágrafo é curto, de 2 a 4 frases (até ${F.paragrafo.maximoDePalavras} palavras)`,
      });
    }
  });

  const total = palavras(blocos.join(" ")).length;
  if (total > F.tetoDePalavras) {
    problemas.push({
      tipo: "forma",
      detalhe: `a legenda tem ${total} palavras; o alvo é de ${F.alvo.minimo} a ${F.alvo.maximo}, e acima de ${F.tetoDePalavras} é enchimento: corte o parágrafo que menos acrescenta`,
    });
  }

  /*
   * A manchete repetida palavra por palavra. A legenda conta MAIS que a capa,
   * e o primeiro lugar onde o leitor percebe que não é isso é a primeira linha.
   * Igualdade de texto normalizado, e não semelhança: retomar o fato da capa
   * com outras palavras e mais detalhe é exatamente o que o lide faz. Só
   * manchete de 8 palavras ou mais: as curtas ("USCIS descreve as etapas do
   * pedido") cabem por acaso dentro de qualquer lide sobre o mesmo fato.
   */
  const capa = normalizar(headline).trim();
  if (capa.split(" ").length >= 8 && normalizar(corpo).includes(` ${capa} `)) {
    problemas.push({
      tipo: "forma",
      detalhe: "a legenda repete a manchete palavra por palavra; o lide retoma o fato com o detalhe que a capa não tinha",
    });
  }

  if (EMOJI.test(corpo)) problemas.push({ tipo: "forma", detalhe: "emoji na legenda: o registro é de jornal" });
  if (LINK.test(corpo)) problemas.push({ tipo: "forma", detalhe: "link na legenda: o Instagram não abre, e o método não usa" });

  return problemas;
}

/*
 * A atribuição na frase: "segundo X", "de acordo com X", "conforme X".
 *
 * X é o que vem depois, até a pontuação, e só é conferido quando é nome
 * próprio (começa com maiúscula ou é sigla). "Segundo o regulador" não tem
 * nome para conferir; "segundo a Caixin" tem.
 */
const ATRIBUICAO =
  /\b(?:segundo|de acordo com|conforme)\s+(?:(?:o|a|os|as)\s+)?((?:[A-ZÀ-Ý][\p{L}\d'’&.-]*)(?:\s+(?:(?:de|da|do|dos|das|e|&|of|the|for)\s+)?[A-ZÀ-Ý\d][\p{L}\d'’&.-]*){0,6})/gu;

/** Palavras que abrem a frase com maiúscula e não são nome. */
const NAO_E_NOME = new Set(["ele", "ela", "eles", "elas", "isso", "este", "esta", "esse", "essa"]);

/** Marcas de atribuição no TEXTO DA FONTE, em inglês e em português. */
const ATRIBUICAO_NA_FONTE =
  /\b(according to|said|says|told|estimated|estimates|reported by|per the|segundo|de acordo com|disse|afirmou|informou|estima)\b/i;

function contem(palheiro: string, agulha: string): boolean {
  const a = normalizar(agulha).trim();
  if (!a) return false;
  if (palheiro.includes(` ${a} `)) return true;
  // Nome composto: todas as palavras significativas presentes ("Moody's Investors Service" e "Moody's").
  const partes = a.split(" ").filter((p) => p.length >= 3);
  return partes.length > 0 && partes.every((p) => palheiro.includes(` ${p} `));
}

/**
 * O "segundo X" da legenda é o X de verdade?
 *
 * Três conferências, da mais firme para a mais fraca:
 *
 * 1. Com várias fontes no pacote, a régua da matéria do portal
 *    (`atribuicaoSemLastro`): o número atribuído a uma fonte tem de estar no
 *    material DELA. No pacote de uma fonte só, que é o da camada comum e o que
 *    o post recebe hoje, ela não tem o que comparar e devolve nada.
 * 2. X tem de existir no pacote (pessoas, organizações, fatos, texto de
 *    origem) ou ser o próprio veículo. Atribuir a quem o pacote não cita é
 *    inventar fonte.
 * 3. O defeito da matéria de Chicago ("39 data centers, segundo a Axios",
 *    quando quem disse foi a cidade): se X é o VEÍCULO e o número da frase só
 *    aparece no pacote em fatos que já trazem outro dono ("according to the
 *    city"), o dono é o outro. Heurística que só afirma o que sabe medir:
 *    frase sem número não é conferida.
 */
export function atribuicoesDaLegendaSemLastro(
  corpo: string,
  pacote: PacoteFactual | null,
  veiculo: string,
): ProblemaDeLegenda[] {
  if (!pacote) return [];
  const problemas: ProblemaDeLegenda[] = [];

  for (const paragrafo of (corpo || "").split(/\n\s*\n/)) {
    const multi = atribuicaoSemLastro(paragrafo, pacote);
    if (multi) problemas.push({ tipo: "atribuicao", detalhe: multi });
  }

  const palheiro = normalizar(
    [
      ...pacote.people,
      ...pacote.organizations,
      ...pacote.places,
      ...pacote.verified_facts,
      ...pacote.numbers,
      pacote.texto_de_origem ?? "",
    ].join(" \n "),
  );
  const nomeDoVeiculo = (veiculo || "").replace(/^www\./i, "").replace(/\.(com|org|net|gov|br|co)(\.[a-z]{2})?$/i, "");

  for (const frase of frases((corpo || "").replace(/\n+/g, " "))) {
    for (const m of frase.matchAll(ATRIBUICAO)) {
      const dono = m[1].replace(/[.,;:]+$/, "").trim();
      if (!dono || NAO_E_NOME.has(dono.toLowerCase())) continue;

      const ehVeiculo = Boolean(nomeDoVeiculo) && (contem(normalizar(nomeDoVeiculo), dono) || contem(normalizar(dono), nomeDoVeiculo));
      if (!ehVeiculo && !contem(palheiro, dono)) {
        problemas.push({
          tipo: "atribuicao",
          detalhe: `"segundo ${dono}": ${dono} não aparece no pacote factual; a atribuição tem de ser a quem deu a informação, e o pacote não cita esse nome`,
        });
        continue;
      }

      if (ehVeiculo) {
        const numeros = extrairNumeros(frase).map((n) => n.bruto.replace(/\D/g, "")).filter((d) => d.length > 0);
        if (numeros.length === 0) continue;
        // Dígitos puros dos dois lados: "1,250" na fonte e "1.250" na legenda são o mesmo número.
        const fatosComONumero = pacote.verified_facts.filter((f) => {
          const digitos = f.replace(/\D/g, "");
          return numeros.some((d) => digitos.includes(d));
        });
        if (fatosComONumero.length > 0 && fatosComONumero.every((f) => ATRIBUICAO_NA_FONTE.test(f) && !contem(normalizar(f), nomeDoVeiculo))) {
          problemas.push({
            tipo: "atribuicao",
            detalhe: `"segundo ${dono}": no pacote, o número desta frase tem outro dono ("${fatosComONumero[0].slice(0, 140)}"); atribua a quem deu a informação, não ao veículo`,
          });
        }
      }
    }
  }

  return problemas;
}

/* ------------------------------------------------------------------ */
/* O quando do lide: "na segunda-feira (5)"                            */
/* ------------------------------------------------------------------ */

const SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const DIA_DA_SEMANA_COM_DIA =
  /\b(domingo|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado)(-feira)?\s*\((\d{1,2})\)/gi;

/** Os pares dia da semana e dia do mês dos últimos oito dias, no fuso de Brasília. */
function paresDaSemana(agora: Date): Set<string> {
  const pares = new Set<string>();
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(agora.getTime() - i * 86_400_000);
    const iso = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const [ano, mes, dia] = iso.split("-").map(Number);
    pares.add(`${SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()]}:${dia}`);
  }
  return pares;
}

/** O par "semana:dia" de uma data, no fuso de Brasília. */
function parDaData(d: Date): string {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const [ano, mes, dia] = iso.split("-").map(Number);
  return `${SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()]}:${dia}`;
}

/** O dia da semana nomeado no material, em inglês ou em português, no nosso índice. */
const NOMES_NA_FONTE: Array<[RegExp, string]> = [
  [/\b(sunday|domingo)\b/i, "domingo"],
  [/\b(monday|segunda)/i, "segunda"],
  [/\b(tuesday|ter[cç]a)/i, "terca"],
  [/\b(wednesday|quarta)/i, "quarta"],
  [/\b(thursday|quinta)/i, "quinta"],
  [/\b(friday|sexta)/i, "sexta"],
  [/\b(saturday|s[aá]bado)\b/i, "sabado"],
];

function nomeDoPar(par: string): string {
  const [semana, dia] = par.split(":");
  const nome = { domingo: "domingo", segunda: "segunda-feira", terca: "terça-feira", quarta: "quarta-feira", quinta: "quinta-feira", sexta: "sexta-feira", sabado: "sábado" }[semana] ?? semana;
  return `${nome} (${dia})`;
}

/**
 * O "(5)" de "na segunda-feira (5)" é dia do mês, não número da notícia.
 *
 * Ele vem do CALENDÁRIO que o prompt recebe, e não do pacote: a fonte diz
 * "Monday", e a ancoragem reprovaria o 5 como número inventado (foi o que a
 * primeira amostra mostrou, em 06/10/2026). Então o par é conferido aqui,
 * contra o mesmo calendário, em duas perguntas:
 *
 * 1. O dia da semana bate com o dia do mês? "segunda-feira (6)" quando o 6
 *    foi terça é fato errado que nenhuma outra régua pega.
 * 2. O pacote sustenta ESTE dia? O quando sai do material (o dia da semana
 *    que a fonte nomeia) ou da data de publicação da fonte. Na amostra, o
 *    modelo pôs "terça-feira (6)", o dia em que escrevia, em três pautas cuja
 *    fonte não dizia dia nenhum; e o reparo de "sexta-feira (3)" virou
 *    "sábado (3)", quando a fonte dizia Friday, que era o dia 2.
 *
 * O par que passa nas duas sai do texto que vai para a ancoragem.
 */
export function conferirDiasDaSemana(
  corpo: string,
  agora: Date = new Date(),
  lastro?: { pacote?: PacoteFactual | null; publicadaEm?: string | null },
): { paraAncorar: string; problemas: ProblemaDeLegenda[] } {
  const pares = paresDaSemana(agora);
  const problemas: ProblemaDeLegenda[] = [];

  let permitidos: Set<string> | null = null;
  if (lastro) {
    permitidos = new Set<string>();
    const material = lastro.pacote
      ? [...lastro.pacote.dates, ...lastro.pacote.verified_facts, lastro.pacote.texto_de_origem ?? ""].join(" ")
      : "";
    for (const [padrao, semana] of NOMES_NA_FONTE) {
      if (!padrao.test(material)) continue;
      for (const par of pares) if (par.startsWith(`${semana}:`)) permitidos.add(par);
    }
    const publicada = lastro.publicadaEm ? new Date(lastro.publicadaEm) : null;
    if (publicada && !Number.isNaN(publicada.getTime())) permitidos.add(parDaData(publicada));
  }

  const paraAncorar = (corpo || "").replace(DIA_DA_SEMANA_COM_DIA, (inteiro, semana: string, _feira, dia: string) => {
    const chave = `${semana.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace("ç", "c")}:${Number(dia)}`;
    if (!pares.has(chave)) {
      problemas.push({
        tipo: "forma",
        detalhe: `"${inteiro}": o dia da semana não bate com o dia do mês no calendário dos últimos oito dias; use o CALENDÁRIO que veio com a pauta`,
      });
      return inteiro;
    }
    if (permitidos && !permitidos.has(chave)) {
      const opcoes = [...permitidos].map(nomeDoPar);
      problemas.push({
        tipo: "forma",
        detalhe:
          `"${inteiro}": o pacote não diz que o fato foi neste dia. ` +
          (opcoes.length
            ? `Os dias que o material sustenta, no calendário: ${opcoes.join(", ")}. `
            : "") +
          `Sem dia no material, a legenda fica sem o quando, e nunca usa o dia em que foi escrita`,
      });
      return inteiro;
    }
    return semana;
  });
  return { paraAncorar, problemas };
}
