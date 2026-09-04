-- O resultado do QA passa a ser gravado, não só o veredito.
--
-- O checador devolve sete campos — `passed`, `hallucination_risk`,
-- `tone_check_passed`, `grammar_passed`, `story_count_valid`, `issues[]` e
-- `score` — e só o `passed` era persistido, como um booleano.
--
-- O efeito prático: quando a newsletter ficava retida, o motivo existia apenas
-- num `console.log` dentro do contêiner. Ninguém conseguia saber se a edição
-- foi barrada por inventar um número ou por uma vírgula fora de lugar — e sem
-- saber, não há como calibrar o portão nem decidir se vale disparar à mão.
--
-- Em 2026-09-04 a campanha #11 ficou em rascunho e o motivo já era
-- irrecuperável quando fomos procurar.

alter table public.news_editions
  add column if not exists qa_score int,
  add column if not exists qa_hallucination_risk boolean,
  add column if not exists qa_issues jsonb not null default '[]'::jsonb;

-- O painel lista as edições retidas primeiro; o índice cobre esse filtro.
create index if not exists news_editions_qa_idx
  on public.news_editions (project_id, qa_passed, edition_date desc);
