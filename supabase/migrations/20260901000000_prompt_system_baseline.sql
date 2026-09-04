-- Sistema PROMPT — baseline do schema que já estava em produção.
--
-- Esta migração **não criou** nada: as oito tabelas `prompt_*` foram aplicadas
-- direto no banco, fora deste histórico, e este arquivo é a reconstrução delas
-- para que `supabase/migrations/` volte a reproduzir produção. Sem ele, um
-- ambiente novo nasce sem o Sistema PROMPT e ninguém tem como saber o que está
-- no ar sem consultar o banco.
--
-- Reconstruída em 2026-09-03 a partir de:
--   `information_schema.columns` (nomes, tipos, precisão, nulabilidade,
--   defaults e ordem das colunas), `pg_constraint` (PK, CHECK, UNIQUE e as
--   ações ON DELETE das chaves estrangeiras), `pg_indexes` e `pg_class`
--   (`relrowsecurity`).
--
-- **Datada antes de `20260903120000_prompt_system_invariantes.sql` de
-- propósito.** As migrações rodam em ordem de nome de arquivo, e aquela
-- acrescenta constraints às tabelas criadas aqui: invertida, um banco novo
-- falharia. A data anterior também é a verdade histórica — o schema existia
-- antes dos invariantes. Rodar as duas em sequência num banco vazio produz
-- exatamente o estado de produção.
--
-- Em produção esta migração é inteiramente no-op (`if not exists` em tudo).
--
-- Depende de `20260827030000_multi_project_base.sql`, que cria `projects`.

-- ---------------------------------------------------------------------------
-- 1. Tendências capturadas (etapa 1)
-- ---------------------------------------------------------------------------

create table if not exists public.prompt_trends (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  source text not null default 'manual',
  raw_title text not null,
  category text not null default 'geral',
  captured_at timestamptz not null default now(),
  opportunity_score integer not null default 0,
  visual_hook text,
  status text not null default 'candidate',
  created_at timestamptz not null default now(),

  constraint prompt_trends_pkey primary key (id),
  constraint prompt_trends_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint prompt_trends_source_check
    check (source = any (array['manual', 'google_trends', 'reddit', 'catalogo_estreias'])),
  constraint prompt_trends_status_check
    check (status = any (array['candidate', 'promoted', 'rejected', 'archived']))
);

create index if not exists prompt_trends_project_idx
  on public.prompt_trends (project_id, status, opportunity_score desc);

-- ---------------------------------------------------------------------------
-- 2. Conceitos de trend jacking (etapas 2 e 3)
-- ---------------------------------------------------------------------------
-- `trend_id` é ON DELETE SET NULL: apagar a tendência não pode apagar o
-- conceito que já virou campanha publicada.

create table if not exists public.prompt_concepts (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  trend_id uuid,
  concept text not null,
  hook text not null default '',
  hook_pattern text,
  applications jsonb not null default '[]'::jsonb,
  visual_direction jsonb not null default '{}'::jsonb,
  ip_check jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),

  constraint prompt_concepts_pkey primary key (id),
  constraint prompt_concepts_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint prompt_concepts_trend_id_fkey
    foreign key (trend_id) references public.prompt_trends(id) on delete set null,
  constraint prompt_concepts_status_check
    check (status = any (array['draft', 'approved', 'blocked', 'archived']))
);

create index if not exists prompt_concepts_project_idx
  on public.prompt_concepts (project_id, status, created_at desc);
create index if not exists prompt_concepts_trend_idx
  on public.prompt_concepts (trend_id);

-- ---------------------------------------------------------------------------
-- 3. Campanhas (etapas 7 e 8) — o registro central
-- ---------------------------------------------------------------------------
-- A keyword é o fio que atravessa csltia e OpenReply: o que a pessoa comenta,
-- o que o worker casa por texto, o que viaja no link do Direct e o que
-- identifica cada evento do funil. A unicidade é composta com `project_id`
-- porque cada projeto tem sua própria conta do Instagram.
--
-- O CHECK do formato da keyword não está aqui: ele foi acrescentado depois,
-- em `20260903120000_prompt_system_invariantes.sql`.

create table if not exists public.prompt_campaigns (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  concept_id uuid,
  keyword text not null,
  campaign_type text not null default 'prompt',
  theme text not null default '',
  format text not null default 'prompt',
  status text not null default 'draft',
  ig_media_id text,
  openreply_automation_id text,
  lp_url text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  published_at timestamptz,
  dm_message text,
  opening_dm_message text,
  follow_up_enabled boolean not null default false,
  follow_up_delay_minutes integer,
  follow_up_message text,

  constraint prompt_campaigns_pkey primary key (id),
  constraint prompt_campaigns_project_keyword_key unique (project_id, keyword),
  constraint prompt_campaigns_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint prompt_campaigns_concept_id_fkey
    foreign key (concept_id) references public.prompt_concepts(id) on delete set null,
  constraint prompt_campaigns_campaign_type_check
    check (campaign_type = any (array['newsletter', 'prompt'])),
  constraint prompt_campaigns_format_check
    check (format = any (array['noticia', 'tutorial', 'prompt'])),
  constraint prompt_campaigns_status_check
    check (status = any (array['draft', 'ready', 'published', 'blocked', 'archived'])),
  constraint prompt_campaigns_source_check
    check (source = any (array['manual', 'automated'])),
  constraint prompt_campaigns_follow_up_delay_check
    check (follow_up_delay_minutes is null or follow_up_delay_minutes > 0)
);

create index if not exists prompt_campaigns_project_idx
  on public.prompt_campaigns (project_id, status, created_at desc);
create index if not exists prompt_campaigns_concept_idx
  on public.prompt_campaigns (concept_id);

-- ---------------------------------------------------------------------------
-- 4. Prompts entregues (etapa 5)
-- ---------------------------------------------------------------------------
-- `prompt_text` é o prompt exato que gerou a imagem mostrada, gravado no
-- momento da geração. A unicidade de `label` e o CHECK de não-vazio vieram na
-- migração de invariantes.

create table if not exists public.prompt_assets (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  campaign_id uuid not null,
  label text not null,
  prompt_text text not null,
  model text not null default '',
  image_url text,
  substitution_notes text,
  generated_at timestamptz not null default now(),

  constraint prompt_assets_pkey primary key (id),
  constraint prompt_assets_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint prompt_assets_campaign_id_fkey
    foreign key (campaign_id) references public.prompt_campaigns(id) on delete cascade
);

create index if not exists prompt_assets_campaign_idx
  on public.prompt_assets (campaign_id);

-- ---------------------------------------------------------------------------
-- 5. Leads capturados na landing (etapa 11)
-- ---------------------------------------------------------------------------
-- `name` é NOT NULL sem default: a captura da etapa 11 pede nome, e o banco
-- recusa lead sem ele.
--
-- `email_sequence_stage` e `email_sequence_next_at` sustentam a régua de
-- e-mail — o índice parcial é o que o worker consulta para achar o que venceu.

create table if not exists public.prompt_leads (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  campaign_id uuid not null,
  name text not null,
  email text not null,
  whatsapp text,
  attribution jsonb not null default '{}'::jsonb,
  listmonk_synced boolean not null default false,
  email_sequence_stage integer not null default 0,
  email_sequence_next_at timestamptz,
  created_at timestamptz not null default now(),

  constraint prompt_leads_pkey primary key (id),
  constraint prompt_leads_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint prompt_leads_campaign_id_fkey
    foreign key (campaign_id) references public.prompt_campaigns(id) on delete cascade
);

create index if not exists prompt_leads_campaign_idx
  on public.prompt_leads (campaign_id);
create index if not exists prompt_leads_sequence_due_idx
  on public.prompt_leads (email_sequence_next_at)
  where email_sequence_next_at is not null;

-- ---------------------------------------------------------------------------
-- 6. Eventos do funil (etapa 13)
-- ---------------------------------------------------------------------------
-- Comentário, Direct e clique vêm por pull do OpenReply (`DmLog`,
-- `LinkClick`), com o identificador de lá em `external_id`; visita, cadastro e
-- entrega vêm dos eventos do próprio csltia. `veto` registra a recusa do
-- guardrail de propriedade intelectual da etapa 3.

create table if not exists public.prompt_funnel_events (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  campaign_id uuid not null,
  stage text not null,
  external_id text,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,

  constraint prompt_funnel_events_pkey primary key (id),
  constraint prompt_funnel_events_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint prompt_funnel_events_campaign_id_fkey
    foreign key (campaign_id) references public.prompt_campaigns(id) on delete cascade,
  constraint prompt_funnel_events_stage_check
    check (stage = any (array['publish', 'comment', 'dm', 'dm_followup', 'click',
                              'lp_view', 'lead', 'delivery', 'veto']))
);

create index if not exists prompt_funnel_events_campaign_idx
  on public.prompt_funnel_events (campaign_id, stage, occurred_at desc);

-- ---------------------------------------------------------------------------
-- 7. Resultado por campanha (etapa 14)
-- ---------------------------------------------------------------------------
-- Fotografia de desempenho. Alcance, saves e shares vêm do Meta Graph
-- insights; o resto vem do funil. `is_explore` marca o retrato como parte da
-- fatia exploratória do loop editorial.
--
-- `conversion_rate` é coluna comum, não gerada: quem grava precisa calcular, e
-- nada no banco impede que ela divirja dos contadores.

create table if not exists public.prompt_concept_results (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  campaign_id uuid not null,
  reach integer not null default 0,
  saves integer not null default 0,
  shares integer not null default 0,
  comments integer not null default 0,
  dms_started integer not null default 0,
  clicks integer not null default 0,
  leads integer not null default 0,
  conversion_rate numeric(6, 4) not null default 0,
  performance_score numeric(10, 4) not null default 0,
  is_explore boolean not null default false,
  snapshot_at timestamptz not null default now(),

  constraint prompt_concept_results_pkey primary key (id),
  constraint prompt_concept_results_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade,
  constraint prompt_concept_results_campaign_id_fkey
    foreign key (campaign_id) references public.prompt_campaigns(id) on delete cascade
);

create index if not exists prompt_concept_results_campaign_idx
  on public.prompt_concept_results (campaign_id, snapshot_at desc);

-- ---------------------------------------------------------------------------
-- 8. Aprendizados agregados (etapa 14)
-- ---------------------------------------------------------------------------
-- Consolidação por período: qual combinação de tendência, aplicação, visual e
-- hook converteu e qual não. `applied_to_prompt` diz se o aprendizado já foi
-- incorporado ao prompt editorial — sem isso o loop não fecha, só acumula.

create table if not exists public.prompt_learnings (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  period_start date not null,
  period_end date not null,
  top_combo jsonb not null default '[]'::jsonb,
  bottom_combo jsonb not null default '[]'::jsonb,
  summary_text text not null default '',
  applied_to_prompt boolean not null default false,
  generated_at timestamptz not null default now(),

  constraint prompt_learnings_pkey primary key (id),
  constraint prompt_learnings_project_id_fkey
    foreign key (project_id) references public.projects(id) on delete cascade
);

create index if not exists prompt_learnings_project_idx
  on public.prompt_learnings (project_id, period_start desc);

-- ---------------------------------------------------------------------------
-- 9. Acesso
-- ---------------------------------------------------------------------------
-- RLS ligada com zero políticas: nega tudo para quem não a contorna. Só a
-- chave de serviço alcança as tabelas, e os grants de `anon` e `authenticated`
-- são revogados — a captura de lead da landing é uma rota do Next, não um
-- insert do navegador. Confirmado em produção: a chave anônima recebe
-- `401`/`42501`.

alter table public.prompt_trends enable row level security;
alter table public.prompt_concepts enable row level security;
alter table public.prompt_campaigns enable row level security;
alter table public.prompt_assets enable row level security;
alter table public.prompt_leads enable row level security;
alter table public.prompt_funnel_events enable row level security;
alter table public.prompt_concept_results enable row level security;
alter table public.prompt_learnings enable row level security;

revoke all on public.prompt_trends from anon, authenticated;
revoke all on public.prompt_concepts from anon, authenticated;
revoke all on public.prompt_campaigns from anon, authenticated;
revoke all on public.prompt_assets from anon, authenticated;
revoke all on public.prompt_leads from anon, authenticated;
revoke all on public.prompt_funnel_events from anon, authenticated;
revoke all on public.prompt_concept_results from anon, authenticated;
revoke all on public.prompt_learnings from anon, authenticated;
