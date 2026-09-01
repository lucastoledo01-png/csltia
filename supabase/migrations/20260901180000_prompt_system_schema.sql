-- Sistema PROMPT — schema do funil de conteúdo automatizado.
--
-- Ver docs/sistema-prompt-arquitetura.md pro desenho completo (14 etapas +
-- 9b/12b + vetos automáticos + loop de aprendizado). Esta migração cobre a
-- Fase 0 do roadmap: as 8 tabelas `prompt_*`, sem nenhuma etapa automatizada
-- ainda plugada — só a estrutura pra registrar campanha manualmente e testar
-- o funil de ponta a ponta antes de qualquer geração automática.
--
-- Todas as tabelas carregam `project_id`, seguindo a convenção da migração
-- multi-projeto (`20260827030000_multi_project_base.sql`) — mesmo o Sistema
-- PROMPT hoje só rodando pra desbuguei.ia, não faz sentido nascer sem o
-- campo que toda tabela de conteúdo já tem.

-- ---------------------------------------------------------------------------
-- 1. Trend Intelligence (etapa 1)
-- ---------------------------------------------------------------------------

create table if not exists public.prompt_trends (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source text not null default 'manual' check (source in ('manual', 'google_trends', 'reddit', 'catalogo_estreias')),
  raw_title text not null,
  category text not null default 'geral',
  captured_at timestamptz not null default now(),
  opportunity_score int not null default 0,
  visual_hook text,
  status text not null default 'candidate' check (status in ('candidate', 'promoted', 'rejected', 'archived')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Trend Jacking criativo (etapa 2) + Originalidade/IP (etapa 3)
-- ---------------------------------------------------------------------------

create table if not exists public.prompt_concepts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  trend_id uuid references public.prompt_trends(id) on delete set null,
  concept text not null,
  hook text not null default '',
  hook_pattern text,
  -- cada item de `applications`: { type: application_type fechado, description }
  applications jsonb not null default '[]'::jsonb,
  -- inclui `visual_style` fechado (etapa 4) além de composição/luz/cenário
  visual_direction jsonb not null default '{}'::jsonb,
  -- resultado do veto de IP/marca da etapa 3: { passed, reason, checked_at }
  ip_check jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'approved', 'blocked', 'archived')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Campanha (identidade que amarra keyword, OpenReply e landing — etapas 7-9b)
-- ---------------------------------------------------------------------------

create table if not exists public.prompt_campaigns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  concept_id uuid references public.prompt_concepts(id) on delete set null,
  keyword text not null,
  -- decide o destino da landing: 'newsletter' = página evergreen fixa,
  -- 'prompt' = container dinâmico por campanha (D3 do doc de arquitetura)
  campaign_type text not null default 'prompt' check (campaign_type in ('newsletter', 'prompt')),
  theme text not null default '',
  format text not null default 'prompt' check (format in ('noticia', 'tutorial', 'prompt')),
  status text not null default 'draft' check (status in ('draft', 'ready', 'published', 'blocked', 'archived')),
  ig_media_id text,
  openreply_automation_id text,
  lp_url text,
  source text not null default 'manual' check (source in ('manual', 'automated')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint prompt_campaigns_project_keyword_key unique (project_id, keyword)
);

-- ---------------------------------------------------------------------------
-- 4. Prompt como asset (etapa 5)
-- ---------------------------------------------------------------------------

create table if not exists public.prompt_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid not null references public.prompt_campaigns(id) on delete cascade,
  label text not null,
  prompt_text text not null,
  model text not null default '',
  image_url text,
  substitution_notes text,
  generated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. Captura de lead (etapa 11) + estado da sequência de e-mail (etapa 12b)
-- ---------------------------------------------------------------------------

create table if not exists public.prompt_leads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid not null references public.prompt_campaigns(id) on delete cascade,
  name text not null,
  email text not null,
  whatsapp text,
  -- campos ocultos de atribuição do formulário: campaign_id, post_id, keyword, source, timestamp
  attribution jsonb not null default '{}'::jsonb,
  listmonk_synced boolean not null default false,
  email_sequence_stage int not null default 0,
  email_sequence_next_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. Eventos de funil (etapa 13) — inclui vetos automáticos e a DM de upsell
-- ---------------------------------------------------------------------------

create table if not exists public.prompt_funnel_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid not null references public.prompt_campaigns(id) on delete cascade,
  stage text not null check (stage in (
    'publish', 'comment', 'dm', 'dm_followup', 'click', 'lp_view', 'lead', 'delivery', 'veto'
  )),
  external_id text,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- 7. Resultado por campanha (etapa 13-14, insumo do score do loop editorial)
-- ---------------------------------------------------------------------------

create table if not exists public.prompt_concept_results (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid not null references public.prompt_campaigns(id) on delete cascade,
  reach int not null default 0,
  saves int not null default 0,
  shares int not null default 0,
  comments int not null default 0,
  dms_started int not null default 0,
  clicks int not null default 0,
  leads int not null default 0,
  conversion_rate numeric(6, 4) not null default 0,
  performance_score numeric(10, 4) not null default 0,
  is_explore boolean not null default false,
  snapshot_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 8. Síntese qualitativa do loop editorial (etapa 14, gerada semanalmente)
-- ---------------------------------------------------------------------------

create table if not exists public.prompt_learnings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  top_combo jsonb not null default '[]'::jsonb,
  bottom_combo jsonb not null default '[]'::jsonb,
  summary_text text not null default '',
  applied_to_prompt boolean not null default false,
  generated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

create index if not exists prompt_trends_project_idx on public.prompt_trends (project_id, status, opportunity_score desc);

create index if not exists prompt_concepts_project_idx on public.prompt_concepts (project_id, status, created_at desc);
create index if not exists prompt_concepts_trend_idx on public.prompt_concepts (trend_id);

create index if not exists prompt_campaigns_project_idx on public.prompt_campaigns (project_id, status, created_at desc);
create index if not exists prompt_campaigns_concept_idx on public.prompt_campaigns (concept_id);

create index if not exists prompt_assets_campaign_idx on public.prompt_assets (campaign_id);

create index if not exists prompt_leads_campaign_idx on public.prompt_leads (campaign_id);
create index if not exists prompt_leads_sequence_due_idx on public.prompt_leads (email_sequence_next_at) where email_sequence_next_at is not null;

create index if not exists prompt_funnel_events_campaign_idx on public.prompt_funnel_events (campaign_id, stage, occurred_at desc);

create index if not exists prompt_concept_results_campaign_idx on public.prompt_concept_results (campaign_id, snapshot_at desc);

create index if not exists prompt_learnings_project_idx on public.prompt_learnings (project_id, period_start desc);

-- ---------------------------------------------------------------------------
-- Acesso — mesmo padrão das demais tabelas: só o servidor, com a chave de
-- serviço, chega nelas. Nada de anon/authenticated.
-- ---------------------------------------------------------------------------

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
