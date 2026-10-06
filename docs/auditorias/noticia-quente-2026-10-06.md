# Notícia quente: por que a seleção está fria (06/10/2026)

O dono leu os últimos posts do `@eua.journal` ("Quem tem status de elite na
Delta ou American recebe 90 dias na United", "Clientes da American poderão
combinar dinheiro e milhas", "Quem deposita dinheiro para garantir immigration
bonds recebe juros de 3%", "Emprego em folha de pagamento aumenta e desemprego
fica em 4,2%") e disse que a seleção está "muito fria". A referência é o
`@notjournal.ai`: história que alcança a massa, quase sempre com uma pessoa
famosa no centro, foto de rosto e chapéu curto.

Esta auditoria mede as duas pontas: o que a referência publica e engaja, e o
que a nossa esteira teve na mão e deixou passar. Tudo foi só LIDO: nada foi
gravado no banco de produção.

## Método

| o quê | de onde | quanto |
|---|---|---|
| Posts do Not Journal | Graph API, Business Discovery, com o nosso token | 200 posts, 15/09 a 06/10/2026 (20,9 dias), 368.973 seguidores |
| Posts do Brazil Journal (contraste) | idem | 200 posts, 20/08 a 05/10/2026 (46,4 dias), 376.007 seguidores |
| Nossos posts | `social_posts`, `status = published` | os últimos 60, 16/09 a 06/10/2026 |
| Nosso pool | `news_candidates`, últimos 7 dias | 3.857 candidatas, com classificação e motivo |
| Fontes | `project_news_sources` (a tabela real) | 129 cadastradas, 50 ativas |
| Tendências | as cinco fontes de `editorial/tendencias.ts` mais a Wikipédia em português | chamadas ao vivo |

A legenda do Not Journal não traz o chapéu (ele está na imagem), então a
categoria, a região, a pessoa no centro, a data do fato e o encaixe na nossa
linha foram classificados por um modelo barato (`gpt-4o-mini`), em lote, sobre
a legenda. O mesmo modelo marcou pessoa famosa e categoria nos 3.857 títulos do
pool. Custo total das classificações: **US$ 0,10** (teto era US$ 1). Os vetores
dos títulos (`text-embedding-3-small`) custaram menos de um centavo. Os scripts
ficaram fora do repositório; o que vale repetir virou `src/scripts/ensaiar-calor.ts`.

A Graph API não recusou nada. O nosso próprio perfil, pela mesma API, devolve
**5 posts e 9 seguidores**, enquanto `social_posts` tem 60 como publicados: o
engajamento do `@eua.journal` não é medível hoje, e a comparação de
engajamento abaixo é só entre as referências.

## 1. O que a referência publica

### Volume e horário (America/Sao_Paulo)

| | Not Journal | Brazil Journal | eua.journal |
|---|---|---|---|
| posts por dia (média) | 9,6 | 4,3 | 3,1 |
| posts por dia (mediana, máximo) | 8,5, 15 | 5, 8 | 2,5, 12 |
| 00h a 05h | 4 | 0 | 0 |
| 06h a 08h | 2 | 16 | 8 |
| 09h a 11h | 29 | 58 | 9 |
| 12h a 14h | 48 | 66 | 13 |
| 15h a 17h | 39 | 39 | 7 |
| 18h a 20h | 48 | 17 | 11 |
| 21h a 23h | 30 | 4 | 12 |

O Not Journal publica o dia inteiro, com o grosso entre o almoço e as 23h. O
Brazil Journal é de horário comercial.

### Formato

| | Not Journal | Brazil Journal | eua.journal |
|---|---|---|---|
| carrossel | 160 (80%) | 28 (14%) | 60 (100%) |
| vídeo | 39 (20%) | 56 (28%) | 0 |
| imagem única | 1 | 116 (58%) | 0 |

### Categoria (chapéu deduzido)

| Not Journal | n | Brazil Journal | n | eua.journal | n |
|---|---|---|---|---|---|
| POLÍTICA | 47 | ECONOMIA | 32 | IMIGRAÇÃO | 10 |
| GEOPOLÍTICA | 30 | BUSINESS | 29 | MERCADO | 9 |
| TECNOLOGIA | 28 | POLÍTICA | 28 | POLÍTICA | 9 |
| ECONOMIA | 16 | CULTURA | 16 | ECONOMIA | 9 |
| BUSINESS | 15 | MERCADO | 15 | SAÚDE | 6 |
| CULTURA | 10 | IA | 14 | GEOPOLÍTICA | 4 |
| IA | 10 | OUTRO | 12 | TECNOLOGIA | 4 |
| SOCIEDADE, MUNDO | 6, 5 | TECNOLOGIA | 9 | BUSINESS | 3 |

Os 10 de imigração do nosso lado são de antes de 05/10, quando a imigração
saiu da pauta.

### Quem está no centro

| | Not Journal | Brazil Journal | eua.journal |
|---|---|---|---|
| post com pessoa famosa no centro | **115 (58%)** | 143 (72%) | **18 (30%)** |
| centro é pessoa | 88 | 114 | 9 |
| centro é dado ou tema | 60 | 48 | 29 |
| post que é citação de alguém | 49 (25%) | 71 (36%) | **0** |
| manchete com número forte | 67 (34%) | 62 (31%) | 26 (43%) |

As pessoas mais frequentes no Not Journal: Donald Trump (22), Lula (9), Elon
Musk (6), Alexandre de Moraes (6), Flávio Bolsonaro (5), Meloni (3), Bezos,
Netanyahu, Bill Gates, Milei, Putin, Jensen Huang e Xi Jinping (2 cada). No
nosso: Trump (5), Bernie Sanders, Pete Hegseth e David Ek (2 cada).

### Região

| | Not Journal | Brazil Journal | eua.journal |
|---|---|---|---|
| EUA | 23 (12%) | 3 | 49 (82%) |
| EUA ligado ao Brasil | 20 (10%) | 3 | 0 |
| Brasil | 50 (25%) | 167 (84%) | 1 |
| Mundo | 107 (54%) | 27 | 10 |

O Not Journal é sobretudo MUNDO e BRASIL. Os EUA puros são um oitavo do feed
dele. A semana medida incluiu o primeiro turno da eleição brasileira (04/10), e
28 dos 50 posts sobre o Brasil são de política.

### Idade da história

Para 55 posts do Not Journal o modelo achou a data do fato na legenda. **34
saíram no mesmo dia do fato, 12 no dia seguinte, 9 com dois dias ou mais**
(mediana zero). Do nosso lado, 13 posts tinham data legível: 5 no mesmo dia, 1
no dia seguinte, 7 com dois dias ou mais (mediana dois dias). A medida pela
pauta, abaixo, confirma: o nosso post sai em mediana **31 horas** depois de a
fonte publicar.

### O que engaja (curtidas mais comentários, dividido pela mediana da conta)

Mediana do Not Journal: 2.176. Do Brazil Journal: 277. Grupos com 4 posts ou mais.

| Not Journal | relativo | n |
|---|---|---|
| CULTURA | 1,56 | 10 |
| SOCIEDADE | 1,53 | 6 |
| TECNOLOGIA | 1,14 | 28 |
| POLÍTICA | 1,14 | 47 |
| BUSINESS | 0,74 | 15 |
| GEOPOLÍTICA | 0,72 | 30 |
| ECONOMIA | 0,67 | 16 |
| IA | 0,60 | 10 |
| com pessoa famosa / sem | 1,06 / 0,87 | 115 / 85 |
| vídeo / carrossel | 1,33 / 0,93 | 39 / 160 |
| citação / fato | 1,06 / 0,96 | 49 / 151 |
| EUA ligado ao Brasil / EUA / Mundo / Brasil | 1,08 / 1,01 / 1,05 / 0,91 | |
| **o que caberia na nossa linha** / não caberia | **1,68** / 0,92 | 19 / 175 |

Os maiores do período: Alexandre de Moraes e o STF (157.879), o robô Atlas da
Boston Dynamics (84.382), uma ação da Toyota com "Cars" (76.493), a mansão de
Jeff Bezos em Beverly Hills (71.748), a luz azul dos LEDs (62.732).

No Brazil Journal os vídeos de humor (`#pedrovinicio80`) dominam o topo; fora
eles, LUTO, POLÍTICA e BUSINESS ficam acima da mediana, e a imagem única
(1,36) e o carrossel (1,44) engajam quatro vezes mais que o vídeo (0,36).

Leitura: a pessoa famosa ajuda, mas não é o único motor. O que o leitor do
Not Journal mais curte é a história com personagem OU com objeto curioso
(robô, mansão, avião), contada no dia. E a fatia do feed dele que caberia na
nossa linha (19 posts: Flávio favorito na Polymarket, Musk reagindo à eleição,
Bezos e a mansão, o Atlas, Miami com 138% mais vendedores, Goldman e a Bolsa)
engaja 1,68 vez a mediana dele. A linha não é o problema; a seleção dentro dela
é.

## 2. O que a nossa esteira teve na mão

### Volume e motivo

| | 7 dias | por dia |
|---|---|---|
| candidatas classificadas | 3.857 | 551 |
| aprovadas | 127 | 18,1 |
| `REJECT_LOW_RELEVANCE` | 2.503 (65%) | |
| `REJECT_INSUFFICIENT_FACTS` | 556 | |
| `REJECT_US_NEGATIVE` | 406 | |
| `REJECT_POLITICAL_STATEMENT` | 108 | |
| `REJECT_BR_OFF_AXIS` | 63 | |
| `REJECT_SOURCE_UNRESOLVED` | 41 | |

A relevância das recusadas por baixa relevância: 619 com nota 0, 471 com 1, 893
com 2, 515 com 3, e só 5 acima de 3. O corte é duro e é o classificador quem
decide.

### As pessoas famosas estavam no pool, e caíram

**880 candidatas (23%) tinham uma pessoa famosa no centro. 26 foram
aprovadas.** Motivos das 854 recusas: baixa relevância 597, notícia ruim dos EUA
99, poucos fatos 72, declaração política 58, Brasil fora do eixo 9.

| pessoa | no pool | aprovadas |
|---|---|---|
| Trump (como "Trump") | 210 | 9 |
| Lula | 100 | 1 |
| Donald Trump | 61 | 1 |
| Flávio Bolsonaro (e "Flávio") | 50 | 0 |
| Tom Cruise | 19 | 0 |
| OpenAI | 18 | 6 |
| Elon Musk | 11 | 1 |
| Netanyahu | 10 | 0 |
| Rubio, Putin, Milei, Sam Altman, Tarcísio | 5 a 8 cada | 0 |

### Histórias quentes no pool (três veículos ou mais no mesmo dia)

Agrupamento pelo vetor do título, cosseno 0,70, janela de 24h, contando
domínio distinto. Em 7 dias: 2.898 histórias com um veículo só, 136 com dois,
**34 com três ou quatro** e nenhuma com cinco ou mais. Das 34, as que cabiam na
linha e não viraram post:

| história | veículos | o que aconteceu |
|---|---|---|
| Trump reúne big techs e fecha acordo de autorregulação da IA | 3 (mais 6 variações) | 1 aprovada (`Trump's AI Accord...`), as outras por poucos fatos ou declaração política; nenhum post |
| Ibovespa passa de 200 mil e dólar cai abaixo de R$ 5 depois do primeiro turno | 3 a 4 | 2 aprovadas como contexto Brasil, 5 por fonte não resolvida (Google News), nota baixa; nenhum post |
| Paramount e Warner viram Skydance (negócio de US$ 110 bi) | 3 | poucos fatos e baixa relevância (4) |
| Jensen Huang: data centers podem criar 1 milhão de empregos | 1 | `REJECT_POLITICAL_STATEMENT` (é citação, o formato que o Not Journal mais usa) |
| Trump anuncia investimento sul-coreano de US$ 200 bi nos EUA | 1 | `REJECT_DUPLICATE_URL` |
| Gemini 4 é lançado | 3 | entidade duplicada e baixa relevância |
| Tropas dos EUA deixam o Iraque | 4 | 2 aprovadas, nenhum post |

E as que a linha recusou de propósito, que são as perguntas do fim deste
documento: Netanyahu e o copiloto (4 veículos), protestos na França (4),
eleição na Espanha (3), Trump comentando a eleição brasileira (3 veículos, 14
matérias, relevância 3), Suprema Corte e deportações (notícia ruim e
imigração), a execução de Christa Pike (notícia ruim dos EUA).

O limiar de 0,70 foi medido em vetor de título mais resumo. No vetor só do
título, que é o que existe para toda candidata, ele é mais severo. Medido nas
127 aprovadas da semana:

| limiar | aprovadas com 2+ veículos | com 3+ |
|---|---|---|
| 0,70 | 29 | 7 |
| 0,65 | 34 | 14 |
| 0,60 | 46 | 23 |

Numa amostra de pares, a faixa de 0,65 a 0,70 é quase toda o mesmo fato
("Trump, top AI leaders agree to voluntary AI standards" e "AI firms agree to
'morally binding' self-policing", 0,685); a de 0,60 a 0,65 mistura fato e
vizinho ("Balança comercial" e "Inflação nos EUA", 0,612). O calor usa 0,70,
o limiar de sempre; a descida para 0,65 fica para o dono decidir.

### O nosso feed repete a mesma história em dias seguidos

Dos 60 posts publicados, **21 contam 9 histórias**, duas ou três vezes cada,
em dias seguidos: o relatório de emprego três vezes (03, 05 e 05/10), a perda
de peso com amilina três vezes (03, 04 e 05/10), a reunião sobre Irã e Iêmen
três vezes, a Neko Health duas, as indenizações climáticas duas, os leitores
de placa duas.

Causa encontrada: a repetição histórica da guarda é conferida contra o
histórico da **newsletter** (`canal: "newsletter"` em `newsroom-service.ts`), e
`editorial_history` não tem **nenhuma** linha com `channel = 'instagram'` desde
20/09 (54 de newsletter, 3 de artigo). O ramo do Instagram não confere o
próprio histórico, e a pauta que fica 72h na janela da coleta volta a ser
post no dia seguinte, com a manchete reescrita. É uma causa direta do "frio":
a história de ontem, repetida. Não foi corrigido aqui (fora do escopo e da
capacidade); está nas decisões abaixo como prioridade.

### Idade da pauta na seleção

| medida | valor |
|---|---|
| da publicação na fonte até a classificação, aprovadas | mediana 15,9 h (22 em até 6h, 77 entre 6 e 24h, 28 com mais de 24h) |
| da publicação na fonte até o post no ar | mediana **31 h**, 24 de 37 com mais de 24h |

A janela de coleta é de 72h para fonte que não é agregador, e o post sai na
grade do dia seguinte. O Not Journal publica no mesmo dia do fato em dois de
cada três posts.

### As fontes de hoje

50 fontes ativas (lista completa em `project_news_sources`). O que entrou de
cada domínio em 7 dias:

| domínio | por dia | aprovadas | taxa | idade mediana na classificação |
|---|---|---|---|---|
| news.google.com (buscas fixas) | 247,7 | 0 | 0% | 12,1 h |
| redir.folha.com.br | 72,9 | 6 | 1% | 13,8 h |
| oglobo.globo.com | 32,3 | 14 | 6% | 14,2 h |
| valor.globo.com | 21,0 | 11 | 7% | 14,6 h |
| thehill.com | 17,1 | 3 | 3% | 10,4 h |
| g1.globo.com | 14,0 | 5 | 5% | 14,5 h |
| axios.com | 13,4 | 29 | 31% | 19,0 h |
| techcrunch.com | 13,4 | 19 | 20% | 15,0 h |
| theatlantic.com | 11,7 | 0 | 0% | 19,2 h |
| bbc.com | 11,6 | 0 | 0% | 12,1 h |
| infomoney.com.br | 11,6 | 5 | 6% | 1,2 h |
| variety.com | 11,4 | 0 | 0% | 5,1 h |
| cnet.com | 10,3 | 1 | 1% | 14,9 h |
| npr.org | 10,0 | 0 | 0% | 18,2 h |
| theverge.com | 9,3 | 4 | 6% | 12,9 h |
| nytimes.com | 7,7 | 0 | 0% | 10,4 h |
| marketwatch.com | 6,6 | 0 | 0% | 11,4 h |
| cnbc.com | 6,3 | 12 | 27% | 19,4 h |
| politico.com | 6,0 | 0 | 0% | 16,7 h |
| vox.com, nerdwallet.com, pbs.org | 2,7 a 3,9 | 0 a 2 | | |
| órgãos oficiais (Fed, BLS, DOL, Casa Branca, Census, EIA, Dallas Fed) | menos de 1,2 cada | 13 no total | | |

Três achados:

- **Google News é 45% da coleta e 0% da aprovação.** São 248 candidatas por
  dia pagando classificação para nada: ou caem por fonte não resolvida, ou por
  baixa relevância. A regra de 08/09 ("descoberta, nunca fonte") está certa; o
  custo é que ninguém mediu.
- **As buscas de tendência não deixam rastro.** A coleta das tendências roda
  (as cinco fontes responderam 200 hoje, ao vivo), a triagem só escreve no log
  do contêiner, e o resultado vira busca no Google News. A candidata grava o
  domínio `news.google.com`, e não a busca de onde veio, então não dá para
  separar no banco a busca de tendência da busca fixa; dá para saber que todo
  o Google News da semana teve aprovação zero. O sinal mais quente do sistema
  morre na fonte mais fria.
- **A Folha chega com os acentos quebrados.** O feed declara ISO-8859-1 e a
  coleta lia como UTF-8; os títulos no banco têm o caractere de substituição
  ("D?lar fecha em queda"). Corrigido nesta entrega (`textoDoFeed` em
  `collector.ts`).

### As tendências de hoje, ao vivo

| fonte | resposta | primeiros termos |
|---|---|---|
| Google Trends EUA | 200 | world space week, scott caan, mexico-united states border, tom cotton daylight saving time |
| Google Trends Brasil | 200 | rayssa leal, djokovic, debora do batom, pedro sánchez espanha, comissão parlamentar de inquérito |
| Wikipédia em inglês | 200 | Christa Pike, 2026 Brazilian general election, filmes e séries |
| Wikipédia em português | 200 | **Flávio Bolsonaro, Lucas Pavanato, Nikolas Ferreira, Lula, Cleitinho, Jair Bolsonaro, Erika Hilton** |
| Hacker News | 200 | manchetes de tecnologia |
| Bluesky | 200 | Trump's Iran remarks, Paramount-Warner renamed Skydance, plague death in Siberia, US removes bombers from RAF Fairford |

A Wikipédia em português, que `tendencias.ts` não lia, trouxe exatamente as
pessoas dos posts mais curtidos do Not Journal na mesma semana. Ela entrou no
calor.

## 3. O que isto diz

1. **O pool não é frio; a seleção é.** Trump, Musk, Bezos, Jensen Huang, o
   acordo de IA na Casa Branca, o dólar abaixo de R$ 5, a fusão de US$ 110 bi:
   tudo esteve no pool. A nota da pauta (`pontuacao.ts`) mede o quanto o fato
   muda a vida do leitor, e nada nela mede se alguém está falando dele. Entre
   duas aprovadas, a de taxa de juros de caução vencia a do Trump porque o
   classificador a achava mais útil.
2. **A história chega velha.** 31 horas de mediana até o post, e um terço do
   feed é repetição do dia anterior.
3. **A linha corta metade do que a referência faz.** Política brasileira,
   geopolítica do mundo e citação de famoso são a maior parte do Not Journal,
   e a nossa linha recusa as três (por eixo, por relevância ou por
   `REJECT_POLITICAL_STATEMENT`). Isso é decisão do dono, e não foi mexido.

## 4. O que foi feito (capacidade `calor`)

Ver "O calor da pauta" em `docs/decisoes.md`. Em resumo: um calor de 0 a 100
por pauta aprovada (veículos 30, tendência 25, fama 25, recência 10, número 10),
somado à nota com peso 0,35 no pool do Instagram (antes dos finalistas) e
usado para escolher a abertura da newsletter. `dry_run` só grava em
`platform_events` (`calor_da_selecao`) o calor e o feed que sairia.

Ensaio com as 34 aprovadas das últimas 48h (`npx tsx src/scripts/ensaiar-calor.ts 48`):

| pauta | posição pela nota | com calor |
|---|---|---|
| Trump libera compra de diesel vermelho | 11º | 8º |
| Inside Trump's new AI playbook | 30º | 12º |
| Supreme Court hears major climate case (3 veículos) | 24º | 11º |
| Ibovespa bate 200 mil e dólar abaixo de R$ 5 (Flávio nos Trends e na Wikipédia) | 32º | 16º |
| How states are tackling midterm pump pain (sem nome nem número) | 1º | 7º |
| Mortgage rates today | 14º | 26º |

O calor não salva o que a linha recusou: ele só reordena o que passou.

## 5. Perguntas que os dados levantam para o dono

| pergunta | o que os dados dizem | recomendação |
|---|---|---|
| Política brasileira e eleição entram? | 25% do Not Journal é Brasil, 28 de 50 posts são política; Flávio, Lula, Moraes, Nikolas e Erika Hilton estão entre os mais curtidos. A linha hoje só aceita "notícia ruim do Brasil" e com eixo. | Entrar quando o fato mexe com dólar, Bolsa ou a relação com os EUA (Ibovespa e dólar depois do turno, Trump comentando a eleição, Musk reagindo). Fofoca de campanha continua fora. |
| Geopolítica do mundo entra (Netanyahu, Putin, França, Espanha)? | 54% do Not Journal é MUNDO, mas GEOPOLÍTICA engaja 0,72 da mediana. | Fora, salvo quando os EUA são o ator (tropas saindo do Iraque, bombardeiros retirados do Reino Unido). |
| Citação de pessoa famosa entra? | 25% do Not Journal, engaja 1,06. Hoje vira `REJECT_POLITICAL_STATEMENT` (Jensen Huang e o milhão de empregos). | Entrar como formato próprio quando quem fala é CEO, bilionário ou chefe de governo falando de economia, trabalho ou tecnologia nos EUA. Continua fora a declaração de campanha. |
| Esporte (NFL no Brasil, Super Bowl) entra? | Esporte é 1% do Not Journal; a NFL no Maracanã é o exemplo dele. | Só quando é negócio ou audiência (o jogo mais assistido, o preço do anúncio), nunca placar. |
| Notícia ruim dos EUA de grande alcance (execução de Christa Pike, ICE)? | 406 recusas por `REJECT_US_NEGATIVE` na semana, com várias histórias de 3 a 4 veículos. | Continua fora. É o coração da linha. |
| Baixar o limiar de veículos para 0,65? | Medido acima: a faixa 0,65 a 0,70 é quase toda o mesmo fato. | Sim, para o calor; não para a composição. |
| Consertar a repetição do Instagram? | 21 de 60 posts repetem história de ontem; `editorial_history` não tem linha de Instagram. | Sim, antes de ligar o calor em `enforce`. |
| Publicar no mesmo dia? | Not Journal: 2 de 3 posts no dia do fato; nós: 31h de mediana. | Rever a grade da produção da véspera para notícia quente. |
| Tirar as buscas fixas do Google News? | 248 por dia, 0 aprovadas. | Desligar as fixas e manter só as de tendência, até a metade ativa do `GOOGLE_NEWS_DISCOVERY_ONLY` existir. |
