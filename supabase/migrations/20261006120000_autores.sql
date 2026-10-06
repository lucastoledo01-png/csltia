-- Autores do portal (06/10/2026).
--
-- Até aqui toda matéria assinava como "Redação eua.journal". O dono aprovou
-- autores com nome: pessoa com página própria (/autor/<slug>), cargo, minibio,
-- foto e redes, que assina as matérias que o dono atribuir a ela no painel
-- (/admin/<projeto>/autores). Matéria sem autor continua da Redação, e é o
-- padrão de tudo o que a esteira automática publica.
--
-- ## Regras do projeto que esta migration segue
--
-- - `project_id not null` SEM default. Default do projeto semente é dívida:
--   um call site esquecido gravaria no projeto errado sem erro nenhum.
-- - Unicidade e CHECK entram agora, com a tabela vazia.
-- - `slug` é `not null`, então o UNIQUE (project_id, slug) protege de verdade.
-- - RLS ligada e nada para anon/authenticated, como as tabelas vizinhas: só o
--   servidor lê, com a chave de serviço.
--
-- `articles.author` (texto) fica como está, por compatibilidade. A página
-- prefere `author_id`; nulo, assina como a Redação. Apagar o autor deixa a
-- matéria sem autor (on delete set null), mas o painel não apaga: desativa.
--
-- O código degrada sem esta migration: as matérias abrem com a Redação, a
-- página de autor dá 404, e o painel diz qual arquivo rodar.

create table if not exists public.autores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  cargo text not null default '' check (char_length(cargo) <= 120),
  minibio text not null default '' check (char_length(minibio) <= 1200),
  foto_url text check (foto_url is null or foto_url ~ '^https://'),
  -- O id de uma editoria (economia, governo...) ou texto livre.
  area text not null default '' check (char_length(area) <= 80),
  -- {"instagram": url, "linkedin": url, "x": url, "site": url}, só as que existem.
  redes jsonb not null default '{}'::jsonb check (jsonb_typeof(redes) = 'object'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint autores_projeto_slug_key unique (project_id, slug)
);

alter table public.articles
  add column if not exists author_id uuid null references public.autores(id) on delete set null;

-- A página do autor e o sitemap perguntam "as matérias deste autor".
create index if not exists articles_author_id_idx
  on public.articles (author_id)
  where author_id is not null;

alter table public.autores enable row level security;

revoke all on public.autores from anon, authenticated;

-- Conferência: a primeira deve responder true; a segunda, uma linha.
--   select relname, relrowsecurity from pg_class where relname = 'autores';
--   select column_name, is_nullable from information_schema.columns
--    where table_name = 'articles' and column_name = 'author_id';

-- O PostgREST passa a enxergar a tabela e a coluna sem esperar o próximo recarregamento.
notify pgrst, 'reload schema';
