alter table public.article_comments
  add column if not exists likes int not null default 0 check (likes >= 0),
  add column if not exists dislikes int not null default 0 check (dislikes >= 0);

alter table public.articles
  add column if not exists content_html text not null default '';

create index if not exists article_comments_votes_idx on public.article_comments (article_slug, status, (likes - dislikes) desc);
