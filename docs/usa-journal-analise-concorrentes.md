# USA Journal: auditoria de concorrentes e plano de implementação

Análise de Brazil Journal e Not Journal, e o que fazer com ela dentro da
arquitetura que já existe neste repositório.

Levantamento feito em 15/09/2026, por leitura direta dos sites, dos perfis do
Instagram e de reportagem de terceiros. Fontes ao final.

## 1. Método e limites

Li as home dos dois sites, as páginas institucionais, uma matéria de cada,
a editoria EUA do Not Journal, e as duas grades do Instagram. O que **não**
consegui: métricas internas (abertura de newsletter, engajamento por post,
receita), porque não são públicas. Onde houver número de audiência, ele é
declarado pela própria empresa ou por reportagem, não medido por mim.

## 2. Brazil Journal

### Identidade

Fundado em 2016 por Geraldo Samor, jornalista de negócios. Slogan:
**"Quem faz o PIB lê."** Instagram com 373 mil seguidores e apenas 3 contas
seguidas, o que é sinal de marca, não de rede social.

### Público

Declarado sem eufemismo: **CEOs, CFOs, empreendedores e investidores**. O
formulário da newsletter pede empresa, nome completo e cargo, o que transforma a
lista num ativo comercial qualificado, não num contador de e-mails. Os
depoimentos na página de assinatura são de David Vélez (Nubank) e Guilherme
Benchimol (XP). O público é a prova social.

### Estratégia de comunicação

**Autoridade por proximidade com a fonte.** A matéria que li tem cerca de 750
palavras, sem subtítulos, com três fontes nomeadas de primeira linha (CEO da B3,
economista-chefe do Bradesco, economista-chefe do Itaú) e uma fala colhida depois
do painel. É jornalismo de acesso: o valor não está na velocidade, está em quem
atende o telefone.

Manchetes de 80 a 120 caracteres, conversacionais, frequentemente com número
específico ("US$ 40 bilhões", "R$ 1,2 bi") ou com pergunta retórica
("Cenário-base do mercado é de ajuste fiscal pós-eleição. De novo?").

### Modelo de negócio

**Publicidade institucional e conteúdo de marca, declarados.** Na home há uma
faixa "A word from our partners" e matérias marcadas como "Um conteúdo
[Marca]", com McKinsey, Safra, Alchemy, ALLOS, Cadastra, Matera, Lindenberg.
Newsletter gratuita. A monetização é a audiência qualificada, não o acesso.

Expandiram de site e newsletter para vídeo e eventos entre 2022 e 2023, e
operam uma família de marcas: INFRA Journal, Metro Quadrado, Page9, mais séries
verticais (AI Journal, Health Journal, Wealth Journal, Agro Journal, CMO Journal).

### Estrutura

Cerca de 13 pessoas identificadas: 6 a 7 repórteres e 5 no comercial. **É uma
operação humana, cara e não replicável por automação.** Isso importa para a sua
decisão: Brazil Journal não é o concorrente que você consegue copiar, é o
posicionamento que você consegue mirar.

### Instagram

Vídeo em primeiro lugar. A grade é dominada por reels: entrevistas, "RESUMO DO
MERCADO DE HOJE" com data no card, cortes de podcast, e conteúdo patrocinado
co-marcado ("McKinsey & Company x Brazil Journal"). Os cards estáticos usam foto
em tela cheia com gradiente escuro embaixo e manchete em serifada branca.

## 3. Not Journal

### Identidade

Fundado em julho de 2024. Posicionamento: **"Smart news for smart people."**
Instagram com 360 mil seguidores em pouco mais de dois anos, e mais de 50 milhões
de visualizações mensais declaradas. Sócios: Bruno Richards de Souza Figueiredo
(editor-chefe) e Marlon Ceni (engenheiro).

### O que eles realmente são

**É o concorrente que se parece com o que você quer construir.** A conta do
Instagram se chama `@notjournal.ai` e o primeiro post fixado vende o produto com
todas as letras:

> "As principais notícias, 24 horas por dia, direto no seu WhatsApp. As notícias
> mais relevantes. **Curadas e selecionadas por IA.** Enviadas direto para você."

No site institucional o discurso muda de tom: fala em curadoria editorial
liderada por uma editora-chefe, colunistas independentes e o princípio "os fatos
vêm primeiro". Ou seja, **a IA é argumento de venda no Instagram e fica discreta
no institucional.** Isso é uma escolha de posicionamento, e você vai ter que fazer
a sua.

### Público

Executivos, investidores e profissionais de mercado, o mesmo alvo do Brazil
Journal, capturado por um caminho diferente: volume e velocidade em vez de
acesso e profundidade.

### Linha editorial e cadência

Editorias: Arte, Business, Economia, **EUA**, Geopolítica, IA, Inovação, Justiça,
Lifestyle, Moda, Not Opinion, Poder, Política, Real Estate, Saúde, Sociedade,
Tech, Wealth.

Na home contei entre 20 e 25 matérias, com várias do mesmo dia. **A cadência é de
dezenas de itens por dia**, não de uma edição diária. Os títulos são factuais e
rasos de propósito: "Mercado reduz estimativa de inflação", "Trump pede a
Zelensky fim de ataques", "Copom deve reduzir Selic".

Repare numa coisa: **eles já têm editoria EUA, e ela publica sobre visto O-1.**
Três matérias entre maio e setembro, incluindo "O boom da IA está levando quem
trabalha com tech para os EUA com o visto O-1". Eles tocam o seu assunto de raspão,
com frequência mensal. É a fresta por onde o imigra.us passa.

### Modelo de negócio

**Assinatura barata e de volume: a partir de R$ 19,90 por mês**, entregando
notícia por WhatsApp 24 horas mais um terminal web. Somam publicidade
institucional. É o oposto do Brazil Journal: lá a audiência é o produto vendido
a anunciantes, aqui o acesso é vendido ao leitor.

### Design dos posts, que é o que você quer modelar

Dois gabaritos, e os dois são simples o bastante para automatizar:

**Gabarito A, o card de notícia com foto**
```
+-----------------------------------+
| [logo not]  NOT JOURNAL @handle   |  barra superior, fundo preto
|                                   |
|  Manchete em duas linhas, branca, |  sentence case, sem caixa alta
|  sem serifa, alinhada à esquerda  |
|                                   |
|  +-----------------------------+  |
|  |                             |  |
|  |      FOTO DO PERSONAGEM     |  |  foto ocupa a metade de baixo
|  |                             |  |
|  +-----------------------------+  |
|  [ FAIXA AZUL: RÓTULO EM CAIXA ]  |  contexto, ex: "JULGAMENTO DA PETIÇÃO 16.662"
+-----------------------------------+
```

**Gabarito B, a capa editorial**
```
+-----------------------------------+
| [logo not]                        |
|                                   |
|        FOTO EM TELA CHEIA         |  com recorte circular de um rosto
|        (+ círculo com anel        |  secundário sobreposto
|         colorido no canto)        |
|                                   |
|  JUSTIÇA                          |  chapéu em caixa alta, pequeno
|  MANCHETE EM CAIXA ALTA,          |  três a quatro linhas, bold
|  BRANCA, DUAS A QUATRO LINHAS     |
+-----------------------------------+
```

O sistema visual inteiro cabe em cinco decisões: **fundo preto, tipografia branca
sem serifa, um único acento de cor, chapéu de editoria em caixa alta, e o rosto da
notícia sempre presente.** Não há ilustração, não há gráfico, não há gradiente
elaborado. É barato de gerar e reconhecível na grade, que é exatamente o que uma
operação automatizada precisa.

### A ressalva que eu não posso deixar de fazer

Reportagem da Folha de S.Paulo de maio de 2026, citada por Aos Fatos e pela
Agência Pública, aponta que o Not Journal recebeu R$ 30 mil por 12 publicações
mensais no site e no Instagram em 2025, e que o site foi identificado pela Polícia
Federal como parte do "Projeto DV", ligado a contratos com a agência Mithi para
ataques ao Banco Central. O editor-chefe também se apresenta desde abril de 2026
como country manager da Polymarket, cujo logo aparece no site.

Isso não invalida o modelo de produto deles, que é bom. Significa que **o que se
deve copiar é o formato, e o que não se deve copiar é a governança do conteúdo
pago.** Um jornal automatizado que aceita pauta comprada sem marcação clara vira
exatamente esse problema, e num nicho de imigração, com leitor tomando decisão de
vida, o dano é maior.

## 4. A comparação que importa

| | Brazil Journal | Not Journal |
|---|---|---|
| Fundação | 2016 | jul/2024 |
| Seguidores no IG | 373 mil | 360 mil |
| Proposta | acesso e profundidade | volume e velocidade |
| Cadência | poucas matérias, densas | dezenas por dia, rasas |
| Matéria típica | 750 palavras, fontes nomeadas | nota factual curta |
| Produção | 13 pessoas, humana | curadoria com IA, declarada |
| Receita | publicidade e conteúdo de marca | assinatura R$ 19,90 mais publicidade |
| IG | vídeo em primeiro lugar | card estático com foto |
| Copiável por automação | não | sim |

**Os dois provam a mesma tese por caminhos opostos:** existe audiência
qualificada disposta a ler notícia de negócios em português, e ela cabe no
Instagram. O Brazil Journal prova que dá para virar autoridade. O Not Journal
prova que dá para chegar a 360 mil seguidores em dois anos sem redação
tradicional.

**A síntese que interessa para você:** o formato do Not Journal com a
credibilidade do Brazil Journal. O primeiro é replicável com o que você já tem
construído. O segundo é o que evita que o produto vire mais um agregador.

## 5. Onde o USA Journal se encaixa

### O espaço real

Não é "notícias dos Estados Unidos" em geral, porque isso é território de
gigante e de commodity. O espaço é **notícia dos EUA lida por quem tem interesse
concreto nos EUA**: quem quer ir, quem já foi, quem investe lá, quem tem filho
estudando lá, quem manda dinheiro para lá.

Isso já é o público do imigra.us, um degrau acima. E é justamente o que o Not
Journal cobre uma vez por mês numa editoria secundária.

### A relação com o imigra.us

São dois produtos com públicos concêntricos, e isso é uma vantagem, não um
conflito:

- **imigra.us**: quem está decidindo ir. Conteúdo de processo, visto, prazo.
- **USA Journal**: quem quer entender os EUA. Economia, política, decisão
  judicial, mercado, que afetam quem está indo ou já está lá.

O USA Journal alimenta o imigra.us com audiência de topo de funil, e o imigra.us
converte. Um mesmo sistema, duas marcas, dois Instagram, duas listas.

### Sobre o nome

"USA Journal" tem dois problemas práticos: é genérico demais para registrar como
marca, e o domínio `usajournal.com` quase certamente não está livre. O padrão
"[lugar] Journal" também é o que amarra você visualmente aos dois concorrentes.
Vale conversar sobre alternativas antes de comprar domínio e abrir perfil.

### Sobre copiar o design

Copiar a **gramática** do formato é normal e não é protegido: fundo escuro,
chapéu de editoria, manchete em caixa alta, rosto da notícia, faixa de contexto.
Isso é convenção de card de notícia, e todo mundo usa.

Copiar a **identidade** é outra coisa: o logotipo "not", o recorte circular com
anel colorido, o azul específico da faixa, a assinatura visual. Isso é vestimenta
comercial da marca deles, e imitar de perto cria risco jurídico e, pior, faz o
seu produto parecer clone em vez de concorrente.

**Recomendação:** mesma estrutura, identidade própria. Você já tem a máquina de
templates travados para isso.

## 6. O que já existe no repositório e serve

A boa notícia é que a maior parte do USA Journal já está construída. O sistema
atual faz, todo dia e sem operador: coleta, classificação, redação com LLM,
auditoria antialucinação, publicação no portal, campanha de newsletter e posts de
Instagram com arte gerada.

Aproveitamento direto:

| Peça do USA Journal | O que já existe |
|---|---|
| Coleta de fontes | `project_news_sources` por projeto, janela por fonte |
| Seleção de pauta | guarda editorial com regras duras e antirrepetição |
| Redação | pipeline editorial com pacote factual |
| Credibilidade | auditoria de lastro e semântica, que barra a edição |
| Portal | `articles` mais `/artigos/[slug]` |
| Newsletter | Listmonk, com lista e credenciais por projeto |
| Post de Instagram | pipeline social V2, publicando desde 12/09 |
| Arte | templates travados, e o formato `noticia` já é imagem única |
| Foto real | resolvedor visual com entidade, licença e temporalidade |
| Marca por projeto | `projects` com nome, cor, logo, assinatura, fuso |
| Capacidades por projeto | `capacidades.ts`, sete capacidades ligáveis |
| Credenciais por projeto | `credenciais-do-projeto.ts` |

O formato `noticia` já ser **capa só**, ou seja, post de imagem única, é uma
coincidência feliz: é exatamente o gabarito A do Not Journal.

## 7. O que falta construir

Em ordem de dependência.

### 7.1 Terminar o multiprojeto (bloqueia tudo)

1. **Cron por projeto.** Hoje o ciclo roda um projeto e não itera. Precisa
   percorrer os projetos ativos com a capacidade `coleta` ligada, cada um no seu
   fuso e no seu horário (`publish_hour_local` já existe na tabela).
2. **UUID fixo.** O projeto padrão está hardcoded em alguns arquivos. Precisa sair.
3. **Marca por projeto.** `marca.ts` é constante de módulo e ainda aponta para o
   domínio antigo. Precisa virar leitura do projeto.
4. **Design de carrossel por projeto.** As tabelas de tema e de configuração de
   formato não têm `project_id`. **Esta é a única migração obrigatória.**

### 7.2 A mudança de cadência, que é a decisão de produto mais importante

O sistema de hoje produz **uma edição por dia, com 4 a 6 pautas**. O Not Journal
produz **dezenas de itens por dia, um de cada vez**.

São arquiteturas diferentes. A edição diária tem uma chave de idempotência por
dia, um QA por edição, uma campanha por dia. O fio contínuo precisa de
idempotência por matéria, QA por matéria, e publicação assim que a matéria passa.

Isso não é reescrita: o pipeline social já trabalha por pauta, e o portal já
grava artigo por artigo. O que muda é quem manda no ciclo. A newsletter continua
sendo uma edição diária, montada a partir do que foi publicado no fio.

**Consequência prática que você precisa aceitar:** com dezenas de itens por dia,
o portão de alucinação vai barrar matérias individuais com frequência. Hoje isso
para o dia inteiro. No fio contínuo, para só aquela matéria, e as outras seguem.
O fio é mais robusto que a edição, além de mais rápido.

### 7.3 Design do USA Journal

Uma variante nova de capa no formato `noticia`, com a gramática descrita na seção
3 e identidade própria. Trabalho de template, não de arquitetura: é onde o
sistema de templates travados já foi feito para absorver mudança.

### 7.4 O que eu recomendo não copiar agora

- **WhatsApp como canal principal.** É o melhor produto do Not Journal e o mais
  caro de operar: exige API oficial, número verificado, gestão de opt-in e custo
  por mensagem. Fica para depois de o fio contínuo estar de pé.
- **Assinatura paga.** Antes de cobrar, precisa haver o que cobrar. Newsletter
  gratuita primeiro, audiência depois, produto pago quando a lista justificar.
- **Vídeo.** É o que sustenta o Brazil Journal no Instagram e é o formato que a
  automação atual não produz.

## 8. Ordem sugerida

1. Fechar nome, domínio e identidade do novo jornal
2. Terminar o multiprojeto (7.1), com a única migração necessária
3. Cadastrar o USA Journal como segundo projeto, com fontes e capacidades
4. Desenhar a variante de capa e travar o template
5. Ligar em `dry_run` e rodar uma semana sem publicar, conferindo pauta e arte
6. Ligar o Instagram, depois o portal, depois a newsletter
7. Só então avaliar o fio contínuo (7.2), com dado de operação na mão

A ordem não é conservadora por medo: cada etapa produz evidência que a seguinte
usa. O sistema já mostrou que descobre defeito rodando, não planejando.

## 9. Decisões tomadas

Decididas em 15/09/2026, com o dossiê acima na mão:

| Decisão | Escolha |
|---|---|
| Idioma e público | português, para brasileiros interessados nos EUA |
| Cadência | fio contínuo, como o Not Journal |
| Código | segundo projeto no mesmo sistema |
| Transparência sobre IA | discreta, IA como argumento nas redes e curadoria no institucional |

### Uma ressalva sobre "fio contínuo em tudo"

O Not Journal publica dezenas de itens por dia no site, mas **a newsletter deles
é diária**, e o canal de tempo real é o WhatsApp. Mandar dezenas de e-mails por
dia não é o modelo deles e queimaria a lista em uma semana.

O mesmo vale para o Instagram: a Meta limita publicações em 24 horas, e a grade
do Not Journal mostra bem menos posts por dia do que o site tem matérias.

Então "fio contínuo" implementado com fidelidade ao modelo significa:

- **portal**: recebe tudo, matéria a matéria, assim que passa no QA
- **Instagram**: recebe uma seleção do fio, as melhores do dia
- **newsletter**: uma edição diária montada a partir do que saiu no fio
- **WhatsApp**: o canal de tempo real, quando existir

## 10. Plano de implementação

### Fase 1: terminar o multiprojeto

Nada aqui depende do nome do jornal, então pode começar imediatamente.

1. **Migração única**: `project_id` em `carousel_theme` e `carousel_format_config`,
   com o valor atual apontando para o projeto existente.
2. **Tirar o UUID fixo** do projeto padrão dos arquivos que o carregam.
3. **`marca.ts` passa a vir do projeto.** Hoje é constante de módulo e ainda
   aponta para o domínio antigo. A tabela `projects` já tem nome, cor, logo,
   assinatura, `site_url` e fuso.
4. **Cron por projeto**: percorrer os projetos ativos com a capacidade `coleta`
   ligada, cada um no seu `publish_hour_local` e no seu fuso.

### Fase 2: o fio contínuo

O pipeline social já trabalha por pauta e o portal já grava artigo a artigo. O
que muda é quem manda no ciclo.

1. **Unidade de idempotência passa a ser a matéria**, não o dia. Já existe base
   para isso: `url-canonica.ts` e `fingerprint.ts` produzem identidade estável de
   acontecimento, e `social_posts` já tem `event_fingerprint`.
2. **QA por matéria.** A ancoragem factual já é por pauta, contra o pacote
   daquela pauta. O que muda é o escopo do veredito: hoje a reprovação de uma
   pauta derruba a edição inteira, e passa a derrubar só aquela matéria.
3. **Cron de coleta em intervalo curto** em vez de uma vez por dia. As
   candidatas já são persistidas com a classificação, então releitura não
   reprocessa.
4. **Seleção para o Instagram** a partir do fio, com teto diário.
5. **Newsletter vira digest**: monta a edição do dia a partir do que foi
   publicado, em vez de escrever do zero.

**Ganho colateral que resolve o problema atual:** hoje uma reprovação do portão
de alucinação para o dia inteiro, e foi exatamente isso que aconteceu em 13, 14 e
15 de setembro. No fio, para só aquela matéria.

### Fase 3: marca e design

1. Nome, domínio e identidade
2. Variante de capa no formato `noticia`, com a gramática da seção 3 e
   identidade própria
3. Conta do Instagram e lista no Listmonk, cadastradas como credenciais do
   projeto

### Fase 4: subida controlada

Ligar em `dry_run`, rodar uma semana sem publicar conferindo pauta e arte, e
então ligar canal por canal: Instagram, portal, newsletter.

## 11. Custo e risco

**Custo de LLM, medido na produção atual:** a média histórica é de US$ 0,13 por
edição, e as execuções recentes, com mais auditoria e reparo, ficaram em US$
0,29. Isso dá algo entre US$ 0,05 e US$ 0,07 por matéria.

No fio contínuo, com 20 a 25 matérias por dia, a conta fica entre **US$ 1,00 e
US$ 1,75 por dia**, ou seja, **US$ 30 a US$ 50 por mês por projeto**. A
renderização de arte é própria e não entra nessa conta.

**Riscos que merecem vigilância:**

- **Limite de publicação da Meta.** Instagram tem teto em 24 horas, e frequência
  alta derruba alcance. O teto diário de posts é decisão de produto, não técnica.
- **Custo de LLM cresce linearmente com o fio.** Vale medir por matéria desde o
  primeiro dia, que a tabela `newsroom_runs` já faz por execução.
- **Volume aumenta a exposição a erro factual.** Vinte matérias por dia são vinte
  chances de publicar algo sem lastro. O portão existe e é rígido, e o fio torna
  a reprovação barata: cai a matéria, não o dia.
- **Dois projetos no mesmo sistema compartilham falha.** Uma queda derruba os
  dois. É o preço da base única, e é aceitável porque a alternativa duplica todo
  conserto.

## 12. Fontes

- [braziljournal.com](https://braziljournal.com/) home e editorias
- [Quem faz o Brazil Journal](https://braziljournal.com/quem-faz/) equipe
- [Newsletter do Brazil Journal](https://braziljournal.com/newsletter/) oferta e público
- [instagram.com/braziljournal](https://www.instagram.com/braziljournal/) grade e bio
- [notjournal.com.br](https://notjournal.com.br/) home, editorias e assinatura
- [Editoria EUA do Not Journal](https://notjournal.com.br/categories/eua) cobertura de visto
- [instagram.com/notjournal.ai](https://www.instagram.com/notjournal.ai/) grade, bio e anúncio do produto
- [produto.notjournal.com.br](https://produto.notjournal.com.br/) posicionamento do pago
- [Aos Fatos](https://www.aosfatos.org/noticias/polymarket-apostas-eleicoes-brasileiras/) e [Agência Pública](https://apublica.org/2026/09/apesar-de-proibicao-polymarket-promove-apostas-sobre-eleicoes-brasileiras/) sobre Polymarket e o Projeto DV
- [InvestNews](https://investnews.com.br/negocios/da-istoe-ao-brazil-journal-uma-nova-elite-de-minas-gerais-investe-no-mundo-da-midia/) sobre o grupo do Brazil Journal
