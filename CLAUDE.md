@AGENTS.md
@docs/aprendizados-e-incidentes.md
@docs/decisoes.md
@docs/modelo-de-titulo.md

# O essencial, para quem abriu este repositório agora

O que está acima são as regras longas. O que está aqui é o que você precisa
saber antes de rodar qualquer coisa.

## O que este projeto é

O **eua.journal**: uma publicação diária sobre os Estados Unidos, em português,
para brasileiros. Uma coleta alimenta três canais:

- **newsletter**, disparada pelo Listmonk;
- **portal**, em `casaloti.ia.br`, onde a unidade é a pauta e não a edição;
- **Instagram**, `@eua.journal`, publicado por um contêiner separado.

Ele roda sozinho, todo dia, às 06:03 de Brasília. Não há revisão humana entre a
pauta aprovada e a publicação, e essa é a peça que está sendo construída agora.

A marca já mudou três vezes: `desbuguei.ia`, `imigra.us`, `usa.journal`,
`eua.journal`. O nome atual está em `src/lib/marca.ts`, e é de lá que sai o que
aparece impresso na arte, no e-mail e no portal. A pasta ainda se chama
`csltia` e o slug do projeto no banco ainda é `desbuguei`: os dois são internos
e mudar custa caminho de Storage e chave de idempotência.

## Comandos

```bash
npm run dev            # servidor local na 3000
npm test               # 1685 testes, vitest
npm run build          # o ÚNICO type check do projeto inteiro
npm run newsroom:dry   # roda a redação sem publicar nada
npm run worker:instagram
```

**`npm run build` antes de todo deploy, sem exceção.** O `vitest` passa e o
`tsc` avulso não enxerga o projeto inteiro. Três vezes o build pegou o que os
testes não pegaram, e uma delas foi para produção.

E nunca filtre a saída de um verificador pelos arquivos que você mexeu. Foi
assim que um build quebrado subiu: os dois erros estavam em arquivos que eu não
tinha tocado.

## Acesso

**Supabase.** O projeto é `azqpdesusdzqndvsqmko` e está FORA do MCP desta
máquina. Para ler ou escrever, use PostgREST com `curl` e as chaves do `.env`
(`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). DDL não passa por
aí: `ALTER TABLE` é no SQL Editor, e quem roda é o dono.

**O banco não é o que as migrations dizem.** `supabase/migrations` não
reproduz produção. Leia o schema do banco antes de escrever código contra ele.

**VPS.** `ssh hostinger-vps`. A chave tem passphrase e precisa estar no agent.
O usuário `deploy` não está no grupo `docker`, então log de contêiner é
inalcançável: por isso todo diagnóstico importante é gravado no banco.

**Nunca imprima segredo.** Nem token, nem webhook, nem cabeçalho
`Authorization`. Ao mostrar crontab, comando ou log, redija o valor inteiro, e
não só a URL: já vazou aqui duas vezes por redação pela metade.

## Publicar

`git push` falha com "Repository not found" porque a conta ativa do `gh` quase
nunca é a dona do repositório. O jeito que funciona, sem mexer na conta global:

```bash
GH_TOKEN=$(gh auth token -u lucastoledo01-png) \
  git -c 'credential.https://github.com.helper=' \
      -c 'credential.https://github.com.helper=!f(){ echo username=x; echo "password=$GH_TOKEN"; };f' \
      push origin main
```

**Deploy.** Dois serviços no EasyPanel: `web` (redação, arte, painel) e
`worker` (publica no Instagram). Os webhooks estão no `.env` como
`EASYPANEL_DEPLOY_WEB` e `EASYPANEL_DEPLOY_CORE`.

O webhook responde `200 Deploying...` mesmo quando o build falha em seguida, e
o EasyPanel mantém o contêiner anterior no ar servindo código velho. **Resposta
200 não é prova de deploy.** A prova é uma destas:

- o `next-server` ter nascido depois do push
  (`ssh hostinger-vps 'ps -eo lstart,etimes,args | grep next-server'`);
- uma rota nova responder 401 em vez de 404;
- um valor novo aparecer no HTML servido.

## O que não fazer

- **Não faça `PUT` nas configurações do Listmonk.** Um `PUT` para trocar um
  campo devolve a senha de SMTP mascarada como se fosse a real, o servidor a
  grava, e todo envio passa a falhar com `535`. Já custou um dia de newsletter.
  Entregue o campo e o caminho do painel ao dono.
- **Não apague o que dá para desligar.** Cinco telas do painel e duas verticais
  inteiras estão arquivadas, não removidas.
- **Não use travessão** em nada: código, comentário, commit, documento ou
  resposta. Vírgula, dois-pontos ou frase nova.
- **Não reescreva comentário histórico** para ficar consistente com o presente.
  Um comentário datado que descreve uma transição continua verdadeiro, e é o
  registro de por que as coisas são como são.

## Onde está o quê

```
src/lib/server/newsroom/     coleta, redação, portão de QA
src/lib/server/editorial/    classificação, guarda, auditores
src/lib/server/visual/       escolha e conferência de imagem
src/lib/server/social/       ciclo do Instagram, moldes, ritmo
src/lib/carousel-templates/  o desenho das peças, em HTML e CSS
src/app/admin/               o painel, por projeto
docs/                        decisões, incidentes e modelo de título
```

Os comentários deste repositório explicam **por quê**, não o quê, e muitos
citam a data e a medição que motivaram a regra. Leia antes de mudar: boa parte
do que parece estranho é cicatriz de um incidente que está no
`aprendizados-e-incidentes.md`.

## Onde o projeto está agora

Setembro de 2026, reestruturando a arquitetura com MVP marcado para 20/10.

- O mapa de ponta a ponta da esteira, com os pontos de decisão, as dez chamadas
  de modelo e onde entra a aprovação humana:
  https://claude.ai/artifact/5XndQxbk4kwnMGovk6Hy7h
- As nove entregas até o MVP, com critério de pronto em cada uma:
  https://app.clickup.com/t/868mak90j

O que mudou na última semana: o painel passou a abrir pelo projeto e perdeu
cinco telas da vertical antiga; os quatro moldes de arte do feed ganharam
interruptor que alcança a esteira de verdade; e a marca virou `eua.journal`,
o que de quebra consertou um handle de Instagram errado que saía impresso em
cada peça.
