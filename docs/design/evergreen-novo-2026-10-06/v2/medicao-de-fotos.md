# Queda por foto: antes e depois (06/10/2026)

Medido com `src/scripts/medir-fotos-evergreen.ts`, só leitura: sem cliente de
banco no resolvedor, sem biblioteca, sem acervo, `somenteLeitura`. O "antes" é
o código do PR #91 (`origin/feat/evergreen-novo`, 74356f8) rodando numa cópia
separada; o "depois" é esta branch. Mesmas pautas, mesmo roteiro, banco
espaçado em 10 s por busca para o Pexels não recusar rajada (ele responde 429 a
duas buscas no mesmo segundo, e isso contaminou as primeiras rodadas).

## Pautas reais (o número que importa)

60 pautas aprovadas pela linha editorial entre 22/09 e 06/10/2026, lidas de
`news_candidates` (só SELECT), espaçadas pelos 14 dias, sem as de imigração.

| | com foto | sem foto | queda |
|---|---|---|---|
| antes (PR #91) | 22 | 38 | **63,3%** |
| depois (esta branch) | 60 | 0 | **0,0%** |

Antes, a queda tinha três causas: 30 pautas com entidade nomeada cuja foto foi
recusada pela conferência visual e que nunca chegavam à cena; 5 com entidade
ambígua, que saíam na hora; 3 sem entidade com as três fotos do banco
recusadas.

Depois, por caminho e degrau:

| caminho | degrau | pautas |
|---|---|---|
| entidade | - | 19 |
| cena depois da entidade | cena | 23 |
| cena depois da entidade | cena ampla | 3 |
| cena depois da entidade | editoria | 4 |
| cena (sem entidade) | cena | 8 |
| cena (sem entidade) | cena ampla | 3 |

Nenhuma precisou do degrau `reuso`.

## Catálogo do evergreen (60 tópicos, primeiro ângulo)

| rodada | sem foto |
|---|---|
| antes (PR #91), duas rodadas | 9 de 60 (15,0%) nas duas |
| só com a cena depois da entidade e a régua do logotipo | 11 de 60 (18,3%) |
| com a escada da cena | **0 de 60** |

A rodada do meio piorou de propósito: a régua nova recusou o cartão da
Mastercard (credit score) e as fachadas de banco com letreiro (empréstimos da
SBA), e as onze que caíram tinham todas o mesmo perfil, três fotos de banco
recusadas e nenhum outro lugar para procurar. Foi o que a escada resolveu.

## Tópicos com a instituição declarada

Onze candidatos a ter `entidade` de volta (NASA, BLS, BEA, NIST, USPTO, SBA,
Fed no FOMC):

| | sem foto |
|---|---|
| antes | 8 de 11 |
| depois | 1 de 11 (era a entidade ambígua, que agora também segue pela cena) |

A segunda foto para a bolha não apareceu em nenhum dos onze (0 de 10 com
foto), e por isso a entidade não voltou ao catálogo.

## Amostras de ponta a ponta

`amostras-2026-10-07.md` e `amostras-2026-10-09.md`, pelo mesmo roteiro do PR
#91 (`src/scripts/amostras-evergreen.ts`). Antes: 3 de 8 selecionados caíram
por foto. Agora: nenhum caiu por foto; os dois descartes de 10/10 são de copy
(NIST e FDIC, `LOW_READER_RELEVANCE` e claim sem lastro).

`2026-10-11/` são duas amostras dirigidas (`--itens`) aos casos que motivaram
o trabalho: o FDIC agora diz "US$ 250.000" na manchete, e o credit score saiu
com uma mesa de trabalho em vez do cartão com o logo da Mastercard. A bolha do
FDIC ainda corta a primeira letra do letreiro ("EDERAL DEPOSIT..."): a
conferência sabe do recorte, mas aprovou. Ver o PR.

PNGs reduzidos para 1080x1440.
