-- Tabela de Postagens Sociais e Carrosséis de Instagram
create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid references public.news_editions(id) on delete set null,
  edition_date date not null,
  article_slug text,
  platform text not null default 'instagram' check (platform in ('instagram', 'linkedin', 'twitter')),
  post_type text not null default 'carousel' check (post_type in ('carousel', 'single_image', 'reels_script')),
  title text not null,
  caption text not null default '',
  content_json jsonb not null default '{}'::jsonb,
  slides_manifest jsonb not null default '[]'::jsonb,
  asset_paths jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'generated', 'approved', 'scheduled', 'published', 'failed')),
  idempotency_key text unique,
  scheduled_at timestamptz,
  published_at timestamptz,
  provider_post_id text,
  tokens_input int not null default 0,
  tokens_output int not null default 0,
  cost_estimate_usd numeric(10, 6) not null default 0,
  dry_run boolean not null default true,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_posts_date_idx on public.social_posts (edition_date desc);
create index if not exists social_posts_status_idx on public.social_posts (status, created_at desc);

alter table public.social_posts enable row level security;
revoke all on public.social_posts from anon, authenticated;
