import { EDITORIAS, type EditoriaId } from "./editorias";

/**
 * O vocabulário FECHADO de temas da fileira "Assuntos" (06/10/2026).
 *
 * A matéria-piloto de Chicago saiu com "energia" e "água" como assunto, e o
 * dono decidiu: "isso não pode acontecer novamente". Palavra solta não é
 * assunto, é ruído: não ajuda quem busca, não agrupa matéria nenhuma e, no
 * dia em que existir página de tema, viraria uma página sobre tudo.
 *
 * Por isso o assunto de uma matéria é uma de duas coisas, e só elas:
 *
 *   1. uma entidade nomeada (organização, pessoa, lugar), que vem do pacote
 *      factual e do resolvedor, nunca da imaginação do redator;
 *   2. um tema desta lista.
 *
 * O modelo pode PROPOR o que quiser; quem decide é `validarAssuntos`, em
 * `indexacao-do-artigo.ts`. Tema novo entra aqui, por decisão editorial, e
 * não pelo texto que o modelo devolveu num dia.
 *
 * Cada tema tem um `slug` estável, pensado para as futuras páginas `/tema`:
 * mudar o nome que aparece é livre, mudar o slug quebra link.
 *
 * `sinonimos` são as outras formas como o mesmo tema aparece escrito, para
 * casar a proposta do redator e o texto da matéria com o tema certo. Nenhum
 * sinônimo é palavra genérica solta: "energia" não leva a "conta de luz".
 *
 * A lista é organizada por editoria porque é assim que o redator a recebe (a
 * da editoria da matéria primeiro). A validação aceita tema de qualquer
 * editoria: a matéria de Chicago é de Política e trata de data centers.
 */

export type Tema = {
  slug: string;
  nome: string;
  sinonimos?: string[];
};

export const TEMAS: Record<EditoriaId, Tema[]> = {
  economia: [
    { slug: "juros-do-fed", nome: "juros do Fed", sinonimos: ["juros nos EUA", "corte de juros", "alta de juros", "taxa básica americana"] },
    { slug: "inflacao-nos-eua", nome: "inflação nos EUA", sinonimos: ["inflação americana", "índice de preços ao consumidor"] },
    { slug: "mercado-de-acoes", nome: "mercado de ações", sinonimos: ["Wall Street", "bolsa de Nova York", "S&P 500", "Nasdaq", "Dow Jones"] },
    { slug: "dolar", nome: "dólar", sinonimos: ["cotação do dólar", "dólar americano"] },
    { slug: "pib-dos-eua", nome: "PIB dos EUA", sinonimos: ["PIB americano", "crescimento da economia americana"] },
    { slug: "tarifas-de-importacao", nome: "tarifas de importação", sinonimos: ["guerra comercial", "tarifas comerciais", "tarifaço"] },
    { slug: "recessao", nome: "recessão", sinonimos: ["risco de recessão"] },
    { slug: "titulos-do-tesouro", nome: "títulos do Tesouro", sinonimos: ["Treasuries", "rendimento dos títulos"] },
    { slug: "divida-publica-americana", nome: "dívida pública americana", sinonimos: ["teto da dívida", "dívida dos EUA"] },
    { slug: "resultados-de-empresas", nome: "resultados de empresas", sinonimos: ["balanço trimestral", "lucro trimestral", "temporada de balanços"] },
    { slug: "ipos", nome: "IPOs", sinonimos: ["IPO", "abertura de capital", "oferta pública inicial"] },
    { slug: "fusoes-e-aquisicoes", nome: "fusões e aquisições", sinonimos: ["aquisição bilionária"] },
    { slug: "criptomoedas", nome: "criptomoedas", sinonimos: ["bitcoin", "criptomoeda", "stablecoins"] },
    { slug: "preco-do-petroleo", nome: "preço do petróleo", sinonimos: ["petróleo", "barril de petróleo"] },
    { slug: "comercio-exterior", nome: "comércio exterior", sinonimos: ["balança comercial", "exportações americanas", "importações americanas"] },
    { slug: "consumo-das-familias", nome: "consumo das famílias", sinonimos: ["gastos do consumidor", "vendas no varejo", "varejo americano"] },
    { slug: "black-friday", nome: "Black Friday", sinonimos: ["Cyber Monday"] },
    { slug: "setor-bancario", nome: "setor bancário", sinonimos: ["bancos americanos", "crise bancária"] },
    { slug: "venture-capital", nome: "venture capital", sinonimos: ["capital de risco", "rodada de investimento"] },
    { slug: "ouro", nome: "ouro", sinonimos: ["preço do ouro"] },
  ],
  trabalho: [
    { slug: "relatorio-de-emprego", nome: "relatório de emprego", sinonimos: ["payroll", "criação de vagas", "relatório de empregos"] },
    { slug: "desemprego-nos-eua", nome: "desemprego nos EUA", sinonimos: ["taxa de desemprego", "pedidos de seguro-desemprego"] },
    { slug: "salario-minimo", nome: "salário mínimo", sinonimos: ["piso salarial"] },
    { slug: "demissoes", nome: "demissões em massa", sinonimos: ["layoffs", "cortes de vagas", "demissões"] },
    { slug: "greves-e-sindicatos", nome: "greves e sindicatos", sinonimos: ["greve", "sindicato", "sindicatos"] },
    { slug: "trabalho-remoto", nome: "trabalho remoto", sinonimos: ["home office", "trabalho híbrido", "volta ao escritório"] },
    { slug: "vagas-de-emprego", nome: "vagas de emprego", sinonimos: ["vagas abertas", "oferta de vagas"] },
    { slug: "salarios", nome: "salários", sinonimos: ["aumento salarial", "reajuste salarial", "média salarial"] },
    { slug: "carreira-em-tecnologia", nome: "carreira em tecnologia", sinonimos: ["vagas em tecnologia", "profissionais de tecnologia"] },
    { slug: "ia-no-trabalho", nome: "IA no trabalho", sinonimos: ["automação de empregos", "inteligência artificial no trabalho"] },
    { slug: "profissoes-em-alta", nome: "profissões em alta", sinonimos: ["profissões mais procuradas", "carreiras em alta"] },
    { slug: "qualificacao-profissional", nome: "qualificação profissional", sinonimos: ["requalificação profissional", "formação profissional"] },
    { slug: "jornada-de-trabalho", nome: "jornada de trabalho", sinonimos: ["semana de quatro dias", "horas extras"] },
    { slug: "trabalho-por-aplicativo", nome: "trabalho por aplicativo", sinonimos: ["motoristas de aplicativo", "entregadores de aplicativo", "gig economy"] },
    { slug: "aposentadoria", nome: "aposentadoria", sinonimos: ["previdência privada", "plano 401(k)", "Seguridade Social"] },
    { slug: "beneficios-trabalhistas", nome: "benefícios trabalhistas", sinonimos: ["licença remunerada", "licença-maternidade", "licença parental"] },
    { slug: "trabalho-na-saude", nome: "trabalho na saúde", sinonimos: ["falta de enfermeiros", "profissionais de saúde"] },
  ],
  tecnologia: [
    { slug: "inteligencia-artificial", nome: "inteligência artificial", sinonimos: ["IA generativa", "modelos de linguagem", "chatbots"] },
    { slug: "data-centers", nome: "data centers", sinonimos: ["data center", "centros de dados", "centro de dados"] },
    { slug: "big-techs", nome: "big techs", sinonimos: ["big tech", "gigantes da tecnologia"] },
    { slug: "semicondutores", nome: "semicondutores", sinonimos: ["chips", "fabricação de chips", "indústria de chips"] },
    { slug: "regulacao-de-ia", nome: "regulação de IA", sinonimos: ["regulação da inteligência artificial", "lei de IA"] },
    { slug: "carros-autonomos", nome: "carros autônomos", sinonimos: ["robotáxi", "robotáxis", "veículos autônomos"] },
    { slug: "carros-eletricos", nome: "carros elétricos", sinonimos: ["veículos elétricos", "carro elétrico"] },
    { slug: "redes-sociais", nome: "redes sociais", sinonimos: ["rede social", "plataformas digitais"] },
    { slug: "privacidade-de-dados", nome: "privacidade de dados", sinonimos: ["proteção de dados", "dados pessoais"] },
    { slug: "ciberseguranca", nome: "cibersegurança", sinonimos: ["ataque hacker", "ataques hackers", "vazamento de dados", "ransomware"] },
    { slug: "startups", nome: "startups", sinonimos: ["startup", "unicórnio"] },
    { slug: "exploracao-espacial", nome: "exploração espacial", sinonimos: ["corrida espacial", "lançamento de foguete", "missão lunar"] },
    { slug: "computacao-quantica", nome: "computação quântica", sinonimos: ["computador quântico"] },
    { slug: "smartphones", nome: "smartphones", sinonimos: ["smartphone", "celulares"] },
    { slug: "streaming", nome: "streaming", sinonimos: ["plataformas de streaming"] },
    { slug: "videogames", nome: "videogames", sinonimos: ["games", "indústria de games"] },
    { slug: "robotica", nome: "robótica", sinonimos: ["robôs humanoides", "robôs"] },
    { slug: "energia-nuclear", nome: "energia nuclear", sinonimos: ["usina nuclear", "reatores nucleares", "pequenos reatores"] },
    { slug: "antitruste", nome: "antitruste", sinonimos: ["processo antitruste", "monopólio"] },
    { slug: "energia-para-ia", nome: "energia para IA", sinonimos: ["consumo de energia da IA", "demanda de energia dos data centers"] },
  ],
  "custo-de-vida": [
    { slug: "aluguel", nome: "aluguel", sinonimos: ["aluguéis", "preço do aluguel"] },
    { slug: "preco-dos-imoveis", nome: "preço dos imóveis", sinonimos: ["preço das casas", "mercado imobiliário", "venda de casas"] },
    { slug: "financiamento-imobiliario", nome: "financiamento imobiliário", sinonimos: ["hipoteca", "hipotecas", "juros da hipoteca"] },
    { slug: "preco-da-gasolina", nome: "preço da gasolina", sinonimos: ["gasolina", "preço dos combustíveis nos EUA"] },
    { slug: "conta-de-luz", nome: "conta de luz", sinonimos: ["tarifa de energia", "conta de energia", "contas de serviços públicos", "tarifas de serviços públicos"] },
    { slug: "plano-de-saude", nome: "plano de saúde", sinonimos: ["seguro saúde", "seguro-saúde", "Obamacare"] },
    { slug: "preco-dos-alimentos", nome: "preço dos alimentos", sinonimos: ["preço da comida", "conta do supermercado", "preço dos ovos"] },
    { slug: "mensalidade-universitaria", nome: "mensalidade universitária", sinonimos: ["custo da faculdade", "dívida estudantil", "crédito estudantil"] },
    { slug: "creche", nome: "creche", sinonimos: ["cuidados infantis", "custo da creche"] },
    { slug: "seguro-de-carro", nome: "seguro de carro", sinonimos: ["seguro de automóvel", "seguro auto"] },
    { slug: "preco-de-remedios", nome: "preço de remédios", sinonimos: ["preço dos medicamentos", "remédios mais baratos"] },
    { slug: "imposto-sobre-propriedade", nome: "imposto sobre propriedade", sinonimos: ["property tax", "imposto predial"] },
    { slug: "cartao-de-credito", nome: "cartão de crédito", sinonimos: ["dívida no cartão", "juros do cartão"] },
    { slug: "transporte-publico", nome: "transporte público", sinonimos: ["metrô", "tarifa de ônibus"] },
    { slug: "custo-de-vida-nas-cidades", nome: "custo de vida nas cidades", sinonimos: ["cidades mais caras", "cidades mais baratas"] },
    { slug: "passagens-aereas", nome: "passagens aéreas", sinonimos: ["preço das passagens", "tarifas aéreas"] },
    { slug: "gorjetas", nome: "gorjetas", sinonimos: ["gorjeta"] },
    { slug: "conta-de-agua", nome: "conta de água", sinonimos: ["tarifa de água"] },
  ],
  governo: [
    { slug: "eleicoes-americanas", nome: "eleições americanas", sinonimos: ["eleições de meio de mandato", "midterms", "eleição presidencial", "primárias"] },
    { slug: "suprema-corte", nome: "Suprema Corte", sinonimos: ["Suprema Corte dos EUA"] },
    { slug: "ordens-executivas", nome: "ordens executivas", sinonimos: ["ordem executiva", "decreto presidencial"] },
    { slug: "orcamento-federal", nome: "orçamento federal", sinonimos: ["orçamento do governo federal", "corte de gastos federais"] },
    { slug: "paralisacao-do-governo", nome: "paralisação do governo", sinonimos: ["shutdown"] },
    { slug: "politica-externa-americana", nome: "política externa americana", sinonimos: ["diplomacia americana"] },
    { slug: "sancoes-economicas", nome: "sanções econômicas", sinonimos: ["sanções"] },
    { slug: "defesa-e-forcas-armadas", nome: "defesa e Forças Armadas", sinonimos: ["Forças Armadas", "gastos militares"] },
    { slug: "seguranca-publica", nome: "segurança pública", sinonimos: ["criminalidade", "taxa de homicídios"] },
    { slug: "controle-de-armas", nome: "controle de armas", sinonimos: ["porte de armas", "armas de fogo"] },
    { slug: "aborto", nome: "aborto", sinonimos: ["direito ao aborto"] },
    { slug: "saude-publica", nome: "saúde pública", sinonimos: ["Medicaid", "Medicare", "vacinação"] },
    { slug: "impostos-federais", nome: "impostos federais", sinonimos: ["corte de impostos", "reforma tributária americana"] },
    { slug: "politica-estadual", nome: "política estadual", sinonimos: ["governador", "governadores", "assembleia estadual"] },
    { slug: "politica-municipal", nome: "política municipal", sinonimos: ["prefeito", "prefeita", "câmara municipal", "vereador", "vereadores"] },
    { slug: "regulacao-ambiental", nome: "regulação ambiental", sinonimos: ["mudança climática", "emissões de carbono", "regras ambientais"] },
    { slug: "regulacao-de-data-centers", nome: "regulação de data centers", sinonimos: ["moratória de data centers", "moratória para data centers", "moratória sobre data centers"] },
    { slug: "liberdade-de-expressao", nome: "liberdade de expressão", sinonimos: ["Primeira Emenda"] },
    { slug: "processos-judiciais-contra-o-governo", nome: "processos contra o governo", sinonimos: ["ação judicial contra o governo", "liminar contra o governo"] },
    { slug: "impeachment", nome: "impeachment" },
  ],
  brasil: [
    { slug: "cambio", nome: "câmbio", sinonimos: ["real frente ao dólar", "dólar no Brasil", "cotação do real"] },
    { slug: "selic", nome: "Selic", sinonimos: ["taxa Selic", "juros no Brasil"] },
    { slug: "inflacao-no-brasil", nome: "inflação no Brasil", sinonimos: ["IPCA", "inflação brasileira"] },
    { slug: "contas-publicas", nome: "contas públicas", sinonimos: ["arcabouço fiscal", "déficit fiscal", "dívida pública brasileira", "meta fiscal"] },
    { slug: "reforma-tributaria", nome: "reforma tributária", sinonimos: ["reforma tributária brasileira"] },
    { slug: "imposto-de-renda", nome: "Imposto de Renda", sinonimos: ["isenção do IR", "declaração do IR"] },
    { slug: "desemprego-no-brasil", nome: "desemprego no Brasil", sinonimos: ["taxa de desemprego no Brasil"] },
    { slug: "pib-do-brasil", nome: "PIB do Brasil", sinonimos: ["PIB brasileiro", "economia brasileira"] },
    { slug: "relacao-brasil-eua", nome: "relação Brasil-EUA", sinonimos: ["tarifas sobre o Brasil", "comércio entre Brasil e EUA"] },
    { slug: "agronegocio", nome: "agronegócio", sinonimos: ["exportações agrícolas", "soja"] },
    { slug: "exportacoes-brasileiras", nome: "exportações brasileiras", sinonimos: ["balança comercial brasileira"] },
    { slug: "pix", nome: "Pix" },
    { slug: "ibovespa", nome: "Ibovespa", sinonimos: ["bolsa brasileira", "B3"] },
    { slug: "eleicoes-no-brasil", nome: "eleições no Brasil", sinonimos: ["eleição de 2026", "eleições de 2026"] },
    { slug: "combustiveis-no-brasil", nome: "combustíveis no Brasil", sinonimos: ["preço da gasolina no Brasil", "preço do diesel"] },
    { slug: "custo-de-vida-no-brasil", nome: "custo de vida no Brasil", sinonimos: ["preços no Brasil"] },
    { slug: "compras-internacionais", nome: "compras internacionais", sinonimos: ["taxa das blusinhas", "taxação de compras internacionais"] },
    { slug: "investimento-estrangeiro-no-brasil", nome: "investimento estrangeiro no Brasil", sinonimos: ["capital estrangeiro"] },
  ],
};

/** Igualdade sem acento, sem caixa e sem pontuação, para casar tema com texto. */
export function chaveDeTema(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9& ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Todos os temas, sem repetição de slug, na ordem das editorias. */
export function todosOsTemas(): Tema[] {
  const vistos = new Set<string>();
  const saida: Tema[] = [];
  for (const e of EDITORIAS) {
    for (const t of TEMAS[e.id]) {
      if (vistos.has(t.slug)) continue;
      vistos.add(t.slug);
      saida.push(t);
    }
  }
  return saida;
}

let indice: Map<string, Tema> | null = null;

function indiceDeTemas(): Map<string, Tema> {
  if (indice) return indice;
  indice = new Map();
  for (const t of todosOsTemas()) {
    for (const forma of [t.nome, ...(t.sinonimos ?? [])]) {
      const k = chaveDeTema(forma);
      if (k && !indice.has(k)) indice.set(k, t);
    }
  }
  return indice;
}

/** O tema da lista que a forma escrita nomeia (nome ou sinônimo), ou `null`. */
export function temaPeloNome(forma: string): Tema | null {
  return indiceDeTemas().get(chaveDeTema(forma)) ?? null;
}

export function temaPeloSlug(slug: string): Tema | null {
  return todosOsTemas().find((t) => t.slug === slug) ?? null;
}

function ocorrencias(texto: string, forma: string): number {
  if (!forma) return 0;
  let n = 0;
  let i = texto.indexOf(` ${forma} `);
  while (i >= 0) {
    n += 1;
    i = texto.indexOf(` ${forma} `, i + forma.length + 1);
  }
  return n;
}

/**
 * Os temas da lista que o TEXTO da matéria trata, do mais citado para o
 * menos, os da editoria da matéria primeiro no empate.
 *
 * Conservador de propósito: o tema precisa aparecer pelo menos `minimo` vezes
 * (nome ou sinônimo, somados). Uma citação de passagem não faz de um tema o
 * assunto da matéria.
 */
export function temasNoTexto(texto: string, opcoes: { editoria?: EditoriaId | null; minimo?: number } = {}): Tema[] {
  const alvo = ` ${chaveDeTema(texto)} `;
  const minimo = opcoes.minimo ?? 2;
  const daEditoria = new Set((opcoes.editoria ? TEMAS[opcoes.editoria] : []).map((t) => t.slug));
  const achados: Array<{ tema: Tema; n: number; ordem: number }> = [];
  todosOsTemas().forEach((tema, ordem) => {
    const formas = [...new Set([tema.nome, ...(tema.sinonimos ?? [])].map(chaveDeTema))];
    // A busca é por palavra inteira: "data center" não casa dentro de "data centers".
    const n = formas.reduce((s, f) => s + ocorrencias(alvo, f), 0);
    if (n >= minimo) achados.push({ tema, n, ordem });
  });
  return achados
    .sort((a, b) => b.n - a.n || Number(daEditoria.has(b.tema.slug)) - Number(daEditoria.has(a.tema.slug)) || a.ordem - b.ordem)
    .map((a) => a.tema);
}

/** A lista de temas como o redator a recebe: a da editoria da matéria primeiro. */
export function temasParaOPrompt(editoria?: EditoriaId | null): string {
  const ordem = editoria ? [editoria, ...EDITORIAS.map((e) => e.id).filter((id) => id !== editoria)] : EDITORIAS.map((e) => e.id);
  return ordem.map((id) => `${id}: ${TEMAS[id].map((t) => t.nome).join("; ")}`).join("\n");
}
