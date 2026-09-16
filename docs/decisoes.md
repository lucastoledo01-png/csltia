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
