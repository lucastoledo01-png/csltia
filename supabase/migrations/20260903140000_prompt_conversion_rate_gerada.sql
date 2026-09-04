-- `conversion_rate` passa a ser coluna gerada.
--
-- **Definição: leads por alcance.** `leads / reach`, zero quando o alcance
-- ainda é zero.
--
-- Por que esta e não outra: a documentação nunca definiu a métrica. As três
-- menções em `sistema-prompt-arquitetura.md` são "taxa de conversão" na lista
-- da etapa 14, "conversão vem do funil" e — a única pista real — "um conteúdo
-- com menos views e muitos leads vale mais que um viral que não converte".
-- Leads por alcance é a razão que produz esse efeito; nenhum outro denominador
-- faz um conteúdo de pouco alcance pontuar acima de um viral.
--
-- Dois sinais do próprio schema concordam: `numeric(6,4)` tem resolução de
-- razão (0,0090 = 0,9%), não de percentual; e existe `performance_score
-- numeric(10,4)` ao lado, que é onde o composto ponderado do explore/exploit
-- mora — se `conversion_rate` também fosse composto, aquela coluna não teria
-- função.
--
-- Por que gerada, e não calculada no código: como coluna comum ela podia
-- divergir de `leads` e `reach` sem que nada reclamasse, e é ela que a etapa 14
-- usa para decidir a próxima pauta. Divergência silenciosa ali não produz um
-- erro, produz uma decisão editorial errada. Gerada, é impossível.
--
-- As outras razões do funil continuam disponíveis: `leads/clicks`,
-- `clicks/dms_started`, `dms_started/comments` saem dos contadores na hora, sem
-- precisar de coluna própria.
--
-- Recriar a coluna é a única forma de torná-la gerada. A tabela está vazia,
-- então a reescrita é instantânea e não há valor a preservar — nenhum código
-- escreve nela ainda. `conversion_rate` passa para o fim da ordem de colunas,
-- em produção e em qualquer banco novo igualmente.
--
-- `case when reach > 0` em vez de `nullif(reach, 0)`: a coluna é NOT NULL, e
-- uma expressão que resulta em nulo violaria a restrição no primeiro retrato
-- gravado antes de os insights do Meta chegarem.

alter table public.prompt_concept_results
  drop column if exists conversion_rate;

alter table public.prompt_concept_results
  add column conversion_rate numeric(6, 4) not null
    generated always as (case when reach > 0 then leads::numeric / reach else 0 end) stored;
