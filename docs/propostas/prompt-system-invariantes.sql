-- Sistema PROMPT — Fase 0: schema base do funil.
--
-- Sete tabelas com prefixo `prompt_`, na ordem do pipeline descrito em
-- `docs/sistema-prompt-arquitetura.md`:
--
--   prompt_trends ──► prompt_concepts ──► prompt_campaigns ──► prompt_assets
--                                              │
--                                              ├──► prompt_leads
--                                              ├──► prompt_funnel_events
--                                              └──► prompt_concept_results
--
-- Nada aqui publica nada. A Fase 0 só registra campanhas — por enquanto
-- criadas à mão no painel — e fixa as chaves de atribuição que as fases
-- seguintes vão usar.
--
-- Duas decisões que valem para todas as tabelas abaixo:
--
-- 1. `project_id` é obrigatório e **sem DEFAULT**. As tabelas antigas ganharam
--    o DEFAULT do projeto semente como ponte da migração multi-projeto, e o
--    próprio `docs/multi-project.md` registra isso como dívida: enquanto o
--    DEFAULT existe, um call site esquecido grava silenciosamente no projeto
--    errado. Tabela nova não nasce com essa dívida.
-- 2. Sem acesso por `anon` ou `authenticated`. Todo tráfego passa pelo
--    servidor com a chave de serviço — inclusive a captura de lead da landing,
--    que é uma rota do Next, não um insert do navegador.

-- ---------------------------------------------------------------------------
-- 1. Tendências capturadas (etapa 1)
-- ---------------------------------------------------------------------------
-- Só vira conceito a tendência com associação visual reproduzível: "dá pra
-- fazer alguém querer refazer isso?". `visual_hook` é a resposta a essa
-- pergunta, e é o que a triagem por LLM precisa preencher para promover.

create table if not exists public.prompt_trends (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source text not null default 'manual'
    check (source in ('manual', 'google_trends', 'reddit', 'releases', 'instagram', 'outro')),
  raw_title text not null,
  raw_url text,
  category text not null default 'geral',
  captured_at timestamptz not null default now(),
  opportunity_score int not null default 0 check (opportunity_score between 0 and 100),
  visual_hook text not null default '',
  status text not null default 'captured'
    check (status in ('captured', 'promoted', 'rejected', 'expired')),
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Conceitos de trend jacking (etapas 2 e 3)
-- ---------------------------------------------------------------------------
-- `trend_id` é opcional: um conceito criado à mão no painel não vem de nenhuma
-- tendência coletada, e apagar a tendência não pode apagar o conceito que já
-- virou campanha publicada.
--
-- `ip_check` guarda o resultado do guardrail de propriedade intelectual
-- (etapa 3), no mesmo espírito do `qaResult` do newsroom: o veredito fica
-- gravado junto do conteúdo que ele aprovou.

create table if not exists public.prompt_concepts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  trend_id uuid references public.prompt_trends(id) on delete set null,
  concept text not null,
  hook text not null default '',
  applications jsonb not null default '[]'::jsonb,
  visual_direction jsonb not null default '{}'::jsonb,
  ip_check jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'blocked', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Campanhas (etapas 7 e 8) — o registro central
-- ---------------------------------------------------------------------------
-- A keyword é o único fio que atravessa csltia e OpenReply: é o que a pessoa
-- comenta no post, o que o worker do OpenReply casa por texto, o que viaja no
-- link do Direct (`?k=`) e o que identifica cada evento do funil.
--
-- O formato da keyword está no CHECK, não só no código, porque o casamento no
-- OpenReply é textual: acento, espaço ou caixa mista viram comentários que não
-- disparam Direct nenhum, e o erro só aparece quando o post já está no ar.
--
-- Unicidade composta com `project_id` seguindo a regra do multi-projeto: cada
-- projeto tem sua própria conta do Instagram, então a colisão que importa é
-- dentro do projeto. A checagem contra as automações já existentes no
-- OpenReply é a outra metade, e entra na Fase 1.

create table if not exists public.prompt_campaigns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  concept_id uuid references public.prompt_concepts(id) on delete set null,

  keyword text not null check (keyword ~ '^[A-Z0-9]{3,20}$'),
  theme text not null default '',
  format text not null default 'prompt' check (format in ('prompt', 'tutorial', 'noticia')),

  -- draft            registrada, keyword ainda não reservada
  -- keyword_reserved keyword conferida aqui e no OpenReply
  -- automation_ready automação de Direct criada no OpenReply
  -- published        post no ar, funil recebendo comentário
  -- paused           automação desligada de propósito
  -- archived         campanha encerrada, histórico preservado
  -- failed           quebrou em alguma etapa; o motivo fica em error_message
  status text not null default 'draft'
    check (status in ('draft', 'keyword_reserved', 'automation_ready',
                      'published', 'paused', 'archived', 'failed')),

  source text not null default 'manual' check (source in ('manual', 'pipeline')),

  ig_media_id text,
  openreply_automation_id text,
  lp_url text,
  dm_message text not null default '',
  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,

  constraint prompt_campaigns_project_keyword_key unique (project_id, keyword)
);

-- ---------------------------------------------------------------------------
-- 4. Prompts entregues (etapa 5)
-- ---------------------------------------------------------------------------
-- Restrição dura da etapa 5: `prompt_text` é o prompt **exato** que gerou a
-- imagem mostrada, gravado no momento da geração e nunca reconstruído depois.
-- O material entregue tem que corresponder ao método real — por isso o CHECK
-- de não-vazio: um asset sem prompt é uma promessa que o post não cumpre.

create table if not exists public.prompt_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.prompt_campaigns(id) on delete cascade,
  label text not null,
  prompt_text text not null check (length(btrim(prompt_text)) > 0),
  model text not null default '',
  image_url text,
  image_path text,
  substitution_notes text not null default '',
  position int not null default 0,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint prompt_assets_campaign_label_key unique (campaign_id, label)
);

-- ---------------------------------------------------------------------------
-- 5. Leads capturados na landing (etapa 11)
-- ---------------------------------------------------------------------------
-- `attribution` guarda os campos ocultos do formulário (campaign_id, post_id,
-- keyword, source, timestamp). A unicidade por campanha impede que um F5 no
-- formulário conte duas vezes o mesmo lead na taxa de conversão.

create table if not exists public.prompt_leads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid not null references public.prompt_campaigns(id) on delete cascade,
  name text not null default '',
  email text not null,
  whatsapp text,
  attribution jsonb not null default '{}'::jsonb,
  listmonk_synced boolean not null default false,
  created_at timestamptz not null default now(),

  constraint prompt_leads_campaign_email_key unique (campaign_id, email)
);

-- ---------------------------------------------------------------------------
-- 6. Eventos do funil (etapa 13)
-- ---------------------------------------------------------------------------
-- Comentário, Direct e clique vêm por pull periódico do OpenReply (`DmLog`,
-- `LinkClick`); visita, cadastro e acesso vêm dos eventos do próprio csltia.
--
-- `external_id` é o identificador do lado de lá. A unicidade composta torna o
-- pull idempotente: reprocessar a mesma janela não infla o funil. Nulos são
-- distintos entre si no Postgres, então os eventos internos — que não têm
-- identificador externo — continuam podendo repetir à vontade.

create table if not exists public.prompt_funnel_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid not null references public.prompt_campaigns(id) on delete cascade,
  stage text not null
    check (stage in ('publish', 'comment', 'dm', 'click', 'lp_view', 'signup', 'material_access')),
  external_id text,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint prompt_funnel_events_dedupe_key unique (campaign_id, stage, external_id)
);

-- ---------------------------------------------------------------------------
-- 7. Resultado por conceito (etapa 14)
-- ---------------------------------------------------------------------------
-- Fotografia diária do desempenho de cada campanha. Alcance, saves e shares
-- vêm do Meta Graph insights; o resto vem do funil.
--
-- `conversion_rate` é coluna gerada, não gravada, para não poder divergir dos
-- contadores. **Definição: leads por alcance** — é a métrica que a etapa 14
-- pede, onde um conteúdo com poucas views e muitos leads vale mais que um
-- viral que não converte. A conversão do clique em lead (`leads / clicks`) é
-- outra pergunta, e sai direto dos contadores quando o painel precisar.
--
-- A unicidade por dia torna o cron diário idempotente: rodar duas vezes
-- atualiza a foto do dia em vez de criar uma segunda.
--
-- `snapshot_date` não tem DEFAULT de propósito. `current_date` é a data no
-- fuso do servidor — UTC —, e é exatamente o bug que o multi-projeto já
-- corrigiu uma vez: toda execução depois das 21h no Brasil cai no dia
-- seguinte. Quem grava passa a data de `projectToday(project)`.

create table if not exists public.prompt_concept_results (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.prompt_campaigns(id) on delete cascade,
  snapshot_date date not null,
  snapshot_at timestamptz not null default now(),

  reach int not null default 0 check (reach >= 0),
  saves int not null default 0 check (saves >= 0),
  shares int not null default 0 check (shares >= 0),
  comments int not null default 0 check (comments >= 0),
  dms_started int not null default 0 check (dms_started >= 0),
  clicks int not null default 0 check (clicks >= 0),
  leads int not null default 0 check (leads >= 0),

  conversion_rate numeric(8, 6) generated always as (
    case when reach > 0 then leads::numeric / reach else 0 end
  ) stored,

  created_at timestamptz not null default now(),

  constraint prompt_concept_results_campaign_day_key unique (campaign_id, snapshot_date)
);

-- ---------------------------------------------------------------------------
-- 8. Índices
-- ---------------------------------------------------------------------------
-- O Postgres não indexa coluna de chave estrangeira sozinho, e sem índice o
-- ON DELETE CASCADE varre a tabela inteira. Cada FK abaixo tem um índice que
-- a cobre — como primeira coluna, para servir também às consultas do painel.

create index if not exists prompt_trends_project_status_idx
  on public.prompt_trends (project_id, status, opportunity_score desc);
create index if not exists prompt_trends_captured_idx
  on public.prompt_trends (project_id, captured_at desc);

create index if not exists prompt_concepts_project_status_idx
  on public.prompt_concepts (project_id, status, created_at desc);
create index if not exists prompt_concepts_trend_idx
  on public.prompt_concepts (trend_id);

create index if not exists prompt_campaigns_project_status_idx
  on public.prompt_campaigns (project_id, status, created_at desc);
create index if not exists prompt_campaigns_concept_idx
  on public.prompt_campaigns (concept_id);
create index if not exists prompt_campaigns_ig_media_idx
  on public.prompt_campaigns (ig_media_id) where ig_media_id is not null;

create index if not exists prompt_assets_campaign_idx
  on public.prompt_assets (campaign_id, position);

create index if not exists prompt_leads_campaign_idx
  on public.prompt_leads (campaign_id, created_at desc);
create index if not exists prompt_leads_project_idx
  on public.prompt_leads (project_id, created_at desc);

create index if not exists prompt_funnel_events_campaign_idx
  on public.prompt_funnel_events (campaign_id, stage, occurred_at desc);
create index if not exists prompt_funnel_events_project_idx
  on public.prompt_funnel_events (project_id, occurred_at desc);

create index if not exists prompt_concept_results_campaign_idx
  on public.prompt_concept_results (campaign_id, snapshot_date desc);

-- ---------------------------------------------------------------------------
-- 9. Acesso
-- ---------------------------------------------------------------------------

alter table public.prompt_trends enable row level security;
alter table public.prompt_concepts enable row level security;
alter table public.prompt_campaigns enable row level security;
alter table public.prompt_assets enable row level security;
alter table public.prompt_leads enable row level security;
alter table public.prompt_funnel_events enable row level security;
alter table public.prompt_concept_results enable row level security;

revoke all on public.prompt_trends from anon, authenticated;
revoke all on public.prompt_concepts from anon, authenticated;
revoke all on public.prompt_campaigns from anon, authenticated;
revoke all on public.prompt_assets from anon, authenticated;
revoke all on public.prompt_leads from anon, authenticated;
revoke all on public.prompt_funnel_events from anon, authenticated;
revoke all on public.prompt_concept_results from anon, authenticated;
