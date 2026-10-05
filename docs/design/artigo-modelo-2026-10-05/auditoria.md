# Auditoria de artigos, 2026-10-05

Gerado por `npx tsx src/scripts/auditar-artigos.ts`. Só leitura: nenhuma escrita no banco e nenhuma chamada de modelo.
As réguas estão em `src/lib/server/auditoria-de-artigo.ts`, com o peso de cada conferência; a nota soma 100.

## Matéria-modelo

Auditada pelo molde desta versão (o JSON-LD é o que a página monta com este código), contra as matérias publicadas para as conferências de repetição (descrição e capa).

- Matérias auditadas: **1**
- Nota média: **100** de 100
- Matérias que dividem a capa com outra: **0**

Problemas mais comuns:

| Conferência | Matérias reprovadas |
|---|---|

| Nota | Matéria | Problemas |
|---|---|---|
| 100 | `chicago-propoe-um-ano-sem-novos-data-centers-na-cidade-2026-09-24` | 0 |

### Problemas por matéria

**Chicago propõe um ano sem novos data centers na cidade** (`chicago-propoe-um-ano-sem-novos-data-centers-na-cidade-2026-09-24`), nota 100

- nenhum problema

### Cada conferência

| Conferência | Peso | Resultado | Detalhe |
|---|---|---|---|
| Título de busca até 60 caracteres | 8 | passou | 54 caracteres: "Chicago propõe um ano sem novos data centers na cidade" |
| País identificável no título | 6 | passou | situa o leitor |
| Sem sigla solta no título | 3 | passou | nenhuma |
| Sem nacionalidade de terceiro país | 3 | passou | nenhuma |
| Descrição de 120 a 155 caracteres | 6 | passou | 141 caracteres |
| Descrição única no site | 4 | passou | usada em 1 matéria(s) |
| Descrição não reescreve o título | 4 | passou | 57% das palavras do título reaparecem na primeira frase |
| O lide diz o fato do título | 8 | passou | 71% das palavras do título nas duas primeiras frases |
| Intertítulos presentes | 4 | passou | 2 intertítulo(s) |
| Intertítulos descrevem o que vem embaixo | 4 | passou | descritivos |
| Parágrafos até 80 palavras | 3 | passou | 4 parágrafo(s) |
| Crédito da fonte com link | 6 | passou | crédito com link |
| De 3 a 5 perguntas visíveis | 6 | passou | 4 pergunta(s) |
| Cada resposta sustentada pelo corpo | 8 | passou | 4 de 4 sustentadas |
| JSON-LD completo (NewsArticle e BreadcrumbList) | 9 | passou | completo |
| Canônico aponta para a própria matéria | 3 | passou | https://casaloti.ia.br/artigos/chicago-propoe-um-ano-sem-novos-data-centers-na-cidade-2026-09-24 |
| Capa presente | 3 | passou | tem capa |
| A capa não se repete no corpo | 4 | passou | o molde tira a foto da capa do corpo |
| A capa não é usada por outra matéria | 6 | passou | exclusiva |
| Editoria é uma das do portal | 2 | passou | "Política" |

