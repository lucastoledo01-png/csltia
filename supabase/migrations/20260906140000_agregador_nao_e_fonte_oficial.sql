-- Agregador não é fonte oficial.
--
-- PROPOSTA. Não aplicar sem leitura. Um único UPDATE, que não apaga linha
-- nenhuma e não desabilita fonte nenhuma: só muda `priority` de 1 para 2 em
-- oito linhas do Google News.
--
-- ## O defeito
--
-- `deduplicateCandidates` promove a candidata de prioridade 1 a principal do
-- grupo quando a principal atual é prioridade 2. A regra existe para o caso
-- certo: entre o release do órgão e a matéria do veículo que o repercutiu, o
-- release deve ser a fonte publicada.
--
-- Só que oito consultas do Google News estão gravadas com prioridade 1. Para o
-- deduplicador elas são fonte oficial, então quando a mesma notícia chega pelo
-- feed do USCIS e pelo Google News, é o link do agregador que vira o principal
-- e é ele que sai publicado.
--
-- Foi o que apareceu no dry-run: a pauta "Court Order on Diversity Immigrant
-- Visa Program Hold Policy" existia no feed oficial da USCIS e saiu com URL de
-- `news.google.com`.
--
-- Isso contraria a regra do projeto: Google News serve para descobrir, nunca
-- para publicar. A correção não é de código, é de dado.
--
-- Vale para os dois canais, e melhora a newsletter também.

update public.project_news_sources
   set priority = 2
 where url like '%news.google.com%'
   and priority = 1;

-- Conferência, para rodar depois:
--   select name, priority from public.project_news_sources
--    where url like '%news.google.com%' order by priority;
