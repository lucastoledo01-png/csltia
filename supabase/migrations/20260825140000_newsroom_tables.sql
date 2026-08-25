-- Tabela de Candidatas a Pauta Coletadas
create table if not exists public.news_candidates (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text not null,
  source_name text not null,
  source_type text not null default 'rss',
  author text,
  published_at timestamptz not null,
  description text not null default '',
  content text not null default '',
  category text not null default 'ia',
  score int not null default 0,
  dedupe_key text,
  status text not null default 'collected' check (status in ('collected', 'filtered', 'selected', 'rejected', 'duplicate', 'too_old', 'already_published')),
  created_at timestamptz not null default now()
);

-- Tabela de Edições Geradas
create table if not exists public.news_editions (
  id uuid primary key default gen_random_uuid(),
  edition_date date not null unique,
  edition_number int not null default 1,
  slug text not null unique,
  subject text not null,
  subject_options jsonb not null default '[]'::jsonb,
  preheader text not null default '',
  headline text not null,
  intro text not null default '',
  stories jsonb not null default '[]'::jsonb,
  quick_bits jsonb not null default '[]'::jsonb,
  closing text not null default '',
  final_line text not null default 'Agora você está desbugado. Bora iniciar o dia.',
  content_html text not null default '',
  word_count int not null default 0,
  qa_passed boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'approved', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tabela de Execuções e Métrica de Runs do Newsroom
create table if not exists public.newsroom_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'failed', 'cancelled')),
  sources_count int not null default 0,
  candidates_found int not null default 0,
  candidates_filtered int not null default 0,
  duplicates_count int not null default 0,
  stories_selected int not null default 0,
  tokens_input int not null default 0,
  tokens_output int not null default 0,
  cost_estimate_usd numeric(10, 6) not null default 0,
  dry_run boolean not null default true,
  error_message text,
  edition_id uuid references public.news_editions(id) on delete set null,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create index if not exists news_candidates_status_idx on public.news_candidates (status, score desc, published_at desc);
create index if not exists news_editions_date_idx on public.news_editions (edition_date desc);
create index if not exists newsroom_runs_started_idx on public.newsroom_runs (started_at desc);

alter table public.news_candidates enable row level security;
alter table public.news_editions enable row level security;
alter table public.newsroom_runs enable row level security;

revoke all on public.news_candidates from anon, authenticated;
revoke all on public.news_editions from anon, authenticated;
revoke all on public.newsroom_runs from anon, authenticated;
