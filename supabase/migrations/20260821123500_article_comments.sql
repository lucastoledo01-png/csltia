create table if not exists public.article_comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.articles(id) on delete cascade,
  article_slug text not null default '',
  user_name text not null,
  user_email text not null,
  content text not null,
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists article_comments_article_idx on public.article_comments (article_id, status, created_at desc);
create index if not exists article_comments_slug_idx on public.article_comments (article_slug, status, created_at desc);

alter table public.article_comments enable row level security;
revoke all on public.article_comments from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'article_comments'
      and policyname = 'deny_public_access'
  ) then
    create policy deny_public_access on public.article_comments for all to anon, authenticated using (false) with check (false);
  end if;
end $$;
