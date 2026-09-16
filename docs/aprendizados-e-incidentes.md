Registro de bugs, causas raiz e decisões não óbvias — pra não repetir o mesmo
diagnóstico do zero da próxima vez. Toda vez que algo quebrar em produção ou
uma decisão de arquitetura/conteúdo não for óbvia, acrescente uma entrada
aqui (curta, indo direto ao sintoma → causa → correção → lição). Não é
changelog de feature, é memória de "por que isso quebrou" e "por que
decidimos assim".

## Quando escrever uma entrada

O critério não é "quebrou em produção". Em 16/09/2026 seis correções ficaram só
na mensagem de commit porque o conserto tinha sido "só código", e várias delas
eram justamente as que se repetem: medida relativa contra pai sem altura,
verificação filtrada pela expectativa, guarda que lê uma chave e grava outra.

Escreva quando **a causa não é óbvia a partir do sintoma**, ou seja quando você
mesmo levaria mais de cinco minutos para reencontrá-la daqui a um mês. Isso
inclui:

- defeito achado ANTES de ir para produção, se a causa era sutil
- armadilha de framework ou de linguagem (precedência, cascata, tipo)
- decisão que parece arbitrária e não é
- erro de MÉTODO, como conferir de um jeito que não confere

Commit conta o que mudou. Teste impede a volta do caso. Esta entrada é a única
que explica o porquê para quem chegar depois.

## Infra & Deploy

### 502 em produção: Next.js standalone escutando no endereço errado

**Sintoma:** `casaloti.ia.br` retornava 502 do Traefik. O contêiner aparecia
"Up" no `docker ps`, e o log mostrava `✓ Ready in 0ms` — parecia saudável.

**Causa raiz:** o `server.js` gerado pelo build standalone do Next lê
`process.env.HOSTNAME` pra decidir o endereço de escuta. Sem essa env fixada
no Dockerfile, ele herdava o `HOSTNAME` que o Docker injeta automaticamente
em todo contêiner (o ID do contêiner) — passando a escutar só nesse endereço
específico, não em `0.0.0.0`. Confirmado via
`docker exec <container> node -e "require('http').get('http://localhost:80', ...)"`
→ `ECONNREFUSED`.

**Correção:** `ENV HOSTNAME=0.0.0.0` na etapa `runner` do `Dockerfile`.

**Lição:** um contêiner "Up" com log de "Ready" não prova que a porta está
aceitando conexão — teste de dentro do próprio contêiner antes de suspeitar
do proxy reverso.

### `dall-e-3` foi descontinuado — geração de imagem falhava 100% silenciosa

**Sintoma:** todos os posts do Instagram saíam com a mesma foto de banco de
imagem repetida, mesmo sendo sobre assuntos completamente diferentes.

**Causa raiz:** `generateCoverImageWithAI` chamava `model: "dall-e-3"`, que
não existe mais na API da OpenAI (`"The model 'dall-e-3' does not exist"`).
A função engolia o erro (`catch { return "" }`) e caía num fallback de ~5
fotos fixas do Unsplash — cujo `default` (sem categoria reconhecida) por
coincidência apontava pra mesma URL do bucket "chatgpt", dobrando a colisão.

**Correção:** trocado pra `gpt-image-1` (família atual). Também mudou o
formato de resposta: a API não aceita mais `response_format`, sempre devolve
`b64_json` (não mais `url`) — o código que tratava o retorno como URL HTTP
precisou ser ajustado pra aceitar `data:` URIs diretamente.

**Lição:** erros de geração de imagem/IA que só resultam em "usa o
fallback" nunca aparecem como erro visível pro usuário — testar a chamada
real à API de tempos em tempos, não só confiar que "sempre funcionou".

### RSS/Instagram: vídeo sendo usado como imagem de capa

**Sintoma:** a newsletter saiu com uma "imagem" quebrada (`<img>` apontando
pra um `.mp4`) na matéria da AWS.

**Causa raiz:** o extrator de imagem de RSS pegava qualquer
`<media:content>`/`<enclosure>` pela tag, sem checar o atributo `type=` nem
a extensão do arquivo — o feed da AWS anexava um vídeo de demonstração
nessa mesma tag. O mesmo padrão existia na coleta de perfis do Instagram:
`media_url` de um post de vídeo/reels aponta pro arquivo de vídeo, não uma
imagem, e o `media_type` vindo da Graph API não era usado pra filtrar.

**Correção:** `parseRSSItems` (RSS) agora exige `type="image/..."` ou
extensão de imagem antes de aceitar a URL; a coleta do Instagram só usa
`media_url` quando `media_type` é `IMAGE` ou `CAROUSEL_ALBUM`. Teste de
regressão em `collector.test.ts`.

**Lição:** ao extrair mídia de fontes externas (RSS, APIs de rede social),
sempre validar o *tipo* declarado, nunca assumir pela presença do campo.

### Cron pode falhar silenciosamente durante uma janela de indisponibilidade

**Sintoma:** um dia inteiro sem newsletter nem posts — nenhuma linha em
`newsroom_runs`, nenhuma edição em `news_editions`.

**Causa raiz:** o cron externo bateu em `/api/cron/newsroom` durante a
janela do 502 acima. A chamada nunca chegou a criar registro nenhum — não
teve erro pra logar porque a aplicação nem respondeu.

**Correção pontual:** disparo manual com `?wait=1` recupera o dia (o cron
não é sensível a data — roda a qualquer hora e gera a edição do dia
corrente).

**Lição / pendência:** não existe hoje nenhum alerta de "o cron devia ter
rodado e não rodou". `newsroom_runs` vazio num dia é indistinguível de "a
aplicação nunca recebeu a chamada" só olhando o painel — precisa checar
ativamente. Vale considerar um monitor externo (ex: healthcheck.io/cron
watchdog) que avisa se não houver run bem-sucedido até um horário limite.

## Conteúdo & IA

### QA de alucinação bloqueando o envio automático — isso é o sistema funcionando

> **Atualização de 2026-09-04.** A conclusão acima valia para o caso concreto,
> mas o portão estava calibrado errado. Ele olhava `qaResult.passed`, que é o
> veredito **genérico** autodeclarado pela IA: ela reprovava por tom, gramática
> ou nota baixa e a newsletter do dia inteiro ficava retida. E o motivo não era
> recuperável — dos sete campos que o checador devolve, só o `passed` era
> gravado; `issues` e `score` iam para um `console.log` dentro do contêiner.
>
> Agora o portão olha só `hallucination_risk`. Fato inventado chegando à lista
> não se desfaz com errata; vírgula errada se desfaz e não vale um dia sem
> edição. O detalhe do QA passou a ser gravado em `news_editions`
> (`qa_score`, `qa_hallucination_risk`, `qa_issues`) e uma retenção dispara
> alerta no Telegram — silêncio foi o que custou seis dias em agosto.
>
> **Lição sobre a lição:** "o sistema está funcionando" precisa ser verificável.
> Um portão cujo motivo de bloqueio não é gravado em lugar nenhum não é um
> portão auditável — é uma parada inexplicável.

**Sintoma:** a campanha do dia ficou como "draft" no Listmonk em vez de
disparar sozinha, sem nenhum erro visível.

**Causa raiz:** não é bug. O pipeline roda um checador de QA
(`qaResult.passed`) que reprovou a edição com `hallucination_risk: true` —
uma matéria incluiu números de comparação (percentuais de benchmark entre
modelos) que não estavam no pacote factual original das fontes. O
`autoSend` só dispara quando `qaResult.passed` é `true`
(`newsroom-service.ts`), então a campanha ficou retida pra revisão humana.

**Correção pontual:** editar a matéria removendo o trecho não verificável,
regerar o HTML (`renderEditionToHtml`) e atualizar a campanha via API do
Listmonk (`PUT /api/campaigns/:id` + `PUT /api/campaigns/:id/status`)
antes de disparar manualmente.

**Lição:** quando uma campanha fica em "draft" sem erro no log, checar
`qaResult` no retorno do cron (ou nos logs) antes de assumir que é bug —
pode ser o QA fazendo o trabalho dele. Vale melhorar a visibilidade disso
no painel de admin (hoje exige olhar o JSON bruto do run).

### GitHub Search API não suporta OR entre parênteses combinado com outro qualificador

**Sintoma:** `(topic:a OR topic:b OR topic:c) pushed:>data` devolvia
`total_count: 0` mesmo com milhares de repositórios em cada tópico
isoladamente.

**Correção:** uma query por tópico só, alternando por dia (`topic-sources.ts`).

**Lição:** testar queries da Search API do GitHub direto contra a API real
antes de assumir que a sintaxe documentada de outras APIs de busca se
aplica igual.

### Instagram Hashtag Search exige aprovação da Meta

Retorna erro `(#10)` em toda chamada sem o recurso "Instagram Public
Content Access" aprovado via App Review. Não é configuração errada — é
bloqueio de permissão mesmo. Hoje desligado via flag
(`INSTAGRAM_LISTENING_ENABLED = false` em `topic-sources.ts`), código pronto
pra religar assim que a aprovação sair.

### Instagram não permite DM automática por "seguiu a conta" — só por comentário

Cogitamos mandar Direct automático assim que alguém segue a conta (sem
precisar comentar nada). Não dá: a regra geral da Messaging API do Instagram
é que só se pode mandar DM pra quem já mandou mensagem primeiro — não existe
webhook público de "novo seguidor". A única exceção documentada é o "Follow to
DM", lançado pela Meta em outubro/2025, mas em beta fechada com o **ManyChat
como parceiro exclusivo** — o campo aparece no schema de webhooks da Meta mas
não na lista de campos publicamente inscritíveis, ou seja, não tem caminho de
acesso pra ferramenta self-hosted nenhuma (OpenReply incluso).

**Lição:** o único gatilho de Direct automatizado disponível pra gente é
comentário com keyword → private reply (exceção que a Meta permite
explicitamente). Não vale reinvestigar "mandar DM no follow" até a Meta abrir
isso como capacidade geral da Graph API.

### Guardrail de PI barrava a declaração da boa prática — duas vezes

**Sintoma.** Em 2026-09-04 o Sistema PROMPT tinha 2 conceitos no banco e os
dois `blocked`; zero assets, zero campanhas publicáveis. Sem conceito não há
aplicações, sem aplicações não há imagem, sem imagem não há post: o funil
inteiro parado por causa do portão.

**Causa.** O guardrail casava os termos proibidos sem olhar o contexto. Um
conceito que escreve `"sem marcas ou logotipos visíveis"` ou `"Não inserir
logos"` — que é exatamente o que se quer que ele escreva — era barrado por
*mencionar* o termo. A primeira correção acrescentou janela de negação e
fronteira de palavra (`"logo de"` casava com `"logo depois"`).

Sobrou um caso: `"aparência de recriação autoral, nunca de material oficial"`.
A lista de negações tinha `jamais` — a variante rara — e **não tinha `nunca`**.

**Corrigido.** `nunca`, `em vez de`, `no lugar de`, `nada de` na lista de
negações. Testes usam os textos reais dos conceitos bloqueados em produção, não
exemplos inventados.

**O segundo problema, maior que o primeiro.** O veredito é **gravado** no
registro, não recalculado na leitura. Afrouxar a regra não alcança o que já
está no banco: os dois conceitos continuariam barrados para sempre, e o
conserto seria `UPDATE` na mão em produção. Daí a rota
`/api/admin/prompt-system/concepts/reavaliar` e o botão no painel.

A reavaliação **só afrouxa** de propósito: conceito que passou a ser reprovado
sob a regra nova continua `draft`. Rebaixar conteúdo já aprovado — possivelmente
já publicado — é decisão editorial, não efeito colateral de um botão.

**Lição.** Portão cujo veredito é persistido precisa nascer com o caminho de
reavaliação. Sem ele, cada calibração do critério deixa um rastro de registros
presos numa regra que não existe mais. E quando um guardrail bloqueia texto,
teste com o texto que ele **deve** aprovar, não só com o que deve barrar — a
falha aqui não foi deixar passar o proibido, foi barrar o recomendado.

### Layout desenhado no painel sem bloco de imagem: manchete branca sobre fundo claro

**Sintoma.** A primeira arte renderizada de verdade do pipeline social V2 saiu com
o título invisível: texto branco sobre o creme do canvas, e a foto aprovada pelo
resolvedor não aparecia em lugar nenhum.

**Causa.** `assembleSlide` dá precedência ao layout desenhado no painel sobre a
variante de código, e dá precedência inteira, sem chrome por cima: quem posicionou
os blocos decidiu tudo. O desenho salvo para `noticia/cover` tem três blocos, um
degradê, a marca e a manchete em branco, e **nenhum bloco de imagem**. Ele foi
desenhado assumindo uma foto que ele mesmo não sabe carregar.

**Corrigido.** `diagnosticarLayout` em `social/arte.ts`. O desenho só manda quando
consegue mostrar o que recebeu: com foto, precisa de um bloco `imagem` de fonte
`fundo`. Caso contrário a variante de código assume, e o diagnóstico sai nomeado
como `LAYOUT_MISSING_IMAGE_SLOT`. A regra é de capacidade, não de gosto.

**Lição.** Nenhum teste de unidade pegaria isso: o layout vem do banco, e o defeito
só existe no encontro entre o desenho salvo e o conteúdo recebido. Precedência total
("o desenho manda") precisa vir com uma checagem de que o desenho serve para o
conteúdo, senão ela transfere para o dado a decisão de quebrar a peça.

### Atribuição de licença guardada em coluna não cumpre a licença

**Sintoma.** Nenhum. É esse o problema.

**Causa.** CC BY e CC BY-SA exigem atribuição visível junto da obra. O autor vinha
do Commons, era avaliado por `avaliarLicenca`, montado por `montarAtribuicao` e
gravado no registro do asset. Só que ninguém desenhava nada: `montarAtribuicao`
estava importado e não usado no resolvedor, e nenhuma variante renderizava crédito.
Quem vê o post não vê a coluna do banco.

**Corrigido.** `renderShell` aceita `credito` e imprime a tira sobre a arte; a
arte do V2 passa `asset.attribution`. Licença que não exige atribuição continua sem
tira, e o registro completo (autor, licença, URL da licença, estado da verificação,
e se o crédito foi impresso) é gravado nos dois casos.

**Lição.** Requisito de licença é requisito de RENDER, não de schema. Gravar o autor
prova diligência e não cumpre a obrigação; a obrigação só é cumprida no arquivo que
sai publicado.

### PENDENTE: 06/09 sem newsletter e sem posts

**O que se sabe.** Em 2026-09-06 a newsletter não saiu e os posts do pipeline antigo
também não. Ainda não investigado.

**Por que está aqui.** O dono do produto definiu isto como bloqueio obrigatório
antes de ativar o Social V2: um pipeline novo não entra em produção enquanto o
antigo tiver uma parada sem causa conhecida, porque as duas coisas dividem cron,
worker e banco, e uma causa comum não seria distinguida do ruído do lançamento.

**Onde começar.** `newsroom_runs` vazio no dia significa que a chamada não chegou à
aplicação; `failed` significa que chegou e quebrou. Foi assim que os seis dias de
agosto foram diagnosticados. Conferir também o watchdog e o alerta do Telegram, que
existem desde então justamente para este cenário.

### Hashtag descrevia a página da fonte, não o post

**Sintoma.** O primeiro preview do evergreen saiu com `#EB5 #H1B #VistoF1
#GreenCard #USCIS #ICE #CBP` num post sobre ajuste de status, e os quatro posts
do dia saíram com quase o mesmo conjunto.

**Causa.** Nenhuma daquelas hashtags foi inventada: todas estavam no texto que a
inferência recebe. O `resumo` que chega a `hashtagsDaPauta` é
`enriquecimento.texto`, e no evergreen esse campo é a PÁGINA INTEIRA do policy
manual da USCIS, que cita o sistema imigratório completo, inclusive ICE, CBP e a
Suprema Corte. A régua do módulo ("o assunto precisa aparecer no título, no
resumo, nas entidades ou na categoria") vale para uma matéria, que trata de um
assunto, e não vale para um manual, que enumera tudo.

**Corrigido.** `ResultadoDoEnriquecimento.assuntoParaHashtags`: quem tem um
resumo curado declara, e a guarda o prefere. O texto de origem continua indo
inteiro para o gerador, que é quem precisa dele. Quem não declara segue usando
`texto`, então o caminho da notícia não mudou, e há teste dos dois lados.

**No mesmo trabalho.** Duas lacunas de flexão na inferência compartilhada:
"residente permanente" não era reconhecido como green card, e "migratório" não
era reconhecido como imigração, o que deixava cinco tópicos do catálogo fora do
sinal de imigração.

**Lição.** Inferência calibrada para um tipo de fonte não se transfere para outro
tipo de fonte só porque o campo tem o mesmo nome. Quando o significado do campo
muda, quem sabe disso precisa declarar.

### Nome de arquivo fixo mais upsert: o carrossel sobrescreveria a si mesmo

**Sintoma.** Nenhum, e é por isso que está aqui. Foi encontrado antes de rodar.

**Causa.** `congelarArtefato` grava `social-v2.png` num caminho que já é único
por post, e `subirPngParaStorage` usa `upsert: true`. Congelar N slides num laço
sobre essa função faria os seis slides do mesmo post gravarem no MESMO objeto: o
último venceria, os seis registros do manifesto apontariam para ele, e cinco dos
seis hashes divergiriam na publicação. O post não sairia errado, simplesmente
nunca sairia, e o motivo apareceria como `SOCIAL_ARTIFACT_HASH_MISMATCH` sem nada
explicando por quê.

**Corrigido.** `congelarCarrossel` põe o índice no nome (`social-v2-01.png`), e o
teste de artefato confere que N slides produzem N hashes distintos.

**Lição.** Caminho determinístico com upsert é uma decisão que assume UM arquivo
por chave. Quando a quantidade por chave deixa de ser um, a chave precisa mudar
junto, e reaproveitar a função de um item num laço é exatamente onde isso passa.

### PENDENTE: PROPORCAO_MINIMA e PROPORCAO_MAXIMA estão mortas e erradas

**O que.** `artefato.ts` declara `PROPORCAO_MINIMA = 0.8` e
`PROPORCAO_MAXIMA = 1.91` com o comentário "proporções que a Meta aceita no
feed", e **nenhum código as usa**. `conferirArte` só confere se largura e altura
são maiores que zero.

**Por que não foram ligadas.** O canvas do projeto é 1080x1440, ou seja 0.75, que
é MENOR que o mínimo declarado. Ligar a verificação recusaria todas as peças,
inclusive as que já publicaram com sucesso. O número está desatualizado: o
Instagram passou a aceitar 3:4 no feed.

**O que fazer.** Ou corrigir o mínimo para 0.75 e então ligar a verificação, ou
apagar as duas constantes. Deixá-las declaradas e não usadas é o mesmo padrão do
incidente de `escolherUrlPublicavel`: dá a impressão de que o caso está coberto.

### A mesma regra em três cópias, e a linha gravada mentindo

**Sintoma.** A edição de 16/09 publicou e o post saiu no desenho novo, mas a
linha em `social_posts` dizia `content_json.arte.variante = "fullbleed_portrait"`,
que é o desenho antigo. Vinte minutos de diagnóstico foram gastos investigando
um post que estava correto.

**Causa.** A regra "qual variante desenha a capa" existia em três lugares:

1. `social/arte.ts`, decidindo o desenho de verdade
2. `social-posts-store.ts`, decidindo o que gravar no `content_json`
3. `instagram/carga-v2.ts`, conferindo se os dois concordam

Ao trocar o desenho para a gramática de jornal, só a primeira mudou. A segunda
passou a gravar um nome que não correspondia à peça, e a terceira, que existe
justamente para pegar linha contraditória, comparava duas cópias velhas entre si
e não acusava nada.

**Corrigido.** `varianteDaCapa(comFoto)` é a única regra, e os três a chamam. A
conferência passou a acusar de verdade: ela reprovou as fixtures antigas assim
que a regra mudou, que é exatamente o comportamento esperado dela.

**Lição.** Campo que descreve uma decisão sem TOMAR a decisão é campo que mente,
e mente em silêncio. E conferência que guarda a própria cópia da regra não
confere a regra: confere se as duas cópias envelheceram juntas.

### A régua lia uma chave e o banco gravava outra

**Sintoma.** Nove posts perenes sobre três assuntos em quatro dias: ajuste de
status, processo consular e a comparação entre os dois, todo dia, com ângulos
diferentes. Nenhum título repetido, e o feed parecendo um disco riscado.

**Causa.** O evergreen guarda a identidade em `story_id`, no formato
`evg:<tópico>:<ângulo>`, e a janela de repetição procura por `evg:<tópico>`. Só
que quem gravava `topic_id` era `topicoDaPauta`, a regra da NOTÍCIA, que olha o
texto e devolve `programa:eb5`. Os nove posts tinham o mesmo `topic_id`.

O cooldown do par funcionava, porque ele usa `story_id` e a chave casava. A
janela do tópico nunca disparou porque as duas chaves nunca se encontravam.

**Corrigido.** A gravação passou a usar a chave que a régua lê, e o teste liga
as duas pontas que o código separava: o que o adaptador produz e o que a seleção
consulta.

**Lição.** Regra que consulta uma chave e grava outra não protege nada, e ainda
parece protegida. Quando uma guarda existe e o defeito acontece assim mesmo,
conferir se os dois lados falam da mesma chave vem antes de suspeitar da regra.

### A mesma foto em quatro posts, e duas causas somadas

**Sintoma.** `pexels-photo-3751006` ilustrou quatro posts em três dias, e
`pexels-photo-6358834` ilustrou dois.

**Causa 1: a busca pedia uma foto só.** `per_page=1` no Pexels e no Unsplash.
Busca determinística com um único resultado devolve sempre a mesma foto para a
mesma consulta.

**Causa 2: ninguém guardava o que já tinha saído.** A biblioteca interna existe
e tem janela de dias, mas indexa por ENTIDADE. A foto do banco conceitual é
escolhida por CONCEITO, então nunca disputa a mesma chave, e o código ainda a
excluía explicitamente do registro na biblioteca.

**Causa 3, que apareceu ao consertar.** O conjunto de "já usadas nesta edição"
era criado dentro de cada chamada do resolvedor, então cada pauta tinha o
próprio conjunto vazio: o dedupe do dia não deduplicava nada, e dois posts do
mesmo dia saíram com a mesma foto.

**Corrigido.** A busca pede quinze e pula as que já saíram, por identidade sem
os parâmetros de entrega, já que a mesma foto vem com URLs diferentes conforme o
tamanho. A memória lê `content_json.visual` em `social_posts`, o mesmo lugar que
registra o que foi ao ar. E o conjunto do dia passou a ser um só para o ciclo.

**Lição.** Guarda que indexa por uma dimensão não alcança o que é escolhido por
outra. E conjunto de deduplicação criado dentro do laço é o mesmo que não ter.

### Medida relativa contra pai sem altura definida, duas vezes no mesmo dia

**Sintoma 1.** A manchete do post crescia sem limite e subia por cima da bolha.
`max-height: 22%` estava declarado e não fazia nada.

**Sintoma 2.** A foto da manchete do portal virou 1061px de altura depois que eu
troquei altura fixa por `h-full`.

**Causa, a mesma nos dois.** Porcentagem e `h-full` só resolvem contra pai com
altura DEFINIDA. Com pai de altura automática, `max-height:22%` computa como
`none` e `h-full` vira a altura natural do conteúdo, que no caso era uma foto de
3909x5863.

**Por que importa mais que o pixel.** No primeiro caso havia um script que
encolhe o texto enquanto ele não couber, e ele mede `clientHeight`. Com a caixa
de altura automática, `clientHeight` é a altura do próprio conteúdo: a condição
nunca é verdadeira e o script nunca encolhe nada. A ferramenta existia,
executava e não fazia efeito.

**Corrigido.** Faixa com topo e base fixos no primeiro caso, proporção fixa no
segundo. A caixa passa a existir antes do conteúdo.

**Lição.** Antes de usar percentual ou `full` em altura, perguntar de quem ela é
percentual. E ferramenta de ajuste que mede caixa precisa de caixa medível.

### Estilo fora de layer vencia toda utilidade de cor do site

**Sintoma.** O menu do portal saía com texto preto sobre azul-marinho, e a
classe `text-white/80` estava no componente.

**Causa.** `globals.css` declara `a { color: inherit }` FORA de layer, depois do
`@import "tailwindcss"`. Estilo sem layer vence estilo em layer independente de
especificidade. O efeito não era só o menu: **nenhuma classe de cor do Tailwind
funcionava em link nenhum do site**, e todo link herdava a cor do pai em
silêncio.

**Corrigido.** A regra entrou em `@layer base`. A intenção continua, e agora uma
classe consegue dizer outra coisa.

**Lição.** Em Tailwind 4, CSS escrito solto depois do import não é "um ajuste
pequeno": é uma regra que ganha de todo o resto. Medir a cor computada no
navegador custa dez segundos e teria apontado a causa direto.

### O portal nascia vazio a cada deploy, e se curava sozinho

**Sintoma.** O dono abriu o site depois de um deploy e não havia notícia
nenhuma. Minutos depois, havia.

**Causa.** A home era pré-renderizada no build com revalidação de cinco minutos,
e **o build na VPS não tem as variáveis do banco**: o EasyPanel injeta o
ambiente em execução, não na construção. A leitura falhava, o `catch` devolvia
lista vazia, e a página nascia sem matéria.

**Por que é pior que falhar.** Ela se curava na primeira visita depois dos cinco
minutos. O defeito aparecia para quem chegasse primeiro e sumia antes de alguém
conseguir olhar.

**Corrigido.** A home renderiza por requisição. O sitemap nasceu já assim, pelo
mesmo motivo.

**Lição.** Página que depende de banco e é gerada no build assume que o build
alcança o banco. Aqui ele não alcança, e o `catch` que protege a página de cair
é o mesmo que transforma a falha em página vazia plausível.

### Sitemap que responde 500 é pior que sitemap ausente

**Sintoma.** `/sitemap.xml` com HTTP 500 e `RangeError: Invalid time value`.

**Causa.** O campo `date` do artigo vem formatado para leitura, no estilo
"16 de set. de 2026". `new Date()` disso devolve Invalid Date, e o Next chama
`toISOString()` ao montar o XML.

**Corrigido.** A data só entra quando é uma data, e falha de leitura devolve as
páginas fixas em vez de derrubar a rota.

**Lição.** O rastreador lê 500 no sitemap como problema do site, não do arquivo.
Em rota de infraestrutura de busca, degradar vale mais que estar completo.

### O domínio imigra.us nunca apontou para a aplicação

**O que.** `imigra.us` devolve 114 bytes de página de estacionamento do
registrador, com um redirecionamento para `/lander`. A aplicação está em
`casaloti.ia.br`.

**Por que está aqui.** Isso consumiu meia hora de diagnóstico de "o site está
sem notícia": estávamos olhando endereços diferentes. Quando o relato não bate
com a medição, conferir PRIMEIRO se os dois lados falam da mesma URL.

### 16/09: QA 98, sem alucinação, e a edição barrada mesmo assim

**Sintoma.** O ciclo rodou inteiro, 9 minutos, e foi barrado por
`UNGROUNDED_EDITORIAL_CLAIM` em quatro conclusões. O detalhe, agora gravado no
banco, mostrou o que três dias de discussão não tinham mostrado:

```
QA 98 | alucinação: não | reparos: 2
[conclusão impacto] "Estudantes e visitantes de intercâmbio afetados
  ACOMPANHAM o adiamento antes de uma possível mudança na duração do status"
  -> o pacote identifica os grupos abrangidos e o adiamento, mas não informa
     que eles acompanham o adiamento.
```

As quatro conclusões eram **a mesma frase reescrita pelo laço de reparo**, e a
objeção era sempre a mesma forma.

**O auditor estava certo.** Nenhuma fonte oficial afirma o que as pessoas estão
acompanhando: ela fala de regra, prazo e decisão. "Estudantes acompanham" é
afirmação sobre comportamento de terceiros, e não há pacote factual que a
sustente.

**Quem estava errado era a instrução.** O campo `practical_impact` pedia, com
todas as letras, "o que a pessoa precisa fazer ou **observar**". A redação
obedecia, e a régua recusava. O reparo não salvava porque ele reescrevia
mantendo o verbo: o verbo era o que a instrução pedia.

**Corrigido sem tocar na régua.** A instrução passou a pedir o EFEITO da regra
sobre as pessoas, que está na fonte, e a proibir afirmação sobre o que elas
fazem, acompanham, observam ou esperam. E oferece a saída, porque proibir sem
mostrar o caminho deixa o modelo sem opção: para falar com o leitor, fale COM
ele ("se você está com F-1, o prazo antigo continua valendo"), que é
endereçamento e não afirmação sobre terceiros.

**Lição.** Quando uma guarda reprova todo dia com nota alta e sem risco de
alucinação, o suspeito não é a guarda: é a instrução que fabrica o que ela
recusa. E laço de reparo não conserta contradição entre instrução e guarda, só
a repete com sinônimos.

### O webhook do CORE reinicia em 1 segundo, e isso não é um deploy

**Medido em 16/09/2026**, em três disparos. O processo do worker nasce sempre
UM segundo depois do POST no webhook, e nenhum segundo processo aparece nos
cinco minutos seguintes. Um clone mais build não acontece em um segundo: o que
aquele hook faz é reiniciar o contêiner com a imagem que já estava lá.

O webhook do WEB se comporta como o esperado: o `next-server` nasce de 40 a 50
segundos depois do disparo, que é o tempo do build.

**Por que não travou nada.** A arte é renderizada no contêiner WEB desde que o
artefato passou a ser congelado no momento da aprovação (está no cabeçalho do
`Dockerfile`). O worker baixa o arquivo aprovado e confere o SHA-256. Mudança
de gramática visual, de manchete e de composição da edição entra pelo WEB.

**O que fazer.** Não use a idade do processo do worker como prova de deploy do
core: ela prova reinício, não código novo. Para o worker, a prova é
comportamento observado (uma peça publicada depois da mudança) ou a tela do
EasyPanel.

### O build de produção quebrou, e o contêiner antigo continuou no ar

**Sintoma.** Deploy disparado nos dois serviços. O worker reiniciou dois minutos
depois do clone; o web não reiniciou nunca. O código novo estava no disco dos
dois, e o processo do web era mais velho que o clone.

**Por que isso é perigoso.** O EasyPanel mantém o contêiner anterior quando o
build falha, então o site continua no ar, respondendo 200, servindo o código
velho. Não há erro visível em lugar nenhum que este projeto alcance: o log do
build está no contêiner, e o usuário `deploy` não tem docker. O sinal é
indireto, e é sempre o mesmo: processo mais velho que o clone.

**Causa.** Um campo novo no schema, `inset_image_url`, declarado como
`z.string().optional().default("")`. O `.default()` torna o campo obrigatório no
tipo de SAÍDA do schema, e todo literal de slide já existente no repositório
deixou de compilar.

**O erro de método, que é o maior.** Eu rodei `tsc --noEmit` e **filtrei a saída
pelos arquivos que eu tinha editado**. O erro estava em `AdminCarouselDesignManager.tsx`
e em `sample-data.ts`, que eu não tinha tocado e por isso não apareciam no meu
grep. Verificação cuja saída é filtrada por expectativa não é verificação: ela
confirma o que já se acredita.

**Corrigido.** O campo perdeu o `.default()`, e quem lê já tratava ausência com
`?? ""`. E `npm run build` passou a ser parte do fecho, antes do deploy, porque
o `next build` roda o type check do projeto inteiro e o `vitest` não.

**Lição.** Filtrar a saída de um verificador pelos arquivos que você mexeu é o
mesmo que não rodar o verificador. E `.default()` num schema não é conveniência:
ele muda o contrato de saída para todo mundo que constrói o objeto.

### 14/09, segundo ato: o bloqueio que diz quantas e não diz quais

**O que.** Com a releitura em produção, o ciclo de recuperação viveu 9min19s em
vez de 7 segundos, passou por coleta, seleção e redação inteira, e foi barrado
no portão editorial:

```
Edição bloqueada depois de 2 tentativa(s) de correção (QA 86)
UNGROUNDED_EDITORIAL_CLAIM em 2 conclusão(ões)
```

**O problema não era o portão, era a cegueira.** O trecho reprovado existia,
montado em `DetalheDoBloqueio` e anexado ao erro, e ia inteiro para
`console.error` dentro de um contêiner que ninguém alcança sem docker. No banco
sobrava a contagem. Três dias discutindo a mesma guarda sem nunca ver a frase.

Contagem não distingue as duas hipóteses, e elas pedem ações opostas: ou o texto
inventou, ou a régua apertou. Afrouxar sem saber qual é publicaria alucinação.

**Corrigido.** `resumoDoBloqueio` entra em `error_message` junto da falha, com o
trecho e o motivo de cada conclusão reprovada, antes da linha do stack: a coluna
é cortada em 2000 caracteres, e o que o corte pode comer tem que ser a parte que
menos responde. O dry run local imprime o mesmo detalhe.

**O dado que mudou o diagnóstico.** Um dry run local minutos depois, mesmas
fontes, passou com QA 100/100. O bloqueio foi variação daquela redação, não
defeito sistemático. Sem isso eu teria mexido na régua por causa de um sorteio.

**Lição.** Portão que decide não publicar precisa gravar POR QUE, com o texto na
mão. Diagnóstico que só existe em log de contêiner inalcançável é diagnóstico
que não existe.

### 14/09: consertei o caso, e o problema andou uma casa

**Sintoma.** O ciclo morreu de novo sete segundos depois de começar, um dia
depois da correção:

```
RUN_FAILED: Falha ao carregar fontes do projeto: Gateway Timeout
```

**Causa.** Em 13/09 a falha foi em `getProjectById` e eu blindei **aquela**
leitura com uma segunda tentativa. Em 14/09 a mesma classe de falha bateu na
leitura seguinte, `getProjectNewsSources`, que não tinha proteção nenhuma.

São três leituras no começo do ciclo, cada uma capaz de custar newsletter,
artigo e post sozinha: projeto, fontes do projeto e histórico editorial. As três
já falharam ao menos uma vez nesta semana.

**Por que o gateway estoura sempre às 09:03.** Medido: a PRIMEIRA consulta do dia
leva 2,2s e as seguintes 0,6s. O último tráfego é o cron do Sistema PROMPT às
23:00, então às 09:03 o banco está há dez horas ocioso e a conexão está fria.

**Corrigido.** `leitura.ts` com `LeituraFalhou` e `comRetentativa`, aplicado às
três. Releitura é segura aqui porque são leituras puras: reler não grava, não
cobra e não duplica; o único custo é latência. Indisponibilidade real continua
derrubando o dia, porque as tentativas acabam e o erro sobe com o motivo.

Só falha de leitura é relida. "O projeto não tem fonte habilitada" é
configuração: a resposta seria a mesma e repetir só atrasaria o alerta.

**Lição.** Corrigir o caso quando o defeito é da classe compra um dia. Quando a
mesma falha aparece duas vezes em pontos diferentes, o conserto certo é no
padrão, não no ponto.

### 13/09: "projeto não encontrado" sobre um projeto que existe

**Sintoma.** O ciclo diário morreu **sete segundos** depois de começar. Zero post,
zero edição. A linha em `newsroom_runs` dizia:

```
RUN_FAILED: Projeto 00000000-0000-4000-8000-000000000001 não encontrado.
```

**O projeto existia e estava ativo.** Conferido no banco no mesmo dia.

**Causa.** `getProjectById` fazia `if (error || !data) return null`. Erro de
leitura do Supabase e linha ausente viravam a mesma resposta, e
`requireActiveProject` anunciava "não encontrado". Naquela madrugada o Supabase
vinha dando `Gateway Timeout` intermitente, visto também numa leitura da
biblioteca visual e numa do histórico editorial.

**Por que importa mais que o dia perdido.** A mensagem mandava procurar o defeito
na configuração, que estava certa. Os dois casos pedem reações opostas: projeto
ausente é configuração e ninguém deve tentar de novo; leitura falhou é
infraestrutura e tentar de novo resolve.

**Corrigido.** `LeituraDoProjetoFalhou` separa os dois, e `requireActiveProject`
faz UMA segunda tentativa, só para falha de leitura. É a primeira coisa que o
ciclo faz, e um soluço de rede ali custa o dia inteiro. Projeto ausente não é
tentado de novo.

**O que salvou o diagnóstico.** A linha `failed` em `newsroom_runs`, criada no dia
anterior. Sem ela, 13/09 teria sido mais um dia em branco indistinguível de cron
morto, e a investigação começaria do zero pela quarta vez.

**Lição.** `if (error || !data)` é um colapso de dois estados num só, e o estado
que some é sempre o que tem conserto. Toda leitura cujo `null` decide um fluxo
precisa distinguir "não achei" de "não consegui olhar".

### 10/09 sem edição: o cron disparou, e a falha apagou a própria evidência

**Sintoma.** Nenhuma linha em `newsroom_runs` no dia 10/09/2026, nenhuma edição,
nenhum artigo, nenhum post. A leitura imediata, de novo, era cron morto.

**Não era, e desta vez o cron foi cercado inteiro.** Crontab instalado no usuário
`deploy`, daemon `active` e `enabled`, fuso do servidor em UTC, linha
`3 9 * * *` (09:03 UTC = 06:03 America/Sao_Paulo), endpoint certo, método POST,
segredo no header. O log do cron tem a chamada de 10/09 às 09:03:01 com resposta
`{"ok":true,"accepted":true}`. Sem DNS, sem rede, sem 401, sem 404, sem 5xx.

**E a redação rodou.** 109 candidatas classificadas e persistidas em
`news_candidates` naquele dia, 5 aprovadas pela linha editorial, portanto acima
do mínimo de 2. Depois disso, silêncio.

**Causa.** `newsroom_runs` é gravado UMA vez, no fim do caminho de sucesso
(`created_at` igual a `finished_at` em todas as 21 linhas da tabela). Qualquer
exceção entre a aprovação editorial e a escrita de `news_editions` apaga a
própria evidência. No trecho existe um portão que decide não publicar e sinaliza
por `throw`: o bloqueio do QA quando a guarda está em `enforce`.

É a lição de 06, 07 e 08 de setembro com outro rosto. Naquela vez a correção foi
gravar antes de sinalizar, e ela alcançou só o mínimo de pautas
(`registrarDiaSemEdicao`). O resto do caminho continuou saindo por exceção.

**Corrigido.** `registrarFalhaDaRedacao`: `runNewsroom` virou um invólucro que
grava um run `failed`, com o motivo, e repassa o erro. Não muda decisão nenhuma
e não engole erro nenhum. `failed` já está no CHECK da migration original, e a
chave leva a hora da falha porque `idempotency_key` é UNIQUE global.

**O que continua não sendo possível.** Ler o log do contêiner: o usuário `deploy`
não está no grupo `docker` e não tem sudo, e a base do EasyPanel não é acessível.
Por isso a evidência precisa estar no banco, e não no log.

**Lição.** A correção de um portão que sinaliza por exceção não vale para os
outros portões do mesmo trecho. Enquanto a linha do run nascer só no fim do
sucesso, todo caminho de erro é invisível por construção, e cada gate novo
reintroduz o mesmo buraco.

### A rota chamada dry-run criava publicação de verdade

**Sintoma.** Nenhum, e foi encontrado ao preparar a validação do rollout.

**Causa.** `dryRun` governava a newsletter, o portal e o Listmonk, e parava ali.
No social quem decidia era só `SOCIAL_PIPELINE_V2`. Com a flag em `enforce`, um
dry-run de `/api/admin/newsroom/run` percorria o pipeline inteiro: gerava copy,
resolvia imagem, congelava artefato no Storage e gravava linha `scheduled` em
`social_posts`. O worker publicaria aquilo no perfil.

**Corrigido.** `modoSocialParaOEnsaio`: em ensaio o canal social é rebaixado
para `dry_run`. O rebaixamento só desce, porque ensaiar não pode LIGAR um
pipeline que o operador desligou, e fora do ensaio devolve `undefined`, para o
caminho do cron continuar lendo a flag.

**Por que não bastava mexer na variável de ambiente.** Era essa a intenção
inicial: pôr o canal em `dry_run` no EasyPanel durante a validação e devolver
depois. Garantia que depende de alguém lembrar de reverter uma flag não é
garantia, e o teste da validação é exatamente o caminho onde o erro seria caro.

**Lição.** Quando um parâmetro de segurança existe há tempo e um consumidor novo
aparece, a pergunta não é se o parâmetro existe: é se o consumidor novo o lê. O
social nasceu depois do `dryRun` e nunca o recebeu.

### O desenho do painel vencia a capa nova, e só quando havia foto

**Sintoma.** Nenhum, e por pouco. A capa de carrossel foi aprovada olhando as
renderizações sem foto. Ao renderizar a primeira com foto, ela não apareceu: saiu
a capa antiga.

**Causa.** `assembleSlide` dá precedência total ao layout desenhado no painel, e
`resolveLayout` foi consultado para o par (noticia, cover). `diagnosticarLayout`
recusa o desenho quando não há bloco de imagem para a foto recebida, então **sem
foto** o desenho caía e a variante de código assumia; **com foto** o desenho
passava a valer e a capa de carrossel nunca era desenhada.

O efeito seria uma capa aprovada que some exatamente no dia em que há imagem,
que é o dia em que ela deveria estar melhor.

**Corrigido.** `usaDesenho` passou a exigir também `estiloDaCapa !== "carrossel"`.
O desenho salvo posiciona manchete, marca e foto do jeito da notícia, e a capa do
carrossel é outra peça de propósito.

**Lição.** Precedência condicional é pior que precedência fixa para quem revisa:
o caminho em que o desenho vence só aparece quando a condição bate, e a revisão
visual foi feita justamente no caminho em que ela não batia. Ao dar a uma peça
uma variante nova, verificar os DOIS estados da condição, não só o que está à mão.

### Crase dentro do CSS, cinco vezes, e a trava que faltava

**Sintoma.** `TransformError` do esbuild apontando uma linha distante da causa, e
numa das vezes o render simplesmente não aconteceu.

**Causa.** `BASE_CSS` é template literal. Escrever o nome de uma classe entre
crases num comentário do CSS encerra a string ali.

**Por que merece entrada própria.** Isto já estava documentado duas vezes neste
arquivo, e aconteceu mais três. Documentação não impediu a repetição porque
depende de alguém lembrar no momento exato de escrever o comentário.

**Corrigido.** `css-sem-crase.test.ts` varre os literais de estilo procurando
crase solta, e inclui um caso que prova que a varredura acusaria o erro de
verdade. Sem esse caso, um teste que nunca acusa nada é indistinguível de um
teste que não confere nada, que é a lição do auditor semântico com zero recusas.

**Lição.** Quando a mesma lição escrita falha três vezes, o problema não é a
lição: é o formato dela. Conferência mecânica não depende de memória.

### comporFeedDoDia tinha teste e não tinha chamador

**O que era.** `evergreen/compositor.ts` exportava `comporFeedDoDia`, com quatro
`it()` cobrindo prioridade da notícia e teto do dia, e o único chamador era o
próprio teste: em produção a composição News + Evergreen acontecia em
`pipeline-v2.ts`, montando `[...noticia, ...extras]` direto.

**Por que importava.** É o padrão registrado no incidente do Google News: função
de guarda escrita e não chamada é pior que função ausente, porque o teste prova
uma coisa que não acontece.

**FECHADO.** `pipeline-v2.ts` chama `comporFeedDoDia`, a concatenação solta saiu,
e o log do dia imprime a decisão do compositor. A auditoria que fechou isto
encontrou algo maior no mesmo lugar: o canal Evergreen era inalcançável a partir
do cron, porque ninguém passava a opção `evergreen` para `rodarSocialDoDia`.
`SOCIAL_EVERGREEN_V2=enforce` não teria produzido nada. Agora quem decide é a
flag, dentro da função, e há teste que roda o entrypoint sem passar a opção.

### Campo validado e campo impresso não eram o mesmo campo

**Sintoma.** Nenhum, e foi encontrado por revisão adversarial antes de publicar.

**Causa.** `copy.destaque` era campo morto no render: a capa estática o ignora e
seta `highlight_text: ""`. O carrossel criou o primeiro consumidor de render dele,
como título do slide de fechamento. Só que a guarda ancora `copy.headline` e
`montarLegenda(copy)`, e `montarLegenda` não inclui `destaque`. Resultado: um
destaque com número inventado ia congelado para a Meta sem nenhuma conferência,
no último slide, em três de cada quatro posts (o slide de fechamento existe
sempre que há CTA).

**Pior que o defeito.** O comentário que eu mesmo escrevi afirmava o contrário do
que o código fazia: "a manchete mais o destaque, que já existem na copy, já são
ancorados pela guarda". Um comentário errado é pior que comentário ausente,
porque ele encerra a investigação de quem for olhar depois.

**Corrigido.** O destaque só vai para a arte se for trecho LITERAL da manchete, que
é o que o prompt já pedia e ninguém conferia: trecho de texto ancorado está
ancorado. Quando não é, a peça sai com a manchete inteira, e a guarda aponta.

**Lição.** Ao dar a um campo o seu primeiro consumidor de RENDER, a pergunta não é
se ele existe: é por qual conferência ele passa. Campo que ninguém imprimia não
tinha por que ser validado, e passar a imprimi-lo é mudar o contrato dele.

### A verificação de número era verificação de substring de dígito, e depois de sentido

**Sintoma.** Nenhum visível. Medido na revisão adversarial do carrossel.

**Causa.** As três buscas de `numeroSustentado` eram `palheiro.includes(...)` sem
fronteira. Com a fonte dizendo "Foram 1540 pedidos", o texto "a espera chega a
540 dias" passava, porque "540" está dentro de "1540". Com "$1,440", passava "a
taxa é 440 dólares".

É grave em qualquer pauta e pior no conteúdo permanente, onde o palheiro é a
página inteira de um manual oficial: número de seção, de formulário e de taxa em
profusão, cada um servindo de âncora livre para um prazo que ninguém escreveu.

**Corrigido.** A busca exige fronteira de dígito. A comparação por dígitos puros
continua existindo, então "1.440" segue sustentando "1,440" e "1440".

**FECHADO na rodada do release candidate.** Número de norma citado na fonte
ancorava prazo inventado: com "INA 245(a)" no material, "o processo leva 245 dias"
passava, porque ali o 245 é um número solto de verdade. Fronteira de dígito não
resolve isso; o que resolve é ler o PAPEL do número.

`numeros-com-sentido.ts` classifica cada número pela vizinhança dele em nove
tipos, e a compatibilidade passou a exigir valor E tipo. A regra que fecha o
furo: identificador jurídico, de formulário ou de seção nunca sustenta
quantidade, duração, percentual ou moeda, nas duas direções. O teste que afirmava
o limite mudou de propósito, que era o que o comentário dele previa.

**Segundo limite, também FECHADO, e por reúso.** Slide de prosa puramente
qualitativa voltava com zero claims conferidas e zero bloqueios, ou seja aprovado
sem que nada nele tivesse sido verificado. A ancoragem determinística confere
número, data e nome próprio; afirmação sem nenhum dos três não tem o que
conferir.

Não foi criado verificador novo. `auditarClaims`, em `claims-semanticas.ts`, já
fazia exatamente isso para a newsletter: uma chamada para uma lista de pares
(pacote, texto), com índice por item. O carrossel manda um slide por índice e
recebe a rastreabilidade de graça. O enum de claim ganhou "escopo", e a instrução
que o descreve entra no prompt só de quem pede, para o prompt da newsletter
continuar byte a byte o que era.

**A parte que quase virou um terceiro limite.** O benchmark detectou 40 claims e
reprovou zero, e esse número podia significar duas coisas opostas: a copy está
bem ancorada, ou o auditor nunca diz não. `provar-auditor.ts` manda nove pares
deliberadamente errados numa chamada e confere os dois lados. Nove de nove: as
sete amplificações reprovadas com motivo escrito, a paráfrase fiel e a ressalva
aprovadas.

**Lição.** Uma guarda que confere três classes de coisa não é uma guarda de
veracidade, e o prompt não pode prometer o que ela não entrega. E métrica de
guarda que dá zero precisa de um teste que produza um não, senão "zero" e
"desligado" são indistinguíveis.

### 16/09: a regra contra pauta repetida entrou e a edição saiu repetida mesmo assim

**Sintoma.** A edição publicada em 16/09 tinha quatro pautas, e três contavam o
mesmo adiamento da regra de Duration of Status. O teto por acontecimento tinha
sido implementado horas antes, com teste passando.

**Causa raiz.** O teto agrupava por `impressaoDoAcontecimento`, que é igualdade
EXATA de ator, lugar e tipo de evento, normalizados. Três escritórios de
advocacia descrevendo a mesma liminar escrevem "Court", "DHS" e "District
Court", e termos como "postponed", "preliminary injunction" e "rule ending
duration of status". Nenhuma chave colidia com nenhuma outra, então a regra
rodava e não agrupava nada. O teste passava porque a fixture dava o mesmo
`acontecimento` às três pautas, que é justamente o caso que a realidade não
produz.

**O que mediu.** Os 14 aprovados daquele dia, 91 pares, com os vetores que já
estavam gravados em `news_candidates.embedding`:

| par | cosseno |
|---|---|
| mesma liminar, murthy x klasko | 0.892 |
| mesma liminar, murthy x ogletree | 0.808 |
| mesma sessão do STF, dois ângulos | 0.793 |
| mesmo dia de decisão de juros | 0.743 |
| primeiro par de fatos DISTINTOS | 0.563 |
| mediana dos 91 pares | 0.214 |

**Correção.** `comporEdicao` passou a comparar, além da impressão, o vetor da
pauta contra o das que JÁ ENTRARAM na edição, com limiar em 0.70
(`EDITORIAL_LIMIAR_AGRUPAMENTO`). Reaplicado ao pool daquele dia, a edição sai
com quatro fatos diferentes em vez de um fato quatro vezes.

**Lição, e ela é de método.** Fixture que constrói o caso pela chave que o
código usa não testa o código, testa a fixture. O caso real chega com a chave
DIFERENTE, que é o motivo de o problema existir. Quando a regra é "reconhecer a
mesma coisa escrita de outro jeito", o teste tem que escrever de outro jeito.

### O teto da manchete era da arte antiga, e o produto pedia o dobro

**Sintoma.** As capas saíam com manchete curta e vaga ("Corte adia regra de
prazo"), sem número, sem prazo e sem dizer quem é afetado. Nada estava
quebrado: o sistema entregava exatamente o que estava escrito.

**Causa raiz.** Três números em desacordo, nenhum deles revisado quando a
gramática visual mudou. O prompt pedia "de 3 a 10 palavras", a guarda recusava
acima de 12 com o comentário "é o limite da arte, três linhas", e as capas de
referência que o produto persegue têm 11, 15 e 16 palavras, de 61 a 116
caracteres. O limite era real no desenho ANTERIOR. Na gramática de jornal a
faixa da manchete tem topo e base fixos e o corpo do tipo é decidido pelo
navegador entre 74px e 40px: 130 caracteres cabem em cinco linhas legíveis,
verificado renderizando.

**Correção.** `FORMA_DA_MANCHETE` e `REGRA_DA_MANCHETE` passaram a morar em
`social/manchete.ts`, lidos pelos dois prompts e pela guarda. A faixa virou 6 a
18 palavras e 45 a 130 caracteres, e a regra ensina a forma de duas partes que
a referência usa.

**Lição.** Limite copiado de um desenho que não existe mais é limite inventado.
Quando o layout muda, os números que falam dele têm que ser medidos de novo, na
arte nova, ou eles continuam decidindo o produto sozinhos. E limite que o
prompt e a guarda enunciam diferente é sempre um dos dois errado.


## Legal & marca

### Não usar o mascote do Claude como identidade genérica da conta

Usar o personagem oficial da Anthropic/Claude como mascote de todo post
(incluindo assuntos sem relação, tipo AWS ou ChatGPT) passa a impressão de
afiliação/endosso que não existe, além de risco de denúncia de propriedade
intelectual. Decisão: o mascote do Claude só aparece em posts
especificamente sobre Claude Code, como referência editorial pontual —
identidade geral da conta usa um personagem próprio e original (ver
`opendesign-renderer.ts`, `HOODIE_MASCOT_DESCRIPTION` vs
`CLAUDE_MASCOT_DESCRIPTION`).

## Ambiente de desenvolvimento

### Sessão do Claude Code tem rede restrita a domínios, não IPs

Chamar `http://<IP-da-VPS>:<porta>/...` diretamente (ex: webhook de deploy
do Easypanel) trava em timeout — o proxy de saída da sessão só libera
HTTPS pra domínios conhecidos. O mesmo domínio via HTTPS
(`https://casaloti.ia.br/...`) funciona normalmente. Na prática: quando
precisar disparar algo por IP:porta, pedir pro usuário rodar o comando, ou
usar a URL HTTPS do domínio se existir uma.

---

## Schema, dados e ambiente

Entradas de 2026-09-03 e 04.

### Seis dias sem produzir, e ninguém soube

**O que.** Em 2026-09-03 a produção foi encontrada parada desde 28/08:
`newsroom_runs`, `news_editions`, `articles` e `social_posts` todos com último
registro em 28/08. Seis edições não produzidas, seis dias sem newsletter e sem
post.

**Causa.** O cron não existia em lugar nenhum. Conferidos os quatro lugares
possíveis: `/etc/crontab` (só entradas padrão do Debian), `/etc/cron.d/` (só
docker-prune, e2scrub, monarx, sysstat), crontab do `deploy` (vazio) e a base
do EasyPanel (zero ocorrências de "schedule" ou "cron"). O cron da Hostinger
foi desligado na migração para a VPS — como o próprio `migracao-vps.md` manda
— e o da VPS nunca foi criado.

**Por que ninguém foi avisado.** O Tier 0 — alertas de Telegram, watchdog,
auto-refresh do token da Meta — estava no repositório e **não em produção**.
Os dois merges de 29/08 nunca foram deployados. A rede de proteção construída
justamente para gritar nesse cenário não estava no ar.

**Como foi diagnosticado sem privilégio no servidor.** `newsroom_runs` vazio no
período prova que a chamada não chegou à aplicação — uma execução que quebrasse
gravaria `failed`. E o commit publicado foi cercado testando quais rotas
respondem 401 (existe) contra 404 (não existe):
`/api/admin/carousel-design` e `/api/cron/refresh-instagram-token` davam 404,
`/api/cron/tutorial` dava 401. Confirmado depois no disco, em
`/etc/easypanel/projects/core/web/code`, que é legível sem sudo.

**Corrigido.** Crontab instalado no usuário `deploy` e deploy do `web` disparado
pelo webhook do EasyPanel.

**O que fazer.** Migração de host move o agendamento junto — e a verificação de
que o cron novo disparou tem que ser um item explícito, não uma suposição.
Um site respondendo 200 não diz nada sobre o pipeline: durante os seis dias o
site esteve no ar o tempo todo. O sinal é `newsroom_runs`, e agora o watchdog.

### Três dias sem newsletter: a decisão certa, comunicada por exceção

**Sintoma.** Último disparo em 05/09/2026. Em 06, 07 e 08 nada saiu, e
`newsroom_runs`, `news_editions` e `editorial_history` estavam vazios nos três
dias. A leitura imediata, e a que o incidente de agosto ensinou, era cron morto.

**Não era.** O log do próprio cron, em `/home/deploy/newsroom-cron.log`, tem as
três chamadas, às 09:03:01, 09:03:02 e 09:03:02 UTC, cada uma com resposta
`{"ok":true,"accepted":true}`: cron disparou, autenticação passou, a aplicação
aceitou. E as classificações persistidas em `news_candidates` provam que a
redação rodou inteira: em 07/09 às 09h foram gravadas 35 classificações, e em
08/09 às 09h outras 152, com os motivos nominais de recusa.

**Causa.** A linha editorial aprovou menos que o mínimo de 2 pautas. Reproduzido
em produção pelo `admin/newsroom/run` em dry-run: HTTP 500 em 40 segundos com
`"Edição não fecha hoje: 1 pauta(s) aprovada(s), mínimo 2. 191 pautas recusadas
pela linha editorial."` Isso é a regra funcionando. Dia sem pauta não vira
newsletter, e completar com o que o filtro recusou é não ter filtro.

**O defeito real.** A decisão era comunicada com `throw`. Um throw naquele ponto
acontece antes de qualquer escrita: `news_editions` e `newsroom_runs` ficam
adiante no fluxo e nunca eram alcançados. Três dias de acerto editorial não
deixaram uma linha em lugar nenhum e ficaram **indistinguíveis de um cron
morto**. Pior: o `.catch` da rota classificava o acerto como "Redação falhou",
em nível crítico, e pingava o watchdog como falha.

**Corrigido.** Dia sem pauta passou a ser resultado, não exceção:
`registrarDiaSemEdicao` grava um run com status `cancelled` (valor que já
existia no CHECK, sem migration), com as contagens e o motivo
`EDITORIAL_MINIMUM_NOT_MET`, e `runNewsroom` devolve `ok: false` com motivo
próprio. O alerta virou aviso com o número que importa, e o watchdog recebe
sucesso, porque a pergunta dele é se a chamada chegou à aplicação, e chegou.

**Detalhe que quase virou um segundo bug.** `newsroom_runs.idempotency_key` é
UNIQUE global. Gravando o dia sem edição com a chave canônica do dia, uma
recuperação bem-sucedida mais tarde perderia o próprio registro de sucesso e o
dia ficaria arquivado como cancelado tendo publicado. Daí o sufixo
`#sem-edicao`: registro que mente é pior que registro ausente, que é justamente
o problema que esta correção veio resolver.

**Consequência no Instagram.** O fluxo antigo cria `social_posts` a partir da
edição. Sem edição, não houve post: é consequência, não problema separado.

**Lição, que é a de agosto com o sinal trocado.** Em agosto, tabela vazia
significou cron morto. Em setembro, significou linha editorial funcionando. Os
dois exigem reações opostas e nenhum dos dois deixava rastro. Ausência de linha
nunca é diagnóstico: só é quando o caminho de sucesso E o de recusa ambos
escrevem. E o corolário: portão que decide não publicar precisa gravar antes de
sinalizar, porque sinalizar por exceção apaga o rastro do que ele decidiu.

### Google News era fonte, não descoberta, e o assinante clicava nele

**Sintoma.** Quatro matérias das edições de 04 e 05 de setembro de 2026 saíram
com `news.google.com/rss/articles/CBMi...` como link da fonte. Quem clica cai
num interstitial do Google; seguindo o link de fora, a resposta é
`google.com/sorry` com HTTP 429.

**Causa.** Nenhum filtro estava errado. O deduplicador escolhia o primário por
PRIORIDADE (`candidate.priority === 1 && primary.priority > 1`), e o `url` do
primário é o que vai publicado como fonte. Com o item do Google News e o do
feed direto empatados em prioridade 1, o agregador ficava. O enriquecimento
depois buscava o texto por uma URL secundária e dava certo, então a pauta
passava em tudo com um link que não leva a lugar nenhum.

E existia uma função escrita para exatamente esse caso, `escolherUrlPublicavel`
em `regras-duras.ts`, com teste próprio, **que ninguém chamava fora do próprio
teste**. O comentário dela nomeia o incidente que a motivou.

**Corrigido.** Agregador nunca é a identidade do grupo, e essa regra vem antes
da prioridade; `escolherUrlPublicavel` entrou na guarda, e sem endereço próprio
comprovado a pauta não publica.

**A medida que explica o resto.** Das 987 candidatas classificadas entre 01 e
08 de setembro, **675 vieram do Google News, e nenhuma foi aprovada** — 68% da
coleta. Dessas, 177 foram marcadas como imigração pelo classificador: material
da vertical, identificado, e inutilizável porque o link não resolve. Não existe
atalho técnico: o `<link>` do item é um blob base64 resolvido por JavaScript via
POST assinado, e seguir isso seria engenharia reversa de endpoint privado.

**O que o feed entrega e o código jogava fora.** Todo item do Google News traz
`<source url="https://ogletree.com">ogletree.com</source>`, com o publisher
real, em 100 de 100 itens medidos. `parseRSSItems` extrai título, link, data,
descrição, autor e imagem, e ignora esse campo. É o único sinal de procedência
disponível, e é o que transforma o agregador em ferramenta de descoberta: os
publishers que ele intermedia são a lista de quem assinar direto.

**Lição.** Agregador é para descobrir quem assinar, nunca para ser a fonte. E
função de guarda escrita e não chamada é pior que função ausente: ela dá a
impressão de que o caso está coberto. Se existe teste e não existe call site, o
teste está provando uma coisa que não acontece em produção.

### BACKLOG: GOOGLE_NEWS_DISCOVERY_ONLY

**O que falta.** Em 08/09/2026 as 11 consultas do Google News cuja cobertura
direta já existia foram desativadas, e cinco feeds diretos entraram no lugar
(Wolfsdorf, National Law Review, JD Supra, Ogletree, RN Law Group). Quatro
consultas continuam ativas porque nenhum feed direto cobre o ângulo: asilo e
refúgio, câmbio e custo de vida, e brasileiros nos EUA.

**O objetivo, para quando for feito.** Google News só como descoberta. Nunca
como URL final. Ao encontrar um item, extrair o publisher do campo
`<source url>`, que existe em 100% dos itens e hoje é descartado por
`parseRSSItems`; tentar resolver a matéria na origem direta; e sem origem
direta comprovada, não publicar.

**O que já está no ar dessa ideia.** A metade defensiva: agregador nunca é a
identidade do grupo na deduplicação, e `escolherUrlPublicavel` recusa a pauta
que ficou só com link de agregador. Falta a metade ativa, que é usar o
`<source url>` para casar com a fonte direta.

**O que não vale tentar.** Resolver o link do agregador. Medido: o `<link>` do
item é um blob base64 resolvido por JavaScript via POST assinado, e seguir a URL
de fora devolve `google.com/sorry` com HTTP 429. Seria engenharia reversa de
endpoint privado, e 79% da coleta passaria a depender dela.

### Token de longa duração da Meta expira em ~60 dias

**O que.** `INSTAGRAM_ACCESS_TOKEN` é um token longo que vence. Antes do Tier 0
ele era fixo no env: quando vencia, a publicação parava sem aviso.

**Corrigido em** `a0981ae` — cron diário `/api/cron/refresh-instagram-token`
renova quando falta pouco e alerta no Telegram se não conseguir.

**O que fazer.** Se a publicação parar, conferir `newsroom_runs` e o alerta do
Telegram antes de suspeitar do código.

---

### Data em UTC gravava o dia seguinte

**O que.** O pipeline usava `new Date().toISOString()` para a data da edição.
Toda execução depois das 21h no Brasil era gravada com a data do dia seguinte.

**Corrigido na** migração multi-projeto, com `projectToday(project)`, que
devolve a data no fuso de `projects.timezone`.

**O que fazer.** Nenhuma data de conteúdo vem de `new Date()` nem de
`current_date` (que é UTC no servidor). Sempre `projectToday(project)`. Esta
armadilha voltou a aparecer em 2026-09-03, ao desenhar
`prompt_concept_results.snapshot_date` — o `default current_date` foi removido
justamente por isso.

### `DEFAULT` de `project_id` é dívida, não conveniência

**O que.** As tabelas antigas ganharam `project_id` com `DEFAULT` do projeto
semente para não quebrar o código que ainda não passava o projeto.

**Risco.** Enquanto o `DEFAULT` existe, um call site esquecido grava
silenciosamente no projeto errado — e não há erro para investigar depois.

**O que fazer.** Tabela nova nasce com `project_id not null` **sem** default.
As tabelas `prompt_*` seguem essa regra.

### O banco tem estrutura que o repositório não descreve

**O que.** Em 2026-09-03, ao começar a Fase 0 do Sistema PROMPT, as oito
tabelas `prompt_*` **já estavam em produção** — aplicadas direto no banco, fora
de `supabase/migrations/`, sem nenhum arquivo do repo descrevendo-as. O desenho
aplicado era mais rico que o do documento de arquitetura (sequência de Direct,
régua de e-mail, explore/exploit, tabela `prompt_learnings`) e usava outro
vocabulário nos CHECKs: `status` é `draft`/`ready`/`published`/`blocked`/
`archived`, não os sete que o documento sugeria.

**Consequência.** Uma Fase 0 inteira foi escrita contra o schema do documento e
quebrou contra o banco real (`column prompt_campaigns.error_message does not
exist`), exigindo reescrita.

**O que fazer.** Antes de escrever código contra qualquer tabela, ler o schema
do **banco**, não o documento nem as migrações. Sem acesso SQL, o schema exposto
pelo PostgREST dá colunas, tipos, obrigatoriedade e chaves estrangeiras:

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" | jq '.definitions'
```

CHECKs, unicidades e índices só saem por SQL — `pg_get_constraintdef` mais
`pg_indexes`, no SQL Editor. E migração que contradiga produção **não** entra em
`supabase/migrations/`: num banco novo criaria estrutura errada.

### UNIQUE sobre coluna nullable não protege nada

**O que.** Em 2026-09-03 criei `prompt_concept_results.snapshot_date` como
nullable e pus `unique (campaign_id, snapshot_date)` em cima dela, para
garantir um retrato por campanha por dia. No Postgres, nulos são **distintos
entre si** numa constraint UNIQUE: N linhas com `snapshot_date` nulo para a
mesma campanha passavam sem violação.

**Por que passou despercebido.** O teste na réplica preenchia `snapshot_date`
explicitamente, então a duplicata era barrada e a garantia parecia funcionar. O
caminho não testado — quem grava esquecer a coluna — era justamente o que a
constraint deveria cobrir.

**Corrigido em** `20260903130000_prompt_snapshot_date_not_null.sql`.

**O que fazer.** Unicidade que inclui coluna nullable precisa da coluna
`not null`, ou de um índice único parcial (`where col is not null`) mais uma
regra explícita para o caso nulo. E teste de invariante precisa exercitar o
caminho em que quem chama **erra** — o caminho correto não prova constraint
nenhuma.

### Constraint acrescentada com a tabela vazia não pode falhar

**O que.** Os invariantes de `prompt_*` (dedupe do funil, unicidade de lead,
formato da keyword) foram aplicados em 2026-09-03, enquanto as oito tabelas
ainda tinham zero linhas.

**Por que importa.** Depois, com dados, um único par duplicado impede a criação
da constraint, e o conserto passa a exigir limpeza manual — decidir qual linha
duplicada morre, em produção, com o funil rodando.

**O que fazer.** Unicidade e CHECK entram na janela em que a tabela está vazia.
Adiar é trocar um `ALTER TABLE` de segundos por uma migração de dados.

---

### `zod` era dependência não declarada

**O que.** `zod` é importado por código de runtime (`newsroom/schemas.ts`,
`social/instagram/schemas.ts`, `carousel-templates/tokens.ts`), mas chegava só
transitivamente por `eslint-config-next` — uma devDependency.

**Por que não quebrou.** Os dois Dockerfiles rodam `npm ci` puro, que instala
devDependencies. Confirmado com `npm ci --omit=dev` numa cópia limpa: o pacote
não vinha.

**Corrigido em** `7e940d2`, fixado em `4.4.3` exata — a versão que já estava
resolvida, para declarar a dependência sem subir a biblioteca que valida toda
saída de LLM do sistema.

**O que fazer.** Antes de enxugar imagem com `--omit=dev`, testar
`npm ci --omit=dev` numa cópia e conferir que os imports de runtime resolvem.

### Chave SSH com passphrase falha como "chave não autorizada"

**O que.** A chave `~/.ssh/claude_code` do VPS tem passphrase. Conexão
não-interativa falha com `Permission denied (publickey,password)` — mensagem
idêntica à de chave não instalada no servidor.

**Diagnóstico.** `ssh-copy-id` respondeu `All keys were skipped because they
already exist`: a chave estava lá, o `ssh` é que não conseguia destravá-la.

**O que fazer.** Carregar no agent uma vez
(`ssh-add --apple-use-keychain ~/.ssh/claude_code`) antes de concluir que o
acesso não existe. E lembrar que o usuário `deploy` não está no grupo `docker`:
dá shell, não alcança containers nem o EasyPanel.

### `.env` salvo como Rich Text

**O que.** Um `.env` criado pelo TextEdit foi salvo como `.env.rtf`. Nesse
formato nenhum carregador o lê, e renomear não resolve — o conteúdo é RTF.

**O que fazer.** `textutil -convert txt .env.rtf -output .env`, depois
`chmod 600`, e conferir que não sobrou caractere não-ASCII: as aspas curvas do
autocorretor corrompem valores de chave silenciosamente.

```bash
LC_ALL=C grep -c '[^ -~]' .env    # tem que ser 0
```
