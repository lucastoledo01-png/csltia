-- Sistema PROMPT — invariantes que faltavam no schema aplicado.
--
-- O schema `prompt_*` foi aplicado direto em produção, fora deste histórico.
-- A auditoria de 2026-09-03 (`pg_constraint` + `pg_indexes`) mostrou que os
-- CHECKs de vocabulário e a unicidade `(project_id, keyword)` existem, mas
-- faltam as garantias de idempotência e de formato listadas abaixo.
--
-- **Momento importa:** as oito tabelas estão vazias. Acrescentar unicidade
-- agora não pode falhar. Depois, com dados, um único par duplicado impede a
-- criação da constraint e o conserto passa a exigir limpeza manual.
--
-- Constraint em Postgres não aceita `IF NOT EXISTS`, por isso cada bloco
-- confere `pg_constraint` antes de criar — a migração pode ser reaplicada.

-- ---------------------------------------------------------------------------
-- 1. Formato da keyword
-- ---------------------------------------------------------------------------
-- Hoje o formato só é garantido pelo TypeScript (`validateKeyword`). Qualquer
-- outro caminho de escrita — SQL na mão, o pipeline automático da Fase 4, uma
-- carga — grava `gta 26` ou `AÇÃO` sem reclamação.
--
-- O casamento do lado do OpenReply é textual: uma keyword com acento, espaço
-- ou caixa mista vira um post cujo CTA não dispara Direct nenhum, e o erro só
-- aparece depois de publicado. Precisa ser invariante de banco.
--
-- Idêntico ao `KEYWORD_PATTERN` de `src/lib/prompt-system/keyword.ts`.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'prompt_campaigns_keyword_check'
      and conrelid = 'public.prompt_campaigns'::regclass
  ) then
    alter table public.prompt_campaigns
      add constraint prompt_campaigns_keyword_check check (keyword ~ '^[A-Z0-9]{3,20}$');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Idempotência do pull do OpenReply
-- ---------------------------------------------------------------------------
-- `prompt_funnel_events` recebe comentário, Direct e clique por pull periódico
-- do OpenReply (`DmLog`, `LinkClick`), identificados por `external_id`. Sem
-- unicidade, reprocessar a mesma janela — retry, cron sobreposto, replay
-- depois de falha — conta o mesmo evento duas vezes e infla o funil. E como o
-- funil alimenta a pontuação de pauta da etapa 14, o erro se propaga para a
-- decisão editorial.
--
-- Nulos são distintos entre si no Postgres, então os eventos internos (sem
-- identificador externo: `lp_view`, `publish`) continuam podendo repetir.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'prompt_funnel_events_dedupe_key'
      and conrelid = 'public.prompt_funnel_events'::regclass
  ) then
    alter table public.prompt_funnel_events
      add constraint prompt_funnel_events_dedupe_key unique (campaign_id, stage, external_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Lead não conta duas vezes
-- ---------------------------------------------------------------------------
-- O formulário da etapa 11 é público. Sem unicidade, um F5 depois do submit
-- grava o mesmo lead de novo e a taxa de conversão da campanha sobe sem que
-- ninguém novo tenha se cadastrado.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'prompt_leads_campaign_email_key'
      and conrelid = 'public.prompt_leads'::regclass
  ) then
    alter table public.prompt_leads
      add constraint prompt_leads_campaign_email_key unique (campaign_id, email);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Asset: rótulo único e prompt de verdade
-- ---------------------------------------------------------------------------
-- Restrição dura da etapa 5: `prompt_text` é o prompt **exato** que gerou a
-- imagem mostrada. Um asset com prompt vazio é uma promessa que o post não
-- cumpre — quem comentou a keyword recebe um material que não reproduz o
-- resultado. E dois assets com o mesmo `label` na mesma campanha tornam a
-- entrega ambígua ("PROMPT RETRATO" qual?).

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'prompt_assets_campaign_label_key'
      and conrelid = 'public.prompt_assets'::regclass
  ) then
    alter table public.prompt_assets
      add constraint prompt_assets_campaign_label_key unique (campaign_id, label);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'prompt_assets_prompt_text_check'
      and conrelid = 'public.prompt_assets'::regclass
  ) then
    alter table public.prompt_assets
      add constraint prompt_assets_prompt_text_check check (length(btrim(prompt_text)) > 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Índices das chaves estrangeiras de projeto
-- ---------------------------------------------------------------------------
-- Quatro tabelas têm `project_id` referenciando `projects` sem índice. O
-- Postgres não indexa FK sozinho: sem índice, `delete from projects` varre a
-- tabela inteira para conferir o cascade, e todo filtro por projeto — que é
-- como o painel lê tudo — é sequencial.

create index if not exists prompt_assets_project_idx
  on public.prompt_assets (project_id, generated_at desc);
create index if not exists prompt_leads_project_idx
  on public.prompt_leads (project_id, created_at desc);
create index if not exists prompt_funnel_events_project_idx
  on public.prompt_funnel_events (project_id, occurred_at desc);
create index if not exists prompt_concept_results_project_idx
  on public.prompt_concept_results (project_id, snapshot_at desc);

-- ---------------------------------------------------------------------------
-- 6. Um retrato por campanha por dia
-- ---------------------------------------------------------------------------
-- Esta é a única parte que muda a **forma** da tabela, e por isso está por
-- último: se você discordar, corte desta linha para baixo.
--
-- `prompt_concept_results` guarda a fotografia diária de desempenho, mas só
-- tem `snapshot_at timestamptz`. Sem unicidade por dia, o cron de insights
-- rodando duas vezes cria dois retratos do mesmo dia e a série temporal passa
-- a contar o mesmo alcance repetido.
--
-- Não dá para resolver com índice sobre `snapshot_at::date`: a conversão de
-- timestamptz para date depende do fuso da sessão e não é imutável, então o
-- Postgres recusa a expressão num índice. Fixar um fuso na expressão
-- contrariaria o multi-projeto, onde cada marca tem o seu.
--
-- A saída é uma coluna própria, preenchida por quem grava a partir de
-- `projectToday(project)` — nunca de `current_date`, que é UTC e faria toda
-- execução depois das 21h no Brasil cair no dia seguinte. É o mesmo bug que a
-- migração multi-projeto já corrigiu uma vez.

alter table public.prompt_concept_results
  add column if not exists snapshot_date date;

-- Retrato já existente ganha a data derivada do instante, no fuso do projeto.
update public.prompt_concept_results r
set snapshot_date = (timezone(p.timezone, r.snapshot_at))::date
from public.projects p
where p.id = r.project_id and r.snapshot_date is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'prompt_concept_results_campaign_day_key'
      and conrelid = 'public.prompt_concept_results'::regclass
  ) then
    alter table public.prompt_concept_results
      add constraint prompt_concept_results_campaign_day_key unique (campaign_id, snapshot_date);
  end if;
end $$;
