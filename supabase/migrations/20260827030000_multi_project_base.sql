-- Base multi-projeto.
--
-- Ate aqui o sistema assumia uma marca so, e o schema nao apenas deixava de
-- suportar varios projetos: ele proibia. Havia restricoes de unicidade globais
-- que tornavam a coexistencia impossivel, nao apenas trabalhosa:
--
--   news_editions.edition_date UNIQUE  -> uma edicao por dia no sistema inteiro
--   news_candidates.url        UNIQUE  -> a mesma noticia nao podia ser
--                                         coletada por dois projetos
--   articles.slug              UNIQUE  -> colisao de slug entre marcas
--   newsletter_leads.email     UNIQUE  -> um e-mail nao podia assinar duas
--                                         newsletters diferentes
--
-- Esta migracao cria a entidade projeto, vincula todo o conteudo a ela e troca
-- essas unicidades globais por compostas.
--
-- Compatibilidade: project_id entra com DEFAULT apontando para o projeto
-- semente, entao o codigo que ainda nao passa o projeto continua funcionando
-- enquanto o pipeline e migrado por partes. O DEFAULT sai quando a migracao do
-- codigo terminar.

-- ---------------------------------------------------------------------------
-- 1. Projetos
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),

  -- Segmento de atuacao: orienta a curadoria editorial de cada projeto.
  niche text not null default '',
  content_language text not null default 'pt-BR',
  timezone text not null default 'America/Sao_Paulo',

  site_url text,

  -- Identidade visual usada na newsletter e nos slides do carrossel.
  brand_display_name text not null default '',
  brand_tagline text not null default '',
  brand_primary_color text not null default '#ff4a1c',
  brand_logo_url text,
  brand_social_links jsonb not null default '{}'::jsonb,

  -- Publicacao
  newsletter_from_name text not null default '',
  publish_hour_local int not null default 6 check (publish_hour_local between 0 and 23),
  publish_minute_local int not null default 3 check (publish_minute_local between 0 and 59),

  -- Ajuste fino do tom editorial por projeto, concatenado ao prompt do sistema.
  editorial_prompt_extra text not null default '',

  settings jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Fontes de conteudo por projeto
-- ---------------------------------------------------------------------------
-- As fontes viviam num array em news-sources.ts. Para um projeto de outro
-- segmento seria preciso editar codigo e fazer deploy.

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

-- ---------------------------------------------------------------------------
-- 3. Credenciais por projeto
-- ---------------------------------------------------------------------------
-- Cada projeto publica numa conta de Instagram e numa lista de e-mail
-- diferentes, entao essas credenciais nao podem mais vir do ambiente global.
--
-- ATENCAO: os valores ficam em texto no banco. O acesso e restrito ao papel de
-- servico (RLS abaixo), mas o proximo passo de endurecimento e mover os
-- segredos para o Supabase Vault e guardar aqui apenas a referencia.

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

-- ---------------------------------------------------------------------------
-- 4. Projeto semente
-- ---------------------------------------------------------------------------
-- O conteudo existente foi todo produzido para a desbuguei.ia. O identificador
-- e fixo para servir de DEFAULT das colunas adicionadas adiante.

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

-- ---------------------------------------------------------------------------
-- 5. Fontes atuais migradas para o projeto semente
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 6. Vinculo do conteudo existente ao projeto
-- ---------------------------------------------------------------------------

do $$
declare
  alvo text;
begin
  foreach alvo in array array[
    'articles',
    'article_revisions',
    'article_comments',
    'newsletter_leads',
    'email_campaigns',
    'email_events',
    'content_sources',
    'editorial_reviews',
    'listmonk_sync_logs',
    'platform_events',
    'pageviews',
    'news_candidates',
    'news_editions',
    'newsroom_runs',
    'social_posts'
  ] loop
    execute format(
      'alter table public.%I add column if not exists project_id uuid not null '
      || 'default ''00000000-0000-4000-8000-000000000001''::uuid',
      alvo
    );

    if not exists (
      select 1 from pg_constraint
      where conname = alvo || '_project_id_fkey'
        and conrelid = format('public.%I', alvo)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (project_id) '
        || 'references public.projects(id) on delete cascade',
        alvo, alvo || '_project_id_fkey'
      );
    end if;

    execute format(
      'create index if not exists %I on public.%I (project_id, created_at desc)',
      alvo || '_project_idx', alvo
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Unicidades globais viram compostas
-- ---------------------------------------------------------------------------

alter table public.articles drop constraint if exists articles_slug_key;
alter table public.articles
  add constraint articles_project_slug_key unique (project_id, slug);

alter table public.newsletter_leads drop constraint if exists newsletter_leads_email_key;
alter table public.newsletter_leads
  add constraint newsletter_leads_project_email_key unique (project_id, email);

alter table public.news_candidates drop constraint if exists news_candidates_url_key;
alter table public.news_candidates
  add constraint news_candidates_project_url_key unique (project_id, url);

alter table public.news_editions drop constraint if exists news_editions_edition_date_key;
alter table public.news_editions
  add constraint news_editions_project_date_key unique (project_id, edition_date);

alter table public.news_editions drop constraint if exists news_editions_slug_key;
alter table public.news_editions
  add constraint news_editions_project_slug_key unique (project_id, slug);

alter table public.newsroom_runs drop constraint if exists newsroom_runs_idempotency_key_key;
alter table public.newsroom_runs
  add constraint newsroom_runs_project_idempotency_key unique (project_id, idempotency_key);

alter table public.social_posts drop constraint if exists social_posts_idempotency_key_key;
alter table public.social_posts
  add constraint social_posts_project_idempotency_key unique (project_id, idempotency_key);

-- ---------------------------------------------------------------------------
-- 8. Acesso
-- ---------------------------------------------------------------------------
-- Mesmo padrao das demais tabelas: sem acesso por anon ou authenticated. Todo
-- o trafego passa pelo servidor com a chave de servico.

alter table public.projects enable row level security;
alter table public.project_news_sources enable row level security;
alter table public.project_credentials enable row level security;

revoke all on public.projects from anon, authenticated;
revoke all on public.project_news_sources from anon, authenticated;
revoke all on public.project_credentials from anon, authenticated;
