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
