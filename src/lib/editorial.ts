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

export const articles: Article[] = [
  {
    slug: "ia-semana-sem-hype",
    category: "Radar",
    title: "A semana em IA sem aquele cheiro de palestra de LinkedIn",
    excerpt:
      "O que mudou em modelos, produtos e benchmarks, direto ao ponto. Só entra o que vale abrir antes do café esfriar.",
    description:
      "O que mudou em modelos, produtos e benchmarks, direto ao ponto. Um filtro simples para separar notícia útil de espuma antes do café esfriar.",
    date: "20 AGO 2026",
    readTime: "5 min",
    image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Mesa de trabalho moderna com café e notebook exibindo gráficos",
    quote: "Se a notícia não muda sua rotina, ela ainda pode ser interessante. Só não merece virar prioridade.",
    quoteBy: MARCA.nome,
    sections: [
      {
        heading: "O teste do café",
        paragraphs: [
          "O jeito mais honesto de ler notícia de IA é perguntar se ela muda algo antes do café esfriar. Se muda uma ferramenta que você usa, um custo que você paga ou um formato de conteúdo que você publica, entra no radar. Se é só demo bonita com música épica, respira e espera.",
          "Essa régua evita duas armadilhas: achar que tudo é revolução e ignorar mudança pequena que vira padrão. O feed adora extremos. A vida real quase sempre muda por acúmulo.",
        ],
      },
      {
        heading: "Modelo novo não é plano de ação",
        paragraphs: [
          "Quando sai modelo novo, a pergunta boa não é se ele é melhor em tudo. Quase nunca é assim. A pergunta boa é onde ele erra menos no seu uso específico. Escrita longa, pesquisa, imagem, planilha, atendimento, programação, cada caso puxa um tipo de falha diferente.",
          "Para criador e pequeno negócio, o melhor teste ainda é simples: pegar uma tarefa real da semana, rodar no modelo antigo e no novo, comparar tempo, retrabalho e clareza. Sem torcida. Sem print bonito para rede social.",
        ],
      },
      {
        heading: "O que entra no Casaloti IA",
        paragraphs: [
          "Aqui a notícia precisa passar por uma portinha estreita. Tem fonte? Tem impacto provável? Dá para explicar sem usar fumaça? Dá para transformar em prompt, artigo, aula ou decisão de ferramenta? Se a resposta for sim, vira pauta.",
          "A ideia é que você abra a edição e saia com alguma coisa pronta para usar. Nem que seja uma frase melhor para explicar IA para um cliente que ainda acha que ChatGPT é só brinquedo.",
        ],
      },
    ],
  },
  {
    slug: "prompt-bolso-noticia-instagram",
    category: "Prompt de bolso",
    title: "Guarda esse CTRL+C: transforme notícia de IA em post útil",
    excerpt:
      "Um jeito simples de pegar uma fonte confiável, entender a fofoca técnica e transformar tudo em post decente.",
    description:
      "Um mini processo para sair do link cru e chegar em um post que explica, opina e entrega alguma coisa para quem segue você.",
    date: "19 AGO 2026",
    readTime: "4 min",
    image: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Smartphone com anotações de trabalho sobre mesa de madeira",
    quote: "Post bom não repete a notícia. Ele traduz o que a pessoa faz com aquilo na segunda-feira.",
    quoteBy: MARCA.nome,
    sections: [
      {
        heading: "Primeiro, leia como humano",
        paragraphs: [
          "Antes de pedir para a IA resumir, leia a fonte. Parece conselho de tio, mas salva muito conteúdo ruim. A IA costuma deixar tudo com cara de anúncio. Você precisa encontrar o detalhe estranho, a consequência prática, o ponto que alguém comentaria numa mesa de bar.",
          "Depois disso, peça um resumo em três partes: o que aconteceu, quem isso afeta e qual teste uma pessoa comum pode fazer hoje. Se a resposta vier genérica, mande refazer com exemplos concretos.",
        ],
      },
      {
        heading: "Prompt base",
        paragraphs: [
          "Use assim: leia esta notícia e transforme em um post curto para Instagram. Não venda milagre. Explique em português simples o que mudou, por que importa e como uma pessoa pode testar isso hoje. Termine com uma pergunta honesta para comentários.",
          "Ajuste o tom para a sua marca. No Casaloti IA, a régua é papo claro, piada leve e nostalgia quando couber. Se parecer comunicado de empresa, volta uma casa.",
        ],
      },
      {
        heading: "O detalhe que salva o post",
        paragraphs: [
          "Todo post precisa de uma frase que parece humana. Algo como: isso é útil, mas ainda não troca seu processo inteiro. Ou: dá para brincar hoje, mas não coloque no atendimento ao cliente sem revisar.",
          "Essa frase cria confiança. Ela mostra que você não está só empilhando novidade para parecer atualizado.",
        ],
      },
    ],
  },
  {
    slug: "benchmark-modelos-conteudo",
    category: "Benchmark",
    title: "Qual IA escreve melhor quando a missão é parecer gente?",
    excerpt:
      "Teste de escrita sem dó. A gente separa modelo bom de modelo que parece vendedor de curso em lançamento eterno.",
    description:
      "Um artigo sobre como testar modelos de escrita sem cair no placar bonito que não diz nada sobre voz, ritmo e revisão.",
    date: "18 AGO 2026",
    readTime: "8 min",
    image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Caderno com anotações e teclado de computador em estilo editorial",
    quote: "Texto bom não parece que venceu uma rubrica. Parece que alguém pensou antes de publicar.",
    quoteBy: MARCA.nome,
    sections: [
      {
        heading: "O placar engana",
        paragraphs: [
          "Benchmark ajuda, mas não meço por notas frias. Um modelo pode ir bem em teste geral e ainda escrever como manual de micro-ondas quando você pede um artigo com voz. Escrita boa depende de ritmo, opinião, corte e coragem de apagar frase bonita que não diz nada.",
          "O teste certo usa material real. Pegue um tema, uma fonte e um objetivo. Peça versões para newsletter, post e roteiro curto. Depois compare retrabalho, não só a primeira resposta.",
        ],
      },
      {
        heading: "Sinais de texto com alma",
        paragraphs: [
          "Procure frases específicas. Procure pequenas opiniões. Procure variação de tamanho. Se tudo vier com introdução perfeita, três bullets e conclusão motivacional, o alerta toca igual Windows XP travando na lan house.",
          "Também vale contar quantas frases poderiam estar em qualquer marca. Quanto mais genérico o texto, mais revisão humana ele vai pedir.",
        ],
      },
      {
        heading: "Como eu testaria",
        paragraphs: [
          "Eu daria a mesma fonte para três modelos e pediria uma abertura de artigo, uma legenda e um email. Depois revisaria sem olhar o nome do modelo. O vencedor seria o que mais economiza edição, não o que solta mais palavras.",
          "No fim, modelo bom é o que deixa você mais perto do publicar. Se ele te entrega uma parede de texto para você limpar, ele só terceirizou a bagunça.",
        ],
      },
    ],
  },
  {
    slug: "openai-anthropic-google-sinais",
    category: "Mercado",
    title: "Os sinais pequenos da corrida de IA",
    excerpt:
      "Preço, velocidade, memória, agentes e distribuição. Às vezes a notícia pequena entrega o mercado inteiro.",
    description:
      "Uma leitura prática dos sinais que importam mais do que anúncio gigante: preço, limite, integração, memória e onde o botão aparece.",
    date: "17 AGO 2026",
    readTime: "6 min",
    image: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Telas de dados de tecnologia e códigos em alta definição",
    quote: "Na evolução de IA, o detalhe pequeno costuma mostrar para onde o produto está indo antes do palco confirmar.",
    quoteBy: MARCA.nome,
    sections: [
      {
        heading: "Olhe para o botão",
        paragraphs: [
          "Muita gente olha só para o anúncio. Eu olho onde o botão foi parar. Quando uma IA aparece dentro do editor, do email, da planilha ou do navegador, ela muda de categoria. Sai de ferramenta extra e vira parte do caminho normal.",
          "Esse detalhe importa para quem cria conteúdo. A melhor ferramenta nem sempre é a mais poderosa. Muitas vezes é a que aparece na hora certa, no lugar em que você já está trabalhando.",
        ],
      },
      {
        heading: "Preço também é produto",
        paragraphs: [
          "Redução de preço muda comportamento. Se uma tarefa antes era cara demais para automatizar, ela vira rotina quando o custo cai. Isso afeta resumo, atendimento, geração de imagem, análise de planilha e monitoramento de notícia.",
          "Por isso a pergunta não é só qual modelo é melhor. A pergunta é qual modelo permite repetir o processo todo dia sem virar susto no cartão.",
        ],
      },
      {
        heading: "Memória e agentes ainda pedem calma",
        paragraphs: [
          "Memória parece mágica até guardar coisa errada. Agente parece funcionário até clicar onde não devia. Dá para usar, mas com trilho, aprovação e registro. Automação boa não é a que faz tudo sozinha. É a que erra pouco e deixa você intervir rápido.",
          "Para o Casaloti IA, isso vira princípio de produto: publicar com ajuda de IA, mas manter painel interno para editar, apagar e revisar antes de colocar a marca na rua.",
        ],
      },
    ],
  },
  {
    slug: "manual-do-curioso-ai",
    category: "Guia",
    title: "Manual do curioso: como ler notícia de IA sem cair em hype",
    excerpt:
      "Uma régua simples para diferenciar anúncio, benchmark, demo bonita, paper bom e ferramenta que muda seu dia.",
    description:
      "Um manual curto para ler notícia de IA com curiosidade, mas sem comprar toda promessa que aparece com fundo gradiente.",
    date: "16 AGO 2026",
    readTime: "7 min",
    image: "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Biblioteca moderna com revistas e relatórios de pesquisa",
    quote: "Curiosidade boa não acredita em tudo. Ela testa pequeno antes de mudar a rotina inteira.",
    quoteBy: MARCA.nome,
    sections: [
      {
        heading: "Separe anúncio de uso",
        paragraphs: [
          "Anúncio mostra intenção. Uso mostra valor. Quando uma empresa promete algo, anote. Quando pessoas começam a encaixar aquilo em trabalho real, preste atenção. A distância entre esses dois pontos é onde mora a maior parte do hype.",
          "Uma demo pode ser linda e ainda não resolver um problema comum. Às vezes ela só mostra o melhor caso possível, com tudo preparado para dar certo.",
        ],
      },
      {
        heading: "Procure fricção",
        paragraphs: [
          "Ferramenta boa reduz fricção. Ferramenta barulhenta troca uma fricção por outra. Se você precisa copiar texto, trocar aba, ajustar formato, conferir dado e refazer o resultado, talvez ainda não exista ganho real.",
          "O teste é simples: a ferramenta economiza tempo depois da revisão? Se sim, vale acompanhar. Se não, ela é brinquedo de fim de semana.",
        ],
      },
      {
        heading: "Monte seu próprio radar",
        paragraphs: [
          "Escolha poucas fontes. Blogs oficiais, Hacker News, arXiv quando fizer sentido e gente técnica que mostra teste de verdade. Não tente acompanhar tudo. Ninguém acompanha tudo desde a época do Orkut, só fingia melhor.",
          "O objetivo é formar gosto. Com o tempo, você percebe quais anúncios cheiram a mudança real e quais parecem só papel de parede bonito.",
        ],
      },
    ],
  },
  {
    slug: "lan-house-da-ia",
    category: "Cultura",
    title: "A rotina de descoberta: por que todo mundo precisa de curadoria",
    excerpt:
      "O portal nasce para virar hábito. Um canto pequeno e confiável para abrir quando o feed parece uma enxurrada de ruído.",
    description:
      "Um texto sobre ritual, curadoria e por que aprender IA fica mais fácil quando existe um lugar fixo para voltar.",
    date: "15 AGO 2026",
    readTime: "5 min",
    image: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Pessoa lendo conteúdo em notebook com xícara de café",
    quote: "A internet boa tinha lugar para voltar. Conteúdo útil também precisa disso.",
    quoteBy: MARCA.nome,
    sections: [
      {
        heading: "Ritual vence ansiedade",
        paragraphs: [
          "A sensação de estar atrasado em IA vem muito da falta de ritual. Você abre rede social, vê vinte novidades, salva dez e usa nenhuma. No dia seguinte, começa tudo de novo. É uma tempestade de notificações sem parar.",
          "Um ritual pequeno resolve parte disso. Cinco minutos por dia. Uma notícia, um prompt, uma decisão. Parece pouco, mas composto por semanas vira repertório.",
        ],
      },
      {
        heading: "Curadoria e Foco",
        paragraphs: [
          "Curadoria é o filtro que transforma excesso de informação em plano de ação real.",
          "A ideia é simples: um lugar para descobrir ferramentas, entender notícias e sair com algo testável sem virar curso infinito a cada clique.",
        ],
      },
      {
        heading: "Curadoria é cuidado",
        paragraphs: [
          "Escolher o que não entra é tão importante quanto escolher o que entra. Se tudo vira pauta, nada vira orientação. O leitor precisa confiar que alguém filtrou antes.",
          "Esse é o papel do portal: ser pequeno o bastante para ter gosto e consistente o bastante para virar hábito.",
        ],
      },
    ],
  },
];

export function getArticle(slug: string) {
  return articles.find((article) => article.slug === slug);
}

export const newsletterBenefits = [
  "Radar de IA em português, com cara de conversa boa",
  "Prompts copiáveis para usar no mesmo dia",
  "Fonte, leitura honesta e um jeito prático de aplicar",
  "Ganchos para post, carrossel, artigo e ideia de produto",
];
