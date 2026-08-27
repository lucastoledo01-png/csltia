-- =========================================================================
-- SCRIPT UNICO DE ATUALIZACAO DO BANCO DE PRODUCAO
-- =========================================================================
--
-- Consolida quatro migracoes que faltam no banco:
--
--   20260825170000_social_posts                 (nunca aplicada)
--   20260826120000_storage_public_assets        (nunca aplicada)
--   20260827020000_fix_public_assets_upload_policy
--   20260827030000_multi_project_base
--
-- A politica insegura da terceira migracao ja entra corrigida aqui: o bucket
-- e criado com escopo de papel correto desde o inicio, sem passar pelo estado
-- em que qualquer visitante podia subir arquivo.
--
-- Pode ser executado mais de uma vez sem erro.
--
-- COMO USAR: Supabase -> SQL Editor -> colar tudo -> Run.
-- =========================================================================


-- -------------------------------------------------------------------------
-- 1. Postagens sociais
-- -------------------------------------------------------------------------

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
  idempotency_key text,
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


-- -------------------------------------------------------------------------
-- 2. Bucket de assets, com politicas ja corretas
-- -------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public_assets', 'public_assets', true, 10485760, array['image/png', 'image/jpeg', 'image/svg+xml'])
on conflict (id) do update set public = true;

drop policy if exists "Public Read Access for Assets" on storage.objects;
drop policy if exists "Service Role Upload Access for Assets" on storage.objects;
drop policy if exists "Service Role Update Access for Assets" on storage.objects;
drop policy if exists "Service Role Delete Access for Assets" on storage.objects;

-- Leitura publica e intencional: a Meta precisa buscar os slides.
create policy "Public Read Access for Assets"
on storage.objects for select
to anon, authenticated, service_role
using (bucket_id = 'public_assets');

-- Escrita apenas pelo papel de servico. Sem a clausula TO, a politica valeria
-- para PUBLIC e liberaria upload anonimo.
create policy "Service Role Upload Access for Assets"
on storage.objects for insert
to service_role
with check (bucket_id = 'public_assets');

create policy "Service Role Update Access for Assets"
on storage.objects for update
to service_role
using (bucket_id = 'public_assets')
with check (bucket_id = 'public_assets');

create policy "Service Role Delete Access for Assets"
on storage.objects for delete
to service_role
using (bucket_id = 'public_assets');


-- -------------------------------------------------------------------------
-- 3. Projetos
-- -------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  niche text not null default '',
  content_language text not null default 'pt-BR',
  timezone text not null default 'America/Sao_Paulo',
  site_url text,
  brand_display_name text not null default '',
  brand_tagline text not null default '',
  brand_primary_color text not null default '#ff4a1c',
  brand_logo_url text,
  brand_social_links jsonb not null default '{}'::jsonb,
  newsletter_from_name text not null default '',
  publish_hour_local int not null default 6 check (publish_hour_local between 0 and 23),
  publish_minute_local int not null default 3 check (publish_minute_local between 0 and 59),
  editorial_prompt_extra text not null default '',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_news_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_key text not null,
  name text not null,
  company_name text,
  type text not null default 'rss' check (type in ('rss', 'atom', 'html', 'api')),
  url text not null,
  enabled boolean not null default true,
  priority int not null default 2 check (priority in (1, 2)),
  category text not null default 'general_ai',
  region text not null default 'global',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_news_sources_key_unique unique (project_id, source_key)
);

create index if not exists project_news_sources_enabled_idx
  on public.project_news_sources (project_id, enabled, priority);

create table if not exists public.project_credentials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null check (provider in ('instagram', 'listmonk', 'openai', 'chatbotx')),
  config jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_credentials_provider_unique unique (project_id, provider)
);

alter table public.projects enable row level security;
alter table public.project_news_sources enable row level security;
alter table public.project_credentials enable row level security;

revoke all on public.projects from anon, authenticated;
revoke all on public.project_news_sources from anon, authenticated;
revoke all on public.project_credentials from anon, authenticated;


-- -------------------------------------------------------------------------
-- 4. Projeto semente
-- -------------------------------------------------------------------------

insert into public.projects (
  id, slug, name, niche, site_url,
  brand_display_name, brand_tagline, brand_primary_color,
  brand_social_links, newsletter_from_name, editorial_prompt_extra
)
values (
  '00000000-0000-4000-8000-000000000001',
  'desbuguei',
  'Desbuguei',
  'Inteligencia artificial, redes sociais, vendas e produtividade',
  'https://desbuguei.ia',
  'b. / desbuguei.ia',
  'Mais inteligente em 5 minutos.',
  '#ff4a1c',
  '{}'::jsonb,
  'desbuguei.ia',
  'Tom direto, claro, leve e levemente tech. Jargoes de branding como desbugar, update, modo debug e hotfix na medida certa.'
)
on conflict (id) do nothing;


-- -------------------------------------------------------------------------
-- 5. Fontes de conteudo
-- -------------------------------------------------------------------------

insert into public.project_news_sources
  (project_id, source_key, name, company_name, type, url, enabled, priority, category, region)
values
  ('00000000-0000-4000-8000-000000000001', 'openai-blog', 'OpenAI Official Blog', 'OpenAI', 'rss', 'https://openai.com/news/rss.xml', true, 1, 'lab', 'global'),
  ('00000000-0000-4000-8000-000000000001', 'anthropic-news', 'Anthropic News & Research', 'Anthropic', 'rss', 'https://www.anthropic.com/feed.xml', true, 1, 'lab', 'global'),
  ('00000000-0000-4000-8000-000000000001', 'google-deepmind', 'Google DeepMind Blog', 'Google', 'rss', 'https://deepmind.google/blog/rss.xml', true, 1, 'lab', 'global'),
  ('00000000-0000-4000-8000-000000000001', 'meta-ai-blog', 'Meta AI Blog', 'Meta', 'rss', 'https://ai.meta.com/blog/rss/', true, 1, 'lab', 'global'),
  ('00000000-0000-4000-8000-000000000001', 'microsoft-ai-blog', 'Microsoft Official AI Blog', 'Microsoft', 'rss', 'https://blogs.microsoft.com/ai/feed/', true, 1, 'lab', 'global'),
  ('00000000-0000-4000-8000-000000000001', 'huggingface-blog', 'Hugging Face Blog', 'Hugging Face', 'rss', 'https://huggingface.co/blog/feed.xml', true, 1, 'lab', 'global'),
  ('00000000-0000-4000-8000-000000000001', 'github-blog-ai', 'GitHub AI Blog', 'GitHub', 'rss', 'https://github.blog/category/ai/feed/', true, 1, 'lab', 'global'),
  ('00000000-0000-4000-8000-000000000001', 'aws-ai-blog', 'AWS Machine Learning Blog', 'Amazon', 'rss', 'https://aws.amazon.com/blogs/machine-learning/feed/', true, 1, 'lab', 'global'),
  ('00000000-0000-4000-8000-000000000001', 'canaltech-rss', 'Canaltech (Tecnologia & IA BR)', null, 'rss', 'https://canaltech.com.br/rss/', true, 1, 'br_media', 'br'),
  ('00000000-0000-4000-8000-000000000001', 'tecnoblog-rss', 'Tecnoblog', null, 'rss', 'https://tecnoblog.net/feed/', true, 1, 'br_media', 'br'),
  ('00000000-0000-4000-8000-000000000001', 'manual-do-usuario', 'Manual do Usuario', null, 'rss', 'https://manualdousuario.net/feed/', true, 1, 'br_media', 'br'),
  ('00000000-0000-4000-8000-000000000001', 'startse-feed', 'StartSe Inovacao & IA', null, 'rss', 'https://www.startse.com/feed/', true, 2, 'br_media', 'br'),
  ('00000000-0000-4000-8000-000000000001', 'baguete-diario', 'Baguete Diario de TI', null, 'rss', 'https://www.baguete.com.br/feed', true, 2, 'br_media', 'br'),
  ('00000000-0000-4000-8000-000000000001', 'ti-inside', 'TI Inside Brasil', null, 'rss', 'https://tiinside.com.br/feed/', true, 2, 'br_media', 'br'),
  ('00000000-0000-4000-8000-000000000001', 'techcrunch-ai', 'TechCrunch AI', null, 'rss', 'https://techcrunch.com/category/artificial-intelligence/feed/', true, 2, 'tech_media', 'global'),
  ('00000000-0000-4000-8000-000000000001', 'arstechnica-ai', 'Ars Technica AI', null, 'rss', 'https://feeds.arstechnica.com/arstechnica/technology-lab', true, 2, 'tech_media', 'global'),
  ('00000000-0000-4000-8000-000000000001', 'venturebeat-ai', 'VentureBeat AI', null, 'rss', 'https://venturebeat.com/category/ai/feed/', true, 2, 'tech_media', 'global'),
  ('00000000-0000-4000-8000-000000000001', 'mit-tech-review', 'MIT Technology Review AI', null, 'rss', 'https://www.technologyreview.com/topic/artificial-intelligence/feed', true, 2, 'tech_media', 'global'),
  ('00000000-0000-4000-8000-000000000001', 'theverge-ai', 'The Verge AI', null, 'rss', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', true, 2, 'tech_media', 'global')
on conflict (project_id, source_key) do nothing;


-- -------------------------------------------------------------------------
-- 6. Vinculo do conteudo ao projeto
-- -------------------------------------------------------------------------

do $$
declare
  alvo text;
begin
  foreach alvo in array array[
    'articles', 'article_revisions', 'article_comments', 'newsletter_leads',
    'email_campaigns', 'email_events', 'content_sources', 'editorial_reviews',
    'listmonk_sync_logs', 'platform_events', 'pageviews', 'news_candidates',
    'news_editions', 'newsroom_runs', 'social_posts'
  ] loop
    execute format(
      'alter table public.%I add column if not exists project_id uuid not null '
      || 'default ''00000000-0000-4000-8000-000000000001''::uuid', alvo);

    if not exists (
      select 1 from pg_constraint
      where conname = alvo || '_project_id_fkey'
        and conrelid = format('public.%I', alvo)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (project_id) '
        || 'references public.projects(id) on delete cascade',
        alvo, alvo || '_project_id_fkey');
    end if;

    execute format(
      'create index if not exists %I on public.%I (project_id, created_at desc)',
      alvo || '_project_idx', alvo);
  end loop;
end $$;


-- -------------------------------------------------------------------------
-- 7. Unicidades globais viram compostas
-- -------------------------------------------------------------------------

do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('articles',         'articles_slug_key',                  'articles_project_slug_key',           'project_id, slug'),
      ('newsletter_leads', 'newsletter_leads_email_key',         'newsletter_leads_project_email_key',  'project_id, email'),
      ('news_candidates',  'news_candidates_url_key',            'news_candidates_project_url_key',     'project_id, url'),
      ('news_editions',    'news_editions_edition_date_key',     'news_editions_project_date_key',      'project_id, edition_date'),
      ('news_editions',    'news_editions_slug_key',             'news_editions_project_slug_key',      'project_id, slug'),
      ('newsroom_runs',    'newsroom_runs_idempotency_key_key',  'newsroom_runs_project_idempotency_key', 'project_id, idempotency_key'),
      ('social_posts',     'social_posts_idempotency_key_key',   'social_posts_project_idempotency_key',  'project_id, idempotency_key')
    ) as t(tabela, antiga, nova, colunas)
  loop
    execute format('alter table public.%I drop constraint if exists %I', item.tabela, item.antiga);

    if not exists (
      select 1 from pg_constraint
      where conname = item.nova
        and conrelid = format('public.%I', item.tabela)::regclass
    ) then
      execute format('alter table public.%I add constraint %I unique (%s)',
        item.tabela, item.nova, item.colunas);
    end if;
  end loop;
end $$;


-- -------------------------------------------------------------------------
-- 8. Conferencia
-- -------------------------------------------------------------------------

select
  (select count(*) from public.projects)                        as projetos,
  (select count(*) from public.project_news_sources)            as fontes,
  (select count(*) from public.social_posts)                    as posts,
  (select count(*) from storage.buckets where id='public_assets') as bucket,
  (select count(*) from pg_policies
     where schemaname='storage' and tablename='objects'
       and policyname like '%Assets%')                          as politicas_storage;
