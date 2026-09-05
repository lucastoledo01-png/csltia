/**
 * Identidade de um acontecimento, para reconhecê-lo escrito de outro jeito.
 *
 * Duas manchetes contam a mesma coisa com palavras diferentes:
 *
 *   "Tesla anuncia nova fábrica no Texas"
 *   "Nova unidade da Tesla deve gerar milhares de empregos no Texas"
 *
 * Comparar as frases não resolve: elas quase não compartilham palavras. O que
 * elas compartilham são as entidades (Tesla, Texas) e o tipo de acontecimento
 * (fábrica, unidade). É essa combinação que identifica o fato.
 *
 * Nada aqui usa modelo. É a camada barata, que roda em toda pauta antes de
 * qualquer chamada paga, e pega a maioria das repetições sozinha.
 */

/** Palavras que aparecem em toda manchete e não distinguem nada. */
const VAZIAS = new Set([
  "a","o","as","os","um","uma","uns","umas","de","do","da","dos","das","em","no","na","nos","nas",
  "por","para","pra","com","sem","sob","sobre","ao","aos","à","às","e","ou","que","se","seu","sua",
  "seus","suas","este","esta","esse","essa","aquele","aquela","isso","como","mais","menos","muito",
  "ja","ainda","apos","antes","entre","ate","tambem","the","of","in","on","at","for","to","and","or",
  "is","are","was","were","a","an","with","from","by","new","says","said",
]);

function normalizar(texto: string): string {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palavras significativas de um texto, sem as vazias. */
export function palavrasChave(texto: string): string[] {
  return normalizar(texto)
    .split(" ")
    .filter((p) => p.length > 2 && !VAZIAS.has(p));
}

/**
 * Assinatura do título: palavras significativas, ordenadas e únicas.
 *
 * Ordenar é o ponto. "Tesla abre fábrica" e "Fábrica da Tesla abre" produzem
 * a mesma assinatura, e é justamente essa reescrita que um "não repita" no
 * prompt não pega.
 */
export function assinaturaDeTitulo(titulo: string): string {
  return [...new Set(palavrasChave(titulo))].sort().join(" ");
}

/** Semelhança de Jaccard entre dois conjuntos de palavras. */
export function semelhancaDeTitulo(a: string, b: string): number {
  const A = new Set(palavrasChave(a));
  const B = new Set(palavrasChave(b));
  if (A.size === 0 || B.size === 0) return 0;

  let intersecao = 0;
  for (const p of A) if (B.has(p)) intersecao++;

  const uniao = new Set([...A, ...B]).size;
  return intersecao / uniao;
}

export type Entidades = {
  /** Empresa, órgão, político, pessoa. */
  atores: string[];
  /** Cidade, estado, país. */
  lugares: string[];
  /** O que aconteceu: fábrica, demissão, decreto, aprovação. */
  acontecimento: string[];
};

/**
 * Impressão digital do acontecimento: atores, lugares e tipo de evento.
 *
 * Ordenada e minúscula, para que a mesma combinação produza sempre a mesma
 * string, independentemente de como o texto a apresentou.
 */
export function impressaoDoAcontecimento(e: Entidades): string {
  // A lista chega tanto do modelo quanto de coluna jsonb, e nos dois casos
  // pode vir string solta ou nula. Tratar aqui evita derrubar o pipeline por
  // causa da forma de um campo que é, no fundo, opcional.
  const parte = (lista: string[] | string | null | undefined) => {
    const itens = Array.isArray(lista) ? lista : typeof lista === "string" ? [lista] : [];
    return [...new Set(itens.map((x) => normalizar(String(x))).filter(Boolean))].sort().join("+");
  };

  return [parte(e.atores), parte(e.lugares), parte(e.acontecimento)]
    .filter(Boolean)
    .join("|");
}

/**
 * Duas impressões descrevem o mesmo fato?
 *
 * Exige coincidência nos três eixos, não em um só. "Tesla" sozinha não faz
 * duas notícias serem a mesma: a empresa aparece em dezenas de fatos
 * distintos. É ator, mais lugar, mais tipo de acontecimento que identifica.
 */
export function mesmoAcontecimento(a: Entidades, b: Entidades): boolean {
  const cruza = (x: string[], y: string[]) => {
    const A = new Set(x.map(normalizar).filter(Boolean));
    return y.map(normalizar).some((v) => v && A.has(v));
  };

  const atores = cruza(a.atores, b.atores);
  const lugares = cruza(a.lugares, b.lugares);
  const evento = cruza(a.acontecimento, b.acontecimento);

  // Sem lugar declarado dos dois lados, ator mais evento bastam: nem toda
  // notícia tem lugar, e exigi-lo deixaria passar repetição de decisão
  // nacional, que é justamente o tipo que mais se repete.
  const semLugar = a.lugares.length === 0 || b.lugares.length === 0;

  return atores && evento && (lugares || semLugar);
}

/**
 * Os dois textos falam do mesmo tipo de acontecimento?
 *
 * Mais frouxo que `mesmoAcontecimento` de propósito, e serve a outra pergunta.
 * Ali, ator e evento juntos identificam o fato. Aqui, quem já disse que as
 * duas pautas tratam do mesmo assunto foi o vetor, e o que falta saber é se é
 * o mesmo episódio: duas notícias da AWS, uma sobre integração e outra sobre
 * benchmark, são assuntos vizinhos e episódios diferentes.
 */
export function mesmoTipoDeAcontecimento(a: Entidades, b: Entidades): boolean {
  const A = new Set(a.acontecimento.map(normalizar).filter(Boolean));
  if (A.size === 0) return false;
  return b.acontecimento.map(normalizar).some((v) => v && A.has(v));
}
