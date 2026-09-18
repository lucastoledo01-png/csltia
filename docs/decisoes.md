# Decisões do usa.journal

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

**A marca é `usa.journal`.** Era `imigra.us`, e antes disso `desbuguei.ia`. A
troca é de nome e de logotipo, não de linha editorial: continua sendo notícia
dos EUA para brasileiros.

**O Instagram é `@eua.journal`**, e não `usa.journal`. Foi verificado na Graph
API, não suposto. Se a conta for renomeada, três campos do `marca.ts` mudam
juntos: `handle`, `instagram`, `instagramHandle`.

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
pela bandeira, que é peça publicável. O que cai é a fração de posts ilustrados
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
