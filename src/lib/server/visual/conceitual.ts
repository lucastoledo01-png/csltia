/**
 * Consulta do banco conceitual, sem gente genérica.
 *
 * A regra é do dono da publicação e resolve um problema real: quando a foto é
 * de pessoa anônima, ninguém consegue verificar de onde ela é. Escolher uma
 * pessoa para ilustrar "brasileiros nos EUA" significa decidir quem parece
 * brasileiro, e isso é inferir nacionalidade por aparência. Não fazemos isso, e
 * o caminho não é fazer melhor: é não fazer.
 *
 * Então a foto conceitual passa a ser de coisa, não de gente: documento,
 * prédio, cidade, aeroporto, fila, formulário, moeda, tribunal. São elementos
 * verificáveis pelo próprio enquadramento, e nenhum deles exige adivinhar a
 * origem de ninguém.
 *
 * O mapa anterior pedia "office worker professional american", "family
 * suitcase airport waiting" e "law enforcement officer uniform". Os três
 * escolhem pessoas e o primeiro ainda carrega a nacionalidade no adjetivo.
 */

type Tema = { termos: string[]; consulta: string };

/**
 * Cada consulta descreve um objeto, um lugar ou um documento.
 *
 * Onde havia nacionalidade colada em pessoa, agora há lugar: "washington
 * capitol building" é um prédio que É de Washington, e não uma pessoa que
 * supomos americana.
 *
 * Os gatilhos vêm nos DOIS idiomas, e isso não é zelo: o casamento roda sobre
 * o título da FONTE, e fonte americana escreve em inglês. Em 17/09/2026 uma
 * pauta sobre a Suprema Corte, vinda da Vox com o título "The successful
 * campaign to make a terrifying Supreme Court immigration case disappear", não
 * casou com nenhum dos 16 temas: o tema de tribunal só tinha "corte", e
 * "court" não é "corte". Caiu no PADRÃO e o post saiu com um skyline genérico
 * de Manhattan, quando a consulta certa devolvia o prédio da Suprema Corte nas
 * primeiras posições.
 *
 * A cobertura de inglês que existia antes era acidental: "border", "payroll" e
 * "ice" funcionavam nos dois idiomas por coincidência de grafia.
 */
const TEMAS: Tema[] = [
  { termos: ["green card", "residencia permanente", "residente permanente", "permanent residence", "permanent resident", "lawful permanent"], consulta: "immigration application form documents desk" },
  { termos: ["visto de trabalho", "h-1b", "h1b", "eb-1", "eb-2", "eb-3", "eb1", "eb2", "eb3", "niw", "work visa", "employment visa", "work permit", "labor certification", "certificacao de trabalho"], consulta: "office building glass facade city" },
  { termos: ["visto de estudante", "f-1", "intercambio", "universidade", "estudante", "student visa", "university", "college", "campus", "student"], consulta: "university campus building architecture" },
  { termos: ["fronteira", "border", "frontier", "crossing"], consulta: "border checkpoint sign road" },
  { termos: ["asilo", "refugiad", "asylum", "refugee"], consulta: "airport terminal departure board" },
  { termos: ["cidadania", "naturaliza", "juramento", "citizenship", "citizen", "oath"], consulta: "united states flag building exterior" },
  { termos: ["uscis", "formulario", "peticao", "taxa", "processamento", "regra", "norma", "form", "petition", "filing", "fee", "regulation", "processing"], consulta: "official paperwork stamp documents" },
  { termos: ["consulad", "embaixad", "entrevista", "passaporte", "consulate", "embassy", "interview", "passport"], consulta: "passport travel documents table" },
  { termos: ["corte", "tribunal", "juiz", "decisao", "liminar", "processo", "lei", "court", "judge", "judicial", "ruling", "lawsuit", "litigation", "appeal", "justices", "bench"], consulta: "courthouse columns facade architecture" },
  { termos: ["fila", "espera", "prazo", "boletim", "backlog", "queue", "wait time", "waiting", "deadline", "bulletin"], consulta: "empty waiting room chairs" },
  { termos: ["deporta", "detid", "custodia", "fiscaliza", "ice", "deportation", "detention", "detained", "custody", "enforcement", "removal", "bond hearing"], consulta: "government building entrance exterior" },
  { termos: ["dolar", "cambio", "juros", "economia", "salario", "imposto", "tributaria", "dollar", "interest rate", "economy", "wage", "wages", "salary", "tax", "income", "inflation"], consulta: "banknotes currency close up" },
  { termos: ["emprego", "trabalho", "contrata", "vagas", "payroll", "desemprego", "job", "jobs", "employment", "hiring", "labor market", "unemployment", "workers"], consulta: "construction site crane skyline" },
  { termos: ["fabrica", "investimento", "industria", "expansao", "factory", "plant", "investment", "industry", "manufacturing"], consulta: "factory warehouse industrial exterior" },
  { termos: ["moradia", "imov", "aluguel", "casa", "condominio", "hipotec", "housing", "home", "rent", "mortgage", "real estate", "homebuyer", "buyer"], consulta: "suburban houses street neighborhood" },
  { termos: ["stf", "congresso", "senado", "camara", "politica", "governo", "congress", "senate", "house of representatives", "lawmakers", "white house", "government", "administration"], consulta: "government palace building architecture" },
];

/** Quando nada casa: lugar, não pessoa. */
const PADRAO = "city skyline architecture daylight";

/**
 * Contexto geográfico entra pela CENA, nunca pela pessoa.
 *
 * "brazil" numa consulta de cidade traz cidade brasileira, o que é
 * verificável. "brazilian" numa consulta de pessoa traria alguém que o banco
 * de imagem etiquetou assim, o que não é verificável e não é o critério.
 */
function comContexto(consulta: string, pais?: string): string {
  if (!pais) return consulta;
  if (
    /(building|architecture|city|skyline|street|houses|facade|palace|exterior|currency|banknotes|documents|paperwork|passport|form)/.test(
      consulta
    )
  ) {
    if (pais === "Brasil") return `${consulta} brazil`;
    if (pais === "EUA") return `${consulta} united states`;
  }
  return consulta;
}

/**
 * O termo aparece começando uma palavra do texto.
 *
 * A comparação era `texto.includes(termo)`, substring pura, e isso é armadilha
 * com gatilho curto: "ice" casa dentro de "justice", "police", "service",
 * "office" e "notice", e mandava pauta de tribunal para a consulta de prédio de
 * governo. Com os termos em inglês isso piorava muito: "rent" cairia dentro de
 * "current" e "different", "form" dentro de "information" e "reform", "fee"
 * dentro de "coffee".
 *
 * A âncora é só no INÍCIO da palavra, de propósito. Metade dos gatilhos é radical
 * escrito para pegar flexão: "deporta" precisa casar com "deportação" e
 * "deportado", "refugiad" com "refugiada", "naturaliza" com "naturalização".
 * Exigir a palavra inteira quebraria todos eles.
 */
function comecaPalavra(texto: string, termo: string): boolean {
  let de = texto.indexOf(termo);
  while (de !== -1) {
    const anterior = de === 0 ? "" : texto[de - 1];
    if (anterior === "" || !/[a-z0-9]/.test(anterior)) return true;
    de = texto.indexOf(termo, de + 1);
  }
  return false;
}

export function consultaConceitual(titulo: string, categoria = "", pais?: string): string {
  const texto = `${titulo} ${categoria}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  const tema = TEMAS.find((t) => t.termos.some((termo) => comecaPalavra(texto, termo)));
  return comContexto(tema?.consulta ?? PADRAO, pais);
}

/**
 * A consulta escolhe pessoa?
 *
 * Existe para o teste e para o log: se um dia alguém acrescentar um tema com
 * "worker", "family" ou "people", isto acusa.
 */
export function pedeGente(consulta: string): boolean {
  return /\b(people|person|man|woman|men|women|worker|workers|family|families|child|children|student|students|crowd|portrait)\b/i.test(
    consulta
  );
}
