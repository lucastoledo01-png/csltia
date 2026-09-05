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
 */
const TEMAS: Tema[] = [
  { termos: ["green card", "residencia permanente", "residente permanente"], consulta: "immigration application form documents desk" },
  { termos: ["visto de trabalho", "h-1b", "h1b", "eb-1", "eb-2", "eb-3", "eb1", "eb2", "eb3", "niw"], consulta: "office building glass facade city" },
  { termos: ["visto de estudante", "f-1", "intercambio", "universidade", "estudante"], consulta: "university campus building architecture" },
  { termos: ["fronteira", "border"], consulta: "border checkpoint sign road" },
  { termos: ["asilo", "refugiad"], consulta: "airport terminal departure board" },
  { termos: ["cidadania", "naturaliza", "juramento"], consulta: "united states flag building exterior" },
  { termos: ["uscis", "formulario", "peticao", "taxa", "processamento", "regra", "norma"], consulta: "official paperwork stamp documents" },
  { termos: ["consulad", "embaixad", "entrevista", "passaporte"], consulta: "passport travel documents table" },
  { termos: ["corte", "tribunal", "juiz", "decisao", "liminar", "processo", "lei"], consulta: "courthouse columns facade architecture" },
  { termos: ["fila", "espera", "prazo", "boletim", "backlog"], consulta: "empty waiting room chairs" },
  { termos: ["deporta", "detid", "custodia", "fiscaliza", "ice"], consulta: "government building entrance exterior" },
  { termos: ["dolar", "cambio", "juros", "economia", "salario", "imposto", "tributaria"], consulta: "banknotes currency close up" },
  { termos: ["emprego", "trabalho", "contrata", "vagas", "payroll", "desemprego"], consulta: "construction site crane skyline" },
  { termos: ["fabrica", "investimento", "industria", "expansao"], consulta: "factory warehouse industrial exterior" },
  { termos: ["moradia", "imovel", "aluguel", "casa"], consulta: "suburban houses street neighborhood" },
  { termos: ["stf", "congresso", "senado", "camara", "politica", "governo"], consulta: "government palace building architecture" },
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

export function consultaConceitual(titulo: string, categoria = "", pais?: string): string {
  const texto = `${titulo} ${categoria}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  const tema = TEMAS.find((t) => t.termos.some((termo) => texto.includes(termo)));
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
