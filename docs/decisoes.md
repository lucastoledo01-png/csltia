# Decisões do eua.journal

O que já foi decidido, por quê, e o que **não** refazer.

Este arquivo existe porque os outros dois não respondem à pergunta que causa
retrabalho. O `arquitetura.md` diz como o sistema é; o
`aprendizados-e-incidentes.md` diz por que algo quebrou. Falta o registro do que
foi **escolhido de propósito**, e que, sem registro, alguém desfaz achando que é
descuido.

Regra de uso: antes de mudar algo que parece estranho, procure aqui. Se a
decisão estiver registrada e você discordar, discuta com o dono. Se não estiver,
decida e acrescente.

---

## Produto e marca

**A publicação é sobre os ESTADOS UNIDOS, não sobre imigração.** Virada de
16/09/2026, decidida pelo dono depois de ler uma manchete sobre o visto de um
designer mexicano. Economia, trabalho, custo de vida, política, tecnologia,
cultura e cidades, com a imigração como UMA editoria entre elas, teto de uma
pauta de visto por edição.

O que mudou junto, porque prompt sozinho não muda produto: 10 das 13 fontes de
escritório de advocacia foram desligadas e 12 fontes americanas de economia,
política, tecnologia e sociedade entraram; as cinco editorias do classificador,
que eram todas de imigração, viraram oito; o briefing do banco perdeu a ordem de
preferência que ranqueava visto em primeiro lugar. **Não reverta uma dessas
partes sozinha:** com as fontes antigas de volta, nenhuma regra de texto segura
a pauta técnica, porque o sistema não escreve sobre o que não coleta.

**A marca é `eua.journal`**, desde 28/09/2026. A linhagem é `desbuguei.ia` →
`imigra.us` → `usa.journal` → `eua.journal`. A troca é de nome e de logotipo,
não de linha editorial: continua sendo notícia dos EUA para brasileiros.

**O Instagram é `@eua.journal`, nome de exibição "EUA Journal".** Perguntado à
Graph API em 28/09/2026:

```
username  eua.journal
name      EUA Journal
```

Isto já esteve escrito ao contrário em dois lugares, e o erro saiu publicado: o
`marca.ts` apontava para `@usa.journal.ai` e o `pack-de-linguagem.md` afirmava
que esse era o perfil verdadeiro. O handle é IMPRESSO na arte de todo post, no
rodapé da newsletter e no portal, então o valor errado foi ao ar em cada peça
até esta data.

Se a conta for renomeada de novo, três campos do `marca.ts` mudam juntos:
`instagram`, `instagramHandle` e `instagramNome`, mais o `handle`. E a
conferência é uma chamada à Graph API, nunca a memória de ninguém nem um
documento antigo.

**O logotipo** é o que o dono entregou em 05/10/2026, em duas versões
desenhadas: `public/marca/eua-journal-fundo-claro.png` ("eua" azul-marinho,
para fundo branco) e `eua-journal-fundo-escuro.png` ("eua" branco, para
azul-marinho e foto escura). O ".journal" é vermelho nas duas. Até essa data os
arquivos que o `marca.ts` apontava ainda desenhavam "usa.journal" com a
estrela, e a arte escrevia a marca em texto em quatro lugares. A regra é uma
só: quem desenha a marca usa a imagem, escolhida pela cor do fundo onde ela
fica, e o endereço sai de `MARCA.logoClaro` ou `MARCA.logoEscuro`. Os
arquivos `-alta` são o original sem margem, em resolução cheia, para quem
precisar refazer um tamanho.

**O domínio continua `casaloti.ia.br`**, por decisão do dono. É ele que serve o
site, as imagens do e-mail e o alvo do cron.

**`imigra.us` NÃO é o nosso site.** São 114 bytes de página de estacionamento do
registrador. Se alguém relatar "o site está sem notícia", conferir primeiro qual
endereço a pessoa abriu.

**O `slug` do projeto ainda é `desbuguei`.** É interno, não aparece para
ninguém, e trocar mexe em chave de idempotência e caminho de Storage. Fica.

## Cadência e canais

**O fim do e-mail tem UM convite, e é a análise de perfil.** Havia três blocos
disputando a mesma atenção: o "Giro rápido" repetindo fatos das pautas, a
análise de perfil e um convite para seguir o Instagram. O convite ao Instagram
oferecia o mesmo conteúdo em outro formato para quem tinha acabado de ler a
edição, e saiu. O Instagram vive no rodapé, como ícone mais o nome do perfil.
Desde 05/10/2026 o convite continua sendo um só, mas muda de formato a cada
edição: ver "O bloco do VisaMatch alterna de formato a cada edição".

**O `quick_bits` continua sendo gerado e não é mais renderizado.** O campo
alimenta o carrossel e o relatório. O que saiu foi a renderização, como já tinha
acontecido com "O que muda na prática".

**O título de busca do artigo é o `headline`, não o `subject`.** O assunto do
e-mail é escrito para dar vontade de abrir na caixa de entrada, com curiosidade
incompleta e caixa baixa. Isso é ótimo no Gmail e péssimo num resultado de
busca.

**Uma newsletter por dia.** Não é fio contínuo por e-mail: dezenas de disparos
queimariam a lista, e nem a referência faz isso.

**O CTA do Instagram oferece a NEWSLETTER; o do e-mail oferece a ANÁLISE DE
PERFIL. A divergência é deliberada**, decidida pelo dono em 17/09/2026, e não é
descuido de alguém que esqueceu de alinhar os dois.

O que muda entre os dois canais é quem está do outro lado. No Instagram a pessoa
ainda não assina, e o produto que se oferece a ela é a newsletter: até 17/09 as
quatro formas de CTA prometiam avaliação de perfil de imigração, o que
transformava um jornal em captação de lead em todo post. No e-mail a pessoa já
assinou, então pedir que ela assine não é oferta: a análise é a única coisa ali
que responde à pergunta que a levou a assinar, que é "eu consigo?".

Quem for alinhar os dois "por consistência" está desfazendo uma decisão, não
corrigindo um esquecimento.

**A mensagem que a pessoa recebe depois de comentar NÃO mora no repositório.**
Ela está na automação do OpenReply, e `garantirFunilPermanente` só fala com o
OpenReply quando `openreply_automation_id` é nulo: a automação é criada UMA vez e
nunca mais atualizada de cá. O cliente em `openreply-client.ts` tem GET de
disponibilidade e POST de criação, e nada mais.

Consequência prática, que já mordeu: mudar `prompt_campaigns.dm_message` no banco
não muda a DM. O registro no banco é a cópia intencionada; o que a pessoa recebe
é o que está no painel do OpenReply. Os dois só coincidem se alguém editar lá.

E NÃO tente forçar a recriação apagando `openreply_automation_id`: o OpenReply
recusa a segunda automação com a mesma palavra, e o resultado seria o funil
quebrado em vez de atualizado.

**O Instagram tem agenda própria** e não depende da edição passar. Ele roda
sobre o pool aprovado, ANTES da decisão da newsletter, e é por isso que os posts
continuam saindo em dias em que a edição é barrada.

**O portal tem a PAUTA como unidade**, não a edição. Quem procura "o que mudou
no H1B" precisa achar o assunto, e não um item chamado `edicao-2026-09-12`.

## Voz

**A publicação fala, não relata.** O nome tem "journal", o texto não tem. A
régua é conversa entre duas pessoas informadas: parágrafo de duas a quatro
linhas, frase curta alternada com uma que respira, segunda pessoa quando fizer
sentido, zero emoji e zero gíria no corpo. Vale igual para newsletter, artigo do
portal e Instagram, e no portal isso é automático: o artigo é a edição
regravada, sem chamada nova de LLM.

**O texto fala do FATO, nunca da reportagem.** "A fonte não informa", "não foi
detalhado" e "o G1 não diz" estão proibidos em qualquer campo. Isso não era um
descuido do modelo: eram nove instruções pedindo a frase, mais dois auditores
instruídos a tratá-la como desejável, mais o laço de reparo convertendo
afirmação sem lastro em ressalva. A exceção é uma por edição, quando a falta É a
notícia, e mesmo aí se escreve falando da divulgação: "a nova data ainda não foi
divulgada".

**Silêncio é resultado válido, e agora em todos os campos.** Era autorizado só
em `why_it_matters`. Sem essa autorização, tirar a ressalva deixaria o modelo
sem saída: completar a lacuna bloqueia por falta de lastro, e hedge bloqueia por
escopo.

**Português primeiro, sigla depois e só se ajudar.** Nome oficial de norma, de
processo judicial e de órgão em inglês não entra no corpo do texto. O caminho
preferido para jargão é TIRAR, não explicar; quando precisar explicar, é em
frase própria e falada, nunca em aposto no meio da frase.

**Negrito tem função.** Número, prazo, data e valor que decidem a notícia saem
em negrito, no máximo dois por parágrafo, marcados com dois asteriscos pelo
redator e convertidos no template. O leitor passa o olho antes de ler.

**Cada linha acrescenta, nenhuma repete a de cima.** O preheader não é resumo do
headline, e o summary não reescreve o title. Existe uma conferência
determinista que mede isso por CONTENÇÃO de palavras, não por Jaccard, e ela
gera apontamento de reparo, nunca bloqueio.

## Editorial

**O portão de alucinação não se afrouxa.** Fato inventado que chega à lista não
se desfaz com errata. Quando ele barra todo dia, o suspeito é o que alimenta o
texto, nunca o portão.

**A relevância pode ser vazia.** Nem toda pauta tem relevância com lastro. Uma
liminar que só diz "a medida está suspensa" não informa quem é afetado. Antes, o
vazio era apontado, o reparo insistia e a redação devolvia hedge, que o auditor
recusa: dois portões empurrando em direções opostas custavam o dia. A tolerância
é para o SILÊNCIO, não para a tentativa malfeita.

**A instrução nunca pede comportamento de pessoas.** A fonte fala de regra,
prazo e decisão, e não do que as pessoas acompanham, observam ou esperam. Pedir
isso fabrica, todo dia, a frase que a régua recusa.

**Um acontecimento, uma pauta por edição.** Os tetos de ator e de domínio não
pegavam três leituras do mesmo fato por veículos diferentes. Além da repetição,
um fato esticado em três matérias faz a redação enfeitar.

**O agrupamento é por SEMELHANÇA, não por igualdade.** A primeira versão
comparava impressão exata de ator, lugar e termo, e não agrupou nada: quatro
veículos sobre a mesma liminar escrevem palavras diferentes. A régua é o vetor
que já existe em `news_candidates.embedding`, com limiar de 0.70 entre as
pautas do mesmo dia. O número é medido, não escolhido: o mesmo fato por
veículos diferentes deu 0.89, 0.81 e 0.80, e o primeiro par de fatos distintos,
0.563. Não confunda com o limiar de 0.85 da repetição histórica: são perguntas
diferentes, e o mesmo dia repete muito mais que trinta dias.

**Google News é descoberta, nunca a fonte publicada.** Link de agregador não
resolve para o leitor. Resolver o link dele é engenharia reversa de endpoint
privado, e já foi medido: não vale.

## Visual

**Templates travados.** A LLM escreve o texto e nunca toca no layout. Não existe
decisão de layout por post.

**A manchete da capa tem forma, e a forma tem um lugar só.** De 6 a 18 palavras
e de 45 a 130 caracteres, em duas partes: o que é, com nome próprio ou citação,
e o que muda, com o detalhe que prova. A faixa saiu da medição das capas de
referência (11, 15 e 16 palavras) e da capacidade medida da arte nova, não de
gosto. Os números e o texto da regra vivem em `social/manchete.ts`, e os dois
prompts e a guarda leem de lá. Manchete de cinco palavras cabe em qualquer arte
e não diz qual regra, de quem, nem a partir de quando.

**O chapéu de editoria aparece sempre.** Com foto ou sem, peça única ou
carrossel. Ele ficava de fora na peça única com foto, herança do desenho
anterior, e é a linha que diz de que editoria é aquilo antes de o leitor ler a
manchete.

**A gramática dos posts é uma só:** foto sangrando colorida, marca no alto à
esquerda, chapéu de editoria e manchete em caixa alta no rodapé. A capa é a
mesma peça com a bolha por cima. As medidas vieram de medição das referências,
não de estimativa, e estão comentadas no CSS.

**A capa SEM foto é peça tipográfica, e não fallback quebrado.** Ela mede o
corpo do tipo no navegador e impede que "I-765" quebre no meio da linha. Não
troque por "fundo azul com a manchete em cima".

**A bolha é a vice-campeã do resolvedor**, que passou pelas mesmas barreiras da
vencedora. Nunca é a segunda da lista bruta, e nunca repete a foto de fundo.

**Estrutura da referência, identidade nossa.** Copiar a gramática do formato é
normal. Copiar logotipo, recorte circular com anel colorido e a cor de acento de
outra marca cria risco jurídico e faz o produto parecer clone.

## Infraestrutura e método

**Deploy só conta quando o processo nasce DEPOIS do clone.** O EasyPanel mantém
o contêiner anterior quando o build falha, e o site segue respondendo 200 com
código velho. Código novo no disco não prova nada.

**`npm run build` antes de todo deploy.** O `vitest` passa e o `tsc` avulso não
enxerga o projeto inteiro; quem roda o type check completo é o `next build`.

**Nunca filtre a saída de um verificador pelos arquivos que você mexeu.** Foi
assim que um build quebrado foi para produção: os dois erros estavam em arquivos
que eu não tinha tocado e por isso não apareciam no meu grep.

**O build na VPS não tem as variáveis do banco.** Página que depende de dado é
dinâmica, ou nasce vazia a cada deploy.

**Diagnóstico vai para o banco, não para o log.** O usuário `deploy` não está no
grupo `docker`, então log de contêiner é inalcançável. Portão que decide não
publicar grava POR QUE, com o texto na mão, e a linha de falha carrega os
contadores do funil.

**Skill de terceiro: fixe o commit, leia todos os arquivos, desconfie de
descrição larga.** O instalador oficial busca da branch `main` no momento da
instalação, então auditar e instalar viram conteúdos diferentes. Detalhes em
`.claude/skills/PROCEDENCIA.md`.

## O dia deixou de ser só reativo (16/09/2026)

A coleta lê 55 fontes e responde uma pergunta só: *o que estas publicações
publicaram?* Isso deixa dois buracos, e os dois são de tempo.

**O futuro.** A Black Friday é daqui a três semanas e nenhuma fonte escreveu
sobre ela ainda. Quando escreverem, faltarão dois dias. Quem sabe a data é o
calendário, e ele sabe hoje. `editorial/calendario.ts` gera de 84 a 92 datas
por ano, por REGRA e não por tabela, para os Estados Unidos e para o Brasil,
válido de 2026 a 2030 e além. Só vira tabela o que não tem regra: as reuniões
do Fomc, copiadas do Federal Reserve, e os grandes eventos já marcados.

**O agora.** O assunto do país pode não estar em nenhuma das 55.
`editorial/tendencias.ts` lê Google Trends (EUA e Brasil), os mais lidos da
Wikipédia e a capa do Hacker News. Reddit ficou de fora: devolve 403 sem
autenticação, medido.

Os dois viram fonte de busca no Google News, em `editorial/busca-dinamica.ts`,
para atravessarem a MESMA coleta, deduplicação, classificação e guarda. Nada
disso publica nada; só abre a porta.

Três coisas que custaram medida e não podem ser desfeitas por engano:

- **Tendência crua é quase toda esporte e celebridade.** Medido em 16/09/2026:
  o Google Trends dos EUA trazia "barca game", "aaron judge" e "man u" entre os
  dez primeiros. Por isso existe a triagem, e por isso ela devolve VAZIO quando
  falha: passar o cru adiante pagaria classificação por placar de jogo.
- **O relatório de emprego NÃO sai na primeira sexta do mês.** A regra do BLS é
  a terceira sexta depois do fim da semana que contém o dia 12 do mês de
  referência. As duas coincidem na maioria dos meses, e é por isso que a lenda
  sobrevive. Conferido contra o feed oficial: agosto de 2026 saiu em 4 de
  setembro.
- **A Black Friday não é a última sexta de novembro.** É o dia seguinte à
  QUARTA quinta-feira. Em anos com cinco quintas em novembro, a regra popular
  erra por uma semana.

## Uma pauta ruim não derruba mais a edição (16/09/2026)

Entre 04/09 e 16/09 a redação rodou 13 manhãs e publicou 5. As de 13, 14 e 15
morreram inteiras, e no dia 16 três execuções morreram antes de a quarta
passar. O motivo estava sempre na mesma linha: o portão reprovava a EDIÇÃO
quando UMA conclusão de UMA matéria não se sustentava no pacote factual.

Seria defensável se o juiz fosse determinístico. Ele não é: quem decide é um
modelo, e o mesmo texto reprovava numa chamada e passava na seguinte.

A troca é de escopo, não de rigor. A matéria sem lastro continua não sendo
publicada; ela é que sai, e não a edição. Abaixo do mínimo de pautas a edição
continua não saindo, porque aí o problema é do dia. E auditoria que NÃO RODOU
deixou de bloquear: timeout da OpenAI não é conclusão reprovada.

## A marca do topo escolhe a versão pelo brilho da foto (16/09/2026)

O logotipo tem o "usa" em branco, desenhado para foto escura, e em céu claro
ele sumia: a peça saía com meia marca, só o ".journal" vermelho.

Não dá para resolver escrevendo código: quem decide é a foto que o resolvedor
achou naquele dia. Então a decisão é medida no navegador, com a peça montada.
O script recorta o pedaço da foto que fica ATRÁS do logotipo, respeitando o
`cover` (a imagem quase nunca tem a proporção da peça, então o canto do arquivo
não é o canto da peça), reduz para 24 por 12 pixels e tira a luminância média.
Acima de 0.62, troca para a versão de tinta escura.

Medido em fotos reais, com o mesmo recorte da peça:

```
Fed, céu de fim de tarde     0.661   marca clara
Boston, céu branco           0.948   marca clara
Manhattan à noite            0.093   marca escura
```

Três defeitos apareceram no caminho, e os três são do tipo que não dá erro:

- **O template literal comeu as barras da expressão regular.** O script mora
  dentro de crases, e o literal processa escapes antes de a string existir:
  `\(` chegou ao navegador como `(`, a busca pela URL da foto passou a devolver
  vazio, e a medição nunca rodou. Sintoma: marca sempre escura.
- **O logotipo ainda não tinha carregado na hora de medir.** Um `img` sem
  carregar tem altura pelo CSS e largura ZERO, então o recorte tinha zero
  pixel. Só aparecia no render frio: no segundo, o arquivo já estava em cache.
- **A falha era silenciosa.** Passou a gravar `data-brilho` e `data-erro` na
  peça, porque sem eles canvas marcado, expressão quebrada e largura zero são
  o mesmo sintoma.

Existe validador: `npx tsx src/scripts/validar-marca-contraste.ts` renderiza as
três fotos com a foto embutida como data URL, igual à produção, e exige que a
peça tenha MEDIDO, não só acertado. Acertar por acaso não conta, porque a marca
escura é o padrão e uma peça que nunca mediu nada acerta toda foto escura.

## Nenhuma peça convida a arrastar (16/09/2026)

O convite existiu, com um argumento razoável: a peça de várias telas precisa
dizer que tem várias telas, e os pontos do Instagram são pequenos. O argumento
perdeu para a evidência.

Foram baixadas quatro capas de carrossel reais de @notjournal.ai e
@braziljournal, as duas referências do produto. **Nenhuma das quatro traz
convite.** A referência de recorte enviada pelo dono, um post do Tallis Gomes,
também não traz. O que as quatro têm é logotipo, chapéu de editoria e manchete.

O leitor de Instagram já sabe arrastar. A linha gastava espaço para ensinar o
que ninguém precisa aprender, e é o tipo de detalhe que denuncia peça feita
para performar em vez de informar.

Saiu das três gramáticas de notícia: capa de jornal, capa sem foto e recorte.
Continua viva na variante `result_showcase`, que é dos formatos de tutorial e
de prompt, e ali a linha promete um conteúdo, não ensina a arrastar.

## A bolha da capa tem régua própria (16/09/2026)

A bolha é o círculo com a segunda foto. Duas regras novas, pedidas pelo dono:

- **Identidade, não relevância.** O fundo pode ser a cena; o círculo precisa
  mostrar quem ou o que a pauta cita. Uma foto sem nenhuma correspondência de
  entidade soma 55 pontos, acima do piso de 45 do fundo, e virava o círculo. O
  piso de identidade (38, que é 85 por cento do peso de entidade) barra isso
  sem mexer no piso do fundo.
- **Ritmo, não disponibilidade.** Recurso que quebra padrão só funciona
  enquanto for exceção. Depois de uma capa com bolha vem uma sem, mesmo que a
  segunda foto exista. O estado vem do feed, não da leva, senão duas capas com
  bolha se encostam na virada do dia.

ATUALIZADO em 06/10/2026: a bolha nunca cobre rosto, e a alternância virou
alvo. Ver "A bolha não cobre rosto, e a vez dela passa adiante".

## Nenhuma imagem vai ao ar sem alguém ter olhado para ela (17/09/2026)

Decidido pelo dono depois de dois posts agendados com imagem incoerente: "é uma
automação 100%, então um erro vai para o ar". A régua de imagem passou a ter
quatro camadas, e a quarta é de natureza diferente das outras três.

**As três primeiras leem texto.** Relevância compara nome de entidade com nome
de arquivo, temporalidade compara data, e o detector de polaridade compara
palavra com palavra. Todas perguntam "há indício de que esteja errado?" e
**aprovam no silêncio**.

**A quarta abre a imagem.** Uma chamada de modelo recebe a foto e a manchete,
descreve o que vê e decide. Ela pergunta "o que você vê, e isso sustenta esta
manchete?" e **recusa no silêncio**.

A inversão é o ponto. Não adianta somar barreiras que aprovam por omissão: três
delas de olhos fechados continuam sendo zero conferência sobre o conteúdo da
foto.

**O que isso NÃO custa.** Não custa post. Nenhum guard do Instagram lê essas
notas, e o número de posts do dia vem de `SOCIAL_POSTS_MAX_PER_DAY` com o
evergreen preenchendo o que a notícia deixou. Recusar imagem errada troca a foto
pela bandeira, que é peça publicável (SUPERADO em 05/10/2026: a pauta sem foto
não vira post; ver "Pauta sem foto não vira conteúdo"). O que cai é a fração de posts ilustrados
pelo próprio assunto, e o bloco de foto da newsletter, que exige status
aprovado.

**O piso de confiança é 70, e é assimétrico de propósito.** Recusar imagem boa
custa uma bandeira. Aprovar imagem errada custa um post no ar afirmando
visualmente algo que não aconteceu, num perfil que publica sozinho. Os dois
erros não têm o mesmo preço.

**Falha de conferência é recusa, nunca passe livre.** Sem chave, com a rede fora
ou com resposta ilegível, a saída é a bandeira. O motivo gravado separa
"recusada porque estava errada" de "recusada porque não deu para conferir", que
pedem providências diferentes.

**Sigla de PROGRAMA não vira entidade visual; sigla de ÓRGÃO vira.** "PERM",
"EB-2 NIW" e "I-485" nomeiam procedimento, e procedimento não se fotografa: no
Wikidata eles encontram homônimo. "ICE", "USCIS" e "DOL" são instituições com
fachada e acervo. A diferença está no formato, e há teste com os 27 códigos do
catálogo de um lado e as siglas de órgão do outro.

**País fora da cobertura é VETO, não desconto.** A penalidade de pontos existia
para desempatar dois candidatos; quando o homônimo estrangeiro é o único, ela
vira pedágio que ele paga e segue. Foi assim que a cidade de Perm ganhou por
cinco pontos de um limiar.

**Os gatilhos do banco conceitual vêm nos dois idiomas.** O casamento roda sobre
o título da FONTE, e fonte americana escreve em inglês. E o casamento é por
INÍCIO DE PALAVRA, não substring: "ice" casava dentro de "justice" e "police".

## O recorte entra no feed, e quem decide é o eixo (18/09/2026)

O `recorte_post` estava pronto, testado e renderizável desde 16/09, e **nunca
desenhou uma peça**. Nenhum ponto da produção passava a gramática, o padrão era
`"jornal"`, e o único chamador era o script de preview. Faltava a decisão de
quando ele entra, que é de produto e não de código.

**O eixo decide.** Custo de vida, trabalho, cultura e tecnologia chegam como
leitura da realidade, e o recorte serve isso porque ele é uma fala. Política,
segurança, imigração e economia afirmam um fato com data e efeito, e pedem a
peça que afirma. Sem eixo reconhecido, jornal.

**A alternância é a rede, e não há sorteio.** Teto de dois recortes seguidos,
contado a partir do fim do FEED e não do começo da leva, senão três se
encostariam na virada do dia. Sorteio foi recusado pelo mesmo motivo que em
todo o resto do projeto: um dia com seis recortes seguidos seria
indistinguível de defeito.

**O recorte EXIGE foto**, e isso foi descoberto renderizando, não lendo. O
`.r-texto` é faixa fixa de 76% da altura com o tipo travado em 46px, e nada faz
o texto crescer: um gancho de 65 caracteres sem foto deixa dois terços da peça
em branco. Havia um comentário afirmando que sem foto "o corpo do tipo cresce".
Não cresce, e o comentário foi corrigido. Sem foto quem desenha é a capa
tipográfica do jornal, que MEDE o texto no navegador e enche o canvas.

**O corpo do recorte é o `gancho` da copy.** Medido em 25 peças reais: 24 cabem
no orçamento com foto. `fato_principal` não serve, estoura.

**A gramática é gravada, nunca deduzida.** `content_json.arte.gramatica` guarda
a decisão e `arte.variante` guarda o desenho, e a conferência da publicação
compara os dois. Deduzir do eixo na hora de conferir recusaria exatamente a
peça que caiu para jornal por não caber, que é a peça que fez a coisa certa.

Quem calcula a gramática efetiva é `gramaticaEfetiva`, em `social/arte.ts`, e
ela é UMA função com três chamadores: o desenho, o store e o ritmo. Já houve
a versão com três cópias da mesma regra, e custou vinte minutos de diagnóstico
num post que estava correto.

## A cena da foto sai do CONTEÚDO, e não de uma lista (18/09/2026)

São dois caminhos, e a diferença é do dono, que a nomeou melhor do que o código
nomeava.

**Com entidade nomeada** (Trump, a USCIS, o Fed, a Suprema Corte), o sistema
resolve a entidade no Wikidata e busca a foto DAQUELA coisa no Commons. Isso
estava certo e não mudou.

**Sem entidade nomeada**, o sistema desistia de olhar a matéria e caía numa
lista de 16 temas escritos à mão, casados por radical de palavra, na ordem,
primeiro que casar vence. A frase do dono é o diagnóstico:

> "compradores de imóvel ganham margem não tem entidade fotografável, isso está
> errado, porque existe um objeto que contextualiza com o conteúdo"

Tinha casas. Tinha imóveis. A lista é que não sabia.

**Três defeitos, medidos, e os três são do MÉTODO:**

- Um radical errado derruba tudo. O tema de moradia tinha `imovel`, a manchete
  dizia `imóveis`, e `imovel` não é prefixo de `imoveis`: o L quebra.
- A ordem rouba. Moradia é o penúltimo dos 16. "Aluguel pesa mais no orçamento
  e pressiona a economia" foi para notas de dólar, porque `economia` vem antes.
- São 16 gavetas para o mundo inteiro. Robotáxi, controlador de voo e dado do
  Census não têm gaveta, e caíam todos no mesmo skyline genérico.

**Agora o sistema pergunta.** Ele já fazia uma chamada de modelo para CONFERIR
a imagem; passou a fazer uma para DESCREVER o que fotografar. Medido nas pautas
reais do dia:

```
controlador de voo   antes: city skyline      agora: airport control tower exterior
robotáxi em Nevada   antes: city skyline      agora: autonomous vehicle city street Nevada
imóveis              antes: city skyline      agora: suburban houses for sale street
renda desigual       antes: banknotes         agora: mixed income neighborhood houses
```

**Os 16 temas continuam, como rede.** Chamada que falha cai neles, que é o
comportamento de antes, e não no vazio.

**Duas proibições, do dono, com essas palavras: "nunca pessoa identificável nem
texto na imagem".** Elas moram em três lugares de propósito: na instrução, numa
lista que filtra a resposta do modelo, e na conferência visual que abre a
imagem. Pedido não é garantia, e a régua tem que estar dos dois lados.

Pessoa anônima ilustrando "compradores de imóveis" é escolher alguém para
representar um grupo, e em "brasileiros nos EUA" seria inferir nacionalidade
por aparência. Texto na foto compete com a manchete, que já é o texto da peça.
Gente pequena ao fundo compondo uma rua não é recusa; rosto reconhecível é.

## O banco de imagens próprio (29/09/2026)

A decisão do dono: o acervo passa a ser **nosso**, e é a primeira fonte que a IA
consulta. Banco de terceiro vira exceção, não padrão. O motivo é controle: com
acervo próprio, a IA não encontra imagem que a gente não queira.

**A ordem de busca, e ela tem uma inversão que importa:**

| situação | de onde vem a imagem |
|---|---|
| Entidade nomeada e o acervo tem | acervo |
| Entidade nomeada e o acervo **não** tem | fontes externas |
| Sem entidade nomeada | acervo, pela tag de cena |
| Sem entidade e a cena também vazia | fontes externas |
| Nada em lugar nenhum | capa tipográfica |

**A cena só é consultada depois de a entidade falhar nos dois lados.** Se
invertesse, uma pauta sobre um produto novo acharia uma foto genérica de
"tecnologia" no acervo, ganharia ali, e nunca sairia para buscar a foto do
produto. O genérico mascararia a falta do específico, e é justamente em
lançamento e novidade que o acervo não vai ter.

**A busca é por TAG, não por vetor.** A primeira proposta foi vetor sobre a
descrição da imagem; o dono apontou que tag é mais simples, e está certo: é
exata, é de graça e dá para depurar olhando a linha. O vetor fica para quando
o acervo for grande o bastante para precisar distinguir duas fotos dentro da
mesma tag.

O que torna a tag confiável aqui, e não tornava nos 16 temas conceituais, é
QUEM escolhe: `cena-da-pauta.ts` já chama um modelo que lê a matéria, e ele
passa a devolver também a tag, escolhida de uma lista fechada. Modelo
escolhendo de cardápio é confiável; lista de palavras adivinhando pelo título
não é, e foi assim que `ice` casou dentro de `justice` e `imovel` não casou com
`imoveis`.

**A conferência visual continua valendo só para o que vem de fora.** Imagem do
acervo foi conferida na entrada e não é reaberta a cada uso. É o que faz o dia
comum não gastar chamada de modelo nenhuma no ramo visual, e mantém a barreira
exatamente onde ela é necessária, que é quando entra imagem desconhecida.

**As travas de licença saem, o registro fica.** Decisão do dono: `rights_status`
deixa de barrar publicação. O campo continua sendo gravado, porque anotar de
onde a imagem veio custa zero e é o que permite responder se alguém perguntar.

**Onde o arquivo mora:** o derivado de 2160x2880 fica no Storage do Supabase,
em bucket próprio, separado do `public_assets` das artes publicadas, que são
descartáveis e o acervo não. O original em resolução cheia fica no Drive e o
sistema nunca o lê. A linha grava em qual repositório o arquivo está, para a
mudança de casa lá na frente ser uma cópia mais um update, e não uma reescrita
do resolvedor. O ponto de virada é por volta de 2.500 imagens, quando o
derivado passa de 3,5 GB.

**O nome do arquivo é o metadado.** `grupo-pais-assunto-detalhe-numero.jpg`. A
ingestão lê e grava a tag e o país sem ninguém preencher formulário. O que NÃO
entra no nome é tom (claro ou escuro) e orientação: os dois são medidos nos
pixels com precisão maior que a do olho, e escrever à mão cria contradição
entre o nome e o arquivo.

**A régua de país vale para cena e lugar, não para pessoa.** Retrato é da
pessoa, onde quer que tenha sido feito. Cena de terceiro país é recusada.

**O que falta no acervo vira lista de compras.** Toda tag pedida e não atendida
é gravada. Em uma semana isso é a lista de produção ordenada por frequência, e
não um chute sobre o que fotografar.

### Os números que dimensionam o acervo

Medidos em 29/09/2026, no banco de produção:

```
consumo          3,3 posts/dia no Instagram mais as pautas da newsletter,
                 algo em torno de 6 imagens distintas por dia
janela           30 dias (EDITORIAL_JANELA_IMAGEM_DIAS)
minimo           6 x 30 = 180 imagens para nunca repetir dentro do mes
```

Distribuição das 396 pautas aprovadas em 45 dias: tecnologia 31%, economia 16%,
política 16%, custo de vida 14%, Brasil 10%. Por isso a profundidade do acervo
é proporcional, e não uniforme: tecnologia precisa de duas a três fotos por
cena, e `religiao` ou `militar` precisam de uma.

A lista de produção tem 746 cenas em 40 grupos, e está no guia do designer.

### Como entrou no código (05/10/2026)

**Atrás da capacidade `acervo`**, em `settings.capacidades` do projeto: não
declarada é `off` e o resolvedor nem sabe que o acervo existe; `dry_run`
consulta, anota o que escolheria e grava a lista de compras sem decidir a foto;
`enforce` manda. O código mora em `src/lib/server/visual/acervo/`.

**O cardápio é provisório.** O guia do designer não está no repositório, então
`catalogo-de-cenas.ts` foi derivado das editorias e da distribuição das pautas:
42 grupos, cerca de 190 cenas. Quando o guia chegar, é esse arquivo que muda. A
tag é `grupo/assunto`, os dois primeiros campos de conteúdo do nome do arquivo.
Retrato (`pessoas`) fica fora do cardápio: pessoa só sai do acervo pela
entidade, com o nome no campo `assunto`.

**A última linha da tabela ainda é a bandeira**, não a capa tipográfica. O
resolvedor continua devolvendo a bandeira com `NO_VALID_IMAGE` (regra de
17/09/2026, "nenhuma peça sem imagem"), e trocar isso é decisão de arte e de
newsletter, que lê o mesmo campo. Fica em aberto para o dono.
FECHADO em 05/10/2026: pauta sem foto não vira conteúdo, e a bandeira deixa de
ser publicada. Ver "Pauta sem foto não vira conteúdo".

**Imagem resolvida uma vez por pauta**: `imagemDaPauta`, com memória no
processo e a tabela `imagem_da_pauta` para o worker reusar o que o web
resolveu. Só com `enforce`.

## Imigração sai da pauta (05/10/2026)

A decisão do dono: o eua.journal não fala de imigração. O leitor é o
brasileiro que SONHA com os EUA (pensa em morar, trabalhar ou investir lá), e
não quem já mora. A linha é notícia positiva dos EUA e notícia ruim do Brasil,
aproveitando o que está em alta.

**O eixo `imigracao` fica, e é ele que recusa.** O classificador continua
rotulando a pauta de visto como `imigracao`, e `decidirPauta` recusa com
`REJECT_IMMIGRATION_OFF_LINE` antes de olhar país ou nota. Tirar o eixo seria
pior: a notícia de visto cairia em `politica` e passaria. Vale o booleano OU o
eixo, porque o modelo às vezes marca um e esquece o outro.

**O que mudou junto:** o verificador do Instagram recusa pelo mesmo motivo; a
triagem de assuntos em alta deixou de aprovar imigração; o boletim de vistos e
o registro do H-1B saíram do calendário; o teto de imigração no feed caiu de 3
para 0; as editorias do portal viraram Economia, Trabalho, Tecnologia, Custo de
vida, Política e Brasil; e "morar nos EUA" deixou de marcar o post como
imigração nas hashtags.

**O que mora no banco**, e por isso está em `supabase/2026-10-05-sem-imigracao.sql`
para o dono rodar: o nicho e o briefing editorial do projeto, o evergreen
desligado (os 66 temas do catálogo são todos de imigração) e as quatro fontes
ativas dedicadas a imigração. Nada foi apagado.

## Três ramos, e nenhum herda o texto do outro (05/10/2026)

A decisão do dono: a newsletter deixa de ser a mãe dos outros canais. Até aqui
ela compunha primeiro, o portal publicava o HTML do e-mail como artigo, e o
agendador legado do Instagram fazia um post por pauta da edição.

**O que é comum aos três:** coleta, classificação, pacote factual e resolução
de imagem. **O que é de cada ramo:** seleção, redação, auditor, arte e fila. A
mesma pauta pode sair nos três canais; o que é proibido é repetir DENTRO do
canal. O código está em `src/lib/server/ramos/`.

- **Newsletter:** de 2 a 4 pautas com pacote factual, nenhum acontecimento
  repetido (cosseno abaixo de 0.70, conferido de novo na saída), voz de
  e-mail no formato "The News".
- **Portal:** até 3 matérias por dia, de qualquer pauta aprovada com pacote,
  inclusive as que a newsletter não levou. Uma matéria por pauta, escrita como
  matéria de busca, com auditor próprio. Nasce `scheduled` e `needs_review`
  com o horário em `published_at`, e só vira `published` quando alguém aprovou
  E o horário chegou (`/api/cron/portal`, nos horários 06:07, 12:00 e 18:00).
- **Instagram:** até 5 posts sobre o pool mais as candidatas extras (perfis de
  referência e fontes do feed), evergreen desligado, voz de Not Journal e
  Brazil Journal.

**O pacote factual é a única matéria-prima.** Pauta sem pacote não é escolhida
por ramo nenhum: o texto cru da fonte não chega a redator nenhum.

**Nota baixa de QA vira aviso; risco de alucinação continua bloqueando
sozinho.** Fecha a divergência registrada em 18/09: o piso de 85 sai do portão
e vai para a peça, onde quem aprova vê. As duas ancoragens e o risco de
alucinação não mudaram.

**Tudo atrás de `settings.capacidades.ramos`.** Não declarado é `off`, e `off`
é o fluxo de antes. Em `dry_run` os ramos rodam e gravam diagnóstico em
`platform_events` (`ramo_veredito`, `ramo_custos_do_dia`), e quem publica é o
fluxo de antes. Os ramos só mandam com a guarda também em `enforce`.

**As instruções passam por `instrucaoDaEtapa`**, em `src/lib/server/instrucoes.ts`,
que hoje devolve o texto do código e amanhã lê a versão editável do banco.
## Produção na véspera e cadência do projeto (05/10/2026)

O PRD do MVP, validado pelo dono, muda o relógio: produção de segunda a quinta
às 17:00, tudo do dia seguinte; aprovação à noite; publicação de terça a sexta
nos horários de cada canal (newsletter 06:07; portal 06:07, 12:00 e 18:00;
Instagram 08:00, 11:22, 14:45, 18:07 e 21:30).

**Dia, horário, volume e fonte são configuração do PROJETO**, em
`projects.settings.cadencia`, nunca código nem ambiente (RNF-08). Quem lê é
`cadencia.ts` (`cadenciaDoProjeto`, `horariosDoPortal`, `agendaDoPortal`...), e
projeto que não declara nada recebe exatamente a tabela do PRD. Campo declarado
e inválido cai no padrão DAQUELE campo, com aviso no painel: lista vazia de
horários faria o dia sumir em silêncio.

**A troca é por capacidade, `producao_vespera`, e só `enforce` muda o dia.** Em
`enforce` a rota das 17:00 produz e a das 06:03 cede; em `dry_run` a das 17:00
ensaia e a das 06:03 continua publicando; ausente ou `off`, nada muda. O social
ainda lê ambiente, então a cadência chega a ele como ambiente montado na hora
(`ambientePelaCadencia`), e só na produção da véspera.

**Todo dia de produção deixa linha em `newsroom_runs`**, inclusive "capacidade
desligada" e "não é dia de produção". A produção confere se a linha existe no
fim e grava uma de garantia se não existir, em vez de confiar que cada caminho
da redação grava a sua.

**O que vai ao ar na hora certa é de três mecanismos, e só um é novo:** o
Listmonk dispara a campanha agendada (`send_at`), o worker publica o post pelo
`scheduled_at`, e `publicacao-agendada.ts` vira a edição `approved` e o artigo
`scheduled` em `published` quando a hora chega.

**A instrução editorial é editável, o contrato não (RF-26).** Os prompts foram
cortados em julgamento editorial (editável no painel, versionado, com volta) e
contrato de saída (campos do JSON, tetos da guarda, assinatura), que fica no
código. Com a capacidade `instrucoes` fora de `enforce`, os prompts saem byte a
byte como antes; isso foi conferido por snapshot dos seis prompts antes e
depois do corte.
## A fila de aprovação e o portão de publicação (05/10/2026)

O MVP põe uma pessoa entre a pauta e o ar (RF-20 a RF-29). O código está em
`src/lib/server/aprovacao/`, as tabelas na migration
`20261005120000_fila_de_aprovacao.sql`, e a tela em `/admin/<projeto>/aprovacao`.

**Uma função decide se uma peça sai: `decidirPublicacao`, em `portao.ts`.** O
worker do Instagram, o disparo da newsletter e a publicação do artigo
perguntam a ela, e quem grava `scheduled` também (`statusDeEntradaDoPost`,
`tentarLiberar`, em `fila.ts`). É a lição da "mesma regra em
três cópias": antes, três escritores de `social_posts` eram três decisões de
publicar.

**A aprovação é da VERSÃO, não da peça.** Cada linha de `aprovacoes` guarda o
SHA-256 do que vai ao ar (legenda mais o hash de cada arquivo congelado; assunto
mais HTML; título mais HTML). O worker pergunta duas vezes: antes de reivindicar
a vaga, com o manifesto, e depois de baixar os arquivos, com os bytes. Mudou
depois de aprovado, não sai.

**Peça segurada não é falha.** O worker devolve o post para `draft` com o motivo
do portão em `error_message`, e não marca `failed`. Ficar em `scheduled` faria
cinco posts esperando aprovação bloquearem os aprovados, porque `findDuePosts`
pega os cinco mais antigos.

**O interruptor é `settings.capacidades.aprovacao`, sem fallback de ambiente.**
Ausente vale `off`, que é publicar como antes. `dry_run` registra a fila e só
escreve no log o que seria segurado. `enforce` segura. Manual ou automático é
por ramo, em `settings.aprovacao.<ramo>`, e só a sessão do painel troca. Nem o
automático aprova peça com aviso de QA.

**O carrossel de campanha do Sistema PROMPT continua gravando `scheduled`
sozinho**, porque está congelado. Ele é barrado no worker, e há teste das três
origens. O caminho legado e a campanha geram a peça na hora de publicar, então
não têm versão para aprovar: com a fila em `enforce`, quem publica é o Social V2.

**A refação é por etapa, e os ganchos começam vazios.** Reprovar a imagem chama
imagem e arte, nunca o texto; a terceira reprovação descarta. As funções de
cada etapa existem, mas pedem a pauta avaliada inteira, que não está gravada na
linha do post. Até alguém registrar o gancho em `GANCHOS_DE_PRODUCAO`, a peça
reprovada fica em `refazendo` com o motivo no painel.
ATUALIZADO em 06/10/2026: toda etapa de todo ramo tem gancho, e a refação
roda fora do clique. Ver "A refação completa, por peça e por canal".

**Regra fixa só com o dono.** O mesmo erro três vezes, na mesma etapa, vira
PROPOSTA em `regras_propostas`. Só a aprovada entra no bloco "não repetir"
de `errosRecentesDaEtapa`, que é a função que os redatores chamam.

## As ligações entre as frentes (05/10/2026)

As cinco frentes do MVP deixaram pontos de encaixe vazios de propósito, para
não brigarem pelos mesmos arquivos. A integração os preencheu, e cada ligação
continua atrás da capacidade da frente dona: com todas desligadas, o dia é o
de antes.

**Uma foto por pauta, em todos os canais.** A newsletter, o post e a capa da
matéria do portal resolvem a imagem por `imagemDaPauta`. Com o acervo fora de
`enforce` ela é repasse direto ao resolvedor; em `enforce`, a mesma pauta ganha
a mesma foto nos três canais e o acervo não queima duas fotos para um fato.
`capacidadeDoAcervo` virou `resolverCapacidade("acervo", () => "off", ...)`.

**Os perfis de referência entram pelo ciclo de verdade, e só por ele.** O cron
das 06:03 e a produção da véspera passam `candidatosDosPerfisDeReferencia` ao
pool do Instagram (`ligacoes-do-ciclo.ts`). O ensaio da véspera não passa:
seria uma segunda rodada de leitura no mesmo dia.

**Peça do ramo entra na fila pela linha da tabela, uma vez.** `aoProduzirPeca`
leva a matéria do portal e o post à fila pelo id da linha, com o hash lido da
linha pelo mesmo adaptador do portão. Peça que já está na fila não é tocada:
um hash diferente a devolveria a `aguardando` e apagaria uma aprovação. A
newsletter fica de fora desse caminho porque a redação já a enfileira com o
resumo completo. A entrega das matérias passou para DEPOIS do upsert em
`articles`, senão a linha ainda não existe.

**Um portão para o portal.** Os três caminhos que põem matéria no ar
(`/api/cron/portal`, `/api/cron/publicacao` e a liberação da fila) perguntam a
`decidirPublicacao` quando a fila não está em `off`, com o mesmo hash. A edição
só aparece no portal com a newsletter dela aprovada, porque é o mesmo assunto e
o mesmo HTML. O hash do artigo passou a incluir a capa (só quando há capa, para
o hash antigo não mudar), porque a refação de imagem troca só ela.

**Matéria aprovada antes da hora espera a hora.** A liberação da fila já
respeitava `publicar_em`; o despacho do artigo agora também respeita o
`published_at` da linha, e matéria com horário futuro fica `scheduled` com a
revisão aprovada, para o relógio do portal publicar na hora. Despachar o que o
relógio já publicou é sucesso, e não alerta a cada minuto.

**A hora da newsletter na fila é a da cadência.** Com a produção na véspera, a
fila recebe a data da EDIÇÃO e os horários de `agendamento`, os mesmos que o
Listmonk e o artigo recebem. Sem véspera, vale `settings.aprovacao`, como era.

**A memória de reprovação entra nos três redatores.** O bloco de
`errosRecentesDaEtapa(projeto, "texto")`, que já inclui as regras fixas
aprovadas pelo dono, vai no fim da voz da newsletter, do artigo e do post, só
com a fila fora de `off`.
ATUALIZADO em 06/10/2026: o bloco é do CANAL, e não mais um só para os três.
Ver "O aprendizado da fila, por etapa e por canal".

**Refação ligada onde há o que refazer.** Texto e imagem do artigo (a pauta e
o pacote factual passaram a ser gravados no `resumo` da fila, em
`origemDoArtigo`), imagem e arte do post de peça única (lidas da própria linha).
Seleção, texto do post, newsletter e carrossel continuam sem gancho, com o
motivo em `ganchos-de-producao.ts`: cada um pediria um segundo gerador fora do
gerador.
ATUALIZADO em 06/10/2026: ligados todos, ver "A refação completa, por peça e
por canal".

**A home mostra a matéria do portal.** Com os ramos em `enforce`, a home junta
as matérias publicadas às pautas das edições, mais recente primeiro, sem o
artigo que é a própria edição e sem a pauta da edição cuja fonte já tem matéria
própria.

## Sem a fila em enforce, a matéria do portal sai no horário (05/10/2026)

Achado depois da integração. A matéria do ramo nasce `scheduled` e
`needs_review`, e os dois relógios (`/api/cron/portal` e
`/api/cron/publicacao`) exigiam `approved`. Quem grava `approved` é a liberação
da fila (`despacharArtigo`), e ela só despacha com `aprovacao` em `enforce`.
Com os ramos em `enforce` e a fila em `off` ou `dry_run`, nenhuma matéria
seria publicada nunca, sem erro e sem alerta.

**A regra agora:** a revisão humana só é exigida com a fila em `enforce`
(`revisaoExigidaPeloProjeto`, em `ramos/portal.ts`). Fora disso a matéria sai
no `published_at` dela, como antes de a fila existir, e só `blocked` segura.
Há teste dos dois lados contra uma tabela em memória que aplica os filtros.

## As edições viram matéria por pauta, e as editorias viram página (05/10/2026)

**As 23 edições publicadas como artigo (`edicao-AAAA-MM-DD`) viram uma matéria
por pauta**, pelo script `src/scripts/artigos-por-pauta.ts`, que o dono roda
(ensaio por padrão, `--aplicar` grava). Sem chamada de modelo: o texto é o que
a edição publicou, no molde da matéria do ramo (abertura, "Contexto", "Por que
importa", "Na prática", fonte). A pauta de imigração não vira matéria. A
edição não é apagada: sai da lista com `status = archived` (ou `draft`, se o
CHECK do banco recusar), e o link antigo redireciona com 308 para a primeira
matéria da edição. A foto da pauta é pareada pela POSIÇÃO no HTML do e-mail,
não pela ordem, porque pauta sem foto deslocava as seguintes.

**"Seções em foco" é uma fileira de cards de tema**, como na referência: um
card por editoria, com foto, nome e descrição fixa, rolando para o lado com
`scroll-snap` e sem biblioteca de carrossel. Cada card leva a `/editoria/<id>`,
página por requisição com as pautas da editoria no card do feed. Menu, rodapé
e barra lateral apontam para essas páginas; o `id` `editoria-<id>` ficou nos
cards para link antigo não cair no topo. A foto do card é a mais recente da
editoria que ainda não está num card à esquerda, porque as edições de
setembro usaram a mesma foto de Wall Street como reserva em dezenas de pautas.

## O portal veste Sora (05/10/2026)

O dono desenhou a referência no Superdesign, e ela está guardada em
`docs/design/portal-sora-2026-10-05/`, com as capturas do resultado. Letra
Sora em tudo, página branca, barra preta com a data, cabeçalho branco fixo no
computador e preto no celular, rodapé preto. A letra vem do `next/font`, que
serve o arquivo da nossa origem.

**O desenho foi adaptado, não copiado, e cada adaptação é deliberada:**

- A referência punha o logotipo de fundo escuro no cabeçalho branco, onde o
  "eua" branco some. Vale a regra da marca: a versão sai da cor do fundo.
- O vermelho é o do ".journal" do logotipo (#E91C32), e não o rose-600 do
  Tailwind. Texto vermelho pequeno usa #C8102E, porque o tom do logotipo dá
  4,49 de contraste sobre branco, abaixo do mínimo para letra miúda.
- "Mais lidas" virou "O mais novo de cada editoria": não existe contagem de
  leitura por pauta, e lista ordenada por um número que não existe é mentira
  com cara de dado.
- Saíram "Entrar", assinatura paga, busca, "Carregar mais", Facebook, Twitter
  e as páginas institucionais. Nada disso existe no produto, e link para o
  que não existe é pior que link nenhum.
- Tempo de leitura só aparece no artigo, medido nas palavras do corpo. O
  campo `reading_minutes` nasce com 5 e não é medida.
- A pauta sem foto é peça tipográfica com a faixa de cor da editoria, nunca
  caixa vazia. A peça fica por baixo de toda foto, então arquivo lento ou
  quebrado também cai nela.
- Cada página do portal tem UMA caixa de assinatura (`id="newsletter"`), que
  é o fluxo real da newsletter. Barra de topo e rodapé apontam para ela.

## Robôs de IA liberados, os dois tipos (05/10/2026)

Decisão do dono. Os robôs de **busca e citação** (OAI-SearchBot, PerplexityBot,
Claude-SearchBot e os de leitura sob demanda) leem a página quando alguém
pergunta e citam o site com link, e é deles que vem o GEO. Os de **treino**
(GPTBot, ClaudeBot, Google-Extended, CCBot) também ficam liberados: bloquear só
valeria daqui para frente, depende de o robô obedecer e não muda nada na busca
do Google, e um portal construindo audiência ganha mais sendo conhecido pelo
modelo do que protegendo notícia, que perde valor em dias. Rever se surgir
licenciamento ou conteúdo exclusivo. A lista está em `src/app/robots.ts`.

## A matéria na busca: auditoria, molde e correção (05/10/2026)

**A auditoria é determinística e mede a página servida.** `auditar-artigos.ts`
só lê: confere título de busca, descrição, lide, intertítulos, parágrafos,
fonte, perguntas, JSON-LD, canônico e capa, com peso por conferência
(`auditoria-de-artigo.ts`). O JSON-LD de quem está no ar vem do HTML que a
produção serviu, não do código; a página e a auditoria usam a MESMA função
(`dados-estruturados-do-artigo.ts`) para não haver duas cópias da regra.

**Onde as skills de SEO divergem, vale o projeto.** Não se exige
palavra-chave no começo do título (`modelo-de-titulo.md`); a moeda conta
como marca de país (regra 8), e por isso "US$" e "R$" situam o título.

**O molde:** JSON-LD num `@graph` (NewsArticle, Organization, BreadcrumbList
pela página da editoria e, só com pergunta VISÍVEL, FAQPage), `<` escapado,
autor "Redação eua.journal" como Organization, `dateModified` vindo de
`updated_at` só quando ele passa da publicação por mais de dez minutos. As
perguntas gravadas em `aeo_questions` aparecem como "Perguntas e respostas"
antes do crédito da fonte. A capa nunca se repete no corpo, comparada por
identidade da foto (sem tamanho, sem `&amp;`), e o crédito colado nela passa
para baixo da capa, porque a licença CC BY pede crédito junto da obra. A linha
fina some quando repete o começo do lide.

**A correção é piloto primeiro.** `corrigir-artigos.ts` corrige título,
descrição e editoria por regra, sem inventar palavra (o que não cabe vai para
a mão, nunca com reticências), e faz UMA chamada barata por matéria que lê só
o corpo e propõe perguntas e intertítulos; cada uma passa pela ancoragem de
`pacote-factual.ts` contra o corpo, e o que não se sustenta cai. O texto dos
parágrafos nunca é reescrito e a capa não é trocada (o dono decidiu manter as
fotos por ora). O lote só roda depois de o dono aprovar a matéria-modelo em
`docs/design/artigo-modelo-2026-10-05/`.

**Sitemap de notícias e `/llms.txt`** são rotas por requisição que leem o
banco direto, e não `getAllArticlesForAdmin`: aquela cai nos artigos estáticos
com `published_at` de agora quando o banco falha, e o sitemap de notícias
anunciaria matéria velha como de um minuto atrás.

## A matéria completa: molde, poda e indexação (06/10/2026)

O dono achou a matéria-piloto de Chicago rala (238 palavras, dois links): ela
tinha sido refeita só a partir do resumo da newsletter. O molde acertado, que
o redator do ramo do portal passou a seguir e que `reescrever-artigo.ts`
aplica a uma matéria publicada:

título e linha fina; "O que você precisa saber" (3 a 4 tópicos); abertura de
dois parágrafos com o link da fonte DENTRO do texto; intertítulos em forma de
pergunta do leitor, só as que o pacote responde; tabela só com comparação de
verdade; "O que isso significa para quem olha para os EUA" só quando o pacote
diz o efeito; "Leia também" com 2 a 3 matérias publicadas da mesma editoria e
a página da editoria; perguntas e respostas; "Fontes". De 500 a 900 palavras,
sem encher.

**A parte editorial do molde mora na voz (`VOZ_PADRAO_DO_ARTIGO`), que passa
por `instrucaoDaEtapa`; o contrato do JSON fica no código.** É a regra RF-26.

**O que não se sustenta é APAGADO, não amaciado.** `podarArtigo` corta por
unidade (tópico, parágrafo, linha de tabela, par de pergunta e resposta). A
ancoragem dura roda unidade por unidade; a conclusão do auditor semântico cai
na unidade que contém o trecho. Quando o primeiro parágrafo de uma seção sai,
a seção inteira sai, porque é ele que responde a pergunta do intertítulo. O
que não se poda bloqueia: título sem lastro, conclusão sem lugar na matéria,
matéria sem parágrafo. A poda roda SEMPRE, não só na reprovação: cada resposta
tem que estar no corpo que sobrou (`motivoDeRespostaSemLastro`), e o bloco de
significado que só repete o corpo (contenção de 60% ou mais) sai.

**Assuntos e entidades moram em `articles.tags`, com prefixo**, porque a
tabela não tem coluna de metadado em JSON e o dono não quer DDL agora:
`assunto:<texto>`, `sobre:<Tipo>:<nome>[|sameAs]`, `menciona:<Tipo>:<nome>[|sameAs]`
(`src/lib/indexacao-do-artigo.ts`). Viram `keywords`, `about` e `mentions` no
NewsArticle e a fileira "Assuntos" no fim da matéria, em texto puro: não existe
página de assunto nem busca, e link para o que não existe é pior que nenhum.
`sameAs` só com QID que o resolvedor do Wikidata do projeto devolveu com
confiança 70 ou mais. Nada de meta keywords.

**A descrição da foto da capa mora no corpo**, num `<p class="legenda-da-capa">`
que a página tira de lá e desenha embaixo da capa, como o crédito já fazia. Ela
vem da conferência visual chamada SEM a manchete (com a manchete, o modelo
"via" Chicago numa foto qualquer de prédios) e passa pela ancoragem contra o
pacote: nome ou número que o pacote não tem derruba a descrição, e a legenda
vira neutra ("Imagem ilustrativa: <assunto>.").

**O link de compartilhar no WhatsApp leva o endereço**, montado no clique a
partir do que o navegador mostra (origem e caminho, sem consulta nem âncora),
para sobreviver a troca de domínio. O `href` do servidor usa o canônico, só
para quem está sem JavaScript.

**Fonte que recusa o robô é lida pela cópia do Internet Archive da mesma
página** (`buscarTextoDaFonte`), com o mesmo agente honesto. Não se disfarça de
navegador.

## Assuntos com lista fechada, e o resumo com regra (06/10/2026)

A matéria-piloto de Chicago saiu com "energia" e "água" na fileira
"Assuntos", Trump em `mentions` sem uma linha sobre ele no texto, e quatro
tópicos de "O que você precisa saber" que repetiam a abertura logo abaixo. O
dono: "isso não pode acontecer novamente". As duas regras moram no CÓDIGO, e o
prompt só avisa o redator do que vai ser cortado.

**Assunto é entidade nomeada ou tema da lista fechada, e nada mais.** O
vocabulário está em `src/lib/temas.ts`: de 15 a 30 temas por editoria, em
português, específicos e buscáveis ("juros do Fed", "data centers", "conta de
luz"), cada um com `slug` estável para as futuras páginas `/tema` e com
sinônimos para casar a proposta do redator e o texto. A validação aceita tema
de QUALQUER editoria (Chicago é de Política e trata de data centers); a
organização por editoria serve ao prompt e às páginas futuras. Tema novo
entra por decisão editorial, editando o arquivo, nunca pelo que o modelo
devolveu num dia.

**Quem decide é `validarAssuntos`** (`indexacao-do-artigo.ts`): o modelo
propõe, o validador grava a forma canônica da entidade ou do tema, joga fora
palavra genérica (há uma lista só para o motivo do log; a regra é "fora da
lista sai"), repetição e o que passa de cinco, com entidades primeiro (no
máximo três, a central antes) e os temas da lista que o texto trata (duas
menções ou mais) completando. O descarte é silencioso para o leitor e vai
para o aviso do ramo ou para o terminal do script. `tagsDeIndexacao` valida
de novo, para quem grava não conseguir gravar "água" nem esquecendo.

**`about` e `mentions` só com quem o texto final nomeia**, sem acento nem
caixa. Na geração, o filtro vem antes do teto de dez menções; na página,
`indexacaoValidadaDoArtigo` lê as tags, tira entidade ausente do corpo (sem
contar "Leia também" e "Fontes") e passa os assuntos pelo validador. É a
ÚNICA porta de leitura da fileira e do JSON-LD: linha antiga com tag ruim não
mostra tag ruim, mesmo antes de ser reescrita. Há teste que quebra se a
página voltar a ler `indexacaoDasTags` direto.

**"O que você precisa saber" fica, com quatro regras no pós-processamento**
(`ramos/essencial.ts`, chamado por `podarArtigo`): até três tópicos; nenhum
repete uma frase da abertura (contenção de 60%, a medida do leitor); cada um
traz fato próprio que a abertura não disse (número, data, prazo, próximo
passo ou ator nomeado); e o bloco só existe com mais de 400 palavras de corpo.
Tópico que falha sai inteiro; com menos de dois, o bloco sai.

**Reaplicar sem reescrever.** `reescrever-artigo.ts --so <slug> --so-ajustes`
aplica as regras à matéria GRAVADA, sem modelo, e grava só `content_html`,
`tags` e `updated_at` (`ajuste-de-materia.ts`). Existe porque a reescrita dá
outro texto a cada rodada, e o dono já tinha lido a versão de Chicago. Em
Chicago (06/10/2026) os quatro tópicos caíram e o bloco saiu; os assuntos
viraram Chicago, City Council, data centers, política municipal e conta de
luz; e saíram de `mentions` Trump, Seattle, City of Chicago, a força-tarefa e
a Data Center Coalition, que o texto não nomeia. Illinois caiu também: está no
texto, mas não estava entre as entidades gravadas.

## Pauta sem foto não vira conteúdo (05/10/2026)

A decisão do dono, com estas palavras: "pauta sem foto não vira conteúdo". Uma
pauta cuja resolução de imagem termina SEM foto real da pauta (resolvedor com
`NO_VALID_IMAGE`, inclusive quando ele devolveu a bandeira de último recurso,
ou imagem nula) não vira peça em canal nenhum: história da newsletter, matéria
do portal (ramo e desmonte de edição) e post do Instagram.

**Isto SUPERA, para publicação, a regra de 17/09/2026** ("nenhuma peça sem
imagem", a bandeira como último recurso). A bandeira continua existindo no
resolvedor, como marcador interno e para o contador `ultimoRecurso` do
relatório, e nunca é publicada. Os textos datados de 17/09 e 18/09 neste
arquivo e no `aprendizados-e-incidentes.md` ficam como registro.

**A régua é uma só**, `temFotoDaPauta` em `src/lib/server/ramos/sem-foto.ts`:
`status === "SELECTED"`, com URL, e o asset não é a bandeira (pelo campo
declarado e pela URL, `ehImagemDaBandeira`, que reconhece também a miniatura
do Commons). Conferir as duas coisas é a lição de 18/09: a newsletter lia
`status` e o campo tinha mudado de sentido.

**A pauta cai ANTES da redação, e a vaga vai para a próxima.** A imagem sai
do título da fonte e da classificação, que existem antes do texto. Então cada
canal pergunta a foto ao selecionar (`selecionarComFoto`), e a seleção é
refeita sem a pauta sem foto até parar de mudar. O volume se mantém
(newsletter de 2 a 4, portal até 3, Instagram até 5) em vez de encolher, e
ninguém paga pacote factual nem redação de pauta que não vai sair. Onde a foto
da edição vem de outro caminho (resolvedor da fase 1, ranker antigo), vale a
rede de depois da resolução (`separarPautasSemFoto`): a pauta sai da edição já
escrita, como a pauta sem lastro sai em `runNewsroomPipeline`.

**Abaixo do mínimo, é dia sem edição.** Se a newsletter não chega ao mínimo com
pautas que têm foto, vale o caminho de 08/09: `registrarDiaSemEdicao` com o
motivo `EDITORIAL_MINIMUM_NOT_MET` e o detalhe `REJECT_NO_PHOTO`. Não se
completa com pauta sem foto.

**Resolver antes, gravar depois.** A foto antecipada é resolvida em LEITURA
(`somenteLeitura`), porque nessa hora ninguém sabe qual pauta vai sair, e
marcar uso da foto de uma pauta que não saiu a tiraria da próxima por trinta
dias. A newsletter confirma o uso só do que foi ao ar
(`confirmarImagemPublicada`). Uma memória do dia (`criarFotosDoDia`) garante
que a seleção, a capa do portal e a foto da edição leiam a MESMA resposta, e
em sequência, para o "já usada nesta edição" continuar valendo.

**O motivo fica visível.** Código `REJECT_NO_PHOTO`. Newsletter e portal
gravam `platform_events` do tipo `pauta_sem_foto`, no mesmo formato de
`descartados` do social, e o painel de logs junta as duas listas. No
Instagram a queda vai para `descartados` do ciclo, com etapa `visual`.

**O que já estava no ar sem foto é decisão do dono.** O script
`src/scripts/arquivar-sem-foto.ts` lista as matérias publicadas com capa vazia
ou com a bandeira (ensaio por padrão) e só arquiva com `--aplicar`
(`status = archived`, ou `draft` se o CHECK recusar, como em
`artigos-por-pauta.ts`). Medido no ensaio de 05/10/2026: 36 das 62 matérias
publicadas, 32 com a bandeira e 4 com capa vazia.

## O bloco do VisaMatch alterna de formato a cada edição (05/10/2026)

A decisão do dono: o bloco do VisaMatch fica, mas "diluído de forma criativa,
alternando a cada edição, igual o The News". O mesmo cartão escuro todo dia
virava paisagem.

**Oito variantes, de FORMATOS diferentes**, em
`src/lib/server/newsroom/visamatch-na-edicao.ts`: o cartão escuro de antes,
menção de uma linha antes da despedida, pergunta rápida com respostas
clicáveis, P.S. depois da despedida, checklist, caixa de "Você sabia?", cartão
discreto de conteúdo de parceiro e "Dúvida comum". Esta última é a coluna do
leitor sem o leitor: não há carta de leitor por trás, e chamá-la de "Pergunta
do leitor" seria inventar um registro.

**Ferramenta de parceiro, rotulada, curta, nunca o assunto.** Toda variante
diz que é de parceiro. A newsletter não é sobre imigração (decisão do mesmo
dia), e o bloco é um aviso no fim, não pauta. Sem "garantido", "aprovado",
"100%" nem travessão, e há teste disso.

**O mesmo link, com a variante no `utm_content`** e a edição no `utm_term`
(`linkDaVarianteNaNewsletter`). A pergunta que o número responde passou a ser
qual formato converte.

**A rotação é determinística pela data e pela cadência da newsletter.** Cada
dia de publicação do projeto é uma vaga (`vagaDaEdicao`), e a vaga N leva a
variante N módulo oito. Duas edições seguidas nunca repetem, inclusive de
sexta para terça, e as oito passam antes de alguma voltar. Sorteio foi
recusado pelo motivo de sempre. O projeto pode fixar uma variante ou trocar a
ordem em `settings.visamatch` (`{"variante": "quiz"}` ou `{"ordem": [...]}`).

Continua valendo "o fim do e-mail tem UM convite": é um bloco por edição, só
que não o mesmo.

## Os exemplos dos prompts saíram da imigração (05/10/2026)

A decisão do dono: "pode trocar agora os exemplos". A publicação deixou de
falar de imigração, e os exemplos que ensinavam a forma do título ainda eram de
visto (I-864, EB-2 NIW, O-1B, F-1, DS-160, RFE, cidadania por nascimento). O
modelo imita exemplo mais do que obedece regra.

**Cada exemplo manteve o que ensinava**: jurisdição no fim, sigla nunca
sozinha, quem é afetado aparece, o fato antes da ressalva, nacionalidade de
terceiro país fora, a linha de baixo acrescenta. Trocados na redação da
newsletter e no prompt de reparo (`pipeline.ts`), na regra da manchete
(`manchete.ts`), no carrossel (`carrossel/copy.ts`) e na voz social
(`voz.ts`). Onde o exemplo era manchete REAL medida, entrou manchete real atual
do banco, com a data (por exemplo "Agentes sem acordo de 2026 não concluem
registro nos exchanges de 2027 nos EUA", de 23/09/2026, e o par headline e
preheader repetido de 30/09/2026); onde não havia uma que servisse, o exemplo
está marcado como "construção ilustrativa".

**Os padrões editáveis do painel mudaram junto**, porque o padrão é o texto do
código (RF-26): quem não tem versão ativa passa a ver e usar os exemplos novos.
`prompts-sem-imigracao.test.ts` falha se um prompt de redação voltar a trazer
I-864, NIW, EB-2, O-1, USCIS, DS-160, green card ou F-1. Ficam de fora o
classificador e o verificador, que precisam reconhecer visto para recusar, a
frase da linha editorial que diz o que está fora, e as listas de detecção do
`leitor.ts`. O `modelo-de-titulo.md` continua com o texto de 16/09, que é
registro histórico.

## Piso de dois assuntos, que não inventa (05/10/2026)

Da auditoria de SEO, AEO e GEO (`docs/auditorias/seo-aeo-geo-2026-10-05.md`):
61 das 62 matérias publicadas tinham zero assunto, e não havia piso, só o
teto de cinco. **O piso é dois** (`MINIMO_DE_ASSUNTOS`). Quem escreve completa
com as entidades CITADAS que o texto final nomeia, nunca com tema que o texto
não trata nem com palavra genérica; abaixo de dois mesmo assim, a matéria sai
com o que tem e o ramo registra `ASSUNTOS ABAIXO DO MÍNIMO`. Não bloqueia,
porque bloquear empurraria o redator a inventar. A página não completa nada
na leitura.

## A bolha não cobre rosto, e a vez dela passa adiante (06/10/2026)

Dois pedidos do dono, sobre o mesmo círculo. O caso que motivou o primeiro: o
retrato oficial de Biden de fundo (29/09/2026), com a bolha desenhada em cima
da metade do rosto. A posição era fixa no CSS, e nada na esteira sabia onde
ficava o rosto. Exemplos renderizados com fotos de produção em
`docs/design/bolha-sem-rosto-2026-10-06/`, com a conferência desenhada por cima.

**A bolha nunca cobre um rosto.** Na vez da bolha, uma chamada de visão recebe
a foto de fundo JÁ RECORTADA como a peça a mostra (`object-fit: cover`, a
mesma conta do script da marca, em `recorteDoCover`) e devolve as caixas das
cabeças em fração do canvas, com esquema JSON estrito. São 12 posições em
`carousel-templates/bolha.ts`, na ordem de preferência: a de sempre primeiro,
depois o espelho e as variações no mesmo tamanho, depois 36% e 30% da largura.
Todas ficam fora da marca do topo e acima da faixa do texto, e há teste disso
para cada uma. Vale a primeira que não encosta em rosto nenhum, com folga de
3% da largura mais o anel branco. Nenhuma serve: capa sem bolha.

**Falha de detecção é recusa.** Sem chave, com a rede fora, com resposta fora
do esquema ou com coordenada fora da escala de 0 a 1, não há bolha. É a regra
de 17/09/2026 aplicada ao círculo: capa sem bolha é peça publicável, bolha em
cima de rosto não é. A memória é por URL da foto, e a falha não fica guardada.

**O render confere de novo.** Depois de montar a peça, `renderizarCapas` mede o
círculo na página e o compara com as caixas; se encostar, a bolha sai antes do
screenshot. A posição é decidida contra uma tabela, e o arquivo é o que o CSS
desenhou: as duas coisas só coincidem enquanto ninguém mexer numa delas.

**Custo:** uma chamada por post na vez da bolha. Medida em 06/10/2026 com o
modelo de produção: cerca de 1.400 tokens e 0,0045 USD na foto comum, até
0,012 USD numa foto com muitos rostos pequenos (estimativa da tabela de
`calculateCost`, que cobra preço de gpt-4o para modelo desconhecido). Vai para
o livro do dia como etapa `bolha` do ramo do post. Fora da vez não se pergunta
nada. Multidão é cara para o modelo e quase nunca tem lugar livre: acima de
40 rostos é recusa direta.

**Estátua conta como rosto**, e a instrução diz isso. A fachada da NYSE com o
frontão esculpido devolve uma dúzia de rostos pequenos. É conservador de
propósito: o pedido é "nunca", e o preço do falso positivo é uma capa sem
bolha.

**A alternância virou alvo.** O ritmo de 16/09 continua: depois de uma capa com
bolha vem uma sem, com o estado lido do feed. O que muda é o lado da vez:
quando é a vez e ela não se cumpre (sem segunda foto, sem posição livre, render
que tirou a bolha), ela PASSA para o post seguinte, e não se perde. A decisão
virou `decidirBolha`, peça a peça dentro do laço do ciclo, porque a vez de
uma depende de a anterior ter saído com bolha de verdade, e isso só se sabe
depois do render. `alternarBolha`, a passada pura sobre a leva, saiu.

**Na vez, a segunda foto é procurada com mais força, com a mesma régua.** Em
06/10/2026 só 1 das 12 últimas capas tinha bolha, e parte da causa estava no
resolvedor: a vice só existia no caminho das fontes externas, e a foto que
vinha do acervo ou da biblioteca terminava sem vice nenhuma.
`buscarSegundaFoto` entra só na vez e só quando a vice não veio: acervo pelo
assunto da entidade primeiro, depois biblioteca, Commons (30 arquivos em vez de
12) e Openverse, pelas MESMAS barreiras da vice e com o piso de identidade, e
a conferência visual abrindo até quatro. Pauta sem entidade nomeada não tem
bolha: o círculo mostra quem a pauta cita. A ordem é a do custo: os rostos são
perguntados antes, porque procurar segunda foto para uma peça sem lugar livre
seria dinheiro jogado.

**Tudo fica gravado** em `content_json.arte.bolha_decisao`: se era a vez, o
resultado (`com_bolha`, `nao_era_a_vez`, `sem_posicao_livre`,
`sem_segunda_foto`, `deteccao_falhou`, `tirada_no_render`...), os rostos, a
posição escolhida e as recusadas, a origem da segunda foto e o custo.
`arte.bolha` passou a dizer o que foi ao ARQUIVO, e não o que foi pedido.

**Os moldes do painel já alcançam a esteira.** Com `{"recorte": false,
"sem_foto": false}` em `settings.moldes` (gravado em 05/10/2026 às 17:57),
`alternarGramatica` não devolve recorte, e a pauta sem foto já não chegava ao
render (regra de 05/10). Os três recortes de 05/10 nasceram às 09:21, antes do
interruptor. O recorte também deixou de carregar a segunda foto: ele não
desenha bolha, e o campo ia preenchido assim mesmo.

## A refação completa, por peça e por canal (06/10/2026)

Véspera de a fila valer com aprovação manual nos três ramos. Até aqui a
seleção (todos os ramos), o texto do post, a newsletter inteira e o carrossel
deixavam a peça reprovada em `refazendo` para sempre.

**A aprovação e a refação são por PEÇA e por CANAL** (decisão do dono, com
estas palavras: os três canais comunicam de jeitos diferentes). Reprovar a
newsletter nunca toca a matéria nem o post da mesma pauta, e vice-versa; cada
um é aprovado e reprovado sozinho. Os ganchos só escrevem na linha da peça
reprovada (ou criam a substituta), e há teste que reprova o texto do post e
confere que a matéria e a newsletter ficaram iguais, linha e conteúdo.

**A foto refeita é da peça, não da pauta.** A foto de uma pauta é resolvida uma
vez para os três canais (`imagem_da_pauta`). A refação de imagem resolve outra
(`imagemDaPauta` com `ignorarReuso`) e grava só na peça; desde esta data
`ignorarReuso` não regrava a tabela nem a memória, e os outros canais seguem
com a foto que tinham. Até 05/10 a foto refeita substituía a compartilhada.

**O contexto vai para a linha da fila.** `resumo.contexto` guarda a pauta (o
que os redatores e o resolvedor leem dela), o pacote factual, a referência ao
pool aprovado do dia (só os `storyId`, em ordem) e, na newsletter, as fotos e os
créditos de cada história. O post leva o mesmo em `content_json.contexto_da_refacao`
e a forma do carrossel em `content_json.carrossel`. Peça anterior a isto é
remontada de `news_candidates`, `articles.source_urls`, `news_editions.stories`
e do histórico editorial; sem como remontar, o painel diz o que faltou.

**Cada etapa, por ramo:**

| ramo | seleção | texto | imagem | arte |
|---|---|---|---|---|
| post | outra pauta, pelo ciclo social inteiro (`rodarSocialDoDia`, teto 1), na vaga da reprovada | `gerarPostDaPauta` com motivo e memória, depois a arte | foto nova só da peça, depois a arte | recongela |
| carrossel | idem | o mesmo gerador, na mesma estrutura, e recongela todas as telas | foto da capa, e recongela as telas | recongela as telas |
| artigo | outra pauta, pelo ramo do portal (`rodarRamoDoPortal`), no horário da reprovada | `escreverArtigoDaPauta` | capa nova | não existe |
| newsletter | troca UMA história, apontada pelo editor, e reescreve a edição | `runNewsroomPipeline` com motivo e memória (a edição inteira; a pauta apontada vai como foco) | foto nova da história apontada, ou de todas; só o HTML é redesenhado | não existe |

**A seleção refeita respeita a régua do ramo:** aprovada pela linha editorial,
imigração fora, nada que o canal já tenha no dia (nem a pauta recusada), nenhum
acontecimento repetido no canal (cosseno 0.70 contra as peças do dia, e a
impressão do acontecimento no post), nada já publicado no canal
(`verificarRepeticao`), foto real e pacote factual. No post e no artigo a peça
nova entra na fila com hash próprio e herda a contagem de refações da vaga; a
reprovada é descartada com o motivo e o id da substituta. A newsletter é uma
peça por dia, então a troca é dentro dela, e o editor escolhe no painel qual
pauta sai (sem escolher, a refação diz que precisa saber).

**O Listmonk não é tocado.** A campanha só nasce na liberação, com o que está
na linha naquela hora.

**A refação roda fora do clique.** A reprovação grava `resumo.refacao` em
`na_fila` e responde. Roda o `after` da própria reprovação e, a cada minuto, o
relógio da fila (`processarRefacoes`); a reivindicação é condicional, então os
dois nunca refazem a mesma peça. Falha técnica volta para a fila (na terceira
vira "não dá"); processo que morreu no meio deixa `rodando`, e depois de 20
minutos a linha é pega de novo. Com a fila fora de `enforce`, nada roda.

**"Não dá" nunca é silêncio.** Se o gancho recusou sem escrever, a peça volta a
`aguardando` intacta, com o motivo: o editor aprova como está, reprova outra
etapa ou cancela. Se a peça mudou pela metade (texto novo, arte que não
fechou), fica em `refazendo`, porque aprovar a meia-versão publicaria a
manchete de uma peça na arte de outra; a saída é cancelar. O painel mostra
"refazendo X, refação n de 2" com a previsão de volta (estimativa por etapa,
`MINUTOS_DA_REFACAO`) e se atualiza sozinho enquanto houver refação andando.

**O que continua manual:** a peça cujo contexto não dá para remontar (a matéria
que é a edição da newsletter, `edicao-AAAA-MM-DD`; o carrossel gravado antes
desta data, sem a forma; a edição antiga sem a foto no histórico, para refazer
o texto), e a terceira reprovação, que descarta como sempre.

## O aprendizado da fila, por etapa e por canal (06/10/2026)

O dono: "de nada adianta esse esforço manual se não houver aprendizado". Até
aqui a memória de reprovação só chegava ao texto, e misturada: o erro apontado
na legenda do post entrava na voz da newsletter. O código está em
`src/lib/server/aprendizado/`, as tabelas na migration
`20261006120000_aprendizado_da_fila.sql`, e a tela em
`/admin/<projeto>/aprendizado` (também na seção "Aprendizado" do projeto).

**Canal é canal, sempre.** `errosRecentesDaEtapa(projeto, ramo, etapa)` lê só
as reprovações daquele canal, as regras têm `ramo` NOT NULL, e cada voz recebe
o bloco do próprio canal. Nada lê o aprendizado com a fila em `off`.

**Cada etapa aprende com a reprovação dela.** A reprovação grava em
`reprovacoes.detalhes` o que a peça tinha (a pauta, a foto de fundo, o molde):

| etapa | o que aprende | onde |
|---|---|---|
| seleção | cada recusa parecida (fonte, ator, eixo) tira 8 pontos da nota, até 24; fonte ou ator recusado 3 vezes em 30 dias sai do canal; pauta recusada nunca volta ao canal. O eixo nunca bloqueia | `aprenderNaSelecao` na newsletter, no portal e no Instagram; a troca de pauta da refação também |
| texto | erros recentes, regras aprovadas e exemplos aprovados de primeira, do canal | `vozesDosRamosComMemoria` |
| imagem | a foto recusada no canal nunca mais é escolhida nele; o motivo vai para a pergunta da cena | `fotosDoCanal`, `comFotoDoCanal`, `recusasDoEditor` |
| arte | molde recusado 3 vezes sai da escolha do feed (o jornal nunca sai); a refação da arte troca a decisão recusada e grava o porquê em `content_json.arte.aprendizado` | `moldesComAprendizado`, `arteNaRefacao` |

A foto de uma pauta continua resolvida uma vez para os três canais. O bloqueio
de um canal entra DEPOIS dessa resolução: só aquele canal resolve outra.

**A aprovação de primeira vira exemplo.** Até 5 por tipo (assunto da
newsletter; manchete e abertura da legenda do post; título e linha fina da
matéria), num orçamento de 1.600 caracteres, só do canal, só aprovadas pelo
editor sem refação nem edição à mão, dos últimos 30 dias, nada antes de
05/10/2026 e nada com vocabulário de imigração.

**A edição à mão vira proposta.** O antes e o depois vão para
`edicoes_do_editor`. Toda segunda às 08:00 (`/api/cron/aprendizado`) e no botão
do painel, UMA chamada de modelo lê as edições da semana por canal e devolve
padrões; a proposta precisa de duas edições do mesmo canal, a citação de outro
canal é descartada na validação, e tudo nasce `proposta`, com origem `edicoes`.
Nada vira regra sem o dono aprovar.

**A taxa do painel conta edição como retrabalho.** Aprovada de primeira é sem
refação E sem edição à mão.

## A cadência se edita no painel, e o relógio da produção é da rota (06/10/2026)

**A tela é `/admin/<projeto>/cadencia`**, com link no menu do projeto, ao lado
dos perfis de referência e do acervo. Ela edita `settings.cadencia` inteiro:
dias, horários e volume de cada canal, mais produção e aprovação, e mostra a
prévia da semana seguinte. Grava por `PUT /api/admin/projetos/<id>/cadencia`,
com sessão do painel, tocando só a chave `cadencia` do jsonb.

**Campo inválido é gravado como veio**, e na leitura cai no padrão daquele
campo com aviso, que é a regra de 05/10. Normalizar antes de gravar apagaria o
aviso: o painel diria "gravado" e o campo voltaria ao padrão em silêncio. O
formulário calcula a prévia e os avisos a cada tecla com os MESMOS validadores
da esteira (`cadencia-no-painel.ts` é puro e o cliente o importa).

**O horário da produção é decidido pela rota, não pelo crontab.** Com
`?relogio=1`, `/api/cron/producao` é chamada de 15 em 15 minutos e só produz no
primeiro disparo entre o horário gravado e 15 minutos depois. Fora da janela
não grava linha, não pinga o watchdog e não alerta. Sem o parâmetro a rota
continua produzindo quando é chamada, então a linha antiga das 20:00 UTC segue
funcionando até ser trocada; o painel avisa quando o horário gravado não bate
com ela. O portal tem o mesmo aviso para `/api/cron/portal`, que já é segura de
chamar a qualquer hora.

## Os avisos de operação no Telegram (06/10/2026)

Com a fila de aprovação, a rotina do dono passou a ter horário, e o Telegram
deixou de falar só quando algo quebra. O código está em
`src/lib/server/avisos/`, e passa pelo mesmo `alerts.ts` dos alertas de falha.

| aviso | quando (hora do projeto) | condição |
|---|---|---|
| fila pronta | fim da produção das 17:00; rede no cron a partir das 17:30 | fila fora de `off`, produção com linha, fila do alvo não vazia |
| lembrete | 22:00 a 23:59 | fila fora de `off`, peça de amanhã aguardando ou refazendo |
| última chamada | 05:30 a 06:06 | fila fora de `off`, peça de hoje pendente |
| resumo do dia | 22:30 a 23:59 | sempre |
| produção vazia | fim da produção | rodou e a redação não produziu, ou produziu e nada entrou na fila (fora do ensaio) |
| produção não rodou | 18:30 a 21:59 | dia de produção sem linha em `newsroom_runs` |
| newsletter atrasada | 06:15 a 11:59 | fila em `enforce`, newsletter aprovada e não liberada |

**Um aviso por chave `tipo:dia`, gravado em `platform_events`**
(`aviso_operacional`). O cron de minuto em minuto pergunta antes de mandar. Envio
que falha é gravado com o motivo do Telegram e tentado de novo no minuto
seguinte, até três vezes; depois desiste, e as três linhas dizem por quê.

**A janela, e não o minuto.** O aviso sai no primeiro minuto dentro da janela,
então um cron atrasado não perde o dia. E o fuso é sempre o do projeto: o
contêiner está em UTC, onde 22:00 de São Paulo já é o dia seguinte.

**Nenhum aviso mente.** Com a fila em `dry_run` nada é segurado, então a última
chamada diz "sai mesmo assim" em vez de "não sai". E ela dá o primeiro horário
de cada canal, porque o post das 14:45 ainda tem a manhã para ser aprovado.

**Rota própria, `/api/cron/avisos`.** O cron da fila pula projeto fora de
`enforce` antes de ler qualquer coisa, e o resumo vale com a fila desligada; e
uma falha aqui não pode atrasar a liberação das 06:07. A rota não alerta a
própria falha, porque com o banco fora seria um alerta crítico por minuto.

**A falha de QUALQUER alerta vai para o banco**, `platform_events` do tipo
`alerta_falhou`, com o motivo e a descrição do Telegram e sem segredo. Antes
ela só existia no log do contêiner.

## O evergreen ganha catálogo novo, sem imigração (06/10/2026)

O evergreen foi desligado em 05/10 porque os 66 tópicos do catálogo eram todos
de visto. O catálogo novo é da linha atual: o brasileiro que SONHA em morar,
trabalhar ou investir nos EUA, e o conteúdo explica como as coisas funcionam
lá. O de imigração está arquivado em `evergreen/catalogo-imigracao-arquivado.ts`,
que ninguém importa. **A capacidade continua desligada** até o dono aprovar.

**O catálogo:** 60 tópicos e 154 ângulos (de 2 a 4 por tópico), em
`evergreen/catalogo.ts`, agrupados pelas editorias do portal: economia 13,
trabalho 13, tecnologia 8, custo de vida 14, política 8 e Brasil 4. Todo
tópico declara de 1 a 3 temas da lista fechada de `src/lib/temas.ts`, e o
teste recusa slug que não existe lá. Nenhum tópico nem ângulo pode ser de
imigração (o teste procura visto, green card, USCIS, cidadania, deportação e
afins).

**Fontes só de órgão oficial**, e a lista de `grounding.ts` foi trocada
inteira: saíram uscis.gov, travel.state.gov, state.gov, cbp.gov e
federalregister.gov; entraram Fed, Tesouro, SEC, FDIC, CFPB, FTC, BLS, BEA,
Census, EIA, USDA, DOL, IRS, SBA, HealthCare.gov, Medicare, NCES, NIST, USPTO,
NASA, DOE, CISA, USA.gov, Arquivo Nacional, Câmara, Justiça federal, os .gov de
Texas, Califórnia, Nova York, Washington e Tennessee, e gov.br só para o
contraste com o Brasil. As 148 URLs foram conferidas em 06/10/2026 com o agente
honesto do projeto (`eua.journal/1.0`, que substituiu o `imigra.us/1.0` da
leitura): HTTP 200, texto suficiente e o assunto presente na página. Ficaram
fora porque recusam agente declarado (403, desafio ou página vazia):
investor.gov, ssa.gov, hud.gov, huduser.gov, studentaid.gov, ed.gov,
ibge.gov.br, bcb.gov.br, congress.gov, senate.gov e transportation.gov. A
conferência se repete com `npx tsx src/scripts/conferir-fontes-evergreen.ts`.

**O Brasil só entra como contraste**, nos 4 tópicos da editoria Brasil, e cada
lado do contraste tem a sua fonte primária (IRS e Receita, DOL e MTE, IRS e
INSS, FGTS e FICA). Nenhum ângulo afirma equivalência que as duas fontes não
dizem.

**O adaptador deixou de marcar imigração.** `imigracao: false` e o eixo sai da
EDITORIA do tópico (economia, trabalho, tecnologia, custo_de_vida, politica,
brasil), e não mais da família, que diz a forma. Assim as réguas da linha nova
(foto obrigatória, moldes, bolha, chapéu da editoria) tratam o evergreen como
qualquer pauta. As famílias viraram cinco (`explainer`, `glossary`, `faq`,
`comparison`, `process_explainer`).

**Ator da foto é instituição, e só onde ela é o assunto.** O código do
programa ("FOMC", "401(k)") não vai mais como ator, pela lição da sigla PERM.
O campo `entidade` existe em 6 tópicos (Fed, SEC, FDIC, IRS na temporada,
Congresso, Suprema Corte). Medido com o resolvedor: com o órgão declarado,
credit score, 401(k), aluguel e Artemis terminavam sem foto; sem ele, os
quatro saíram com a foto da cena.

**O ritmo:** nenhum TÓPICO volta em 30 dias (a janela era 7) e o par
tópico+ângulo continua com 30. O teto do dia caiu de 4 para 2, que é
`60 tópicos / 30 dias`: com 4, o catálogo secaria na metade do mês de pouca
notícia. Uma editoria por dia (`EVERGREEN_MAX_POR_EDITORIA`). O evergreen
continua só nas vagas que a notícia deixou, e cede o assunto quando a notícia
do dia traz o mesmo programa ou a mesma instituição. O desempate entre itens
nunca usados passou a girar com o dia (continua determinístico): item que cai
depois da seleção (sem foto, copy recusada) não entra no histórico e, com a
ordem alfabética, voltava ao topo todo dia, travando o catálogo.

**Amostras** em `docs/design/evergreen-novo-2026-10-06/`, pelo caminho de
produção inteiro em ensaio (`src/scripts/amostras-evergreen.ts`: store de
memória, arquivo local no lugar do Storage, banco só lido): credit score,
mandato do Fed (com bolha), Colégio Eleitoral e FDIC (com bolha). PNGs
reduzidos para 1080x1440 no repositório.

**Como ligar:** no painel, a capacidade `evergreen` do projeto
(`settings.capacidades.evergreen`): primeiro `dry_run` (calcula, grava o
diagnóstico em `payload.diagnostico.evergreen` e não publica nada), depois
`enforce`. Para `enforce` publicar, o Social V2 também precisa estar em
`enforce`.

## Autores com nome, e a Redação continua o padrão (06/10/2026)

Aprovado pelo dono. Tabela `autores` (migration `20261006120000_autores.sql`)
e `articles.author_id`, nulo por padrão. A esteira automática nunca atribui
autor: matéria sem autor assina "Redação eua.journal" e sai como Organization
no JSON-LD, como antes. O dono cadastra e atribui em `/admin/<projeto>/autores`.

- **A página prefere `author_id`**; a coluna de texto `author` fica por
  compatibilidade e não é lida para a assinatura com link.
- **Com autor, o NewsArticle traz Person** (url da página, `jobTitle`,
  `image`, `sameAs` só com as redes gravadas), e `/autor/<slug>` é ProfilePage.
  A auditoria de artigo aceita Person ou Organization.
- **Desativar, nunca apagar.** Autor desativado sai do portal inteiro: a página
  dá 404 e as matérias voltam a assinar como a Redação, para nenhum link
  apontar para página que não existe. Reativar devolve tudo.
- **Página de autor sem matéria publicada** abre, mas com `noindex` e fora do
  sitemap até a primeira matéria.
- **A leitura degrada.** Antes da migration, a matéria abre com a Redação e o
  painel diz qual arquivo rodar.

Capturas em `docs/design/autores-2026-10-06/` (autora de exemplo, fictícia).

## O método do Not Journal e do The News (06/10/2026)

O dono leu 7 carrosséis do Not Journal (31 slides) e 40 assuntos do The News e
aprovou o método. O teste com dados reais, as peças e o custo estão em
`docs/design/metodo-carrossel-2026-10-06/comparacao.md`.

**O assunto do e-mail é sobre UMA história**, a mais forte do dia, em caixa
baixa inteira (nome e sigla inclusive; só "R$" e "US$" ficam), de 2 a 7
palavras, uns 40 caracteres, sem ponto final, numa de cinco formas: pergunta que
a edição responde, dois ou três nomes, personagem com detalhe curioso, cena ou
número, o momento. A forma é conferida e consertada em código
(`newsroom/assunto.ts`): caixa, ponto e travessão sem pedir nada a ninguém;
tamanho escolhendo a primeira opção da própria redação que cabe, nunca
cortando. O teto do código é 9 palavras e 45 caracteres, e não 7 e 40, porque
os exemplos que ensinam o método passam disso ("o advogado que apostou R$ 5 bi
no tigrinho" tem 9 e 42). O piso do schema caiu de 15 para 5 caracteres: "lula &
trump" derrubaria a edição inteira depois de paga. **O preheader continua
nosso**, editorial, e não a propaganda do The News.

**A pergunta é permitida no ASSUNTO e continua proibida na MANCHETE.** O assunto
abre o e-mail e a edição responde logo abaixo; a capa do Instagram é o post
inteiro para quem não desliza, e pergunta ali é teaser.

**A manchete da capa é uma frase: ator, verbo no presente, fato, escala.**
Número exato, atribuição, zero adjetivo de opinião. O prompt pede de 10 a 18
palavras; a guarda continua recusando abaixo de 6 (`FORMA_DA_MANCHETE`), de
propósito: subir o piso transformaria toda manchete boa de 8 ou 9 palavras em
reescrita paga ou post descartado, e a recusa é do que é rótulo. A legenda abre
com o lide inteiro em uma frase (`gancho`, teto do aparador subiu de 160 para
240 para não cortar a frase no meio).

**A notícia vira carrossel só com material para dois passos além da capa**
(`determinarFormatoDaNoticia`): escala, detalhe, explicação com dono,
consequência. Dois passos dão 3 slides (capa, um slide com dois blocos,
convite); três dão 5; quatro, ou dois com seis fatos ou mais além do lide, dão
5 ou 6. Cada slide de conteúdo tem um ou dois blocos de 15 a 30 palavras,
conferidos (`conferirBlocosDaNoticia`, faixa de 12 a 36 na guarda). Na notícia
a relevância para o leitor é silêncio permitido: o método conta o fato, e o
ensaio mostrou a régua de leitor exigindo "quem" enquanto o auditor recusava
justamente o "para quem pensa em morar em Los Angeles" que o pacote não
sustenta.

**Todo slide é foto, e o protagonista aparece em fotos diferentes**
(`carrossel/fotos.ts`): o resolvedor de sempre, perguntado de novo com a lista
do que já saiu, primeiro pelo RETRATO do protagonista (a conferência visual
pergunta "é esta pessoa?", e não se a foto sustenta a manchete), depois pela
cena sem atores; sem foto nova, o slide sai no azul-marinho, nunca com a foto
de outro slide nem com rosto de outra pessoa. A bolha só entra no slide em que
um SEGUNDO personagem nomeado aparece no texto, com foto cuja entidade é ele. O
LUGAR da bolha é da frente `feat/bolha-sem-rosto`; o miolo usa a classe
`j-bolha` mais o modificador `jn-bolha`.

**O último slide da notícia convida a assinar a newsletter**, sempre, com ou
sem keyword: fundo preto, logotipo de fundo escuro, "Assine a newsletter do
eua.journal." e uma caixa de entrada desenhada em HTML com a NOSSA edição no
topo (`cta_assinatura`). A linha "Comente NEWS e receba o link" só aparece com
keyword escutada. É a regra "o CTA do Instagram oferece a NEWSLETTER" levada à
arte.

**Tudo do carrossel atrás de `settings.capacidades.carrossel_noticia`.** Não
declarado é `off`, a peça única de sempre; `dry_run` só anota no log o que
viraria carrossel; `enforce` faz o carrossel com a verificação semântica ligada.

**Os textos editoriais novos são os padrões do código** (RF-26): valem sem
painel. `src/scripts/salvar-instrucoes.ts` grava as cinco etapas como versões
ativas quando o dono aprovar (ensaio por padrão, `--aplicar`, `--reverter`).

## Armadilhas que já custaram tempo

Estas não são preferências, são fatos da plataforma. Repetir custa horas.

- **Altura relativa contra pai sem altura definida.** `max-height: %` vira
  `none` e `h-full` vira a altura natural do conteúdo. Bateu duas vezes no mesmo
  dia, no carrossel e na manchete do portal.
- **CSS solto depois do `@import "tailwindcss"`** vence toda utilidade,
  independente de especificidade. `a { color: inherit }` fora de layer anulava
  toda classe de cor em link no site inteiro.
- **`.default()` em campo novo de schema compartilhado** torna o campo
  obrigatório no tipo de SAÍDA e quebra todo literal que já existe.
- **Backtick dentro de comentário de CSS** em template literal encerra a string.
  Há um teste que varre isso porque a lição escrita falhou três vezes.
- **Mock parcial de módulo** derruba o que não for redeclarado.
- **`if (error || !data)`** colapsa "não achei" e "não consegui olhar", e o
  estado que some é sempre o que tem conserto.

## Decisões em aberto

Ficam aqui para não serem redescobertas como novidade.

- **Loop de aprendizado**: nada lê alcance ou salvamento e realimenta a pauta.
  `fetchMediaInsights` existe e ninguém chama.
- **`aeo_questions`**: única coluna de SEO ainda vazia. Pede geração, e cabe no
  mesmo passo em que a edição é escrita.
- **Multiprojeto**: o cron executa um projeto e não itera; o design de carrossel
  não tem `project_id`.
- **Versão escura do logotipo** foi gerada recolorindo o azul, não desenhada.
  FECHADO em 05/10/2026: o dono entregou as duas versões desenhadas. Ver
  "O logotipo" em Produto e marca.
- **Ícone quadrado da marca.** O favicon do site ainda é o padrão do Next, e o
  logotipo é uma assinatura horizontal que não cabe em 16 por 16. Precisa de
  uma marca quadrada desenhada (o "e" ou o ponto vermelho, por exemplo); o
  avatar do Instagram é candidato, mas tem detalhe demais para o tamanho.
