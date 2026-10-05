# De onde vieram estas skills

Registro de auditoria. Quem for adicionar outra, leia antes.

## O que foi instalado, e de onde

Origem: `github.com/davila7/claude-code-templates`, **fixado no commit
`26952069e606a7ee583f83e78fd7d8695fe56217`** (15/09/2026).

| Pasta | Origem no repositório de origem |
|---|---|
| `.claude/agents/prompt-engineer.md` | `components/agents/ai-specialists/prompt-engineer.md` |
| `ui-ux-pro-max/` | `components/skills/creative-design/ui-ux-pro-max/` |
| `react-best-practices/` | `components/skills/development/react-best-practices/` |
| `frontend-dev-guidelines/` | `components/skills/development/frontend-dev-guidelines/` |
| `security-best-practices/references/` | idem, **só as referências** |

Segunda leva, **fixada no commit `d2b1e748aeae813ffd65a81b9bd534d572226168`**
(16/09/2026), de `components/skills/business-marketing/`:

| Pasta | Por que entrou |
|---|---|
| `seo-optimizer/` | o portal é site de notícia e vive de busca |
| `content-creator/` | referências de framework e o analisador de voz de marca |

As duas skills do Supabase são de outra origem e não fazem parte desta auditoria.

## Por que não pelo instalador oficial

O `npx claude-code-templates` busca o conteúdo da branch `main` **no momento da
instalação**, sem versão fixada, sem hash e sem assinatura. Auditar e instalar
viram dois conteúdos diferentes, e ninguém é avisado quando o de cima muda. O
commit acima foi feito no mesmo dia em que esta auditoria rodou.

O instalador também manda um POST de telemetria por componente para
`aitmpl.com`, e o pacote contém um módulo que publica a sessão de chat em
`x0.at`, um host anônimo. Esse módulo não é acionado ao instalar skill, mas está
no pacote.

Baixar os arquivos direto, fixando o commit, evita os três.

## O que foi deliberadamente deixado de fora

**`security-best-practices/SKILL.md`**: substituído. O original mandava tratar
regra achada na documentação do projeto como autorização para ignorar boa
prática de segurança, e mandava não discutir com quem pedisse. Também mandava
não reportar ausência de TLS. As referências foram mantidas.

**`development/software-architecture`**: a descrição dispara em qualquer tarefa
que se relacione a desenvolvimento de software. Carregaria em tudo, trazendo
regras de Clean Architecture e DDD que brigam com as convenções daqui.

**`senior-frontend`, `senior-backend`, `senior-fullstack`, `code-reviewer`**: os
doze scripts que elas prometem são o mesmo esqueleto de 114 linhas com o nome da
classe trocado, e o corpo é `# Main logic here`. As próprias instruções são o
mesmo template. Prometem ferramenta e entregam `print`.

**`marketing-strategy-pmm`**: 1163 linhas de posicionamento, GTM e battlecard
competitivo, para um trabalho que já foi feito no dossiê dos concorrentes.

**`marketing-ideas`**: crescimento de SaaS, que não é este produto.

**`content-research-writer`**: pesquisa com citação, que é exatamente o que o
pipeline de redação já faz em produção, com auditoria de lastro por cima.

**`copywriting` e `social-content`**: sem risco e talvez úteis quando eu escrever
a home ou calibrar o prompt da copy social. Ficaram de fora por ora porque skill
instalada custa contexto em toda sessão, e essas duas servem a tarefas raras.

**A ressalva que vale para toda skill de marketing aqui:** skill muda o que eu
faço numa sessão, e não muda o que a produção escreve. A newsletter e os posts
saem às 06:03 sem ninguém. Melhorar aquele texto é editar `pipeline.ts` e o
prompt da copy social, não instalar skill.

**`agent-development`, `debugger`, `algorithmic-art`**: sem risco, sem uso aqui.
Skill instalada custa contexto em toda sessão.

## O que foi conferido

Em todos os 109 arquivos instalados, nas duas levas: nenhum caractere invisível ou tag Unicode,
nenhum bloco base64, nenhuma chamada de rede, `subprocess`, `eval` ou
`os.system`, nenhuma leitura de `.env`, chave ou token, e nenhuma instrução de
sobrescrever instrução anterior ou de silenciar achado.

Os três scripts do `ui-ux-pro-max` são reais e só leem CSV e JSON da própria
pasta `data/`.

## Antes de instalar a próxima

1. Baixe fixando commit, nunca `main`.
2. Leia **todos** os arquivos, não só o `SKILL.md`. Skill pode trazer `.py` e
   `.sh`, e o instalador oficial os marca como executáveis.
3. Desconfie de descrição larga: ela dispara em tarefa que não é dela.
4. Desconfie de instrução que manda obedecer a arquivo do projeto, ou que manda
   não reportar algo. Skill é instrução, e instrução de terceiro é superfície de
   ataque.

## Terceira leva: SEO, AEO e GEO (05/10/2026)

Pedidas pelo dono como quatro comandos `npx skills add`. Nenhum instalador foi
rodado: cada repositório teve o commit da branch padrão lido com
`git ls-remote`, e cada arquivo foi baixado de
`raw.githubusercontent.com/<dono>/<repo>/<sha>/...`, com o hash conferido
depois da cópia.

| Pasta | Origem | Commit fixado |
|---|---|---|
| `seo-audit/` | `coreyhaines31/marketingskills`, `skills/seo-audit/` | `dda3841f0b294e01e93b1541486beefbfab0915e` |
| `ai-seo/` | `coreyhaines31/marketingskills`, `skills/ai-seo/` | `dda3841f0b294e01e93b1541486beefbfab0915e` |
| `seo-aeo-best-practices/` | `sanity-io/agent-toolkit`, `skills/seo-aeo-best-practices/` | `88d6cdfa7cb06c99edd5f376efa4dac21ae3f877` |
| (nada) | `resciencelab/opc-skills`, `skills/seo-geo/` | `39d5acefc168e2a91d4122d1e362e5d2e5db9268` |

O que entrou, arquivo por arquivo:

- **`seo-audit/`**: `SKILL.md` e as duas referências, intactos (3 de 4).
- **`ai-seo/`**: quatro referências intactas (`agent-readiness.md`,
  `content-patterns.md`, `format-volatility.md`,
  `platform-ranking-factors.md`) e um `SKILL.md` escrito aqui (5 de 12).
- **`seo-aeo-best-practices/`**: os cinco arquivos, intactos (5 de 5).
- **`seo-geo`**: nada (0 de 19).

Os arquivos de terceiro foram mantidos byte a byte, inclusive os travessões
que eles têm: editar o texto de origem quebraria a conferência contra o
commit. O que escrevemos aqui não tem travessão. Nenhum arquivo tem bit de
execução.

### O que foi conferido

Os 40 arquivos das quatro pastas de origem foram lidos inteiros, mais a cópia
duplicada do `seo-geo` em `.agents/skills/`, que só difere no cabeçalho do
`SKILL.md`. Nos quarenta: nenhum caractere invisível ou tag Unicode (os únicos
três seletores de variação são o `U+FE0F` do emoji de alerta), nenhum bloco
base64, nenhuma instrução de sobrescrever instrução anterior, de tratar arquivo
do projeto como autorização ou de silenciar achado, nenhuma telemetria.

Dois pontos que parecem e não são:

- `seo-audit` e `ai-seo` mandam ler `.agents/product-marketing.md` se existir.
  É leitura de contexto, não de autorização, e o arquivo não existe aqui. O
  `seo-audit` ainda diz o certo: página buscada é dado não confiável, nunca
  instrução.
- `ai-seo` traz um laço de `curl` (para conferir `noindex` em artigo do
  LinkedIn, na referência que ficou de fora) e cita `npx is-agentic`. Nada roda
  sozinho; o `SKILL.md` daqui avisa para não rodar o pacote sem auditar.

### O que foi deixado de fora, e por quê

**`seo-geo` inteiro.** Não por malícia, por três motivos somados:

1. Os dez scripts são reais e fazem rede: nove chamam a API paga da
   DataForSEO com login e senha lidos do ambiente (`DATAFORSEO_LOGIN`,
   `DATAFORSEO_PASSWORD`), com idioma `en` e local EUA fixos no código; o
   décimo baixa a URL pedida. Não temos conta, o público é brasileiro, e um
   `curl` faz o que o décimo faz. Viriam com bit de execução.
2. O texto ensina o que a régua daqui recusa. O exemplo de "estatística" é
   "67% das Fortune 500", o de "tom autoritário" é "com base na nossa análise
   de 10.000 sites", e o estudo de caso troca "algumas ferramentas" por
   "confiado por indie hackers do mundo todo". É o molde de afirmação sem
   lastro que o portão de alucinação existe para barrar. Também manda pôr
   `meta keywords`, usa FID (substituído por INP em 2024), põe a palavra-chave
   na frente do título contra o `modelo-de-titulo.md`, e promete "+40% de
   visibilidade" com `FAQPage`, número que nem o estudo citado sustenta.
3. O que sobra de útil (o resumo do estudo de Princeton, os moldes de
   JSON-LD) já está no `ai-seo` e no `seo-aeo-best-practices`, com mais
   ressalva. Skill instalada custa contexto em toda sessão.

**`ai-seo/SKILL.md`**: substituído. Foi escrito para SaaS B2B (arquivo
`/pricing.md`, G2, Capterra, comparativos contra concorrente) e dava como
exemplo de acerto "nossos clientes veem 3x de melhora". O substituto guarda o
que serve a um portal de notícia: a posição oficial do Google, robôs por
finalidade, estrutura extraível, o que não fazer e a medição por taxa. E diz
com todas as letras que as regras do projeto vencem e que nenhuma estatística,
aspas ou fonte entra sem estar no pacote factual.

**Seis referências do `ai-seo`**: `citations-vs-recommendations.md`,
`positioning-and-consensus.md`, `content-types.md`, `linkedin-ai-citations.md`,
`youtube-ai-citations.md` e `okf.md`. As cinco primeiras tratam de marca B2B
entrar na lista de recomendação, perfil em site de avaliação e canal que o
portal não usa; o `okf.md` descreve um formato que, nas palavras dele, nenhum
buscador lê hoje.

**Os `evals/evals.json`** das duas skills do `marketingskills`: são casos de
teste do autor, não são lidos em uso.

### Conflitos com as regras daqui que continuam nos arquivos mantidos

Nenhum é risco de segurança, e o `CLAUDE.md` carrega as regras do projeto em
toda sessão, então elas vencem. Ficam anotados para quem ler a skill:

- `seo-audit` e `seo-aeo-best-practices/references/technical-seo.md` pedem
  palavra-chave no começo do título e chamada para ação na descrição. Título
  segue `docs/modelo-de-titulo.md`; o título de busca é o `headline`.
- `ai-seo/references/content-patterns.md` traz números e uma frase atribuída a
  Rand Fishkin como exemplo. São molde, não fato.
- `ai-seo/references/platform-ranking-factors.md` ainda recomenda `FAQPage`
  para o Perplexity e "atualizar todo mês"; para notícia, o que vale é
  `dateModified` honesto, só quando a matéria muda de verdade.
- `seo-aeo-best-practices` usa exemplos de Sanity (`defineType`, GROQ). O que
  serve é o desenho do JSON-LD, não o código.
- `seo-audit/references/ai-writing-detection.md` é lista de vício de escrita
  em inglês; para o português, vale a régua da casa.

### E o `seo-optimizer/`

Fica, por ora. Ele cobre o mesmo chão (título, descrição, cabeçalhos, Core Web
Vitals, schema, snippet) com conselho mais genérico, e o roteiro de post que
ele sugere ("O que é", "Por que importa", "Conclusão") é de blog, não de
notícia. Com as três skills novas ele fica redundante: a sugestão é arquivá-lo
depois que as novas forem usadas numa tarefa real de SEO do portal, e não
apagá-lo agora.
