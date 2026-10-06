# A legenda no método do Not Journal: amostras (06/10/2026)

Gerado por `npx tsx src/scripts/amostras-legenda-not-journal.ts`, com quatro pautas reais aprovadas que já foram ao ar no feed, lidas de `social_posts` e `news_candidates` (banco só lido). O pacote factual não fica gravado na candidata, então foi montado de novo como a esteira monta (texto da fonte e o extrator barato). A legenda nova sai do mesmo `gerarPostDaPauta`, com a guarda e o laço de reparo da esteira, e o fecho e a linha do crédito montados em código (`legenda-final.ts`), com o autor gravado na foto do post.

A legenda atual é a que está gravada no post da mesma pauta (o formato até hoje: gancho curto, convite "Comente NEWS", hashtags e o crédito longo).

Custo total do modelo nas rodadas das amostras: cerca de 0,85 USD (abaixo do teto de 1 USD). A última rodada parou por falta de crédito na conta da OpenAI (`credit_balance_exhausted`), ver a nota no fim.

## 1. Why Lilly and Novo are betting on amylin to power a new wave of obesity drugs after GLP-1s

Fonte: cnbc.com | edição 2026-10-05 | carrossel (noticia) | post `eb71d434-645c-4eee-9e8c-e7496980b58f`

Manchete nova: **Lilly e Novo desenvolvem nos EUA remédios de amilina para obesidade e diabetes**

### Legenda atual (no banco)

```text
A combinação mira duas vias diferentes ligadas à fome e à saciedade.

Em um estudo de Fase 2, pacientes com obesidade e diabetes tipo 2 perderam, em média, 23,3% do peso após 48 semanas com eloralintide e tirzepatide em dose alta. O grupo que recebeu apenas tirzepatide perdeu 14,8%.

A Eli Lilly e a Novo desenvolvem medicamentos baseados em amilina para complementar os tratamentos que atuam no GLP-1. A amilina ajuda a sinalizar a saciedade, suprimir o apetite e desacelerar a passagem dos alimentos pelo estômago.

Os estudos de Fase 3 começarão mais tarde neste ano. As novas terapias ainda precisam passar por mais ensaios clínicos e revisões regulatórias.

Ainda não é possível afirmar que combinações com amilina sejam superiores à tirzepatide ou a outros tratamentos de próxima geração.

Toda manhã a gente conta o que aconteceu nos Estados Unidos, em português.

Comente NEWS para receber no Direct.

#Tirzepatide #EliLilly #ProfissionaisNosEUA #EstadosUnidos

· LeoTar, CC BY-SA 3.0, via Wikimedia Commons
```

159 palavras.

### Legenda nova (método do Not Journal)

```text
Eli Lilly e Novo desenvolvem novos medicamentos à base de amilina para tratar obesidade e diabetes, com opções isoladas ou combinadas a tratamentos existentes, segundo informações divulgadas na terça-feira (6).

Na Lilly, o eloralintide foi testado com tirzepatide, ingrediente ativo de Zepbound e Mounjaro, em um estudo de Fase 2 com pessoas com obesidade e diabetes tipo 2. A combinação na dose mais alta levou a uma perda média de 23,3% do peso corporal, contra 14,8% entre as pessoas que receberam apenas uma dose alta de tirzepatide.

A Novo desenvolve o cagrilintide e a combinação CagriSema, que reúne cagrilintide e semaglutide. CagriSema deve ser lançado no início do próximo ano, enquanto o cagrilintide independente e uma versão de dose mais alta da combinação devem chegar em 2028.

A amilina é um hormônio liberado pelo pâncreas junto com a insulina. Ela ajuda a sinalizar saciedade, suprimir o apetite e desacelerar o movimento dos alimentos pelo estômago, por uma via biológica diferente da do GLP-1. Pfizer, AstraZeneca e Viking Therapeutics também desenvolvem produtos à base de amilina.

Siga @eua.journal
Foto: LeoTar (CC BY-SA 3.0)
```

182 palavras; 1 reescrita(s) pela guarda.

O que a guarda mandou reescrever no caminho:

- SOCIAL_REJECT_GROUNDING: a legenda afirma o que a fonte não diz: numero "48"
- SOCIAL_REJECT_SLIDE_GROUNDING: o slide 2 ("passo 1") afirma o que a fonte não diz: numero "48". Reescreva usando só o pacote factual, ou diga menos nesse slide.
- COUNTRY_UNCLEAR: o título não diz de que país ele fala, e serve para o Brasil e para os Estados Unidos com as mesmas palavras. Quem lê está no Brasil e assume o Brasil por padrão. Situe o leitor com o que a fonte já traz: o país, a cidade, o estado, o órgão, a moeda ou a figura pública. E quando o fato for americano e bom, o título diz o FATO primeiro; a ressalva vem na segunda metade, nunca abrindo a frase.

## 2. Scoop: Trump's top national security aides meet secretly at Camp David on Iran, Yemen

Fonte: axios.com | edição 2026-10-05 | peça única | post `5f43529f-1699-4d97-beb7-3feb465f1800`

Manchete nova: **Principais membros do gabinete de Trump se reúnem por horas em Camp David sobre Irã e Iêmen**

### Legenda atual (no banco)

```text
O encontro reuniu integrantes do alto escalão americano durante horas.

Os principais integrantes do gabinete do presidente Trump se reuniram na sexta-feira em Camp David para discutir os próximos passos da guerra no Irã e o conflito envolvendo houthis no Iêmen. A reunião foi presidida pelo vice-presidente Vance e não foi anunciada pelo governo.

Participaram o secretário de Estado Marco Rubio, o secretário de Defesa Pete Hegseth e o enviado da Casa Branca Steve Wi.

A reunião durou horas e envolveu três autoridades americanas ouvidas pela Axios.

Quer acompanhar o que muda nos Estados Unidos sem depender do feed?

Comente NEWS e o link da newsletter chega no seu Direct.

#PoliticaEUA #CampDavid #Ira #Iemen #EstadosUnidos

· Dietmar Rabich, CC BY-SA 4.0, via Wikimedia Commons
```

123 palavras.

### Legenda nova (método do Not Journal)

```text
Os principais membros do gabinete de Trump se reuniram por horas em Camp David no sábado (3) para discutir os próximos passos na guerra no Irã e o conflito entre a Arábia Saudita e os Houthis no Iêmen.

Vance presidiu a reunião, que não foi anunciada pelo governo Trump. Marco Rubio, Pete Hegseth, Steve Witkoff, John Ratcliffe, o general Dan Caine e Scott Bessent também participaram do encontro.

Uma das autoridades disse que decisões foram tomadas ou profundamente discutidas. As negociações estão paralisadas, enquanto Trump considera retomar grandes operações de combate no Irã e é pressionado pela Arábia Saudita a autorizar ataques aéreos contra os Houthis. Trump tem se inclinado contra os ataques, mas autoridades dizem que ele pode mudar de ideia.

Uma reunião semelhante ocorreu em junho de 2025, e Israel entrou em guerra contra o Irã dias depois. Na quinta-feira, Trump disse que o Irã precisa “assinar o acordo ou deixará de existir” e afirmou que o país não está indo bem.

Siga @eua.journal
Foto: Dietmar Rabich (CC BY-SA 4.0)
```

172 palavras; 1 reescrita(s) pela guarda.

O que a guarda mandou reescrever no caminho:

- SOCIAL_REJECT_GROUNDING: a legenda afirma o que a fonte não diz: numero "3"
- SOCIAL_REJECT_CAPTION_SHAPE: "sexta-feira (3)": o dia da semana não bate com o dia do mês no calendário dos últimos oito dias; use o CALENDÁRIO que veio com a pauta

## 3. New York has a socialist mayor. Los Angeles may be next

Fonte: axios.com | edição 2026-10-05 | peça única | post `f0329f4b-3df7-422d-b87e-71f8ef11e884`

Manchete nova: **Los Angeles pode eleger prefeita socialista, e Nithya Raman lidera pesquisa com 39%**

### Legenda atual (no banco)

```text
A disputa em Los Angeles reflete mudanças na diversidade e na política urbana dos Estados Unidos.

Nithya Raman, urban planner nascida na Índia e integrante do City Council há dois mandatos, tenta derrotar a prefeita democrata Karen Bass em 3 de novembro. Eleitores de Los Angeles podem fazer história no próximo mês.

New York já é liderada pelo prefeito socialista democrático Zohran Mamdani. As duas maiores cidades dos Estados Unidos podem ter prefeitos socialistas democráticos imigrantes do Sul da Ásia, enquanto os limites ideológicos do Democratic Party mudam.

A eleição de Los Angeles está marcada para 3 de novembro.

Quer acompanhar o que muda nos Estados Unidos sem depender do feed?

Comente NEWS e o link da newsletter chega no seu Direct.

#LosAngeles #NithyaRaman #KarenBass #PoliticaAmericana #EstadosUnidos #DemocraticParty

· Dietmar Rabich, CC BY-SA 4.0, via Wikimedia Commons
```

136 palavras.

### Legenda nova (método do Not Journal)

```text
Na terça-feira (6), Nithya Raman aparece à frente de Karen Bass na disputa pela prefeitura de Los Angeles, segundo pesquisa de setembro com eleitores prováveis. A eleição está marcada para 3 de novembro.

A sondagem da Berkeley IGS/L.A. Times aponta Raman com 39% e Bass com 28%; 33% dos eleitores prováveis ainda estão indecisos. Entre os eleitores com menos de 30 anos, Raman lidera por 66% a 4%. Entre os eleitores latinos, a vantagem é de 45% a 21%, com 34% indecisos.

Karen Bass foi eleita em 2022 e é a primeira mulher a ocupar a prefeitura de Los Angeles. Raman está no City Council há dois mandatos, foi eleita em 2020 e tem formação por Harvard e MIT.

Raman apresenta uma versão municipal do socialismo democrático, centrada em serviços básicos, moradia acessível e segurança pública. Julie Chavez Rodriguez, estrategista de Bass, disse que os eleitores discutem aluguel, moradia, segurança e a possibilidade de criar famílias na cidade; ela atribuiu à prefeita a aceleração de quase 47.000 unidades de moradia acessível.

A possível vitória de Raman colocaria as duas maiores cidades dos Estados Unidos sob prefeitos socialistas democráticos. Em New York, Zohran Mamdani já governa como prefeito socialista democrático, depois de declarar na posse que administraria a cidade dessa forma.

Siga @eua.journal
Foto: Dietmar Rabich (CC BY-SA 4.0)
```

218 palavras; 0 reescrita(s) pela guarda.

## 4. United Airlines gets aggressive in battle for top Delta, American flyers

Fonte: cnbc.com | edição 2026-10-05 | peça única | post `cb746885-b9c4-4a43-87bf-6c98d5029850`

Manchete nova: **Clientes elite da Delta e American ganham 90 dias na United, com gasto de até US$ 7.000**

### Legenda atual (no banco)

```text
A United está tentando levar passageiros fiéis de outras companhias para o seu programa.

Viajantes com qualquer nível de status de elite na Delta ou na American recebem status na United por 90 dias. Para manter o status até 31 de janeiro de 2028, terão de fazer um voo e cumprir uma meta de gasto na United.

A disputa pelo passageiro que gasta mais envolve status, lounges, assentos premium, rotas internacionais e Wi-Fi mais rápido. A United também usa o Wi-Fi Starlink para atrair clientes.

Viajantes com status silver na Delta e gold na American precisam gastar US$ 1.500 na United. Para obter o status 1K, o gasto exigido é de US$ 7.000.

Comente NEWS e receba no Direct o link para assinar: economia, trabalho, custo de vida e política dos Estados Unidos, todo dia.

#UnitedAirlines #Delta #AmericanAirlines #EstadosUnidos

· Dietmar Rabich, CC BY-SA 4.0, via Wikimedia Commons
```

147 palavras.

### Legenda nova (método do Not Journal)

```text
A United Airlines lançou um programa que iguala o status de clientes elite da Delta Air Lines e da American Airlines na quinta-feira (1). A oferta dá status na United por 90 dias, com exigência de voos e gastos para manter o benefício.

Os clientes precisam gastar de US$ 1.500 a US$ 7.000 em voos elegíveis da United dentro desse prazo. O nível mais baixo da Delta e o nível Gold mais baixo da American exigem US$ 1.500, enquanto o status 1K, o mais alto da United antes do Global Services, exige US$ 7.000. Para manter o status até 31 de janeiro de 2028, também é preciso fazer um voo e cumprir a meta de gastos definida para cada nível.

As três maiores companhias aéreas disputam clientes que gastam muito em lounges, assentos premium, rotas internacionais e conexão durante o voo. Henry Harteveldt disse que a campanha mostra o acirramento dessa disputa e chamou o movimento de uma guerra no estilo das companhias aéreas.

A United usa o Wi-Fi via satélite da Starlink, da SpaceX, para atrair passageiros, com acesso gratuito para membros do programa de fidelidade. O serviço ainda não está disponível em toda a frota, enquanto clientes pagam pelo menos US$ 8 por voo com os provedores atuais. Uma porta-voz da American disse que os cadastros de sua campanha de status match triplicaram em relação à taxa normal na quinta-feira.

Siga @eua.journal
Foto: Dietmar Rabich (CC BY-SA 4.0)
```

240 palavras; 1 reescrita(s) pela guarda.

O que a guarda mandou reescrever no caminho:

- SOCIAL_REJECT_GROUNDING: a legenda afirma o que a fonte não diz: nome "Estados Unidos"

## Leitura contra o padrão, e o que mudou por causa dela

Lidas uma a uma contra as sete legendas do Not Journal.

**O que está certo nas quatro.** Abrem direto no lide, sem saudação nem pergunta; nenhum emoji, hashtag, link, "Leia mais" ou linha de "Fonte:"; de 3 a 4 parágrafos depois do lide, cada um com uma camada (números, quem disse, histórico, o que vem); de 172 a 240 palavras; nenhuma repete a manchete; a atribuição está dentro da frase; terminam com "Siga @eua.journal" e, na linha de baixo, o crédito curto. Nas quatro, o crédito longo ("via Wikimedia Commons") e o convite de comentário sumiram da legenda.

**Defeito 1, o quando inventado (achado nas amostras 1, 3 e na primeira versão da 4).** O lide dizia "na terça-feira (6)", o dia em que a amostra rodou, em pautas cuja fonte não diz dia nenhum. E na amostra 2 o reparo trocou "sexta-feira (3)" (dia da semana errado) por "sábado (3)", quando a fonte dizia Friday, que foi o dia 2. A ancoragem não pega nenhum dos dois: ela confere o número, não o dia da semana. **Consertado em código** (`conferirDiasDaSemana`, em `forma-da-legenda.ts`): o par dia da semana e dia do mês tem de bater com o calendário dos últimos oito dias E ser um dia que o material nomeia (Monday, sexta...) ou a data de publicação da fonte; fora disso é reescrita, com a lista dos dias que o material sustenta. A amostra 4 foi refeita com a regra e saiu com "quinta-feira (1)", que é o Thursday da matéria. A amostra 3 ficou com o defeito porque a nova rodada parou na falta de crédito da OpenAI; ela está aqui como o exemplo do que a regra agora recusa.

**Limite que fica.** A regra confere que o dia está no material, não que ele é o dia DESTE fato: na amostra 4, o Thursday da matéria é o dia em que as inscrições da American triplicaram, e a legenda o pendura no lançamento da United. Não há como medir isso sem ler a frase da fonte; fica para o auditor semântico e para quem aprova na fila.

**Defeito 2, citação em inglês.** A primeira versão da amostra 4 citava "This is war, airline style" no original. O prompt passou a pedir a fala do pacote, fiel, e traduzida quando é em inglês; a versão refeita já parafraseia em português.

**Defeito 3, atribuição vaga.** A amostra 1 abre com "segundo informações divulgadas", que não diz quem. A régua de atribuição só confere nome próprio ("segundo a CNBC"); a vaga passa. Fica como ponto para o dono decidir se vira regra (por exemplo, recusar "segundo informações" e "segundo relatos").

**Crédito.** As quatro saem com "Foto: Dietmar Rabich (CC BY-SA 4.0)" ou "Foto: LeoTar (CC BY-SA 3.0)": é o autor gravado na foto do post de verdade (a mesma foto de Wall Street serviu a três pautas em 05/10). A sigla aparece porque a licença é CC BY-SA; numa foto do Pexels sairia só o nome.

**Nota sobre a conta da OpenAI.** A última chamada voltou 429 `credit_balance_exhausted` ("You have no credits remaining"). Se o saldo não for reposto, a produção das 17:00 e o ciclo das 06:03 falham na primeira chamada de modelo.
