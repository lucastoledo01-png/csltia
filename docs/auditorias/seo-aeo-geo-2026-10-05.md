# Auditoria de SEO, AEO e GEO do portal, 05/10/2026

Portal `https://casaloti.ia.br`, código em `main` (`e48c6e4`, com o PR #70 por
cima) e o deploy das 23:35 UTC já no ar (a matéria mostrava "Voltar"). Feita com
as três skills da terceira leva (`seo-audit`, `ai-seo`,
`seo-aeo-best-practices`), e onde elas divergem do projeto valeu o projeto
(`PROCEDENCIA.md`, "Terceira leva"): nada de palavra-chave no começo do título,
nada de chamada para ação na descrição, `FAQPage` só com pergunta visível,
`dateModified` só quando o texto mudou.

Tudo aqui foi medido de um destes três jeitos, e cada achado diz qual:

- **no ar**: `curl` contra produção (robots, os dois sitemaps, `llms.txt`,
  status das 71 URLs do sitemap, cabeçalhos, HTML e JSON-LD de amostras);
- **no banco**: leitura por PostgREST, só GET, das 85 linhas de `articles`
  (62 publicadas, 23 edições arquivadas);
- **no código**: leitura das rotas, do molde, do redator e dos scripts.

## 1. Resumo

**Veredito: a fundação técnica estava boa e ficou melhor com este PR; o
problema que sobra é o CONTEÚDO, e ele só se resolve no banco.** 61 das 62
matérias publicadas são os resumos do desmonte das edições: mediana de 88
palavras, nenhuma pergunta, nenhum link interno, nenhum assunto. Para o Google
isso é página rala em escala; para os buscadores com IA é trecho sem nada para
extrair. Nenhum ajuste de molde compensa isso.

E um achado é de licença, não de busca: 41 capas são do Wikimedia Commons, nenhuma
mostrava crédito, e a mais usada (Wall Street, de Dietmar Rabich, CC BY-SA 4.0)
está em 32 matérias. O PR põe um crédito mínimo na página; o crédito com autor e
licença depende de rodar `corrigir-artigos.ts`.

| Área | Nota antes | Nota com o PR | O que pesa |
|---|---|---|---|
| Rastreio e indexação | 6 | 9 | `www` duplicado, sitemap sem `lastmod`, páginas da vertical antiga e um artigo estático indexáveis. Corrigidos. |
| Metadados | 5 | 8 | home, lista e newsletter com o mesmo título; `og:image` de 9 MB; sem `max-image-preview`. Corrigidos. Sobram títulos e descrições no banco. |
| Dados estruturados | 7 | 9 | grafo da matéria já era bom; imagem torta e pesada, organização sem `sameAs`, home e editoria sem nada. Corrigidos. |
| Conteúdo da matéria | 2 | 2 | 61 de 62 ralas. Só o banco resolve. |
| Assuntos e entidades | 2 | 3 | 61 de 62 com zero assunto. O piso de dois entrou no redator; as antigas dependem da reescrita. |
| Desempenho (por indício) | 6 | 7 | não medido em campo (ver seção 8). Fontes sem uso pré-carregadas, saíram. JS de 200 KB comprimido no artigo continua. |
| Links internos | 6 | 8 | nenhuma página órfã; 61 matérias sem "Leia também". O bloco entrou na página. |
| GEO | 5 | 6 | política de robôs escrita, `llms.txt` bom, conteúdo no HTML inicial; sem IndexNow e com matérias sem bloco extraível. |
| Esteira (back end) | 7 | 8 | o redator cobre quase tudo; faltava piso de assuntos, e o ramo diário não grava legenda nem crédito da capa. |

Nota da auditoria determinística que já existia (`auditar-artigos.ts`, lendo a
página no ar): **63,2 de 100** na média das 62 (era 58,8 na rodada anterior do
mesmo dia).

## 2. Achados

Severidade: **crítico** (custa indexação, confiança ou é risco jurídico),
**alto**, **médio**, **baixo**. Estado: **feito** neste PR, **banco** (precisa
gravar em `articles`, aguarda o dono), **dono** (decisão de produto ou conta
externa).

| # | Sev. | Achado | Evidência (valor observado) | Regra | Correção | Estado |
|---|---|---|---|---|---|---|
| 1 | crítico | 61 de 62 matérias ralas | banco: corpo de 30 a 411 palavras, mediana 88; 61 com até 299; 0 entre 500 e 900 | `seo-audit` "Thin Content"; molde de 06/10 (500 a 900) | reescrever as 61 com `reescrever-artigo.ts` (seção 5) | banco |
| 2 | crítico | Foto CC BY-SA sem crédito | no ar: `figcaption` vazio em `/artigos/los-angeles-pode-eleger-...`; Commons: Wall Street é CC BY-SA 4.0, Dietmar Rabich; 41 capas do Commons, 0 com crédito gravado | incidente "Atribuição de licença guardada em coluna"; E-E-A-T, confiança | página: link "Foto: Wikimedia Commons (autor e licença na página do arquivo)" para a página do arquivo quando não há crédito gravado (`creditoDoCommons`) | feito (mínimo); banco para o crédito completo (38 matérias, `corrigir-artigos.ts`) |
| 3 | alto | `og:image`, `twitter:image` e `image` do JSON-LD com o original do Commons | no ar: `.../d/db/New_York_City_..._6614.jpg`, 9.060.780 bytes; 41 matérias | `seo-aeo-best-practices` Open Graph; prévia do WhatsApp e do Facebook | `imagemParaCompartilhar`: miniatura de 1280 do Commons (444 KB, medida 200). 1200 responde 400, por isso 1280 | feito |
| 4 | alto | Endereço da capa torto | no ar: `?auto=compress&amp%3Bcs=tinysrgb&amp%3Bdpr=2...` em `og:image`, JSON-LD e `<img>`; 15 matérias do Pexels | `seo-audit` imagem; JSON-LD sem dado escapado | `enderecoLimpoDaImagem` na leitura (página, OG, JSON-LD, home) | feito; limpeza no banco opcional (15) |
| 5 | alto | `sitemap.xml` sem `lastmod` | no ar: 71 URLs, 0 `<lastmod>`; a data chegava formatada ("05 de out. de 2026") | `seo-audit` sitemap "updated regularly" | `materiasDoSitemap` lê `published_at` e `updated_at` crus; `lastmod` é a mesma modificação honesta do `dateModified` | feito (verificado local: 62 com `lastmod`) |
| 6 | alto | `www` duplica o site | no ar: `https://www.casaloti.ia.br/` responde 200 com a home, e a home não tinha canônico | `seo-audit` canonicalização, www | 308 de `www` para o domínio sem `www` em `next.config.ts`; canônico na home | feito (verificado local com `Host: www...`) |
| 7 | alto | Títulos e descrições repetidos entre páginas | no ar: `/`, `/artigos`, `/newsletter`, `/formacoes`, `/ultraprompts`, `/automacao`, `/admin` com o mesmo `<title>` e a mesma descrição | `seo-audit` "Unique titles" | metadados próprios na home, na lista e na newsletter, com canônico | feito |
| 8 | alto | Páginas da vertical antiga indexáveis | no ar: `/automacao` diz "Busca notícias de IA, escreve artigos"; `/formacoes` e `/ultraprompts` vendem curso e prompt | `seo-audit` thin/duplicate | `noindex, follow` nas três (desligadas, não apagadas) | feito |
| 9 | alto | Artigo estático da vertical de imigração no ar | no ar: `/artigos/o-que-pesa-na-decisao-de-sair-do-brasil` 200, `datePublished` = hora da visita, fora do sitemap | `ai-seo` freshness honesta; decisão "Imigração sai da pauta" | estático só quando o banco não responde; sem `generateStaticParams` com os estáticos | feito (local: 404) |
| 10 | alto | Sem `max-image-preview:large` | no ar: nenhuma meta `robots`/`googlebot` | Google Discover e notícias principais | `robots.googleBot` no layout, mais `metadataBase` | feito |
| 11 | alto | Matéria sem assunto, e sem piso | banco: 61 de 62 com zero assunto; só Chicago tem 5 | molde de 06/10; `ai-seo` entidades | piso de 2 no redator (seção 4) | feito (regra); banco (61) |
| 12 | alto | Matéria sem link para outra matéria | banco: 61 de 62 sem "Leia também" | `seo-audit` internal linking | a página monta o bloco com `buscarRelacionadas` (mesma editoria, só publicadas) quando o corpo não tem | feito |
| 13 | alto | Ramo diário sem legenda e sem crédito da capa | código: `ramos/ramo-do-portal.ts` grava a capa por `resolverCapa` (só a URL); legenda só em `reescrever-artigo.ts`, crédito só em `corrigir-artigos.ts` e no desmonte | `seo-audit` alt e legenda; licença | crédito mínimo do Commons já sai na página (item 2); falta o ramo receber autor e licença do resolvedor e a descrição da conferência visual | feito em parte; resto pendente (código com chamada de modelo) |
| 14 | médio | `<title>` cortado | banco: 34 de 62 `seo_title` acima de 60; com " \| eua.journal" quase todas passavam | `seo-audit` 50 a 60 | marca só quando cabe (`tituloDaAba`); o nome do site o Google tira do `WebSite` | feito; banco: 16 títulos por `corrigir-artigos.ts` |
| 15 | médio | Descrição fora da faixa e igual ao lide | banco: 26 curtas, 9 longas (de 120 a 155 só 27); 61 começam igual ao primeiro parágrafo | `seo-audit` descrição única | `corrigir-artigos.ts` (24 propostas no ensaio) | banco |
| 16 | médio | Datas visíveis fora de `<time>` e sem "Atualizado em" | no ar: Chicago mostra "24 de setembro" e o JSON-LD diz `dateModified` 05/10 | `ai-seo` "data visível igual à do JSON-LD" | `<time dateTime>` na publicação e "Atualizado em" quando a modificação honesta cai em outro dia | feito |
| 17 | médio | Caminho de navegação só no JSON-LD | no ar: chapéu "Política" era `<span>` | `seo-audit` breadcrumb | chapéu vira link para a editoria | feito |
| 18 | médio | Organização incompleta, home e editoria sem JSON-LD | no ar: `Organization` sem `sameAs` nem medida do logo; home e `/editoria/*` sem bloco | `seo-aeo-best-practices` structured-data | `sameAs` Instagram, logo 800x142, `WebSite` (sem `SearchAction`, não há busca), `CollectionPage` com `ItemList` e `BreadcrumbList` na editoria | feito |
| 19 | médio | Painel só no `robots.txt` | no ar: `/admin` 200 sem `noindex` | `seo-audit` noindex | `noindex` no layout do painel e `X-Robots-Tag` em `/admin` e `/api` | feito (local: cabeçalho presente) |
| 20 | médio | Fontes sem uso pré-carregadas | no ar: 6 `<link rel=preload as=font>` no artigo; `--font-archivo-black` e `--font-space-mono` não são usadas em lugar nenhum | `seo-audit` font loading, LCP | `preload: false` nas duas | feito |
| 21 | médio | Mesma foto em 32 matérias, e sem relação | banco: Wall Street na matéria da prefeita de Los Angeles e em outras 31 | `seo-audit` imagem descreve o conteúdo | troca de capa | dono (decidiu manter as fotos por ora) |
| 22 | médio | 4 matérias sem capa, logo sem `image` | banco: 4 de 18/09 | Google recomenda `image` no NewsArticle | decisão registrada: sem capa, sem `image` | dono |
| 23 | médio | JS pesado na matéria | no ar: 9 blocos, cerca de 200 KB comprimidos; Turnstile pré-carregado em toda página; o corpo é componente de cliente e o HTML vai duas vezes (67 KB) | `seo-audit` JS execution, INP | carregar o Turnstile só ao focar a inscrição; tirar o corpo do componente de cliente | pendente |
| 24 | médio | LCP da home em baixa resolução | no ar: a manchete da home usa a capa do Pexels gravada como `w=600&h=360` | LCP e qualidade | pedir 1280 ao Pexels na manchete | pendente |
| 25 | médio | Sem IndexNow e sem Bing Webmaster | no ar: sem chave IndexNow | `ai-seo`: ChatGPT e Copilot usam o índice do Bing | chave na raiz e aviso ao publicar | dono |
| 26 | médio | Leitura de todos os artigos a cada página | código: `getAllArticlesForAdmin` faz `select *` de `articles` inteira em cada matéria | TTFB | consulta por slug | pendente |
| 27 | baixo | Lista chamada "Edições" | no ar: `/artigos` com H1 "Edições", menu "Todas as edições", e a lista é de matérias | clareza | trocar o rótulo | dono |
| 28 | baixo | Título de rodapé como H2 | no ar: "Editorias", "O portal", "Newsletter" e a caixa de assinatura são H2 em toda matéria | `seo-audit` heading hierarchy | trocar por `p` com estilo | pendente |
| 29 | baixo | Texto da vertical de IA nos comentários | no ar: "compartilhe seu teste sobre este tema" | voz | trocar o texto | pendente |
| 30 | baixo | Data em inglês | banco: "marcada para Nov. 3" na matéria de Los Angeles (descrição e corpo) | voz | correção pontual | banco (1) |
| 31 | baixo | Sem `llms-full.txt` e sem Markdown negociado | no ar | `ai-seo` agent-readiness (opcional) | gerar quando o conteúdo estiver reescrito | pendente |
| 32 | baixo | Favicon padrão e sem manifesto | no ar: `/manifest.webmanifest` 404 | `decisoes.md`, decisões em aberto | marca quadrada desenhada | dono |

### O que está bem, e foi conferido

- **`robots.txt`**: os robôs de busca e de treino nomeados por finalidade e
  liberados, `/admin` e `/api/` fora, os dois sitemaps declarados. Bate com a
  decisão de 05/10.
- **`sitemap-noticias.xml`**: formato do Google News correto (namespace,
  `news:name` "eua.journal", `news:language` "pt", data em ISO, título),
  janela de 48 horas respeitada (6 URLs, de 04/10 09:26 a 05/10 09:28, lido às
  23:36 de 05/10), `Cache-Control` de 5 minutos.
- **`llms.txt`**: título, resumo, as seis editorias, as 20 matérias mais novas
  com resumo, newsletter; todos os links apontam para páginas que respondem 200.
- **Status**: as 71 URLs do sitemap respondem 200; barra no fim dá 308 para sem
  barra; slug inexistente e editoria inexistente dão 404; `edicao-2026-09-12`
  dá 308 para a primeira matéria da edição; `http` dá 301 para `https`.
- **Canônico** próprio em cada matéria e em cada editoria; `lang="pt-BR"`;
  hreflang não se aplica (uma língua só).
- **NewsArticle** com título (nenhum acima de 110 caracteres), datas, autor
  Organization, editora, seção, `inLanguage`, `BreadcrumbList` pela editoria,
  `FAQPage` só com pergunta visível, `<` escapado; `about` e `mentions` só com
  quem o texto nomeia, `sameAs` só do Wikidata.
- **Conteúdo no HTML inicial**, sem depender de JavaScript; a capa da matéria
  sai com `priority` (pré-carregada) em caixa de proporção fixa (sem CLS); a
  letra Sora vem do `next/font`, da nossa origem.
- **Nenhuma página órfã**: as 62 estão na lista `/artigos` e nas páginas de
  editoria, e 25 estão na home.
- A matéria-piloto de Chicago passa em tudo que o molde pede (601 palavras na
  página, 4 intertítulos em pergunta, fonte na abertura, 4 perguntas, legenda,
  5 assuntos).

## 3. A estrutura das 62, pelas réguas das skills

Medido no banco por `npx tsx src/scripts/auditar-artigos.ts --estrutura`
(novo neste PR, `src/lib/server/estrutura-da-materia.ts`), sem modelo e sem
gravar nada. "Palavras no corpo" exclui perguntas, "Leia também", fontes e o
bloco de tópicos.

| Medida | Matérias |
|---|---|
| Palavras no corpo (mínimo, mediana, máximo) | 30, 88, 411 |
| Corpo com até 299 palavras | 61 de 62 |
| Corpo com 300 a 499 palavras | 1 de 62 |
| Corpo com 500 a 900 palavras | 0 de 62 |
| Resposta primeiro (o lide diz o fato do título) | 46 de 62 |
| Link da fonte na abertura | 1 de 62 |
| Algum intertítulo em forma de pergunta | 1 de 62 |
| Sem intertítulo nenhum | 17 de 62 |
| Bloco "O que você precisa saber" | 0 de 62 |
| "Leia também" gravado no corpo | 1 de 62 |
| De 3 a 5 perguntas visíveis | 1 de 62 |
| Sem pergunta nenhuma | 61 de 62 |
| Legenda da capa | 1 de 62 |
| Crédito da capa: gravado | 0 de 62 |
| Crédito da capa: só o link do Commons que a página agora põe | 41 de 62 |
| Crédito da capa: nenhum (Pexels, que não exige) | 17 de 62 |
| Sem capa | 4 de 62 |
| Endereço da capa com `&amp;` torto | 15 de 62 |
| Com 0 assunto na página | 61 de 62 |
| Com 5 assuntos na página | 1 de 62 |
| Abaixo do piso de 2 assuntos hoje | 61 de 62 |
| Abaixo do piso mesmo com o que o texto sustenta | 58 de 62 |
| Com parágrafo que abre por referência solta ("Isso", "Ele") | 0 de 62 |

Leitura: o que é forma (lide com o fato, parágrafo que se sustenta) está bem.
O que falta é substância: perguntas, intertítulos, links e assuntos não existem
porque o texto de 88 palavras não tem de onde tirá-los.

## 4. Assuntos: existe mínimo? A recomendação

Hoje **não existe mínimo**, só o teto de cinco (`LIMITE_DE_ASSUNTOS`). Uma
matéria podia sair com zero ou um assunto, e 61 das 62 saíram com zero.

**Recomendação, e o que entrou no código:** piso de **dois**, que **não inventa**.

- `MINIMO_DE_ASSUNTOS = 2` em `src/lib/indexacao-do-artigo.ts`.
- O redator (`indexacaoDoArtigoEscrito`, usado pelo ramo do portal e pela
  reescrita) liga `completarAteOMinimo`: abaixo de dois, completa com as
  entidades CITADAS que o texto final nomeia, na ordem do pacote, sem passar
  do teto de três entidades. Nunca com tema que o texto não trata duas vezes,
  nunca com palavra genérica.
- Se nem assim chega a dois, a matéria sai com o que tem e o ramo registra o
  aviso `ASSUNTOS ABAIXO DO MÍNIMO: n de 2, o texto não sustenta mais`, que
  aparece para quem aprova. Não bloqueia: bloquear empurraria o redator a
  inventar, que é o que a lista fechada existe para impedir.
- A página não completa nada na leitura: mostra o que foi gravado e validado.

Por que dois e não três: um assunto não agrupa nada e não diz ao buscador de
que a página trata além do título; três exigiria completar matéria curta com
citação de passagem. Dois é a entidade central mais um tema ou uma segunda
entidade, e numa matéria de 500 palavras no molde isso sempre existe (Chicago
tem cinco).

**Números:** 61 de 62 publicadas estão abaixo do piso hoje. Rodando o
validador só com o texto gravado e as entidades já gravadas, sem modelo, 58
continuam abaixo: o texto de 88 palavras não cita tema da lista duas vezes e
não tem entidade gravada. Ou seja, o piso nas matérias antigas só se cumpre
com a reescrita (seção 5), que extrai as entidades do pacote factual.

## 5. Correções que precisam do banco, para o dono aprovar

Nenhuma foi rodada. Os scripts existem e gravam só com `--aplicar`.

| O quê | Quantas | Como | Custo estimado |
|---|---|---|---|
| Reescrever as matérias ralas no molde completo (tópicos, abertura com link, intertítulos em pergunta, perguntas, "Leia também", assuntos com o piso, legenda) | 61 | `reescrever-artigo.ts`, uma por vez, lida contra a fonte antes do `--aplicar` (lição de Chicago) | cerca de US$ 0,10 a 0,15 por matéria (pacote factual, redação com um reparo, auditor semântico, conferência visual), US$ 6 a 9 no lote. Estimativa por tamanho de chamada e preço da tabela de `ai-provider.ts`, não medição. Fonte que não abre mais (setembro) cai no Internet Archive, ou fica de fora |
| Crédito da capa com autor e licença lidos do Commons | 38 | `corrigir-artigos.ts --aplicar` (o ensaio de 05/10 já lista cada uma) | parte do item abaixo |
| Título de busca acima de 60 e descrição fora da faixa | 16 títulos, 24 descrições (34 precisam de mão) | `corrigir-artigos.ts --aplicar` | US$ 0,45 no lote inteiro (ensaio de 05/10, `docs/auditorias/corrigir-artigos-ensaio-2026-10-05.txt`) |
| Limpar o `&amp%3B` gravado nas capas do Pexels | 15 | `UPDATE` simples; opcional, a página já limpa na leitura | zero |
| Data em inglês ("Nov. 3") | 1 | correção à mão na matéria de Los Angeles | zero |
| Trocar a capa repetida (Wall Street) | 32 | decisão do dono de manter as fotos por ora | zero em modelo, tempo de escolha |

Ordem sugerida: `corrigir-artigos.ts` primeiro (barato, resolve a licença com
autor), depois a reescrita em lotes pequenos. Uma alternativa, se a reescrita
demorar: `noindex` provisório nas matérias com menos de 150 palavras até serem
reescritas. Não está no PR porque é decisão editorial.

## 6. O que a esteira garante, e o que ainda deixa passar

O redator do ramo (`ramos/artigo.ts`) já impõe, no código: lastro de cada
unidade no pacote (a poda apaga o que não se sustenta), o bloco de tópicos
com as quatro regras, de 3 a 5 perguntas com resposta no corpo, "Leia
também" com 2 a 3 publicadas da editoria, fontes com link, assuntos pelo
validador, entidades só as que o texto nomeia, título e descrição de busca com
teto. Isso é o que a auditoria espera.

O que ainda pode sair abaixo do esperado numa matéria nova:

- **Matéria curta.** O molde pede de 500 a 900 palavras, mas nada mede isso na
  saída; pacote pobre dá matéria de 200 palavras, aprovada. Sugestão: aviso
  na peça abaixo de 350 palavras, para quem aprova ver (não bloqueio).
- **Legenda e crédito da capa.** O ramo grava só a URL da capa. O crédito
  mínimo agora sai na página; o completo (autor, licença) e a legenda
  (descrição da conferência visual com ancoragem) precisam passar do
  resolvedor para o ramo, como a reescrita já faz.
- **Assuntos abaixo de dois.** Agora vira aviso visível (item 11).
- **Perguntas abaixo de três.** O redator aceita menos quando o pacote não
  rende, de propósito; a auditoria aponta.
- **Primeira publicação sem "Leia também".** Editoria nova ou vazia sai sem
  relacionadas; a página agora completa o bloco quando houver.

## 7. GEO: o que está pronto e como medir

Pronto: robôs por finalidade, `llms.txt`, conteúdo no HTML inicial, datas
visíveis iguais às do JSON-LD (com este PR), fonte nomeada com link, `FAQPage`
honesto. Falta: IndexNow e Bing Webmaster Tools (ChatGPT e Copilot buscam no
índice do Bing), e matéria com bloco extraível, que é o item 1.

Medir citação, pelo método da skill (`ai-seo`, `format-volatility.md`):
escolher de 10 a 20 perguntas que as matérias respondem (ex.: "quantos data
centers Chicago tem", "taxa de desemprego dos EUA em setembro"), rodar cada
uma de 3 a 5 vezes no ChatGPT com busca, no Perplexity, no Gemini e no Claude,
e anotar a TAXA de citação de `casaloti.ia.br` ("citado em 2 de 5, n=5").
Repetir a cada duas semanas e comparar taxas, nunca rodadas avulsas. Antes da
reescrita, o esperado é perto de zero: não há trecho para citar.

## 8. O que não foi verificado

- **Core Web Vitals de campo e Lighthouse.** O Lighthouse não está instalado
  nesta máquina e não foi instalado (pouco disco); a API do PageSpeed Insights
  respondeu cota diária esgotada. As notas de desempenho são por indício
  estático: tamanho de JS e de imagem, pré-carga, proporção fixa da capa.
- **Search Console e Bing Webmaster**: sem acesso; cobertura de índice,
  sitemaps enviados e consultas não foram vistos.
- **Rich Results Test**: não rodado; o JSON-LD foi lido do HTML servido e
  validado à mão contra os campos do Google.
- **`sameAs` do Wikidata**: os QIDs de Chicago não foram reconferidos um a um.

## 9. O que este PR muda

Código, sem tocar no banco. `npx vitest run` (2.312 testes, 207 arquivos) e
`npm run build` passam.

- Imagem: `enderecoLimpoDaImagem`, `imagemParaCompartilhar`, `creditoDoCommons`
  e `miniaturaDoCommons` em `src/lib/imagem-da-capa.ts`.
- Matéria: OG e JSON-LD com a capa limpa e leve; `<title>` com a marca só
  quando cabe; `<time>` e "Atualizado em"; chapéu com link; crédito mínimo do
  Commons; "Leia também" quando falta; sem artigo estático, salvo em falha do
  banco.
- Grafo: `organizacaoDoSite` (com `sameAs` e medida do logo), `siteDoPortal`,
  `dadosEstruturadosDaHome`, `dadosEstruturadosDaEditoria`.
- Páginas: metadados da home, da lista e da newsletter; `noindex` na vertical
  antiga e no painel; `max-image-preview:large` e `metadataBase` no layout;
  fontes sem uso fora da pré-carga.
- `next.config.ts`: 308 de `www` e `X-Robots-Tag` em `/admin` e `/api`.
- Sitemap com `lastmod` do banco.
- Assuntos: `MINIMO_DE_ASSUNTOS` e `completarAteOMinimo`, aviso no ramo e na
  reescrita.
- Auditoria: `estrutura-da-materia.ts` e `auditar-artigos.ts --estrutura`.

## 10. Desempenho, medido depois (06/10/2026)

Os itens 23, 24 e 26 e o que a seção 8 deixou sem medir, feitos no PR
`perf/portal-e-painel`. Medição com Playwright (Chromium headless), celular
emulado (412x823 a 1,75x, CPU 4x mais lenta, rede "Slow 4G" do Lighthouse:
150 ms, 1,6 Mbps), `next start` local lendo o banco de produção só para
leitura, mediana de 5 carregamentos frios por página, janela de 10 s depois
do `load`. O Lighthouse não foi instalado (o pacote com dependências passa de
50 MB). Bytes são os transferidos, comprimidos.

| Página | Medida | Antes | Depois |
|---|---|---|---|
| Matéria | LCP | 2.880 ms | 2.120 ms |
| Matéria | Total transferido | 543 KB | 379 KB |
| Matéria | JavaScript | 194 KB | 167 KB |
| Matéria | Fontes | 99 KB (Inter, Sora latin e latin-ext) | 34 KB (Sora latin) |
| Matéria | Imagens | 219 KB | 144 KB |
| Home | LCP | 7.680 ms | 4.400 ms |
| Home | Total transferido | 852 KB | 512 KB |
| Home | Imagens | 507 KB | 249 KB |
| Lista `/artigos` | LCP | 2.688 ms | 1.840 ms |
| Lista `/artigos` | Total transferido | 526 KB | 312 KB |
| Todas | CLS | 0 | 0 |

O Turnstile saiu do carregamento: o carregador (28 KB) é o que a conta de
JavaScript acima enxerga, mas o widget inteiro, iframe incluído, são 11
pedidos e cerca de 800 KB que toda página do portal baixava em segundo plano.
Agora só com foco, toque ou envio na caixa de assinatura.

A leitura da matéria no banco: `select *` da tabela inteira devolvia 653 KB em
857 ms (mediana de 7), e a página fazia isso duas vezes (metadados e corpo). A
leitura por slug devolve 10 KB em 233 ms, uma vez.

O TTFB da home ficou entre 2,0 e 2,9 s nos dois lados e domina o LCP dela: a
home é renderizada por requisição e lê 20 edições com o HTML inteiro (423 KB)
para achar as fotos das pautas. Não mexido aqui; é o próximo item de
desempenho.
