create extension if not exists pgcrypto;

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'temporary-admin',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null default '',
  description text not null default '',
  cover_image text,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  category text not null default 'ia',
  author text not null default 'Casaloti IA',
  reading_minutes int not null default 4 check (reading_minutes > 0),
  view_count bigint not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  title text not null,
  body jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.newsletter_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text not null default 'site',
  status text not null default 'active' check (status in ('active', 'unsubscribed', 'bounced', 'complained')),
  consent_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'paused', 'failed')),
  provider text not null default 'manual',
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.email_campaigns(id) on delete set null,
  lead_id uuid references public.newsletter_leads(id) on delete set null,
  event_type text not null check (event_type in ('queued', 'sent', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'failed')),
  provider_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_id uuid,
  path text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pageviews (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  referrer text,
  user_agent text,
  article_id uuid references public.articles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists articles_status_published_idx on public.articles (status, published_at desc);
create index if not exists article_revisions_article_idx on public.article_revisions (article_id, created_at desc);
create index if not exists newsletter_leads_status_idx on public.newsletter_leads (status, created_at desc);
create index if not exists email_events_campaign_idx on public.email_events (campaign_id, created_at desc);
create index if not exists platform_events_type_idx on public.platform_events (event_type, created_at desc);
create index if not exists pageviews_path_created_idx on public.pageviews (path, created_at desc);
create index if not exists pageviews_article_created_idx on public.pageviews (article_id, created_at desc);

alter table public.admin_sessions enable row level security;
alter table public.articles enable row level security;
alter table public.article_revisions enable row level security;
alter table public.newsletter_leads enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_events enable row level security;
alter table public.platform_events enable row level security;
alter table public.pageviews enable row level security;

revoke all on public.admin_sessions from anon, authenticated;
revoke all on public.articles from anon, authenticated;
revoke all on public.article_revisions from anon, authenticated;
revoke all on public.newsletter_leads from anon, authenticated;
revoke all on public.email_campaigns from anon, authenticated;
revoke all on public.email_events from anon, authenticated;
revoke all on public.platform_events from anon, authenticated;
revoke all on public.pageviews from anon, authenticated;
