-- O que faltava da migration de candidatos: só o CHECK de status.
--
-- ## Por que o resto não era necessário
--
-- A migration original propunha trocar uma unicidade global em `url` por uma
-- por projeto. Ela já tinha sido trocada: `20260827030000_multi_project_base`
-- renomeou `news_candidates_url_key` para `news_candidates_project_url_key`
-- com `(project_id, url)` em 27 de agosto. O banco confirma:
--
--   news_candidates_project_url_key   u   UNIQUE (project_id, url)
--
-- E não existe nenhuma unique de coluna só em `url`. As duas primeiras
-- pós-condições que eu tinha escrito verificavam algo que já era verdade, e o
-- `create unique index news_candidates_projeto_url` teria criado um índice
-- duplicado sobre as mesmas duas colunas, ocupando espaço e custando escrita
-- sem servir para nada.
--
-- ## O que de fato falta
--
-- O CHECK antigo continua de pé, com o nome padrão do Postgres, e aceita
-- exatamente os sete valores da tabela original. Testado por inserção: os
-- estados `classified`, `approved` e `capped` são recusados com 23514.
--
--   news_candidates_status_check   c   CHECK (status = ANY (ARRAY['collected', 'filtered', ...]))
--
-- Agora que o nome é conhecido, a troca é por nome, sem busca em catálogo. O
-- bloco genérico que eu tinha escrito procurava pela coluna e deveria ter
-- encontrado este constraint, então o motivo de ele não ter rodado não é a
-- consulta: é que o script não foi executado inteiro.
--
-- Termina num `select` de propósito. Se o editor devolver tabela, rodou.

begin;

alter table public.news_candidates
  drop constraint if exists news_candidates_status_check;

alter table public.news_candidates
  add constraint news_candidates_status_check check (status in (
    'collected',        -- coletada, ainda não classificada
    'classified',       -- classificada, ainda não decidida
    'approved',         -- passou na linha editorial
    'selected',         -- entrou numa edição ou num post
    'rejected',         -- reprovada pela linha editorial, ver decision_reason
    'capped',           -- aprovada, cortada por teto de composição do dia
    'duplicate',
    'filtered',
    'too_old',
    'already_published'
  ));

-- Se uma execução anterior chegou a criar o índice duplicado, ele sai. A
-- unicidade continua garantida por `news_candidates_project_url_key`.
drop index if exists public.news_candidates_projeto_url;

commit;

select conname, pg_get_constraintdef(oid) as definicao
  from pg_constraint
 where conrelid = 'public.news_candidates'::regclass
   and contype in ('c', 'u')
 order by contype, conname;
