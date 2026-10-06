import type { TopicoEvergreen } from "./tipos";

/**
 * O estoque editorial do evergreen, na linha de 05/10/2026.
 *
 * O leitor é o brasileiro que SONHA em morar, trabalhar ou investir nos EUA, e
 * não quem já mora lá. O catálogo explica como as coisas funcionam no país:
 * dinheiro, trabalho, impostos, moradia, saúde, governo e tecnologia. Visto,
 * green card, USCIS e qualquer processo migratório ficam fora, como na pauta.
 * O catálogo anterior, todo de imigração, está arquivado em
 * `catalogo-imigracao-arquivado.ts`.
 *
 * Cada tópico é um assunto que não vence, e cada ângulo é uma pergunta
 * diferente sobre ele. "O que é o 401(k)" e "o que acontece com ele quando a
 * pessoa troca de emprego" são conteúdos diferentes; "o que é" e "entenda o"
 * seriam o mesmo post com dois títulos.
 *
 * As fontes são só de órgão oficial (lista em `grounding.ts`), e cada URL foi
 * conferida por requisição em 06/10/2026 com o agente honesto do projeto:
 * HTTP 200, texto suficiente para o extrator e o termo do assunto presente na
 * página. Ficaram de fora, por responderem 403 ou página vazia a um agente
 * declarado: investor.gov, ssa.gov, hud.gov, huduser.gov, studentaid.gov,
 * ed.gov, ibge.gov.br, bcb.gov.br, congress.gov, senate.gov, transportation.gov
 * e federalregister.gov. Quem trocar uma URL confere de novo
 * (`src/scripts/conferir-fontes-evergreen.ts`).
 *
 * O Brasil entra só como contraste, e só quando uma fonte primária brasileira
 * sustenta o lado de cá (gov.br). Nenhum ângulo afirma equivalência que as
 * duas fontes não dizem.
 *
 * `entidade` só aparece em seis tópicos, aqueles em que a instituição É o
 * assunto (Fed, SEC, FDIC, IRS na temporada de declaração, Congresso e
 * Suprema Corte). Medido em 06/10/2026 com o resolvedor de produção: com o
 * órgão declarado, credit score, 401(k), aluguel e Artemis terminavam em
 * NO_VALID_IMAGE (o caminho da entidade recusa as fotos do órgão e não volta
 * para a cena); sem ele, os quatro saíram com foto da cena descrita pelo
 * conteúdo. Conceito se ilustra pela cena, não pela fachada de quem o regula.
 *
 * Número que muda todo ano só entra quando a fonte é o número oficial do ano
 * (faixas do IRS, paridade regional do BEA, sindicalização do BLS). O ângulo
 * pergunta pelo mecanismo, e o número vem da fonte no dia em que o post é
 * escrito. Cotação, taxa do dia e decisão de reunião pertencem ao noticiário.
 */
export const CATALOGO_EVERGREEN: TopicoEvergreen[] = [
  /* ------------------------------------------------------------------ */
  /* ECONOMIA                                                            */
  /* ------------------------------------------------------------------ */
  {
    id: "federal-reserve",
    nome: "Federal Reserve (o banco central americano)",
    familia: "explainer",
    editoria: "economia",
    temas: ["juros-do-fed"],
    programa: "Fed",
    entidade: "Federal Reserve",
    resumo: "O que é o Fed, como ele se organiza em um conselho em Washington e doze bancos regionais, e quais são os objetivos que a lei dá a ele.",
    fontesCanonicas: [
      "https://www.federalreserve.gov/aboutthefed/fedexplained/who-we-are.htm",
      "https://www.federalreserve.gov/faqs/what-economic-goals-does-federal-reserve-seek-to-achieve-through-monetary-policy.htm",
      "https://www.federalreserve.gov/aboutthefed.htm",
    ],
    angulos: [
      { id: "o-que-e", pergunta: "O que é o Federal Reserve e por que ele não é um banco só?" },
      { id: "mandato-duplo", pergunta: "Quais objetivos a lei americana dá ao Fed quando ele mexe nos juros?" },
      { id: "doze-bancos", pergunta: "Como funcionam os doze bancos regionais do Federal Reserve espalhados pelo país?" },
    ],
  },
  {
    id: "fomc-juros",
    nome: "FOMC (o comitê que decide os juros nos EUA)",
    familia: "process_explainer",
    editoria: "economia",
    temas: ["juros-do-fed"],
    programa: "FOMC",
    resumo: "Quem vota no comitê de política monetária do Fed, quantas vezes ele se reúne no ano e como a decisão chega à taxa básica americana.",
    fontesCanonicas: [
      "https://www.federalreserve.gov/monetarypolicy/fomc.htm",
      "https://www.federalreserve.gov/monetarypolicy/openmarket.htm",
      "https://www.federalreserve.gov/aboutthefed/fedexplained/monetary-policy.htm",
    ],
    angulos: [
      { id: "quem-vota", pergunta: "Quem tem voto no comitê que decide os juros nos Estados Unidos?" },
      { id: "como-a-decisao-vira-juro", pergunta: "Como a decisão do FOMC se transforma na taxa de juros que circula na economia?" },
      { id: "reunioes-no-ano", pergunta: "Quantas vezes por ano o comitê de juros do Fed se reúne, e o que sai de cada reunião?" },
    ],
  },
  {
    id: "inflacao-cpi",
    nome: "CPI (o índice de inflação ao consumidor americano)",
    familia: "explainer",
    editoria: "economia",
    temas: ["inflacao-nos-eua"],
    programa: "CPI",
    resumo: "Como o Bureau of Labor Statistics mede a inflação americana, que preços entram na cesta e qual é a meta de inflação que o Fed persegue.",
    fontesCanonicas: [
      "https://www.bls.gov/cpi/questions-and-answers.htm",
      "https://www.bls.gov/cpi/overview.htm",
      "https://www.federalreserve.gov/faqs/economy_14400.htm",
    ],
    angulos: [
      { id: "como-e-medido", pergunta: "Como o governo americano mede a inflação que aparece no CPI?" },
      { id: "o-que-entra-na-cesta", pergunta: "Que preços entram na cesta do CPI e como eles são coletados?" },
      { id: "meta-do-fed", pergunta: "Qual é a meta de inflação do Fed e por que ela não é zero?" },
    ],
  },
  {
    id: "pib-americano",
    nome: "GDP (o PIB americano, medido pelo BEA)",
    familia: "explainer",
    editoria: "economia",
    temas: ["pib-dos-eua"],
    programa: "GDP",
    resumo: "O que o Bureau of Economic Analysis soma para chegar ao PIB dos EUA, de quanto em quanto tempo ele sai e por que o número é revisado depois.",
    fontesCanonicas: [
      "https://www.bea.gov/resources/learning-center/what-to-know-gdp",
      "https://www.bea.gov/data/gdp/gross-domestic-product",
    ],
    angulos: [
      { id: "o-que-entra", pergunta: "O que entra na conta do PIB americano?" },
      { id: "revisoes", pergunta: "Por que o PIB dos EUA sai em mais de uma estimativa para o mesmo trimestre?" },
    ],
  },
  {
    id: "titulos-do-tesouro",
    nome: "Treasuries (os títulos do Tesouro americano: bills, notes e bonds)",
    familia: "comparison",
    editoria: "economia",
    temas: ["titulos-do-tesouro"],
    programa: "Treasury",
    resumo: "A diferença entre Treasury bills, notes e bonds, por quanto tempo cada um empresta dinheiro ao governo americano e como eles pagam juros.",
    fontesCanonicas: [
      "https://www.treasurydirect.gov/marketable-securities/treasury-bills/",
      "https://www.treasurydirect.gov/marketable-securities/treasury-notes/",
      "https://www.treasurydirect.gov/marketable-securities/treasury-bonds/",
      "https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics",
    ],
    angulos: [
      { id: "bills-notes-bonds", pergunta: "Qual a diferença entre Treasury bills, notes e bonds?" },
      { id: "como-paga-juros", pergunta: "Como um título do Tesouro americano paga juros a quem compra?" },
    ],
  },
  {
    id: "tips-e-i-bonds",
    nome: "TIPS e I bonds (os títulos do Tesouro atrelados à inflação)",
    familia: "comparison",
    editoria: "economia",
    temas: ["titulos-do-tesouro", "inflacao-nos-eua"],
    programa: "TIPS",
    resumo: "Os dois títulos do Tesouro americano que corrigem o investimento pela inflação, como cada um faz a correção e o que muda entre eles.",
    fontesCanonicas: [
      "https://www.treasurydirect.gov/marketable-securities/tips/",
      "https://www.treasurydirect.gov/savings-bonds/i-bonds/",
    ],
    angulos: [
      { id: "como-corrige", pergunta: "Como os TIPS corrigem o valor investido pela inflação americana?" },
      { id: "tips-x-i-bonds", pergunta: "Qual a diferença entre TIPS e I bonds, os dois títulos americanos contra a inflação?" },
    ],
  },
  {
    id: "bolsas-e-sec",
    nome: "Bolsa de valores americana (as bolsas registradas na SEC)",
    familia: "explainer",
    editoria: "economia",
    temas: ["mercado-de-acoes"],
    programa: "SEC",
    entidade: "U.S. Securities and Exchange Commission",
    resumo: "O que a SEC faz, o que é uma bolsa registrada como national securities exchange e quem fiscaliza a negociação de ações nos EUA.",
    fontesCanonicas: [
      "https://www.sec.gov/about/mission",
      "https://www.sec.gov/about/divisions-offices/division-trading-markets/national-securities-exchanges",
      "https://www.sec.gov/about/divisions-offices/division-trading-markets",
    ],
    angulos: [
      { id: "o-que-a-sec-faz", pergunta: "O que faz a SEC, a comissão que fiscaliza o mercado de ações americano?" },
      { id: "o-que-e-bolsa-registrada", pergunta: "O que é uma bolsa registrada na SEC e por que existem várias nos EUA?" },
    ],
  },
  {
    id: "alocacao-de-ativos",
    nome: "Asset allocation (diversificação de investimentos, pelo guia da SEC)",
    familia: "explainer",
    editoria: "economia",
    temas: ["mercado-de-acoes"],
    programa: "asset allocation",
    resumo: "O guia da SEC para quem começa a investir: como dividir o dinheiro entre ações, títulos e caixa, o que é diversificar e o que é rebalancear.",
    fontesCanonicas: ["https://www.sec.gov/about/reports-publications/investorpubsassetallocationhtm"],
    angulos: [
      { id: "o-que-e", pergunta: "O que a SEC chama de alocação de ativos e por que ela muda com o prazo de cada pessoa?" },
      { id: "diversificar", pergunta: "O que é diversificar investimentos, segundo o guia da SEC?" },
      { id: "rebalancear", pergunta: "O que é rebalancear uma carteira e quando o guia da SEC sugere fazer isso?" },
    ],
  },
  {
    id: "ipo",
    nome: "IPO (como uma empresa abre capital nos EUA)",
    familia: "process_explainer",
    editoria: "economia",
    temas: ["ipos"],
    programa: "IPO",
    resumo: "O que significa uma empresa abrir capital nos Estados Unidos, o que a SEC exige dela antes e depois, e que alternativas ao IPO tradicional existem.",
    fontesCanonicas: ["https://www.sec.gov/resources-small-businesses/going-public"],
    angulos: [
      { id: "o-que-muda", pergunta: "O que muda para uma empresa americana depois que ela abre capital?" },
      { id: "etapas", pergunta: "Quais são as etapas para uma empresa abrir capital nos EUA?" },
    ],
  },
  {
    id: "fdic",
    nome: "FDIC (o seguro dos depósitos bancários americanos)",
    familia: "faq",
    editoria: "economia",
    temas: ["setor-bancario"],
    programa: "FDIC",
    entidade: "Federal Deposit Insurance Corporation",
    resumo: "Como funciona o seguro que protege o dinheiro depositado em banco nos EUA, até que valor ele cobre e o que fica de fora.",
    fontesCanonicas: [
      "https://www.fdic.gov/resources/deposit-insurance/understanding-deposit-insurance",
      "https://www.fdic.gov/resources/deposit-insurance",
    ],
    angulos: [
      { id: "ate-quanto", pergunta: "Até quanto o FDIC garante do dinheiro depositado num banco americano?" },
      { id: "o-que-nao-cobre", pergunta: "O que o seguro de depósitos do FDIC não cobre?" },
      { id: "se-o-banco-quebra", pergunta: "O que acontece com o dinheiro do correntista quando um banco americano quebra?" },
    ],
  },
  {
    id: "divida-publica-americana",
    nome: "National debt (a dívida pública americana)",
    familia: "explainer",
    editoria: "economia",
    temas: ["divida-publica-americana"],
    programa: "national debt",
    resumo: "O que é a dívida pública dos EUA, como ela se diferencia do déficit e quem são os credores, nos guias do Tesouro americano.",
    fontesCanonicas: [
      "https://fiscaldata.treasury.gov/americas-finance-guide/national-debt/",
      "https://fiscaldata.treasury.gov/americas-finance-guide/national-deficit/",
    ],
    angulos: [
      { id: "divida-x-deficit", pergunta: "Qual a diferença entre a dívida pública americana e o déficit do governo?" },
      { id: "quem-e-credor", pergunta: "A quem o governo americano deve a dívida pública dele?" },
    ],
  },
  {
    id: "llc",
    nome: "LLC (a empresa de responsabilidade limitada americana)",
    familia: "explainer",
    editoria: "economia",
    temas: ["startups"],
    programa: "LLC",
    resumo: "O que é uma LLC, como ela é tratada pelo IRS, o que é o EIN e quais passos a SBA lista para registrar um negócio nos EUA.",
    fontesCanonicas: [
      "https://www.irs.gov/businesses/small-businesses-self-employed/limited-liability-company-llc",
      "https://www.sba.gov/counseling/launch-your-business/",
      "https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number",
    ],
    angulos: [
      { id: "o-que-e", pergunta: "O que é uma LLC e por que ela é a forma de empresa mais lembrada nos EUA?" },
      { id: "como-o-irs-trata", pergunta: "Como o IRS trata o imposto de uma LLC?" },
      { id: "ein", pergunta: "O que é o EIN, o número que identifica uma empresa no IRS?" },
      { id: "passos-da-sba", pergunta: "Quais passos a SBA lista para abrir um negócio nos EUA?" },
    ],
  },
  {
    id: "emprestimos-sba",
    nome: "SBA loans (o crédito com garantia federal para pequenas empresas)",
    familia: "explainer",
    editoria: "economia",
    temas: ["startups"],
    programa: "SBA",
    resumo: "Como funcionam os empréstimos com garantia da Small Business Administration, o programa 7(a) e quem empresta de fato o dinheiro.",
    fontesCanonicas: ["https://www.sba.gov/loans/", "https://www.sba.gov/loans/7a-loans/"],
    angulos: [
      { id: "quem-empresta", pergunta: "Quem empresta o dinheiro num empréstimo da SBA, o governo ou o banco?" },
      { id: "programa-7a", pergunta: "O que é o programa 7(a), o empréstimo mais comum da SBA?" },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* TRABALHO                                                            */
  /* ------------------------------------------------------------------ */
  {
    id: "salario-minimo",
    nome: "Minimum wage (o salário mínimo federal e o dos estados)",
    familia: "explainer",
    editoria: "trabalho",
    temas: ["salario-minimo"],
    programa: "minimum wage",
    resumo: "Como o salário mínimo americano é por hora, por que cada estado pode ter um mínimo maior que o federal e qual vale quando os dois existem.",
    fontesCanonicas: [
      "https://www.dol.gov/agencies/whd/minimum-wage",
      "https://www.dol.gov/agencies/whd/minimum-wage/state",
      "https://www.dol.gov/general/topic/wages/minimumwage",
    ],
    angulos: [
      { id: "federal-x-estadual", pergunta: "Quando o estado tem salário mínimo diferente do federal, qual vale?" },
      { id: "por-hora", pergunta: "Por que o salário mínimo nos EUA é contado por hora, e não por mês?" },
      { id: "estados-acima", pergunta: "Como fica o mapa dos estados americanos com salário mínimo acima do federal?" },
    ],
  },
  {
    id: "hora-extra",
    nome: "Overtime (a hora extra pela lei federal americana)",
    familia: "faq",
    editoria: "trabalho",
    temas: ["jornada-de-trabalho"],
    programa: "overtime",
    resumo: "A partir de quantas horas por semana a lei federal manda pagar hora extra, quanto a mais ela vale, quem fica fora da regra e o que a FLSA deixa para o contrato.",
    fontesCanonicas: [
      "https://www.dol.gov/agencies/whd/overtime",
      "https://www.dol.gov/agencies/whd/fact-sheets/23-flsa-overtime-pay",
      "https://www.dol.gov/agencies/whd/flsa",
      "https://www.dol.gov/general/topic/workhours",
    ],
    angulos: [
      { id: "a-partir-de-quando", pergunta: "A partir de quantas horas na semana a hora extra é obrigatória nos EUA?" },
      { id: "quem-fica-fora", pergunta: "Quem fica fora da regra de hora extra da lei federal americana?" },
      { id: "o-que-a-flsa-nao-regula", pergunta: "O que a lei federal de jornada americana deixa para o empregador e para os estados decidirem?" },
    ],
  },
  {
    id: "ferias-e-feriados",
    nome: "PTO (férias e feriados remunerados nos EUA)",
    familia: "faq",
    editoria: "trabalho",
    temas: ["beneficios-trabalhistas"],
    programa: "PTO",
    resumo: "O que a lei federal diz sobre férias e feriados pagos, quantos feriados federais existem e quanto de férias os trabalhadores costumam ter, pelos dados do BLS.",
    fontesCanonicas: [
      "https://www.dol.gov/general/topic/workhours/vacation_leave",
      "https://www.dol.gov/general/topic/workhours/holidays",
      "https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/",
      "https://www.bls.gov/ebs/factsheets/paid-vacations.htm",
    ],
    angulos: [
      { id: "lei-obriga", pergunta: "A lei federal americana obriga o empregador a dar férias pagas?" },
      { id: "feriados-federais", pergunta: "Quais são os feriados federais dos Estados Unidos?" },
      { id: "quanto-o-americano-tem", pergunta: "Quantos dias de férias pagas o trabalhador americano costuma ter, pelos dados do BLS?" },
    ],
  },
  {
    id: "fmla",
    nome: "FMLA (a licença médica e familiar americana)",
    familia: "faq",
    editoria: "trabalho",
    temas: ["beneficios-trabalhistas"],
    programa: "FMLA",
    resumo: "Quem tem direito à licença da Family and Medical Leave Act, por quanto tempo, em que situações e se ela é paga.",
    fontesCanonicas: [
      "https://www.dol.gov/agencies/whd/fmla",
      "https://www.dol.gov/agencies/whd/fact-sheets/28-fmla",
    ],
    angulos: [
      { id: "quanto-tempo", pergunta: "Por quanto tempo a FMLA garante a licença do trabalhador americano?" },
      { id: "em-que-situacoes", pergunta: "Em que situações o trabalhador americano pode usar a licença da FMLA?" },
      { id: "e-paga", pergunta: "A licença da FMLA é paga ou só garante o emprego de volta?" },
    ],
  },
  {
    id: "gorjetas-e-salario",
    nome: "Tipped employees (o salário de quem recebe gorjeta)",
    familia: "explainer",
    editoria: "trabalho",
    temas: ["gorjetas", "salario-minimo"],
    programa: "tipped",
    resumo: "Como a lei federal trata o salário de garçons e de quem vive de gorjeta, o que é o tip credit e como as regras mudam por estado.",
    fontesCanonicas: [
      "https://www.dol.gov/agencies/whd/fact-sheets/15-tipped-employees-flsa",
      "https://www.dol.gov/agencies/whd/state/minimum-wage/tipped",
    ],
    angulos: [
      { id: "tip-credit", pergunta: "O que é o tip credit, a regra que deixa o salário-base de quem recebe gorjeta abaixo do mínimo?" },
      { id: "por-estado", pergunta: "Por que a regra do salário de quem recebe gorjeta muda de estado para estado?" },
      { id: "de-quem-e-a-gorjeta", pergunta: "De quem é a gorjeta deixada pelo cliente, pela lei federal americana?" },
    ],
  },
  {
    id: "seguro-desemprego-eua",
    nome: "Unemployment insurance (o seguro-desemprego americano)",
    familia: "process_explainer",
    editoria: "trabalho",
    temas: ["desemprego-nos-eua", "beneficios-trabalhistas"],
    programa: "unemployment insurance",
    resumo: "Como o seguro-desemprego dos EUA é um programa federal e estadual ao mesmo tempo, quem paga por ele e como o trabalhador pede.",
    fontesCanonicas: [
      "https://www.dol.gov/general/topic/unemployment-insurance",
      "https://oui.doleta.gov/unemploy/uifactsheet.asp",
      "https://www.usa.gov/unemployment-benefits",
    ],
    angulos: [
      { id: "federal-e-estadual", pergunta: "Por que o seguro-desemprego americano depende do estado onde a pessoa trabalhou?" },
      { id: "quem-paga", pergunta: "Quem paga o seguro-desemprego nos EUA, o trabalhador ou o empregador?" },
      { id: "como-pedir", pergunta: "Quais são as etapas para pedir o seguro-desemprego nos EUA?" },
    ],
  },
  {
    id: "relatorio-de-emprego",
    nome: "Payroll (o relatório de emprego do BLS)",
    familia: "process_explainer",
    editoria: "trabalho",
    temas: ["relatorio-de-emprego"],
    programa: "payroll",
    resumo: "Como o relatório mensal de emprego dos EUA é feito a partir de duas pesquisas, uma com empresas e outra com famílias, e por que elas podem divergir.",
    fontesCanonicas: [
      "https://www.bls.gov/news.release/empsit.tn.htm",
      "https://www.bls.gov/ces/",
      "https://www.bls.gov/cps/",
    ],
    angulos: [
      { id: "duas-pesquisas", pergunta: "Quais são as duas pesquisas que formam o relatório de emprego americano?" },
      { id: "por-que-revisa", pergunta: "Por que o número de vagas criadas nos EUA é revisado nos meses seguintes?" },
      { id: "como-e-feito", pergunta: "Como o BLS coleta os dados do relatório de emprego todo mês?" },
    ],
  },
  {
    id: "taxa-de-desemprego",
    nome: "Unemployment rate (como o BLS calcula o desemprego americano)",
    familia: "glossary",
    editoria: "trabalho",
    temas: ["desemprego-nos-eua"],
    programa: "unemployment rate",
    resumo: "Quem o BLS conta como desempregado, quem fica fora da força de trabalho e como a pesquisa com famílias chega à taxa.",
    fontesCanonicas: ["https://www.bls.gov/cps/cps_htgm.htm", "https://www.bls.gov/cps/definitions.htm"],
    angulos: [
      { id: "quem-conta", pergunta: "Quem o governo americano conta como desempregado?" },
      { id: "fora-da-forca", pergunta: "O que é estar fora da força de trabalho, na conta do desemprego americano?" },
    ],
  },
  {
    id: "guia-de-profissoes",
    nome: "Occupational Outlook Handbook (o guia oficial de profissões do BLS)",
    familia: "explainer",
    editoria: "trabalho",
    temas: ["profissoes-em-alta", "carreira-em-tecnologia"],
    programa: "Occupational Outlook",
    resumo: "O guia do BLS que descreve centenas de profissões americanas com salário, formação e perspectiva de emprego, as projeções que o alimentam e a pesquisa de salário por profissão.",
    fontesCanonicas: [
      "https://www.bls.gov/ooh/about/ooh-faqs.htm",
      "https://www.bls.gov/emp/",
      "https://www.bls.gov/oes/",
    ],
    angulos: [
      { id: "o-que-traz", pergunta: "O que o guia oficial de profissões do governo americano informa sobre cada carreira?" },
      { id: "projecoes", pergunta: "Como o BLS projeta quais profissões vão crescer nos EUA?" },
      { id: "salario-por-profissao", pergunta: "Como o governo americano mede o salário de cada profissão em cada cidade?" },
    ],
  },
  {
    id: "401k",
    nome: "401(k) (a aposentadoria pelo empregador)",
    familia: "explainer",
    editoria: "trabalho",
    temas: ["aposentadoria"],
    programa: "401(k)",
    resumo: "O plano de aposentadoria oferecido pelo empregador nos EUA: como o dinheiro sai do salário, o que é a contrapartida da empresa e como o IRS trata o imposto.",
    fontesCanonicas: [
      "https://www.irs.gov/retirement-plans/401k-plans",
      "https://www.irs.gov/retirement-plans/plan-participant-employee/401k-resource-guide-plan-participants-401k-plan-overview",
      "https://www.dol.gov/general/topic/retirement/typesofplans",
    ],
    angulos: [
      { id: "o-que-e", pergunta: "O que é o 401(k), o plano de aposentadoria que o empregador americano oferece?" },
      { id: "contrapartida", pergunta: "Como funciona a contrapartida da empresa no 401(k)?" },
      { id: "imposto", pergunta: "Quando o imposto do 401(k) é pago, na entrada do dinheiro ou na saída?" },
      { id: "tipos-de-plano", pergunta: "Quais tipos de plano de aposentadoria o empregador americano pode oferecer?" },
    ],
  },
  {
    id: "ira-e-roth",
    nome: "IRA e Roth IRA (a aposentadoria individual americana)",
    familia: "comparison",
    editoria: "trabalho",
    temas: ["aposentadoria"],
    programa: "IRA",
    resumo: "As contas individuais de aposentadoria dos EUA, a diferença entre a tradicional e a Roth e como o imposto incide em cada uma.",
    fontesCanonicas: [
      "https://www.irs.gov/retirement-plans/individual-retirement-arrangements-iras",
      "https://www.irs.gov/retirement-plans/roth-iras",
      "https://www.irs.gov/retirement-plans/traditional-and-roth-iras",
    ],
    angulos: [
      { id: "o-que-e", pergunta: "O que é uma IRA, a conta de aposentadoria que a pessoa abre por conta própria nos EUA?" },
      { id: "tradicional-x-roth", pergunta: "Qual a diferença entre a IRA tradicional e a Roth IRA?" },
    ],
  },
  {
    id: "fica-contracheque",
    nome: "FICA (o que sai do contracheque americano)",
    familia: "explainer",
    editoria: "trabalho",
    temas: ["impostos-federais", "aposentadoria"],
    programa: "FICA",
    resumo: "Os descontos de Social Security e Medicare no salário americano, a parte do empregado e a do empregador, e a retenção do imposto de renda na fonte.",
    fontesCanonicas: [
      "https://www.irs.gov/taxtopics/tc751",
      "https://www.irs.gov/businesses/small-businesses-self-employed/understanding-employment-taxes",
    ],
    angulos: [
      { id: "o-que-e-descontado", pergunta: "O que é descontado do salário de quem trabalha nos EUA?" },
      { id: "parte-do-empregador", pergunta: "Quanto o empregador americano paga de Social Security e Medicare além do salário?" },
    ],
  },
  {
    id: "w2-ou-1099",
    nome: "W-2 ou 1099 (empregado ou contratado independente)",
    familia: "comparison",
    editoria: "trabalho",
    temas: ["trabalho-por-aplicativo", "impostos-federais"],
    programa: "1099",
    resumo: "Como o IRS e o Departamento do Trabalho distinguem empregado de contratado independente, e o que muda em imposto e direitos entre os dois.",
    fontesCanonicas: [
      "https://www.irs.gov/businesses/small-businesses-self-employed/independent-contractor-self-employed-or-employee",
      "https://www.dol.gov/agencies/whd/flsa/misclassification",
      "https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes",
    ],
    angulos: [
      { id: "como-distingue", pergunta: "Como o governo americano decide se alguém é empregado ou contratado independente?" },
      { id: "o-que-muda-no-imposto", pergunta: "O que muda no imposto de quem trabalha como contratado independente nos EUA?" },
      { id: "classificacao-errada", pergunta: "O que acontece quando a empresa americana classifica um empregado como contratado?" },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* TECNOLOGIA                                                          */
  /* ------------------------------------------------------------------ */
  {
    id: "nist-ai-rmf",
    nome: "AI Risk Management Framework (o guia de inteligência artificial do NIST)",
    familia: "explainer",
    editoria: "tecnologia",
    temas: ["regulacao-de-ia", "inteligencia-artificial"],
    programa: "AI RMF",
    resumo: "O que é o guia do NIST para gerir o risco de sistemas de inteligência artificial, por que ele é voluntário e a quem ele se dirige.",
    fontesCanonicas: ["https://www.nist.gov/itl/ai-risk-management-framework"],
    angulos: [
      { id: "o-que-e", pergunta: "O que é o guia do governo americano para gerir os riscos da inteligência artificial?" },
      { id: "voluntario", pergunta: "O guia de IA do NIST é obrigatório para as empresas americanas?" },
    ],
  },
  {
    id: "chips-for-america",
    nome: "CHIPS for America (o programa americano de semicondutores)",
    familia: "explainer",
    editoria: "tecnologia",
    temas: ["semicondutores"],
    programa: "CHIPS",
    resumo: "O programa federal que financia fábricas e pesquisa de semicondutores nos EUA, quem o administra e quais são as frentes dele.",
    fontesCanonicas: ["https://www.nist.gov/chips"],
    angulos: [
      { id: "o-que-e", pergunta: "O que é o CHIPS for America, o programa que quer trazer a fabricação de chips para os EUA?" },
      { id: "frentes", pergunta: "Quais são as frentes do programa americano de semicondutores?" },
    ],
  },
  {
    id: "patentes-e-marcas",
    nome: "Patente e trademark (como o USPTO protege invenção e marca)",
    familia: "comparison",
    editoria: "tecnologia",
    temas: ["startups"],
    programa: "USPTO",
    resumo: "O que é uma patente nos EUA, os tipos que existem, o que o USPTO avalia, e a diferença entre patente, marca registrada e direito autoral.",
    fontesCanonicas: [
      "https://www.uspto.gov/patents/basics/essentials",
      "https://www.uspto.gov/trademarks/basics",
    ],
    angulos: [
      { id: "o-que-e-patente", pergunta: "O que uma patente protege nos EUA, e por quanto tempo?" },
      { id: "tipos", pergunta: "Quais são os tipos de patente que o USPTO concede?" },
      { id: "patente-x-marca", pergunta: "Qual a diferença entre patente, marca registrada e direito autoral nos EUA?" },
    ],
  },
  {
    id: "computacao-quantica",
    nome: "Computação quântica (o que o NIST explica sobre o computador quântico)",
    familia: "explainer",
    editoria: "tecnologia",
    temas: ["computacao-quantica"],
    programa: "quantum",
    resumo: "O que diferencia um computador quântico de um comum, o que é um qubit e por que o NIST trabalha em criptografia que resista a ele.",
    fontesCanonicas: [
      "https://www.nist.gov/quantum-information-science/quantum-computing-explained",
      "https://www.nist.gov/quantum-information-science",
    ],
    angulos: [
      { id: "o-que-e-qubit", pergunta: "O que é um qubit e por que ele muda o jeito de calcular?" },
      { id: "criptografia", pergunta: "Por que o governo americano prepara uma criptografia que resista ao computador quântico?" },
    ],
  },
  {
    id: "carros-eletricos",
    nome: "Carros elétricos (como funcionam e onde carregam nos EUA)",
    familia: "explainer",
    editoria: "tecnologia",
    temas: ["carros-eletricos"],
    programa: "electric vehicle",
    resumo: "Como funciona um carro elétrico a bateria, a diferença para o híbrido e os níveis de recarga em casa e na rua, pelos guias do Departamento de Energia.",
    fontesCanonicas: [
      "https://www.fueleconomy.gov/feg/evtech.shtml",
      "https://afdc.energy.gov/vehicles/electric",
      "https://afdc.energy.gov/fuels/electricity-charging-home",
    ],
    angulos: [
      { id: "como-funciona", pergunta: "Como funciona um carro elétrico a bateria por dentro?" },
      { id: "eletrico-x-hibrido", pergunta: "Qual a diferença entre carro elétrico, híbrido e híbrido plug-in?" },
      { id: "carregar-em-casa", pergunta: "Como é carregar um carro elétrico em casa nos EUA?" },
    ],
  },
  {
    id: "energia-nuclear",
    nome: "Energia nuclear (como funciona um reator, pelo Departamento de Energia)",
    familia: "explainer",
    editoria: "tecnologia",
    temas: ["energia-nuclear"],
    programa: "nuclear",
    resumo: "Como um reator nuclear gera eletricidade e quanto da energia americana vem das usinas nucleares, pelos guias do DOE e da EIA.",
    fontesCanonicas: [
      "https://www.energy.gov/ne/articles/nuclear-101-how-does-nuclear-reactor-work",
      "https://www.eia.gov/energyexplained/nuclear/",
    ],
    angulos: [
      { id: "como-funciona", pergunta: "Como um reator nuclear transforma calor em eletricidade?" },
      { id: "peso-na-matriz", pergunta: "Quanto da eletricidade dos EUA vem de usinas nucleares?" },
    ],
  },
  {
    id: "programa-artemis",
    nome: "Artemis (o programa da NASA de volta à Lua)",
    familia: "explainer",
    editoria: "tecnologia",
    temas: ["exploracao-espacial"],
    programa: "Artemis",
    resumo: "O que é o programa Artemis, quais são as missões, o que a NASA pretende fazer na Lua e como isso se liga à ida a Marte.",
    fontesCanonicas: ["https://www.nasa.gov/humans-in-space/artemis/", "https://www.nasa.gov/about/"],
    angulos: [
      { id: "o-que-e", pergunta: "O que é o programa Artemis e o que a NASA quer fazer na Lua?" },
      { id: "lua-e-marte", pergunta: "Como a volta à Lua prepara a NASA para ir a Marte?" },
    ],
  },
  {
    id: "sbir",
    nome: "SBIR (o dinheiro federal para pesquisa em startups)",
    familia: "explainer",
    editoria: "tecnologia",
    temas: ["startups"],
    programa: "SBIR",
    resumo: "O programa que reserva parte do orçamento de pesquisa das agências federais para pequenas empresas americanas de tecnologia.",
    fontesCanonicas: ["https://www.sbir.gov/about"],
    angulos: [
      { id: "o-que-e", pergunta: "O que é o SBIR, o programa que financia pesquisa em pequenas empresas americanas?" },
      { id: "fases", pergunta: "Como funcionam as fases do SBIR, da ideia ao produto?" },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* CUSTO DE VIDA                                                       */
  /* ------------------------------------------------------------------ */
  {
    id: "credit-score",
    nome: "Credit score (a pontuação de crédito americana)",
    familia: "explainer",
    editoria: "custo-de-vida",
    temas: ["cartao-de-credito", "financiamento-imobiliario"],
    programa: "credit score",
    resumo: "O que é o credit score, de onde vem a informação dele, como o relatório de crédito pode ser consultado de graça e o que pesa na nota.",
    fontesCanonicas: [
      "https://www.consumerfinance.gov/ask-cfpb/what-is-a-credit-score-en-315/",
      "https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/",
      "https://www.usa.gov/credit-reports",
      "https://consumer.ftc.gov/articles/free-credit-reports",
      "https://www.consumerfinance.gov/consumer-tools/credit-cards/",
    ],
    angulos: [
      { id: "o-que-e", pergunta: "O que é o credit score e por que ele pesa tanto na vida financeira nos EUA?" },
      { id: "relatorio-gratis", pergunta: "Como o americano consulta de graça o próprio relatório de crédito?" },
      { id: "o-que-pesa", pergunta: "O que pesa na pontuação de crédito americana?" },
      { id: "juros-do-cartao", pergunta: "Como os juros do cartão de crédito americano são calculados?" },
    ],
  },
  {
    id: "hipoteca",
    nome: "Mortgage (o financiamento da casa própria nos EUA)",
    familia: "process_explainer",
    editoria: "custo-de-vida",
    temas: ["financiamento-imobiliario"],
    programa: "mortgage",
    resumo: "O que é uma hipoteca americana, o que compõe a prestação e as etapas que o CFPB descreve para quem vai comprar a primeira casa.",
    fontesCanonicas: [
      "https://www.consumerfinance.gov/ask-cfpb/what-is-a-mortgage-en-99/",
      "https://www.consumerfinance.gov/owning-a-home/",
    ],
    angulos: [
      { id: "o-que-e", pergunta: "O que é uma mortgage, o financiamento imobiliário americano?" },
      { id: "etapas", pergunta: "Quais são as etapas para comprar uma casa com financiamento nos EUA?" },
    ],
  },
  {
    id: "property-tax",
    nome: "Property tax (o imposto anual sobre o imóvel nos EUA)",
    familia: "explainer",
    editoria: "custo-de-vida",
    temas: ["imposto-sobre-propriedade"],
    programa: "property tax",
    resumo: "Por que o imposto sobre o imóvel nos EUA é local, quem calcula o valor da casa e como Califórnia e Texas organizam a cobrança.",
    fontesCanonicas: [
      "https://www.boe.ca.gov/proptaxes/proptax.htm",
      "https://comptroller.texas.gov/taxes/property-tax/",
    ],
    angulos: [
      { id: "quem-cobra", pergunta: "Quem cobra o imposto sobre o imóvel nos EUA, o estado ou o município?" },
      { id: "como-avalia", pergunta: "Como o valor da casa é avaliado para o property tax?" },
      { id: "california-x-texas", pergunta: "Como Califórnia e Texas organizam o imposto sobre o imóvel?" },
    ],
  },
  {
    id: "sales-tax",
    nome: "Sales tax (o imposto que só aparece no caixa)",
    familia: "explainer",
    editoria: "custo-de-vida",
    temas: ["custo-de-vida-nas-cidades", "politica-estadual"],
    programa: "sales tax",
    resumo: "Por que o preço da etiqueta nos EUA não inclui o imposto, como estado e cidade somam alíquotas e como Texas, Califórnia e Nova York cobram.",
    fontesCanonicas: [
      "https://comptroller.texas.gov/taxes/sales/",
      "https://cdtfa.ca.gov/taxes-and-fees/sutprograms.htm",
      "https://www.tax.ny.gov/bus/st/stidx.htm",
      "https://www.irs.gov/credits-deductions/individuals/use-the-sales-tax-deduction-calculator",
    ],
    angulos: [
      { id: "fora-da-etiqueta", pergunta: "Por que o imposto não vem no preço da etiqueta nos EUA?" },
      { id: "estado-e-cidade", pergunta: "Como o sales tax do estado e o da cidade se somam na mesma compra?" },
      { id: "texas", pergunta: "Como funciona o sales tax no Texas, do estado e das cidades?" },
    ],
  },
  {
    id: "imposto-de-renda-estadual",
    nome: "State income tax (o imposto de renda dos estados americanos)",
    familia: "comparison",
    editoria: "custo-de-vida",
    temas: ["politica-estadual", "custo-de-vida-nas-cidades"],
    programa: "state income tax",
    resumo: "Por que, além do imposto federal, alguns estados cobram imposto de renda e outros não, com os casos de Washington, Tennessee e Nova York.",
    fontesCanonicas: [
      "https://dor.wa.gov/taxes-rates/income-tax",
      "https://www.tn.gov/revenue/taxes/hall-income-tax.html",
      "https://www.tax.ny.gov/pit/",
    ],
    angulos: [
      { id: "estados-sem", pergunta: "Como funcionam os estados americanos que não cobram imposto de renda da pessoa física?" },
      { id: "tennessee", pergunta: "Como o Tennessee acabou com o único imposto de renda que cobrava?" },
      { id: "federal-e-estadual", pergunta: "Por que quem mora nos EUA pode pagar imposto de renda para o país e para o estado?" },
    ],
  },
  {
    id: "aluguel",
    nome: "Aluguel nos EUA (como o governo mede o custo da moradia)",
    familia: "explainer",
    editoria: "custo-de-vida",
    temas: ["aluguel"],
    programa: "rent",
    resumo: "Como o BLS mede o aluguel dentro da inflação, o que é o aluguel equivalente do proprietário e as pesquisas de moradia do Census.",
    fontesCanonicas: [
      "https://www.bls.gov/cpi/factsheets/owners-equivalent-rent-and-rent.htm",
      "https://www.census.gov/programs-surveys/ahs.html",
      "https://www.census.gov/topics/housing.html",
    ],
    angulos: [
      { id: "aluguel-na-inflacao", pergunta: "Como o aluguel entra na conta da inflação americana?" },
      { id: "aluguel-equivalente", pergunta: "O que é o aluguel equivalente do proprietário, que o BLS usa para medir a moradia?" },
    ],
  },
  {
    id: "paridade-regional",
    nome: "Regional Price Parities (quanto custa viver em cada estado, pelo BEA)",
    familia: "explainer",
    editoria: "custo-de-vida",
    temas: ["custo-de-vida-nas-cidades", "aluguel"],
    programa: "Regional Price Parities",
    resumo: "O índice oficial do BEA que compara o nível de preços entre estados e regiões metropolitanas, com os estados mais caros e os mais baratos do ano.",
    fontesCanonicas: ["https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area"],
    angulos: [
      { id: "o-que-mede", pergunta: "Como o governo americano compara o custo de vida entre os estados?" },
      { id: "mais-caros", pergunta: "Quais estados americanos têm o nível de preços mais alto e o mais baixo, pelo índice do BEA?" },
      { id: "aluguel-por-estado", pergunta: "Quanto o aluguel muda de um estado americano para outro, pelo índice regional do BEA?" },
    ],
  },
  {
    id: "plano-de-saude",
    nome: "Plano de saúde nos EUA (pelo empregador ou pelo Marketplace)",
    familia: "comparison",
    editoria: "custo-de-vida",
    temas: ["plano-de-saude"],
    programa: "Marketplace",
    resumo: "Os dois caminhos mais comuns para ter plano de saúde nos EUA, o do empregador e o do Marketplace da healthcare.gov, e as janelas para contratar.",
    fontesCanonicas: [
      "https://www.healthcare.gov/quick-guide/one-page-guide-to-the-marketplace/",
      "https://www.healthcare.gov/have-job-based-coverage/options/",
      "https://www.healthcare.gov/coverage-outside-open-enrollment/special-enrollment-period/",
      "https://www.healthcare.gov/quick-guide/dates-and-deadlines/",
    ],
    angulos: [
      { id: "empregador-x-marketplace", pergunta: "Qual a diferença entre ter plano de saúde pelo empregador e pelo Marketplace nos EUA?" },
      { id: "open-enrollment", pergunta: "O que é o Open Enrollment, a janela anual para contratar plano de saúde nos EUA?" },
      { id: "fora-da-janela", pergunta: "Em que situações dá para contratar plano de saúde nos EUA fora da janela anual?" },
    ],
  },
  {
    id: "vocabulario-do-plano",
    nome: "Deductible, copay e coinsurance (o vocabulário do plano de saúde americano)",
    familia: "glossary",
    editoria: "custo-de-vida",
    temas: ["plano-de-saude"],
    programa: "deductible",
    resumo: "Os termos que decidem quanto a pessoa paga do próprio bolso num plano de saúde americano: premium, deductible, copay, coinsurance e teto anual.",
    fontesCanonicas: [
      "https://www.healthcare.gov/glossary/deductible/",
      "https://www.healthcare.gov/glossary/co-insurance/",
      "https://www.healthcare.gov/glossary/co-payment/",
      "https://www.healthcare.gov/glossary/out-of-pocket-maximum-limit/",
    ],
    angulos: [
      { id: "deductible", pergunta: "O que é o deductible do plano de saúde americano?" },
      { id: "copay-x-coinsurance", pergunta: "Qual a diferença entre copay e coinsurance no plano de saúde americano?" },
      { id: "teto-anual", pergunta: "O que é o teto anual que o plano de saúde americano põe no gasto do próprio bolso?" },
    ],
  },
  {
    id: "preco-da-gasolina",
    nome: "Preço da gasolina nos EUA (o que forma o preço, pela EIA)",
    familia: "explainer",
    editoria: "custo-de-vida",
    temas: ["preco-da-gasolina"],
    programa: "gasoline",
    resumo: "As parcelas do preço do galão de gasolina nos EUA, por que ele sobe e desce e por que muda tanto de uma região para outra.",
    fontesCanonicas: [
      "https://www.eia.gov/energyexplained/gasoline/factors-affecting-gasoline-prices.php",
      "https://www.eia.gov/energyexplained/gasoline/price-fluctuations.php",
      "https://www.eia.gov/energyexplained/gasoline/regional-price-differences.php",
    ],
    angulos: [
      { id: "o-que-forma", pergunta: "O que forma o preço do galão de gasolina nos EUA?" },
      { id: "por-regiao", pergunta: "Por que a gasolina custa mais em alguns estados americanos do que em outros?" },
      { id: "por-que-oscila", pergunta: "Por que o preço da gasolina americana muda ao longo do ano?" },
    ],
  },
  {
    id: "conta-de-luz",
    nome: "Conta de luz nos EUA (o que forma a tarifa de eletricidade, pela EIA)",
    familia: "explainer",
    editoria: "custo-de-vida",
    temas: ["conta-de-luz"],
    programa: "electricity",
    resumo: "O que compõe o preço da eletricidade nos EUA, por que ele varia por região e estação, e como a casa americana usa energia.",
    fontesCanonicas: [
      "https://www.eia.gov/energyexplained/electricity/prices-and-factors-affecting-prices.php",
      "https://www.eia.gov/energyexplained/electricity/use-of-electricity.php",
    ],
    angulos: [
      { id: "o-que-forma", pergunta: "O que forma o preço da conta de luz nos EUA?" },
      { id: "onde-a-casa-gasta", pergunta: "Em que a casa americana mais gasta eletricidade?" },
    ],
  },
  {
    id: "faculdade-custos",
    nome: "Faculdade nos EUA (pública, privada e community college, pelo NCES)",
    familia: "comparison",
    editoria: "custo-de-vida",
    temas: ["mensalidade-universitaria"],
    programa: "tuition",
    resumo: "Quanto custam mensalidade, moradia e alimentação em faculdades públicas, privadas e de dois anos, pelos números oficiais do NCES, e como funciona o plano 529.",
    fontesCanonicas: [
      "https://nces.ed.gov/fastfacts/display.asp?id=76",
      "https://nces.ed.gov/programs/coe/indicator/cua",
      "https://www.irs.gov/newsroom/529-plans-questions-and-answers",
    ],
    angulos: [
      { id: "publica-x-privada", pergunta: "Qual a diferença de custo entre faculdade pública e privada nos EUA, pelos números oficiais?" },
      { id: "dois-anos", pergunta: "Quanto custa uma faculdade de dois anos nos EUA perto de uma de quatro?" },
      { id: "plano-529", pergunta: "O que é o plano 529, a poupança com vantagem fiscal para pagar a faculdade?" },
    ],
  },
  {
    id: "gastos-das-familias",
    nome: "Consumer Expenditure Survey (onde vai o dinheiro do americano)",
    familia: "explainer",
    editoria: "custo-de-vida",
    temas: ["consumo-das-familias", "custo-de-vida-nas-cidades"],
    programa: "Consumer Expenditure",
    resumo: "A pesquisa anual do BLS que mostra como as famílias americanas dividem o gasto entre moradia, transporte, comida, saúde e o resto.",
    fontesCanonicas: ["https://www.bls.gov/news.release/cesan.nr0.htm", "https://www.bls.gov/cex/"],
    angulos: [
      { id: "onde-gasta", pergunta: "Com o que a família americana mais gasta dinheiro, pela pesquisa anual do BLS?" },
      { id: "moradia-pesa", pergunta: "Quanto do orçamento da família americana vai para moradia?" },
    ],
  },
  {
    id: "gasto-com-comida",
    nome: "Gasto com comida nos EUA (a série oficial do USDA)",
    familia: "explainer",
    editoria: "custo-de-vida",
    temas: ["preco-dos-alimentos"],
    programa: "food expenditure",
    resumo: "Quanto o americano gasta com comida em casa e fora de casa e que parte da renda isso representa, pela série do Economic Research Service.",
    fontesCanonicas: ["https://www.ers.usda.gov/data-products/food-expenditure-series"],
    angulos: [
      { id: "dentro-x-fora", pergunta: "O americano gasta mais com comida em casa ou fora de casa?" },
      { id: "parte-da-renda", pergunta: "Que parte da renda o americano gasta com comida, pela série do USDA?" },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* GOVERNO (editoria Política)                                         */
  /* ------------------------------------------------------------------ */
  {
    id: "temporada-do-ir",
    nome: "Tax season (a temporada de declaração do imposto de renda no IRS)",
    familia: "process_explainer",
    editoria: "governo",
    temas: ["impostos-federais"],
    programa: "IRS",
    entidade: "Internal Revenue Service",
    resumo: "Quem precisa declarar imposto de renda nos EUA, quando a declaração é entregue e como funciona a entrega gratuita pelo IRS.",
    fontesCanonicas: [
      "https://www.irs.gov/filing",
      "https://www.irs.gov/filing/individuals/when-to-file",
      "https://www.irs.gov/individuals/check-if-you-need-to-file-a-tax-return",
      "https://www.irs.gov/e-file-do-your-taxes-for-free",
    ],
    angulos: [
      { id: "quando", pergunta: "Quando o americano entrega a declaração do imposto de renda?" },
      { id: "quem-precisa", pergunta: "Quem precisa declarar imposto de renda nos EUA?" },
      { id: "de-graca", pergunta: "Como funciona a declaração gratuita do imposto de renda pelo IRS?" },
    ],
  },
  {
    id: "faixas-do-ir",
    nome: "Tax brackets (as faixas do imposto de renda federal)",
    familia: "explainer",
    editoria: "governo",
    temas: ["impostos-federais"],
    programa: "tax brackets",
    resumo: "Como as faixas do imposto de renda americano incidem em camadas sobre a renda e o que é a dedução padrão que o IRS desconta antes.",
    fontesCanonicas: [
      "https://www.irs.gov/filing/federal-income-tax-rates-and-brackets",
      "https://www.irs.gov/taxtopics/tc551",
    ],
    angulos: [
      { id: "em-camadas", pergunta: "Por que subir de faixa no imposto americano não faz a pessoa pagar mais sobre toda a renda?" },
      { id: "deducao-padrao", pergunta: "O que é a dedução padrão do imposto de renda americano?" },
    ],
  },
  {
    id: "colegio-eleitoral",
    nome: "Colégio Eleitoral (como o presidente americano é eleito)",
    familia: "process_explainer",
    editoria: "governo",
    temas: ["eleicoes-americanas"],
    programa: "Electoral College",
    resumo: "Como os votos de cada estado viram delegados, quantos são, quantos o candidato precisa e o caminho até a posse.",
    fontesCanonicas: ["https://www.archives.gov/electoral-college/about", "https://www.usa.gov/electoral-college"],
    angulos: [
      { id: "como-funciona", pergunta: "Como funciona o Colégio Eleitoral que escolhe o presidente americano?" },
      { id: "quantos-votos", pergunta: "Quantos votos no Colégio Eleitoral um candidato precisa para ser presidente?" },
      { id: "calendario", pergunta: "Quais são as etapas entre a eleição e a posse do presidente americano?" },
    ],
  },
  {
    id: "congresso-e-leis",
    nome: "Congresso americano (Câmara, Senado e como um projeto vira lei)",
    familia: "process_explainer",
    editoria: "governo",
    temas: ["eleicoes-americanas"],
    programa: "Congress",
    entidade: "United States Congress",
    resumo: "Como o Congresso dos EUA se divide entre Câmara e Senado, quem é eleito para cada casa e as etapas de um projeto até virar lei.",
    fontesCanonicas: [
      "https://www.usa.gov/branches-of-government",
      "https://www.house.gov/the-house-explained",
      "https://www.usa.gov/how-laws-are-made",
      "https://www.house.gov/the-house-explained/the-legislative-process",
    ],
    angulos: [
      { id: "camara-x-senado", pergunta: "Qual a diferença entre a Câmara e o Senado americanos?" },
      { id: "como-vira-lei", pergunta: "Quais são as etapas para um projeto virar lei nos EUA?" },
      { id: "tres-poderes", pergunta: "Como os três poderes do governo americano se controlam?" },
    ],
  },
  {
    id: "ordem-executiva",
    nome: "Executive order (a ordem executiva do presidente americano)",
    familia: "glossary",
    editoria: "governo",
    temas: ["ordens-executivas"],
    programa: "executive order",
    resumo: "O que é uma ordem executiva, como ela é numerada e publicada e o que a diferencia de uma lei aprovada pelo Congresso.",
    fontesCanonicas: ["https://www.archives.gov/federal-register/executive-orders/about.html"],
    angulos: [
      { id: "o-que-e", pergunta: "O que é uma ordem executiva do presidente americano?" },
      { id: "ordem-x-lei", pergunta: "Qual a diferença entre uma ordem executiva e uma lei nos EUA?" },
    ],
  },
  {
    id: "suprema-corte",
    nome: "Suprema Corte e a Justiça federal americana",
    familia: "explainer",
    editoria: "governo",
    temas: ["suprema-corte"],
    programa: "Supreme Court",
    entidade: "Supreme Court of the United States",
    resumo: "Como a Justiça federal americana se organiza em três níveis, quantos juízes tem a Suprema Corte, como eles são escolhidos e por quanto tempo ficam.",
    fontesCanonicas: [
      "https://www.uscourts.gov/about-federal-courts/educational-resources/about-educational-outreach/activity-resources/about",
      "https://www.uscourts.gov/about-federal-courts/court-role-and-structure",
      "https://www.uscourts.gov/about-federal-courts/court-role-and-structure/about-us-courts-appeals",
    ],
    angulos: [
      { id: "como-escolhe", pergunta: "Como os juízes da Suprema Corte americana são escolhidos, e por quanto tempo ficam?" },
      { id: "tres-niveis", pergunta: "Como a Justiça federal americana se divide em três níveis?" },
      { id: "nove-juizes", pergunta: "Por que a Suprema Corte americana tem nove juízes?" },
    ],
  },
  {
    id: "orcamento-federal",
    nome: "Orçamento federal americano (de onde vem e para onde vai o dinheiro)",
    familia: "explainer",
    editoria: "governo",
    temas: ["orcamento-federal", "impostos-federais"],
    programa: "federal spending",
    resumo: "De onde vem a receita do governo dos EUA, em que ele mais gasta e como a diferença vira déficit, pelos guias do Tesouro americano.",
    fontesCanonicas: [
      "https://fiscaldata.treasury.gov/americas-finance-guide/government-revenue/",
      "https://fiscaldata.treasury.gov/americas-finance-guide/federal-spending/",
    ],
    angulos: [
      { id: "de-onde-vem", pergunta: "De onde vem o dinheiro que o governo americano arrecada?" },
      { id: "onde-gasta", pergunta: "Em que o governo federal americano mais gasta?" },
    ],
  },
  {
    id: "medicare",
    nome: "Medicare (o plano de saúde público para quem tem 65 anos ou mais)",
    familia: "faq",
    editoria: "governo",
    temas: ["saude-publica"],
    programa: "Medicare",
    resumo: "Para quem é o Medicare, como a inscrição se liga ao benefício de aposentadoria e quando ela acontece sozinha.",
    fontesCanonicas: ["https://www.medicare.gov/basics/get-started-with-medicare"],
    angulos: [
      { id: "para-quem", pergunta: "Para quem é o Medicare, o plano de saúde público americano?" },
      { id: "inscricao", pergunta: "Como funciona a inscrição no Medicare perto dos 65 anos?" },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* BRASIL (contraste factual, cada lado com a sua fonte primária)     */
  /* ------------------------------------------------------------------ */
  {
    id: "ir-eua-e-brasil",
    nome: "Imposto de renda nos EUA e no Brasil (IRS e Receita Federal)",
    familia: "comparison",
    editoria: "brasil",
    temas: ["imposto-de-renda", "impostos-federais"],
    programa: "IRS",
    resumo: "Como a declaração anual funciona no IRS americano e na Receita Federal brasileira, cada lado descrito pela própria fonte oficial.",
    fontesCanonicas: [
      "https://www.irs.gov/filing/individuals/when-to-file",
      "https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda",
    ],
    angulos: [
      { id: "a-declaracao", pergunta: "Como a declaração anual do imposto de renda funciona no IRS e na Receita Federal?" },
      { id: "o-prazo", pergunta: "Em que época do ano o americano e o brasileiro declaram o imposto de renda?" },
    ],
  },
  {
    id: "seguro-desemprego-eua-e-brasil",
    nome: "Seguro-desemprego nos EUA e no Brasil",
    familia: "comparison",
    editoria: "brasil",
    temas: ["beneficios-trabalhistas", "desemprego-nos-eua"],
    programa: "unemployment insurance",
    resumo: "Quem paga, quem recebe e como se pede o seguro-desemprego nos EUA e no Brasil, cada lado pela fonte oficial do próprio país.",
    fontesCanonicas: [
      "https://www.dol.gov/general/topic/unemployment-insurance",
      "https://www.gov.br/trabalho-e-emprego/pt-br/servicos/trabalhador/seguro-desemprego",
    ],
    angulos: [
      { id: "quem-recebe", pergunta: "Quem tem direito ao seguro-desemprego nos EUA e no Brasil?" },
      { id: "quem-administra", pergunta: "Quem administra o seguro-desemprego nos EUA e no Brasil?" },
    ],
  },
  {
    id: "aposentadoria-eua-e-brasil",
    nome: "Aposentadoria: o 401(k) americano e o INSS brasileiro",
    familia: "comparison",
    editoria: "brasil",
    temas: ["aposentadoria"],
    programa: "401(k)",
    resumo: "Como o plano de aposentadoria pelo empregador funciona nos EUA e como a aposentadoria pública funciona no INSS, cada lado pela fonte oficial do próprio país.",
    fontesCanonicas: [
      "https://www.irs.gov/retirement-plans/401k-plans",
      "https://www.gov.br/inss/pt-br/direitos-e-deveres/aposentadorias",
    ],
    angulos: [
      { id: "como-se-forma", pergunta: "Como se forma a aposentadoria de quem trabalha pelo 401(k) nos EUA e pelo INSS no Brasil?" },
      { id: "quem-contribui", pergunta: "Quem contribui para a aposentadoria no 401(k) americano e no INSS?" },
    ],
  },
  {
    id: "fgts-e-fica",
    nome: "O que o empregador recolhe: FGTS no Brasil e FICA nos EUA",
    familia: "comparison",
    editoria: "brasil",
    temas: ["beneficios-trabalhistas", "impostos-federais"],
    programa: "FICA",
    resumo: "O depósito do FGTS feito pelo empregador brasileiro e os tributos de Social Security e Medicare recolhidos pelo empregador americano, cada um pela fonte oficial.",
    fontesCanonicas: [
      "https://www.gov.br/trabalho-e-emprego/pt-br/servicos/trabalhador/fgts",
      "https://www.irs.gov/taxtopics/tc751",
    ],
    angulos: [
      { id: "o-que-recolhe", pergunta: "O que o empregador recolhe sobre o salário no Brasil, com o FGTS, e nos EUA, com o FICA?" },
      { id: "para-que-serve", pergunta: "Para que serve o dinheiro do FGTS no Brasil e o do FICA nos EUA?" },
    ],
  },
];
