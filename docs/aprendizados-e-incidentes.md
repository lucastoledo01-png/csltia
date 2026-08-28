# Aprendizados e incidentes

Registro de bugs, causas raiz e decisões não óbvias — pra não repetir o mesmo
diagnóstico do zero da próxima vez. Toda vez que algo quebrar em produção ou
uma decisão de arquitetura/conteúdo não for óbvia, acrescente uma entrada
aqui (curta, indo direto ao sintoma → causa → correção → lição). Não é
changelog de feature, é memória de "por que isso quebrou" e "por que
decidimos assim".

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
