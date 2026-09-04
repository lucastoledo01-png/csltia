-- Fecha um furo deixado por `20260903120000_prompt_system_invariantes.sql`.
--
-- Aquela migração criou `prompt_concept_results.snapshot_date` como nullable e
-- pôs a unicidade `(campaign_id, snapshot_date)` em cima dela. No Postgres,
-- nulos são distintos entre si numa constraint UNIQUE — então N linhas com
-- `snapshot_date` nulo para a mesma campanha passam sem violação, e a garantia
-- de "um retrato por campanha por dia" só valia se quem grava lembrasse de
-- preencher a coluna.
--
-- Isto é o oposto de um invariante: uma proteção que depende de disciplina de
-- quem chama não protege nada. Obrigatória, o cron de insights não tem como
-- gravar um retrato sem data.
--
-- A tabela está vazia, então o `set not null` é instantâneo e não pode falhar
-- por linha preexistente. Com dados, exigiria backfill antes.
--
-- Quem grava passa a data de `projectToday(project)` — nunca `current_date`,
-- que é UTC e faria toda execução depois das 21h no Brasil cair no dia
-- seguinte. Ver `docs/aprendizados-e-incidentes.md`.

alter table public.prompt_concept_results
  alter column snapshot_date set not null;
