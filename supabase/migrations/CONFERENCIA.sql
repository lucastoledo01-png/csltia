-- ============================================================================
-- CONFERÊNCIA. Rodar DEPOIS das três migrations, e me mandar a saída.
--
-- Devolve tudo num resultado só: cada linha é uma verificação, com o que se
-- esperava e o que o banco respondeu.
-- ============================================================================

with checagens as (

  -- 1. Fontes: quantas no total, e quantas habilitadas.
  select 1 as ordem,
         'fontes cadastradas' as verificacao,
         '92 (55 antigas + 37 novas)' as esperado,
         count(*)::text as encontrado
    from public.project_news_sources

  union all
  select 2, 'fontes habilitadas', '66', count(*)::text
    from public.project_news_sources where enabled

  union all
  -- 2. Google News não pode ter prioridade de fonte original.
  select 3, 'Google News com priority=1', '0', count(*)::text
    from public.project_news_sources
   where url like '%news.google.com%' and priority = 1

  union all
  select 4, 'Google News com priority=2', '19', count(*)::text
    from public.project_news_sources
   where url like '%news.google.com%' and priority = 2

  union all
  -- 3. Fontes diretas com priority=1 não podem ter sido tocadas.
  select 5, 'fontes diretas com priority=1', '39', count(*)::text
    from public.project_news_sources
   where url not like '%news.google.com%' and priority = 1

  union all
  select 6, 'USCIS direto existe e é priority=1', 'sim', 
         coalesce((select 'sim, priority=' || priority::text
                     from public.project_news_sources
                    where url = 'https://www.uscis.gov/news/rss-feed/22984' limit 1), 'NAO ENCONTRADO')

  union all
  -- 4. news_candidates: nenhuma perda de dado.
  select 7, 'linhas em news_candidates', '0', count(*)::text
    from public.news_candidates

  union all
  select 8, 'colunas em news_candidates', '43', count(*)::text
    from information_schema.columns
   where table_schema = 'public' and table_name = 'news_candidates'

  union all
  -- 5. Unicidade: nenhuma global em url, uma por projeto.
  select 9, 'unique global só em url', '0',
         count(*)::text
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.news_candidates'::regclass
     and c.contype = 'u' and array_length(c.conkey, 1) = 1 and a.attname = 'url'

  union all
  select 10, 'índice unique (project_id, url)', 'presente',
         coalesce((select indexname from pg_indexes
                    where tablename = 'news_candidates'
                      and indexname = 'news_candidates_projeto_url'), 'AUSENTE')

  union all
  -- 6. CHECK de status: exatamente um.
  select 11, 'quantidade de CHECK em status', '1', count(*)::text
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.news_candidates'::regclass
     and c.contype = 'c' and a.attname = 'status'

  union all
  select 12, 'valores aceitos no CHECK de status', 'os 10 novos',
         coalesce((select pg_get_constraintdef(c.oid)
                     from pg_constraint c
                     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
                    where c.conrelid = 'public.news_candidates'::regclass
                      and c.contype = 'c' and a.attname = 'status' limit 1), 'NENHUM')

  union all
  -- 7. RLS.
  select 13, 'RLS em news_candidates', 'true', relrowsecurity::text
    from pg_class where oid = 'public.news_candidates'::regclass

  union all
  -- 8. social_posts: colunas novas da idempotência da Meta.
  select 14, 'social_posts tem provider_creation_id', 'sim',
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name='social_posts'
                              and column_name='provider_creation_id')
              then 'sim' else 'NAO' end

  union all
  select 15, 'social_posts tem candidate_id', 'sim',
         case when exists (select 1 from information_schema.columns
                            where table_schema='public' and table_name='social_posts'
                              and column_name='candidate_id')
              then 'sim' else 'NAO' end

  union all
  select 16, 'índice unique de provider_post_id', 'presente',
         coalesce((select indexname from pg_indexes
                    where tablename = 'social_posts'
                      and indexname = 'social_posts_media_unica'), 'AUSENTE')

  union all
  -- 9. Nenhuma tabela perdeu linha.
  select 17, 'linhas em social_posts', '16', count(*)::text from public.social_posts
  union all
  select 18, 'linhas em editorial_history', '23', count(*)::text from public.editorial_history
  union all
  select 19, 'linhas em news_editions', '4', count(*)::text from public.news_editions
)

select ordem, verificacao, esperado, encontrado
  from checagens
 order by ordem;
