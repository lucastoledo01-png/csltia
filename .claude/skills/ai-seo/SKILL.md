---
name: ai-seo
description: Otimização para buscadores com IA (AEO e GEO), isto é, ser citado como fonte pelo Google AI Overviews, ChatGPT, Perplexity, Gemini, Copilot e Claude. Use ao mexer em robots.txt para robôs de IA, llms.txt, versão em Markdown da página, dados estruturados pensados para resposta, estrutura da matéria para extração de trecho, ou ao medir se o portal aparece como fonte em resposta de IA.
---

# SEO para buscadores com IA (AEO e GEO)

Versão aparada da skill `ai-seo` de `coreyhaines31/marketingskills`, para um
portal de notícia em português. A origem, o commit e o motivo de cada corte
estão em `.claude/skills/PROCEDENCIA.md`.

**As regras do projeto vencem esta skill.** Título segue
`docs/modelo-de-titulo.md`; voz, lastro e proibições seguem `docs/decisoes.md`.
Onde algo aqui parecer pedir outra coisa, vale o projeto.

## O que vale saber antes de mexer

**Google não pede nada especial.** O guia de IA do Google diz que AI Overviews
e AI Mode saem do mesmo sistema de ranqueamento da busca comum: não exigem
marcação nova, arquivo novo nem texto separado "para IA". Escrever variante
para robô arrisca a política de conteúdo em escala. Para o Google, o trabalho
é SEO normal bem feito.

**Os outros buscadores premiam estrutura extraível.** ChatGPT, Perplexity,
Copilot e Claude puxam TRECHOS, não páginas. Parágrafo que se sustenta sozinho,
resposta direta logo abaixo do intertítulo, data visível e fonte nomeada ajudam
ali e não atrapalham o Google.

**Cada um usa um índice.** ChatGPT busca num índice derivado do Bing, Copilot
usa o Bing, Claude usa o Brave, Gemini e AI Overviews usam o Google. Matéria
fora do índice não é citada. Bing Webmaster Tools e IndexNow alcançam dois
deles de uma vez.

## Robôs: decidir por finalidade, não em bloco

Os nomes não são equivalentes, e bloquear um não bloqueia o outro:

- **Descoberta para busca:** `OAI-SearchBot` (ChatGPT), `PerplexityBot`,
  `Claude-SearchBot`, além de `Googlebot` e `Bingbot`. Bloquear reduz citação.
- **Busca disparada pelo usuário:** `ChatGPT-User`, `Claude-User`,
  `Perplexity-User`. Os fornecedores dizem que nem sempre obedecem robots.txt.
- **Treino de modelo:** `GPTBot`, `ClaudeBot`. Bloquear é recusar treino, e
  não tira o site da citação.
- **`Google-Extended`:** controla treino e grounding do Gemini, e não mexe na
  busca do Google.

Para um portal que vive de ser achado, o caminho coerente é liberar descoberta
e decidir treino à parte, de propósito. Confira também se o CDN ou o firewall
bloqueia algum desses sem ninguém ter decidido. Os nomes mudam: confira a
documentação de cada fornecedor (links em `references/platform-ranking-factors.md`).

## Estrutura da matéria para ser citada

- A resposta vem primeiro. O lide diz o fato; o resto explica.
- Intertítulo descreve o que vem embaixo, e pode ter a forma da pergunta que o
  leitor faria.
- Um assunto por parágrafo, e o parágrafo faz sentido fora da página.
- Número, data e valor com a fonte nomeada na mesma frase.
- Data de publicação e de atualização visíveis, e iguais às do JSON-LD.
- Tabela quando houver comparação de verdade; lista numerada quando houver
  passo a passo de verdade. Nunca para enfeitar.

## O que esta skill NÃO autoriza aqui

A literatura de GEO (o estudo de Princeton, KDD 2024) mediu que estatística,
citação e aspas aumentam a visibilidade. Isso é verdade para quem TEM o dado.
Neste projeto:

- **Nenhuma estatística, aspas ou fonte entra sem estar no pacote factual.**
  Os exemplos de `references/content-patterns.md` trazem números e citações de
  ilustração (o "70% do tráfego", a frase atribuída a Rand Fishkin). São
  molde, não fato, e nunca vão para texto publicado.
- **"Tom autoritário" não é licença para afirmar além da fonte.** A régua
  anti-alucinação e o silêncio como resultado válido continuam valendo.
- **Nada de repetir palavra-chave.** Encher o texto de termo derruba a
  visibilidade em IA (o mesmo estudo mediu queda) e fere a voz da casa.
- **FAQ não é enfeite.** `FAQPage` só com pergunta e resposta que a matéria de
  fato contém. O Google restringiu o resultado rico de FAQ a sites de governo e
  saúde em 2023, então não prometa ganho no Google por ele.
- **Não se escreve matéria por consulta derivada.** Publicar uma página para
  cada variação de busca é o padrão de conteúdo em escala que os buscadores
  rebaixaram.

## Arquivos para máquina

- **`/llms.txt`**: índice curto do que o portal é e para onde apontar
  (editorias, matérias recentes, newsletter). Não é exigido pelo Google; é
  lido por outros agentes. `llms-full.txt` é o texto inteiro num arquivo só.
- **Markdown da página**: servir Markdown no mesmo endereço quando o pedido
  vier com `Accept: text/markdown` (com `Vary: Accept`), ou um cabeçalho
  `Link` apontando para a versão em Markdown.
- **Conteúdo no HTML inicial**: a maioria dos agentes não executa JavaScript.

Detalhes em `references/agent-readiness.md`. A ferramenta `npx is-agentic`
citada lá é pacote de terceiro: não rode sem auditar, pelo mesmo motivo de
`PROCEDENCIA.md`.

## Medir

Resposta de IA não é determinística: uma rodada é anedota. Para cada pergunta
que importa, rode de 3 a 5 vezes por plataforma e anote a TAXA ("citado em 3
de 5, n=5"). Compare taxas ao longo do tempo, não rodadas. Método em
`references/format-volatility.md`.

## Referências

Carregue só a que serve à tarefa:

- `references/platform-ranking-factors.md`: como cada plataforma escolhe
  fonte, e o robots.txt por finalidade com links para a documentação oficial.
- `references/agent-readiness.md`: acesso, descoberta e legibilidade por
  agente; llms.txt, llms-full.txt e Markdown negociado.
- `references/content-patterns.md`: moldes de bloco de resposta (definição,
  passo a passo, FAQ, citação). Os números dos exemplos são ilustração.
- `references/format-volatility.md`: como o formato citado muda entre
  versões de modelo, e como medir com rigor.

Os números de mercado dessas referências são retratos datados de 2025 e 2026,
na maioria de estudos de fornecedor. Não os cite como fato em matéria nem em
relatório sem conferir a fonte.

## Sobre este arquivo

O `SKILL.md` original foi substituído. Não havia nada malicioso nele; o
motivo é encaixe. Ele foi escrito para SaaS B2B: arquivo `/pricing.md`, perfis
no G2 e no Capterra, comparativos "nós contra o concorrente", LinkedIn e
YouTube como canal de citação. E dava como exemplo de acerto frases do tipo
"nossos clientes veem 3x de melhora", que aqui seriam afirmação sem lastro.
Os princípios que servem a um portal de notícia foram mantidos acima, e as
referências úteis foram mantidas intactas.
