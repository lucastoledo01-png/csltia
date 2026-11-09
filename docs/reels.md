# Reels no molde do eua.journal

Ferramenta: `src/scripts/montar-reel.ts` (28/10/2026). Entra um vídeo, sai um
MP4 9:16 (1080x1920, H.264, áudio original). Não publica nada: publicar é com
`src/scripts/_publicar-reel-manual.ts`.

## Os dois moldes

**A, moldura.** O fundo é `src/scripts/reel/molde-a.jpg` (Capitólio, Casa
Branca, as duas bandeiras). O vídeo entra na moldura (992x537, em
x 44 / y 609), o rótulo vai na faixa vermelha e a manchete em três linhas,
com a linha marcada com `*` em vermelho. Rótulo e manchete se ajustam ao
tamanho sozinhos.

**B, tela cheia.** O vídeo ocupa a tela, com a marca no alto, a editoria numa
etiqueta vermelha e a manchete em caixas brancas, sobre um escurecido.

## Como usar

```bash
# A: rótulo, três linhas (a do meio em destaque) e o corte que tira a marca de quem publicou
npx tsx src/scripts/montar-reel.ts --video video.mp4 --formato a \
  --rotulo "TRAGÉDIA" --linhas "ACIDENTE DE TREM|*NA ESPANHA*|ENTRE OS MAIS GRAVES DO PAÍS" \
  --corte "0:385:720:390"

# B: editoria e linhas da manchete
npx tsx src/scripts/montar-reel.ts --video video.mp4 --formato b \
  --categoria "Mundo" --linhas "Acidente de trem na Espanha|está entre os mais graves|da história do país" \
  --corte "175:0:456:810"
```

`--corte x:y:largura:altura` é em pixels do vídeo ORIGINAL e roda antes do
encaixe. É assim que sai o logo e a legenda de quem publicou primeiro: meça
num quadro (`ffmpeg -ss 5 -i video.mp4 -frames:v 1 quadro.png`) e corte fora.
No molde A o corte deve ter a proporção da moldura (~1,85:1); no B, 9:16.

## Direito de uso

Vídeo de outra conta é obra de terceiro. Republicar, mesmo com moldura e
crédito, pode gerar denúncia, derrubada do Reel e penalidade na conta, que é
comercial. O dono decidiu seguir sabendo disso (28/10/2026). Onde der,
prefira vídeo de governo dos EUA (em geral domínio público), vídeo com
autorização ou vídeo próprio.

## Automático (28/10/2026)

O caminho, do vídeo achado ao Reel na fila:

1. **Descoberta**, de hora em hora das 9h às 17h (`/api/cron/reels?relogio=1`,
   capacidade `reels`): lê os perfis de referência e `settings.reels.perfis_ig`
   no Instagram (Business Discovery com `media_url`) e até quatro buscas no
   YouTube (`YOUTUBE_API_KEY`). Ordena pela nota da fonte e pelo calor da
   história do termômetro; fora do nicho não entra. Grava em
   `reels_candidatos`. Nada aqui baixa vídeo nem chama modelo.
2. **Escolha, no chat do Claude** (MCP): `reels_sugeridos`, depois
   `produzir_reel`.
3. **Preparo, no worker** (giro de 30 s): baixa (Instagram direto, YouTube
   pelo yt-dlp), corta nos primeiros 60 s, mede o corte que tira a marca de
   quem publicou (`social/reels/corte.ts`: o que não mexe e tem borda é
   sobreposição), desenha a folha de quadros e abre a tarefa `escrever_reel`.
4. **Texto, pelo Claude**: `ver_reel` mostra a folha com o corte em amarelo;
   `proxima_tarefa` e `entregar_tarefa` fazem o texto. A plataforma confere
   com as guardas (ancoragem no material do vídeo, forma da legenda,
   `limparVicios`) e pede reparo até o teto.
5. **Render, no worker**: monta no molde, sobe o MP4 no bucket `reels` e grava
   a linha em `social_posts` (`formato: "reel"`) na próxima vaga do dia,
   `aguardando` na fila. `ver_reel` mostra a folha do Reel pronto; o vídeo
   toca no painel.
6. **Aprovação, só no painel.** Reprovar texto, imagem (corte) ou arte (molde)
   devolve a tarefa ao Claude com o motivo; a versão nova volta à fila com
   hash novo. A seleção não se refaz: cancele e escolha outro vídeo.
7. **Publicação, no worker**: container `media_type=REELS`, espera de até 5
   minutos pelo processamento da Meta.

Ligar, nesta ordem: rodar `supabase/2026-10-28-reels.sql`; pôr
`YOUTUBE_API_KEY` no web; deploy do web e do worker (o worker ganha ffmpeg e
yt-dlp; a versão do yt-dlp é `YTDLP_VERSION` no `Dockerfile.worker` e precisa
ser atual); `settings.capacidades.reels` em `dry_run` para ver o
`reels_rodada` em `platform_events` sem gravar candidato; depois `enforce`.
A fila de aprovação do projeto precisa estar em `enforce`: sem ela, nenhum
Reel é gravado.

Ensaio sem banco e sem publicar:
`npx tsx src/scripts/ensaiar-reel.ts --video <arquivo.mp4>`.

## O que ainda falta

- O Reel não passa pela trava do termômetro.
- Os textos são estáticos (sem animação de entrada).
- `reels_sugeridos` mostra métricas e link, não a folha: a folha só existe
  depois do download, que só acontece no `produzir_reel`.
- A terceira reprovação descarta a peça na fila, mas o candidato fica como
  estava.

## Regra: todo Reel de vídeo sai no molde B (09/11/2026)

Pedido do dono, depois de um Reel de entrevista montado à mão num desenho
próprio (manchete num bloco preto no topo, vídeo quadrado no meio): Reel de
VÍDEO, automático ou feito à mão, sai no molde B de `montar-reel.ts`. O vídeo
fica em tela cheia, a marca no alto, a editoria na etiqueta vermelha e a
manchete em caixas brancas. Nada de desenho avulso.

- A marca é a imagem "eua." e a manchete tem a base a 560 px do fim
  (`BASE_DO_MOLDE_B`): a 250 px ela ficava debaixo da legenda e dos botões
  que o Instagram desenha embaixo.
- Legenda em português, quando o vídeo é fala em outra língua, vai em faixa
  preta logo ABAIXO da manchete (topo em y 1395), ainda acima dessa faixa.
- Legenda gravada no vídeo original (outra língua, outra marca) sai pelo
  `--corte`, como o logotipo de quem publicou.
- O Reel de FOTO continua no próprio formato (`social/reel-de-foto.ts`,
  `docs/formato-reel-padrao.md`).
- O bucket de vídeo aceita até 10 MB: Reel longo sai em 720x1280.

## Canais de notícia do YouTube, com a fala legendada (09/11/2026)

Pedido do dono: Reel a partir do que os canais de notícia publicam, inclusive
em inglês, com o trecho da fala legendado em português e sem marca nenhuma de
terceiro no vídeo.

**Os canais** ficam em `settings.reels.canais_youtube`, uma lista de
`{ id, handle, nome, idioma: "en" | "pt", credito }`. O padrão do código é
nenhum; a lista real está em `supabase/2026-11-09-reels-canais-youtube.sql`
(19 canais, cada id conferido). Canal torto (sem id "UC..." nem handle, sem
idioma) sai da lista com aviso no `reels_rodada`. `termos_youtube` continua
funcionando como antes.

**Leitura barata** (`social/reels/canais.ts`): a playlist de uploads do canal é
"UU" mais o resto do id, então o canal com id custa 1 unidade
(`playlistItems.list`); com handle, mais 1 do `channels.list`. Os detalhes de
todos os vídeos novos vêm de um `videos.list` só (1 unidade a cada 50). Ficam
os vídeos da janela (`janela_horas`), de 20 s a `duracao_maxima_canal`
(padrão 1.200 s), fora transmissão ao vivo ou agendada. O desfecho da rodada
grava `canais` e `unidadesDoYoutube`.

**Custo de cota**, com a frequência atual (de hora em hora, das 9h às 17h, 9
rodadas): as quatro buscas por termo custam 101 cada, 404 por rodada e 3.636
por dia; os 19 canais custam de 20 a 23 por rodada, uns 200 por dia. Total
perto de 3.850 das 10.000 diárias.

**Inglês entra**, só pelo canal. A busca por termo continua só com português
(`serveParaOReel`). O nicho do vídeo em inglês é `casaComNichoEmIngles`
(`ordem.ts`): tem de falar dos EUA, e esporte e fofoca ficam fora. Imigração
como notícia política entra nos Reels (Trump, o Congresso); a ORIENTAÇÃO de
visto (como tirar, entrevista, advogado) fica fora em qualquer idioma
(`orientacaoDeVisto`). O classificador e o verificador da esteira de notícias
não mudaram.

**A fala, sem modelo** (`social/reels/transcricao.ts`): no preparo, o yt-dlp
baixa a legenda do YouTube (a manual, senão a automática) sem baixar o vídeo,
e o VTT vira segmentos com início e fim. A legenda automática vem "rolando",
com o tempo de cada palavra; cada palavra entra uma vez. Vídeo em inglês sem
legenda falha no preparo com o motivo; em português, a legenda é ajuda e a
falta dela não impede o Reel. O vídeo de canal é guardado com até 240 s
(`SEGUNDOS_DO_VIDEO_DE_CANAL`), e a transcrição vai até esse ponto.

**A tarefa `escrever_reel`** recebe a transcrição com tempos e o crédito do
canal, e pede, além do de sempre:

- `trechos`: só a FALA, de 15 a 45 s somados, até 4 trechos, em ordem e sem
  sobreposição; cada trecho precisa ter fala em pelo menos metade do tempo;
- `legendas`: a tradução fiel para o português, em pedaços de até 7 palavras
  (o teto conferido é 8), com o tempo do Reel MONTADO (o 0 é o começo do
  primeiro trecho, os trechos colados); sem sobreposição, sem travessão, sem
  passar do fim;
- `enquadramento`: "cheio" (9:16 na tela toda) ou "quadrado".

Vídeo em inglês sem trechos ou sem legendas volta para reparo. O vídeo de canal
é sempre o molde B. A transcrição entra no material da ancoragem: o número que
a pessoa disse sustenta a manchete.

**Sem marca de terceiro.** O vídeo deitado de canal tem corte próprio
(`corteDoCanalNaGrade`, em `corte.ts`): fica sempre dentro da faixa limpa da
transmissão (de 14% a 74% da altura, longe dos cantos de logotipo e relógio e
da faixa de manchete e do "LIVE"), não toca o que a máscara achou parado, e é
centrado onde a cena mexe, que é quem está falando. O preparo mede também o
corte quadrado (`corte.q`): com `enquadramento: "quadrado"` o vídeo entra 1:1,
de 1080, em y 300, sobre ele mesmo esticado e desfocado. O crédito vai na
legenda do post ("Vídeo: Bloomberg", do campo `credito`), nunca no vídeo; a
etiqueta do molde pode dizer "VÍDEO: BLOOMBERG". O Short vertical do canal não
tem faixa de TV e segue a máscara de sempre.

**O render** (`montar-reel.ts`): `trechos` corta e cola antes do molde;
`legendas` vira uma imagem por pedaço (faixa preta translúcida, Inter 800 de
42 px, centralizada), com o topo em y 1395 enquanto a manchete está na tela e
em y 1300 depois que ela some. Acima de 9,5 MB, o Reel sai de novo em
720x1280, mais comprimido (`tetoDeBytes`). Na linha de comando:
`--trechos "12.5-30,41-55" --legendas legendas.json --quadrado`.

**Ligar**: rodar o SQL; `YOUTUBE_API_KEY` no EasyPanel (web e worker); deploy
dos dois. A ferramenta MCP mudou só no texto da instrução: no Claude Desktop,
fechar com Cmd+Q e abrir de novo para ler a versão nova.

**O que fica de fora por ora**: o vídeo de perfil do Instagram e da busca por
termo continua podendo sair no molde A (a regra do molde B para todo Reel de
vídeo só é aplicada em código no vídeo de canal); a fala em português não
exige legenda.

## Regra: etiqueta com a editoria e o corte dentro da cena de quem fala (09/11/2026)

Duas reprovações do dono nos Reels do Trump, transformadas em conferência:

- **A etiqueta vermelha é a editoria ou o tema** (POLÍTICA, ECONOMIA,
  TECNOLOGIA), nunca "VÍDEO: CBS NEWS", "ENTREVISTA À BLOOMBERG" nem o nome do
  veículo. Crédito de vídeo e de imagem vai SÓ na legenda do post.
  `conferirEtiqueta` (em `mcp/reels/tarefa.ts`) devolve `[ETIQUETA]` ao Claude.
- **Só a pessoa da fala aparece.** A transcrição diz quando alguém fala; quem
  aparece é decidido pela troca de cena. O preparo mede os cortes de cena
  (`cortesDeCena`, ffmpeg, diferença acima de 0,25) e os entrega à tarefa. Trecho
  com borda a menos de 0,7 s de uma troca de cena volta ao Claude com o tempo
  certo (`[CENA]`): o pedaço era a apresentadora antes da fala, ou o
  entrevistador e quem responde depois. Não é ajustado sozinho porque mexer na
  borda desloca as legendas.
- Pergunta de repórter fora de quadro pode ficar, legendada com "Repórter:".
