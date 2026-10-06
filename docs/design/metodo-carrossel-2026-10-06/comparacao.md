# O método Not Journal e The News, testado com dados reais (06/10/2026)

Ensaio do branch `feat/metodo-not-journal-e-the-news`. Banco só LIDO, nada
gravado; pacotes factuais remontados das fontes; fotos do resolvedor de sempre
em modo leitura. Custo no fim.

## 1. O assunto do e-mail: as 10 últimas edições

O assunto novo foi gerado com a instrução nova (`INSTRUCAO_PADRAO_ASSUNTO`) a
partir das pautas PUBLICADAS de cada edição, e passou pela conferência de forma
(`escolherAssunto`). "Forma" é a do método: 1 pergunta, 2 nomes, 3 personagem,
4 cena ou número, 5 momento.

| edição | assunto antigo | assunto novo | forma | história escolhida |
|---|---|---|---|---|
| 05/10 | o depósito de imigração rende juros | quem quer governar los angeles? | 1 | Los Angeles pode eleger uma urbanista para prefeita |
| 04/10 | o novo dinheiro de Hollywood *(maiúscula)* | filmes prontos em um ano | 4 | Hollywood atrai capital privado para filmes independentes |
| 03/10 | eua vão ficar de fora? | a segunda recusa dos eua | 4 | EUA recusam ofensiva saudita contra os Houthis, por enquanto |
| 02/10 | 17.500 admissões, mas para quem? | 17.500 vagas para refugiados | 4 | até 17.500 admissões de refugiados em 2027 |
| 01/10 | O Alasca entrou na conta *(maiúscula)* | a coreia vai investir US$ 200 bi? | 1 | Coreia do Sul planeja US$ 200 bilhões nos EUA |
| 30/09 | o assistente ficou ligado | o que são os dots? | 1 | OpenAI estreia os dots |
| 29/09 | 77 a 22 para o esporte universitário | o placar de 77 a 22 | 4 | Senado aprova pacote do esporte universitário |
| 28/09 | a lista dos US$ 30 bilhões | US$ 30 bi em bens | 4 | acordo EUA e China sobre US$ 30 bilhões |
| 26/09 | juíza manda trazer jovem de volta | governo vai trazer deportado de volta? | 1 | juíza manda trazer de volta solicitante de asilo |
| 25/09 | o ICE enganou o tribunal *(maiúscula)* | o ice enganou o tribunal? | 1 | juiz impõe padrões a centro de detenção |

O que o ensaio mostrou:

- **Caixa baixa e ponto deixam de depender do modelo.** Três dos dez antigos
  tinham maiúscula; nenhum novo tem, e o código consertaria se tivesse.
- **O modelo escreveu as cinco formas e escolheu quase sempre pergunta ou
  número.** As opções de nomes e de personagem existiram em 9 das 10 edições
  ("trump & coreia do sul", "gallagher & o deportado", "a juíza do segundo
  desacato", "kaplan & ice"), mas a escolha final caiu nelas zero vezes. Se o
  dono quiser rotação de forma, ela pede regra de código (como a do VisaMatch),
  e não só instrução.
- **Uma opção saiu com nome errado:** "nithya ramon & karen bass" (é Raman). Não
  foi a escolhida, mas é o argumento para a ancoragem de nome olhar também o
  assunto e as opções. Fica como ponto aberto.
- **Pergunta precisa ser respondida pela edição.** "a coreia vai investir US$ 200
  bi?" é respondida ("planeja investir"); "o ice enganou o tribunal?" depende de
  a edição afirmar o engano. A regra está no prompt; não há conferência
  determinística possível para "a edição responde".

## 2. Dois carrosséis de notícia, com as regras novas

Folhas de contato:

- `folha-camp-david.png`, slides em `camp-david/`
- `folha-sanders-flock.png`, slides em `sanders-flock/`

Cada pasta tem `carrossel.json` com a decisão de formato, o pacote factual, a
legenda, os slides, os reparos e a origem de cada foto. Renderizados em
1080x1350 com o tema do banco; a produção continua em 1080x1440 (o desenho é em
porcentagem e serve aos dois).

### Camp David (Axios, 03/10), 5 slides

Decisão: 3 passos além da capa (detalhe, explicação, consequência), 15 fatos.

1. capa: "Membros do gabinete de Trump discutem Irã e Iêmen por horas em Camp David"
2. "Os principais membros do gabinete de Trump se reuniram por horas em Camp David na sexta-feira, segundo três autoridades dos Estados Unidos; o governo não anunciou o encontro."
3. "Vance presidiu a reunião, com participação de Marco Rubio, Pete Hegseth, Steve Witkoff, John Ratcliffe, Gen. Dan Caine e Scott Bessent." / "Os debates trataram dos próximos passos na guerra do Irã e do conflito entre a Arábia Saudita e os Houthis no Iêmen."
4. "Uma autoridade disse que decisões foram tomadas ou profundamente discutidas, enquanto as negociações permanecem paralisadas." / "Trump considera retomar grandes operações de combate no Irã e tem se inclinado contra ataques sauditas aos Houthis; autoridades dos Estados Unidos dizem que ele pode mudar de ideia."
5. convite de assinatura

Fotos: capa com o retrato oficial (a mesma que a produção usou); slide 2 com
outra foto de Trump, aprovada pela conferência visual; slides 3 e 4 no
azul-marinho, porque as fotos seguintes de Trump foram recusadas pela
conferência e a cena (Camp David) não teve entidade resolvida. É o
comportamento pedido: sem foto nova, nada de repetir nem de rosto de outra
pessoa.

O que precisa de olho:

- **O slide 2 repete a capa** com mais detalhe. O método pede um passo à frente
  por slide; a guarda não mede isso (é julgamento), e o prompt já pede.
- **A foto do slide 2 tem outras pessoas identificáveis** (agentes de fronteira
  ao lado de Trump, 2018). É foto de Trump, aprovada, mas de outro contexto. O
  Not Journal faz isso; se o dono não quiser, a régua é "retrato sem terceiros".
- **Vance não ganhou bolha**: ele entra no slide 3, que ficou sem foto de fundo,
  e a bolha só existe sobre foto.

### Sanders e a Flock (TechCrunch, 02/10), 5 slides

Decisão: 3 passos (escala, detalhe, explicação), 26 fatos.

1. capa: "Bernie Sanders apresenta projeto que proíbe governo federal dos EUA de usar leitores de placas" (veio do reparo: a primeira versão não dizia o país e tinha 100 caracteres)
2. "A Flock tem mais de 120.000 câmeras e sua rede processa mais de 20 bilhões de leituras de veículos por mês, segundo Sanders."
3. "O texto abrange todos os sistemas de leitura automática de placas e não menciona especificamente a Flock." / "A proposta permite exceção para cobrança de pedágios e para usos aprovados pelo Congresso em legislação futura."
4. "Governos estaduais e locais perderiam subsídios de cinco departamentos federais a partir do primeiro ano fiscal após a promulgação, caso não proibissem a tecnologia." / "Americanos poderiam processar o governo federal por violações, e procuradores-gerais estaduais poderiam fazer cumprir a lei."
5. convite de assinatura

É o carrossel que mostra o método inteiro: escala com número exato e dono
("segundo Sanders"), o mesmo protagonista em quatro fotos diferentes, o texto
em caixa alta na metade de baixo, o convite no fim.

**Ressalva de método, importante:** as três fotos dos slides 2 a 4 foram
escolhidas pelo resolvedor de verdade com a conferência visual DESLIGADA,
porque o teto de custo do ensaio tinha sido atingido. A capa é a foto que a
produção já tinha aprovado e publicado para esta pauta. Em produção cada foto
de slide passa pela conferência, como a da capa. A foto do slide 2 (Sanders
pequeno num palco de ginásio) é a que a conferência provavelmente recusaria.

## 3. Manchetes de capa: antes e depois

As cinco foram reescritas com a regra nova a partir do pacote factual remontado
da fonte. As cinco passaram na forma (`conferirFormaDaHeadline`) e na
ancoragem determinística, sem número nem nome sem lastro.

| pauta | manchete publicada | manchete nova |
|---|---|---|
| Los Angeles | Eleitores de Los Angeles podem fazer história: Raman tenta derrotar Karen Bass em 3 de novembro | Nithya Raman lidera disputa em Los Angeles com 39%, e 33% dos eleitores seguem indecisos |
| Lilly | Pacientes com obesidade e diabetes perderam 23,3% com amilina e tirzepatide, contra 14,8% | Eli Lilly testa eloralintide com tirzepatide e registra 23,3% de perda de peso na Fase 2 |
| Camp David | Próximos passos da guerra no Irã e do conflito no Iêmen discutidos em Camp David | Principais assessores de Trump se reúnem por horas em Camp David sobre Irã e Iêmen |
| Sanders | Agências federais deixariam de usar leitores de placas em projeto apresentado por Sanders | Bernie Sanders apresenta projeto para proibir governo federal de usar leitores automáticos de placas |
| Burger King | Burger King quer vender cerca de 200 restaurantes a franqueados até o fim de 2026 | Burger King prioriza franqueados locais e planeja vender cerca de 200 restaurantes em 2026 |

O padrão: as antigas abriam pelo efeito, pela voz passiva ou pelo adjetivo
("podem fazer história"); as novas abrem pelo ator com verbo no presente e
fecham com o número. O gancho da legenda virou o lide inteiro; em Los Angeles,
o antigo era "A disputa em Los Angeles reflete mudanças na diversidade e na
política urbana dos Estados Unidos" (interpretação) e o novo é "Pesquisa de
setembro Berkeley IGS/L.A. Times mostra Nithya Raman com 39% entre eleitores
prováveis, contra 28% de Karen Bass; 33% seguem indecisos" (fato).

## 4. O que o ensaio mudou no código

- A régua de leitor exigia "quem" ou "você" no carrossel e o auditor recusava o
  "para quem pensa em viver em Los Angeles" que isso produzia: na notícia a
  relevância virou silêncio permitido.
- O resolvedor muta o conjunto de fotos usadas; passar o próprio conjunto fazia
  toda foto nova parecer repetida. Ele recebe cópia, com teste.
- Para os slides, a pergunta à conferência visual passou a ser o retrato do
  protagonista, e não a manchete: ela recusava toda foto de Trump que não fosse
  daquela reunião.
- Dois passos com seis fatos ou mais além do lide passaram a sustentar 5
  slides (Camp David saía com 3 tendo 15 fatos).
- O avatar da marca (`eua-journal-avatar.png`) ainda desenha ".usa"; o convite
  desenha o remetente em CSS.

## 5. Pontos abertos para o dono

> **Fechados em 06/10/2026.** Os quatro pontos abaixo e o avatar foram decididos
> pelo dono; as decisões estão em "As decisões do dono sobre o método", no
> `docs/decisoes.md`, e as amostras novas em `v2/` (capas com a marca do
> Instagram e o chapéu por tema, o carrossel do Sanders inteiro, o mesmo
> carrossel com uma foto faltando e o convite final). O texto abaixo fica como
> estava, como registro.

- **A régua de título do carrossel corta em 95 caracteres** (`HEADLINE_TOO_LONG`,
  do `leitor.ts`), mais curta que os 130 da capa de imagem única. Manchetes do
  método com 16 a 18 palavras passam disso e pedem reparo no carrossel.
- **Rotação das cinco formas do assunto**: hoje é só instrução, e o modelo
  prefere pergunta e número.
- **Fotos de slide com terceiros identificáveis**: aceitar, como o Not
  Journal, ou exigir retrato sem terceiros.

## 6. Custo

Estimado pela tabela de `calculateCost` (o mesmo cálculo dos relatórios de
custo do projeto), somando todas as chamadas à OpenAI deste ensaio:

| etapa | US$ |
|---|---|
| 10 assuntos | 0,12 |
| carrosséis: pacotes, copy, reparos, auditoria semântica e conferência das fotos, incluindo as rodadas que acharam os defeitos acima | 2,76 |
| 5 manchetes | 0,16 |
| **total** | **3,04** |

O teto era US$ 3. A conferência do teto é feita antes de cada chamada, e as
duas últimas manchetes passaram dele em uns 4 centavos. O render final das
duas peças não fez chamada nenhuma.
