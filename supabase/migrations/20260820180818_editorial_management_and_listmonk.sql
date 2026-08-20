alter table public.articles
  add column if not exists content jsonb not null default '[]'::jsonb,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists source_urls text[] not null default '{}'::text[],
  add column if not exists seo_title text not null default '',
  add column if not exists seo_description text not null default '',
  add column if not exists canonical_url text,
  add column if not exists aeo_questions jsonb not null default '[]'::jsonb,
  add column if not exists age_summary text not null default '',
  add column if not exists editorial_score int not null default 0 check (editorial_score >= 0 and editorial_score <= 100),
  add column if not exists manual_review_status text not null default 'needs_review' check (manual_review_status in ('needs_review', 'approved', 'blocked')),
  add column if not exists listmonk_campaign_id int,
  add column if not exists last_reviewed_at timestamptz;

create table if not exists public.content_sources (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.articles(id) on delete cascade,
  url text not null,
  title text not null default '',
  source_type text not null default 'reference' check (source_type in ('reference', 'official', 'paper', 'video', 'benchmark', 'market')),
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.editorial_reviews (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.articles(id) on delete cascade,
  score int not null check (score >= 0 and score <= 100),
  checks jsonb not null default '[]'::jsonb,
  reviewer text not null default 'automation',
  created_at timestamptz not null default now()
);

create table if not exists public.listmonk_sync_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.newsletter_leads(id) on delete set null,
  campaign_id uuid references public.email_campaigns(id) on delete set null,
  action text not null check (action in ('subscriber_upsert', 'campaign_create', 'campaign_send', 'bounce', 'complaint', 'unsubscribe')),
  status text not null default 'pending' check (status in ('pending', 'synced', 'skipped', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists articles_manual_review_idx on public.articles (manual_review_status, created_at desc);
create index if not exists articles_seo_status_idx on public.articles (status, editorial_score desc, published_at desc);
create index if not exists content_sources_article_idx on public.content_sources (article_id, created_at desc);
create index if not exists editorial_reviews_article_idx on public.editorial_reviews (article_id, created_at desc);
create index if not exists listmonk_sync_logs_lead_idx on public.listmonk_sync_logs (lead_id, created_at desc);
create index if not exists listmonk_sync_logs_campaign_idx on public.listmonk_sync_logs (campaign_id, created_at desc);
create index if not exists email_events_lead_idx on public.email_events (lead_id, created_at desc);

alter table public.content_sources enable row level security;
alter table public.editorial_reviews enable row level security;
alter table public.listmonk_sync_logs enable row level security;

revoke all on public.content_sources from anon, authenticated;
revoke all on public.editorial_reviews from anon, authenticated;
revoke all on public.listmonk_sync_logs from anon, authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'admin_sessions',
    'articles',
    'article_revisions',
    'newsletter_leads',
    'email_campaigns',
    'email_events',
    'content_sources',
    'editorial_reviews',
    'listmonk_sync_logs',
    'platform_events',
    'pageviews'
  ] loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and policyname = 'deny_public_access'
    ) then
      execute format(
        'create policy deny_public_access on public.%I for all to anon, authenticated using (false) with check (false)',
        target_table
      );
    end if;
  end loop;
end $$;
