-- Três tabelas do newsroom estão legíveis pela chave anônima.
--
-- Descoberto pela pós-condição da migration de candidatos, que abortou com
-- "FALHOU: RLS desligada" e desfez tudo. A asserção existia para provar o
-- estado final e acabou provando um problema anterior a ela.
--
-- ## O que está exposto hoje
--
-- A chave anônima é a que vai no navegador, com o prefixo NEXT_PUBLIC_.
-- Testado contra a API pública do projeto:
--
--   news_candidates   HTTP 200, tabela vazia hoje e destinada a guardar toda
--                     candidata classificada, com pacote factual e vetor
--   news_editions     HTTP 200, devolve a edição inteira: stories, intro,
--                     closing, content_html, e também qa_score,
--                     qa_hallucination_risk e qa_issues
--   newsroom_runs     HTTP 200, devolve custo em dólar, tokens, contagem de
--                     candidatas e error_message de cada execução
--
-- As demais tabelas do projeto respondem 401 e estão corretas.
--
-- O conteúdo da edição é público depois de publicado, então o dano ali é
-- pequeno. O que não deveria estar aberto é a nota de QA, o risco de
-- alucinação medido, o custo por execução e as mensagens de erro do pipeline.
-- E `news_candidates` está prestes a receber tudo que o sistema coleta.
--
-- ## Por que isso não quebra nada
--
-- A chave anônima não é usada em lugar nenhum do código: não há componente
-- de navegador falando com o Supabase, e as três tabelas só são lidas pelo
-- servidor, com a chave de serviço, que ignora RLS por definição.
--
-- ## Por que a migration original não pegou
--
-- `20260825140000_newsroom_tables.sql` declara exatamente estes comandos. Eles
-- constam no repositório e não estão no banco, o que significa que aquela
-- migration foi aplicada só em parte. Vale desconfiar do mesmo em outras.

alter table public.news_candidates enable row level security;
alter table public.news_editions   enable row level security;
alter table public.newsroom_runs   enable row level security;

revoke all on public.news_candidates from anon, authenticated;
revoke all on public.news_editions   from anon, authenticated;
revoke all on public.newsroom_runs   from anon, authenticated;

-- Conferência: as três devem responder true.
--   select relname, relrowsecurity from pg_class
--    where relname in ('news_candidates','news_editions','newsroom_runs');
