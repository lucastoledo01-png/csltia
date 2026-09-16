# Pack de linguagem: o que muda no texto

Pedido de 16/09/2026, depois de o dono ler a primeira edição publicada em cinco
dias. Este arquivo é o registro do que foi pedido, do que foi decidido, do que o
código faz hoje e do que muda. Ele existe porque a mudança é de VOZ, e voz não
se conserta num arquivo só: ela nasce em nove instruções espalhadas por três
camadas, mais um briefing que mora no banco e vence todas elas.

## 1. O que foi pedido, nas palavras do dono

1. **Parar de dizer que a fonte não informa.** Todo bloco de notícia termina
   dizendo que falta um dado. "Parece que existe alguma trava que está tornando
   a linguagem robótica."
2. **Sair do registro técnico.** "Não pode ser técnico a nível de escritório.
   A gente precisa ser generalista com a pauta." O leitor é a massa brasileira
   que gosta de acompanhar os EUA, não o advogado.
3. **Linguagem de social media**, rápida, fluida, objetiva e natural. "Não pode
   parecer um jornal, como a gente está fazendo, apesar do nome." Informar de
   forma leve.
4. **A mesma régua vale para os três canais**: newsletter, artigo do portal e
   Instagram.
5. **Ocultar o bloco do fim da newsletter** que ele chamou de "Guia rápido". No
   código ele se chama **Giro rápido** e é o `quick_bits`.
6. **Análise de perfil e CTA do Instagram estão competindo** no fim do e-mail.
   O CTA do Instagram sai, porque concorre com a própria newsletter. A análise
   de perfil assume o desenho do bloco do Instagram. O Instagram fica só com um
   ícone discreto embaixo.
7. **Nome do perfil desatualizado** no e-mail.
8. **Assunto do e-mail com pegada de marketing**, feito para dar vontade de
   abrir. Alto CTR.
9. **Título e subtítulo não podem se repetir.** O caso do dia: o título dizia
   que a corte adiou a regra para estudantes e intercambistas, e a linha de
   baixo repetia a mesma frase trocando as palavras por siglas. O subtítulo tem
   que COMPLEMENTAR.

E uma referência explícita: a newsletter **the news**, edição de 15/09, enviada
em PDF. "Nós queremos algo exatamente como eles fazem, o texto trabalhado na
mesma dinâmica para a newsletter, e aí para o Instagram linguagem de rede
social."

## 2. O que já está decidido

| pergunta | decisão |
|---|---|
| quando falta um dado que o leitor precisa | dizer com naturalidade, sem citar a fonte: "ainda não há data nova". Só quando a falta muda alguma coisa, nunca em todo bloco |
| até onde vai o tom | conversa informada, sem emoji no corpo, sem gíria, sem jargão. Lê rápido e continua sério |
| Instagram no e-mail | ícone discreto mais o nome **USA Journal**, sem arroba |
| sigla e termo técnico | português primeiro, menos sigla. A dinâmica de escrita segue a referência |

## 3. A evidência, na edição publicada hoje

**A frase da lacuna aparece em três das quatro pautas**, e ainda no preheader:

```
pauta 2   "A fonte não informa por quanto tempo o adiamento vale nem qual será a nova data."
pauta 3   "A fonte não informa a duração da decisão."
pauta 4   "O G1 não informa por quanto tempo a suspensão vale."
preheader "a nova data de vigência ainda não foi informada"
```

**O registro é de escritório**, e dá para medir pelo que o leitor comum não
reconhece: "regra final do Department of Homeland Security", "o modelo de
permanência chamado duration of status", "certos não imigrantes I", e o nome
completo de um processo judicial em inglês dentro do corpo do texto.

**Título e subtítulo dizem a mesma coisa**, e o segundo é a versão técnica do
primeiro:

```
headline    Corte adia regra para estudantes e intercambistas
preheader   Corte adia regra para F-1, J-1 e I; a nova data de vigência ainda não foi informada
```

## 4. Onde isso nasce

### 4.1 A trava da lacuna: nove instruções, e duas blindam a frase

Não é uma instrução. São nove, e elas se reforçam:

| onde | o que manda |
|---|---|
| `pacote-factual.ts:58` | o extrator PRODUZ a lista de lacunas de cada pauta |
| `pipeline.ts:330` | a lista viaja dentro do pacote factual de toda pauta |
| `pipeline.ts:189` | manda escrever que a fonte não divulgou quando o detalhe falta |
| `pipeline.ts:353` | repete a ordem junto do pacote |
| `pipeline.ts:358` | manda declarar que a fonte não informou o EFEITO |
| `pipeline.ts:359` | dá a frase pronta como exemplo do que é CERTO |
| `pipeline.ts:688` | o reparo converte afirmação sem lastro em frase de lacuna |
| `pipeline.ts:519` | o auditor de QA é instruído a tratar a ressalva como comportamento correto |
| `claims-semanticas.ts:107` | o auditor semântico é instruído a ignorar a frase |
| banco, `editorial_prompt_extra` | "Na dúvida, escreva o fato e diga que o órgão não divulgou o detalhe" |

As duas últimas linhas da tabela são a trava de verdade. Com os dois auditores
isentando a frase, ela **nunca** entra na lista de reparo, e o laço de correção
ainda a produz de novo quando uma afirmação é reprovada. O sistema estava
construído para escrevê-la.

Existe uma única proibição de ressalva hoje, em `pipeline.ts:245`, e ela cobre
só o campo `why_it_matters`. O defeito já tinha sido reconhecido num campo e
nunca foi estendido aos outros.

### 4.2 O registro técnico

| onde | o que causa |
|---|---|
| `pipeline.ts:117` | o papel declarado é editor-chefe sênior de publicação |
| `pipeline.ts:129` | a ordem de prioridade põe clareza em 4º e atratividade em 5º, com "nunca inverta" logo abaixo |
| `pipeline.ts:157` | quando o termo técnico é necessário, ensina a explicá-lo com aposto no meio da frase, o que alonga e dá cara de manual |
| `pipeline.ts:184` | a regra que proíbe falar do comportamento das pessoas tira quase todo verbo humano e deixa sujeito abstrato: a regra, a medida, a decisão |

A linha 184 entrou ontem, e resolveu um problema real: o auditor derrubava a
edição quando o texto inventava o que as pessoas fazem. Ela não sai. O que muda
é o que fica no lugar dela, e isso precisa ser escrito com cuidado.

### 4.3 Título, subtítulo e a redundância

- `subject` (assunto do e-mail): 15 a 70 caracteres, `schemas.ts:25`. É o ÚNICO
  campo com regra de gancho, no bloco de `pipeline.ts:193` a 228.
- `headline` (o h1 da edição): instrução de uma linha só, `pipeline.ts:236`.
  Sem tamanho, sem estrutura, sem relação declarada com o assunto.
- `preheader` (a linha abaixo do h1): `pipeline.ts:235` pede **resumo**, e é por
  isso que ele repete. Schema de 30 a 120, `schemas.ts:26`.
- **Nenhuma regra, em lugar nenhum, impede a repetição entre os dois.**
  Procurado no prompt do redator, no do auditor, no de reparo, no leitor, no
  anti-vícios e no verificador.
- O auditor é explicitamente instruído a NÃO julgar o assunto por resumir demais
  (`pipeline.ts:503`).
- A redundância vaza para o Google: `newsroom-service.ts:1760` copia o assunto
  em `seo_title` e o preheader em `seo_description`.
- Contradição de tamanho dentro do mesmo prompt: `pipeline.ts:169` pede no
  máximo 55 palavras num parágrafo, e `pipeline.ts:243` pede 2 a 3 parágrafos.

### 4.4 Os blocos do e-mail

Tudo em `renderEditionToHtml`, `newsroom-service.ts:161` a 527. A mesma função
serve o e-mail e o corpo do artigo no portal, e o que o portal corta é só
cabeçalho, intro, índice e rodapé. Ordem atual:

```
data > headline > preheader > intro > "Nesta edição" > pautas
> Giro rápido > Análise de perfil > Todo dia no Instagram > fechamento > rodapé
```

- Giro rápido: `newsroom-service.ts:329`
- Análise de perfil: `newsroom-service.ts:445`, fundo claro
- Todo dia no Instagram: `newsroom-service.ts:466`, fundo azul-marinho,
  centralizado, botão vermelho. É este desenho que a análise de perfil recebe.

### 4.5 A marca, e o que o banco ainda diz

O `src/lib/marca.ts` já foi migrado. O banco não:

```
projects.brand_display_name      imigra.us
projects.newsletter_from_name    imigra.us
```

O segundo é o **nome do remetente na caixa de entrada**. E o handle do
Instagram no código é `@eua.journal`, que é o nome anterior. Verificado agora na
Graph API, o perfil real é:

```
username  usa.journal.ai
nome      USA Journal
```

Também divergem: `MARCA.keyword` é "VISTO" e `projects.settings.instagram_keyword`
é "VISA". O CTA dos posts pede para comentar a palavra que vier daí.

## 5. A referência, destrinchada

Estrutura da edição de 15/09 da the news, para copiar a DINÂMICA, não o texto:

**Abertura.** Título curto em minúsculas, duas ou três palavras. Um parágrafo de
abertura que não é sobre a notícia: uma pergunta ou reflexão curta, falando com
"você". Só depois vem a data.

**Cada pauta.**
1. Chapéu de editoria em caixa alta, colorido.
2. Manchete grande, afirmativa, em linguagem comum. Não é frase de órgão.
3. Imagem com crédito.
4. Parágrafos de duas a quatro linhas, com **negrito nos números e nos nomes**.
   O negrito é o que faz a leitura em diagonal funcionar.
5. Blocos rotulados em negrito no meio do texto, em vez de subtítulos: "Por que
   isso importa?", "Como funciona:", "O panorama de longo prazo:".
6. Um bloco com barra lateral colorida para a explicação que precisa parar o
   olho.
7. Fecho com o próximo passo, quando existe.
8. Compartilhar pelo WhatsApp no fim de CADA pauta.

**O que o texto faz.** Frases curtas alternadas com uma longa. Conversa com o
leitor. Reticências. Comentário seco. Compara com coisa do dia a dia. Nunca
explica o que o leitor já sabe, e nunca usa o nome completo de uma norma quando
o apelido dela basta.

**O que nós já temos e não usamos.** O campo `why_it_matters` é exatamente o
bloco "Por que isso importa?" deles. Ele existe, é escrito, e o e-mail o
renderiza colado no resumo, sem rótulo e sem destaque.

**O que eles têm e nós não vamos copiar.** Publicidade, termômetro de opinião,
programa de indicação e emoji no índice.

## 6. O plano, em ordem de risco

**Fase 1, estrutura do e-mail.** Não toca em prompt, não pode quebrar edição.
Ocultar o Giro rápido, trocar o CTA do Instagram pela análise de perfil com o
desenho escuro, e descer o Instagram para um ícone discreto no rodapé.

**Fase 2, marca.** Corrigir o remetente e o nome de exibição no banco, e o
handle do Instagram no código, com o valor verificado na Graph API.

**Fase 3, voz.** Reescrever o bloco de tom do prompt do redator, remover as nove
instruções de lacuna, trocar as duas isenções dos auditores por uma regra que
proíbe a frase, e reescrever o briefing que está no banco. Esta fase muda o
texto de todos os canais de uma vez, porque o artigo do portal não tem prompt
próprio: ele é a edição regravada.

**Fase 4, título e subtítulo.** Dar ao `headline` a mesma régua que o assunto já
tem, e trocar a instrução do preheader de "resumo" para "complemento". Uma
conferência determinista de redundância entre os dois, do mesmo tipo que a
semelhança de título já faz contra o histórico.

**Fase 5, Instagram.** A legenda e os slides herdam a voz nova, com uma camada a
mais de rede social.

## 7. O que foi feito em 16/09/2026

Fases 1 a 5 aplicadas na mesma leva. O que mudou:

**Estrutura do e-mail.** Giro rápido não é mais renderizado. O convite ao
Instagram saiu e a análise de perfil herdou o desenho escuro dele. O Instagram
virou ícone mais nome no rodapé. O corpo da pauta passou a aceitar parágrafos e
negrito, e "Por que isso importa:" voltou como rótulo inline, no formato da
referência.

**Marca.** `projects.brand_display_name` e `projects.newsletter_from_name`
estavam em `imigra.us` no banco, e o segundo é o nome do remetente na caixa de
entrada. O handle foi conferido na Graph API: o perfil é `usa.journal.ai`, nome
de exibição "USA Journal". O código apontava para `@eua.journal`, que é conta
de outra pessoa.

**Voz.** Nove instruções de lacuna removidas ou invertidas, as duas isenções de
auditor trocadas, o laço de reparo reescrito, o apontamento de relevância do
`leitor.ts` alinhado com a proibição de comportamento, e as marcas de explicação
ampliadas para reconhecer fala. O briefing do banco ganhou a seção de voz e
perdeu a linha que mandava declarar o que o órgão não divulgou.

**Título e subtítulo.** O prompt passou a dizer o que cada linha ACRESCENTA, e
entrou uma conferência determinista de redundância por contenção de palavras,
que gera apontamento de reparo. O `seo_title` do portal passou a ser o
`headline`, e não o assunto do e-mail.

**Instagram.** Mesma regra de ressalva, mesma voz, mais a faixa de manchete no
prompt de reparo, que apontava para 3 a 10 palavras enquanto a guarda cobrava 6
a 18.

## 8. O que a Fase 3 tinha de perigoso

Este projeto já perdeu cinco dias de edição porque uma instrução pedia um
comportamento que um auditor recusava, e o laço de reparo repetia o mesmo erro
com sinônimos. A regra continua valendo: **nenhuma instrução nova de tom pode
pedir o que a régua de alucinação recusa.**

Tom leve não é licença para afirmar mais. O texto fica mais leve tirando
palavra, não acrescentando alcance. Toda frase continua tendo que caber no
pacote factual.
