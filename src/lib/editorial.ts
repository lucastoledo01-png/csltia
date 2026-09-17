import { MARCA } from "@/lib/marca";
export type ArticleSection = {
  heading: string;
  paragraphs: string[];
};

export type Article = {
  slug: string;
  category: string;
  title: string;
  excerpt: string;
  description: string;
  date: string;
  readTime: string;
  image: string;
  imageAlt: string;
  quote: string;
  quoteBy: string;
  sections: ArticleSection[];
};

export const featuredIssue = {
  eyebrow: "Publicação sobre IA e automação",
  title: MARCA.tagline,
  subtitle:
    "Todo dia, um resumo esperto sobre IA no seu email. Sem ruído e sem enrolação.",
  author: MARCA.nome,
  date: "25 AGO 2026",
  readTime: "7 min",
};

/**
 * Artigos de base do portal.
 *
 * Eles existem porque o sistema gera uma edicao por dia, e um site com um
 * artigo so nao da a quem chega pelo Google nenhuma razao para ficar. Sao
 * pecas perenes: nao envelhecem com mudanca de regra, porque nao afirmam
 * regra nenhuma.
 *
 * Essa e a restricao que desenha os textos abaixo. Prazo, taxa, requisito e
 * criterio de elegibilidade mudam, e um artigo estatico afirmando qualquer um
 * deles envelhece errado sem ninguem perceber: continua no ar dizendo o que
 * ja nao vale, para quem esta decidindo a vida com aquilo. Entao aqui se
 * escreve sobre o que nao muda, como o processo se organiza e que perguntas
 * fazer, e o que muda fica com a edicao diaria, que cita a fonte do dia.
 */
export const articles: Article[] = [
  {
    slug: "como-a-fila-de-imigracao-funciona",
    category: "Entenda o processo",
    title: "Por que duas pessoas com o mesmo visto esperam tempos diferentes",
    excerpt:
      "A fila de imigracao americana nao e uma so. Entender como ela se divide explica quase toda a diferenca de espera entre um caso e outro.",
    description:
      "A fila de imigracao americana nao e uma so, e entender como ela se divide explica quase toda a diferenca de espera entre um caso e outro.",
    image:
      "https://images.pexels.com/photos/1051075/pexels-photo-1051075.jpeg?auto=compress&cs=tinysrgb&w=1200",
    imageAlt: "Passaporte e documentos de viagem sobre uma mesa",
    date: "SET 2026",
    readTime: "6 min",
    quoteBy: MARCA.nome,
    quote:
      "A pergunta util nao e quanto tempo demora, e sim em qual fila o seu caso entrou.",
    sections: [
      {
        heading: "Nao existe uma fila, existem varias",
        paragraphs: [
          "A pergunta mais comum de quem comeca a pesquisar imigracao para os Estados Unidos e quanto tempo demora. A resposta honesta e que depende de qual fila o caso entrou, e as filas sao muitas.",
          "O sistema americano separa os pedidos por categoria e, dentro de varias delas, tambem por pais de nascimento. Duas pessoas com o mesmo perfil profissional podem esperar tempos muito diferentes se entraram por categorias distintas, e o mesmo vale para quem nasceu em paises com demanda alta.",
          "Isso explica a sensacao de informacao contraditoria. O relato que voce leu num grupo pode estar correto para o caso daquela pessoa e nao dizer nada sobre o seu.",
        ],
      },
      {
        heading: "O que voce controla e o que voce nao controla",
        paragraphs: [
          "Parte do tempo depende do governo americano, e nisso ninguem interfere: o ritmo de analise do orgao, a disponibilidade de vagas na categoria, a agenda do consulado.",
          "A outra parte depende do caso em si, e essa e a parte que se trabalha. Documento completo, historico organizado, evidencia coerente e resposta rapida a um pedido de complementacao encurtam o caminho de verdade.",
          "Quem trata a preparacao como burocracia costuma perder mais tempo do que ganharia com qualquer atalho.",
        ],
      },
      {
        heading: "Onde conferir",
        paragraphs: [
          "Numeros de fila e tempo de processamento mudam, e por isso nao estao escritos aqui. Eles vivem nos boletins e paineis oficiais do governo americano, atualizados periodicamente, e e la que se checa.",
          "Este texto e informativo e nao substitui orientacao juridica. Cada caso tem particularidades, e a leitura de um advogado licenciado sobre a sua situacao especifica vale mais que qualquer artigo geral, inclusive este.",
        ],
      },
    ],
  },
  {
    slug: "o-que-pesa-na-decisao-de-sair-do-brasil",
    category: "Brasil e EUA",
    title: "As contas que ninguem faz antes de decidir sair do Brasil",
    excerpt:
      "Salario convertido em dolar diz pouco. O que muda a decisao e o conjunto: custo de vida, carga tributaria, previsibilidade e o que sobra no fim do mes.",
    description:
      "Salario convertido em dolar diz pouco sobre a mudanca. O que pesa e o conjunto: custo de vida, carga tributaria, previsibilidade e o que de fato sobra.",
    image:
      "https://images.pexels.com/photos/373912/pexels-photo-373912.jpeg?auto=compress&cs=tinysrgb&w=1200",
    imageAlt: "Pessoa trabalhando em escritorio",
    date: "SET 2026",
    readTime: "7 min",
    quoteBy: MARCA.nome,
    quote:
      "Converter salario em dolar e a conta mais facil e a menos util de todas.",
    sections: [
      {
        heading: "A conta do dolar engana nos dois sentidos",
        paragraphs: [
          "Quase todo mundo comeca pela mesma conta: pega o salario que ganharia la, converte, compara com o de ca e conclui alguma coisa. Ela engana para cima e para baixo ao mesmo tempo.",
          "Para cima, porque ignora que o custo de vida acompanha o salario, e varia enormemente entre estados e cidades americanas. Para baixo, porque ignora o que muda em servicos, seguranca e horizonte de planejamento.",
          "A comparacao que serve compara o que sobra, nao o que entra.",
        ],
      },
      {
        heading: "O que costuma pesar mais que o salario",
        paragraphs: [
          "Carga tributaria e previsibilidade sao os fatores que mais aparecem em quem ja se mudou. Nao pela aliquota isolada, mas pela capacidade de planejar: saber a regra do ano que vem muda decisao de investimento, de compra de imovel e de abrir negocio.",
          "Poder de compra e o segundo. Ele nao se le no salario e sim na cesta: moradia, transporte, educacao, saude e o custo de manter um padrao equivalente.",
          "E ha o fator que ninguem coloca em planilha e todo mundo cita depois: a sensacao de que o esforco de hoje vira patrimonio amanha.",
        ],
      },
      {
        heading: "Como montar a sua conta",
        paragraphs: [
          "Escolha a cidade antes de comparar. Media nacional americana nao existe na pratica, e a diferenca entre duas cidades pode ser maior que a diferenca entre paises.",
          "Some tudo o que sai por mes nos dois cenarios, inclusive o que hoje voce paga sem perceber. Depois compare o que sobra, e so entao pense em salario.",
          "Este texto e informativo e nao substitui orientacao juridica ou financeira.",
        ],
      },
    ],
  },
  {
    slug: "perguntas-antes-de-contratar-um-advogado-de-imigracao",
    category: "Entenda o processo",
    title: "Sete perguntas que separam um bom advogado de imigracao de uma promessa",
    excerpt:
      "Ninguem garante aprovacao. Quem garante esta vendendo outra coisa. Estas perguntas mostram rapidamente com quem voce esta falando.",
    description:
      "Ninguem garante aprovacao num processo migratorio. Estas perguntas mostram rapidamente se voce esta falando com um profissional ou com um vendedor.",
    image:
      "https://images.pexels.com/photos/5668858/pexels-photo-5668858.jpeg?auto=compress&cs=tinysrgb&w=1200",
    imageAlt: "Martelo de juiz sobre a mesa de um tribunal",
    date: "SET 2026",
    readTime: "5 min",
    quoteBy: MARCA.nome,
    quote:
      "Garantia de aprovacao e o unico sinal que dispensa a segunda pergunta.",
    sections: [
      {
        heading: "O sinal que encerra a conversa",
        paragraphs: [
          "Nenhum profissional serio garante aprovacao, porque a decisao nao e dele. Quem garante ou nao entende o processo ou sabe exatamente o que esta fazendo, e nos dois casos a conversa acabou.",
          "O mesmo vale para prazo cravado e para percentual de sucesso apresentado como se fosse previsao do seu caso.",
        ],
      },
      {
        heading: "As perguntas",
        paragraphs: [
          "Voce e licenciado em qual estado, e onde eu confiro isso. Quantos casos com perfil parecido com o meu voce conduziu. O que no meu caso e ponto fraco, e nao so o que e forte.",
          "Quem vai efetivamente trabalhar no processo, voce ou uma equipe. O que esta e o que nao esta incluido no valor. O que acontece se houver pedido de complementacao ou negativa.",
          "E a mais reveladora: o que voce faria se fosse meu caso e quisesse gastar o minimo possivel.",
        ],
      },
      {
        heading: "O que uma boa resposta parece",
        paragraphs: [
          "Uma boa resposta e especifica, admite o que nao sabe e separa o que e regra do que e leitura profissional. Ela costuma citar a fonte oficial em vez de pedir que voce confie.",
          "Uma resposta ruim e generica, elogia demais o seu perfil e trata prazo como se fosse combinado com o governo.",
          "Este texto e informativo e nao substitui orientacao juridica.",
        ],
      },
    ],
  },
];

export function getArticle(slug: string) {
  return articles.find((article) => article.slug === slug);
}

/**
 * O que a edição entrega, na ordem em que o leitor se importa.
 *
 * A lista anterior descrevia a newsletter de IA da fase `desbuguei.ia`, duas
 * marcas atrás, e ficou no ar até 17/09/2026 numa página cujo cabeçalho já
 * dizia `usa.journal`: a página se contradizia sozinha, e é onde a pessoa
 * decide assinar.
 */
export const newsletterBenefits = [
  "Economia, trabalho e custo de vida nos EUA explicados em português",
  "O que muda nas regras de visto e de permanência, e a partir de quando",
  "Tecnologia, política e cultura americana sem jargão e sem tradução literal",
  "Fonte ao lado de cada informação, para você conferir",
];
