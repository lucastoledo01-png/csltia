-- A linha quente do eua.journal (06/10/2026): as decisões do dono sobre a
-- auditoria docs/auditorias/noticia-quente-2026-10-06.md, num arquivo só.
--
-- Para o DONO rodar no SQL Editor, depois do deploy do código desta data.
-- Nada aqui foi executado. Tudo é idempotente: rodar duas vezes dá o mesmo
-- resultado. Uma transação só: ou entra tudo, ou nada.
--
-- O que faz, na ordem:
--   1. Projeto: política brasileira em "eleicao" (abertura TEMPORÁRIA do
--      segundo turno), o calor em "dry_run" e o ciclo da tarde do Instagram
--      em "dry_run", com a configuração dele explícita para o painel.
--   2. Fontes quentes: insere as 27 de 2026-10-06-fontes-quentes.sql que
--      faltarem e LIGA os dois grupos aprovados (14 fontes). As outras 13
--      entram desligadas, como estavam no arquivo de origem. Cada uma das 14
--      respondeu HTTP 200 com XML em 06/10/2026 com o agente honesto
--      (eua.journal/1.0); Business Insider é Atom, que o coletor lê.
--   3. Mantém ligadas as buscas do Google News (decisão do dono).
--
-- Ordem recomendada depois de rodar: ler por uns dias os eventos
-- `calor_da_selecao` e `quente_da_tarde` em platform_events; só então trocar
-- calor e quente_da_tarde para "enforce".
--
-- Para FECHAR a abertura eleitoral depois do segundo turno:
--   update public.projects
--   set settings = jsonb_set(settings, '{linha,politica_brasileira}', '"so_mercado"'), updated_at = now()
--   where id = '00000000-0000-4000-8000-000000000001';

begin;

-- 1. O projeto ----------------------------------------------------------------

update public.projects
set settings =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(settings, '{}'::jsonb),
            '{linha}', coalesce(settings -> 'linha', '{}'::jsonb)
          ),
          '{linha,politica_brasileira}', '"eleicao"'
        ),
        '{capacidades}', coalesce(settings -> 'capacidades', '{}'::jsonb)
      ),
      '{capacidades,calor}', '"dry_run"'
    ),
    '{capacidades,quente_da_tarde}', '"dry_run"'
  )
  -- A configuração do ciclo da tarde, com os padrões do código, só se ainda
  -- não existir: rodar de novo não desfaz um ajuste feito no painel.
  || case
       when settings ? 'quente_da_tarde' then '{}'::jsonb
       else jsonb_build_object(
         'quente_da_tarde',
         jsonb_build_object('horario', '15:30', 'janela_horas', 10, 'calor_minimo', 35, 'maximo_posts', 2)
       )
     end,
  updated_at = now()
where id = '00000000-0000-4000-8000-000000000001';

-- 2. As fontes quentes ----------------------------------------------------------

insert into public.project_news_sources
  (project_id, source_key, name, company_name, type, url, enabled, priority, category, region, keywords)
select p.id, v.source_key, v.name, v.company_name, 'rss', v.url, v.ligar, v.priority, v.category, v.region, '{}'::text[]
from public.projects p
cross join (values
  -- Grupo 1, LIGADO: negócio e tecnologia dos EUA, e o mercado brasileiro
  ('cnbc-technology', 'CNBC, tecnologia', 'CNBC', 'https://www.cnbc.com/id/19854910/device/rss/rss.html', 1, 'tecnologia', 'eua', true),
  ('cnbc-markets', 'CNBC, mercados', 'CNBC', 'https://www.cnbc.com/id/15839069/device/rss/rss.html', 2, 'economia', 'eua', true),
  ('fortune', 'Fortune', 'Fortune', 'https://fortune.com/feed/fortune-feeds/?id=3230629', 2, 'economia', 'eua', true),
  ('business-insider', 'Business Insider', 'Business Insider', 'https://feeds.businessinsider.com/custom/all', 2, 'economia', 'eua', true),
  ('semafor', 'Semafor', 'Semafor', 'https://www.semafor.com/rss.xml', 2, 'politica', 'eua', true),
  ('bloomberg-linea-br', 'Bloomberg Línea Brasil', 'Bloomberg Línea', 'https://www.bloomberglinea.com.br/arc/outboundfeeds/rss/?outputType=xml', 2, 'br_media', 'br', true),
  ('estadao-economia', 'Estadão, economia', 'Estadão', 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/economia/', 2, 'br_media', 'br', true),
  ('exame', 'Exame', 'Exame', 'https://exame.com/feed/', 2, 'br_media', 'br', true),
  ('neofeed', 'NeoFeed', 'NeoFeed', 'https://neofeed.com.br/feed/', 2, 'br_media', 'br', true),
  -- Grupo 2, LIGADO: política brasileira, agora dentro da linha
  ('cnbc-politics', 'CNBC, política', 'CNBC', 'https://www.cnbc.com/id/10000113/device/rss/rss.html', 1, 'politica', 'eua', true),
  ('estadao-politica', 'Estadão, política', 'Estadão', 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/politica/', 2, 'br_media', 'br', true),
  ('folha-poder', 'Folha de S.Paulo, Poder', 'Folha de S.Paulo', 'https://feeds.folha.uol.com.br/poder/rss091.xml', 2, 'br_media', 'br', true),
  ('poder360', 'Poder360', 'Poder360', 'https://www.poder360.com.br/feed/', 2, 'br_media', 'br', true),
  ('cnn-brasil', 'CNN Brasil', 'CNN Brasil', 'https://www.cnnbrasil.com.br/feed/', 2, 'br_media', 'br', true),
  -- Os demais da lista de 06/10, DESLIGADOS como no arquivo de origem
  ('fox-business', 'Fox Business', 'Fox Business', 'https://moxie.foxbusiness.com/google-publisher/latest.xml', 2, 'economia', 'eua', false),
  ('politico-top', 'Politico, manchetes', 'Politico', 'https://rss.politico.com/politics-news.xml', 2, 'politica', 'eua', false),
  ('nyt-politics', 'New York Times, política', 'The New York Times', 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml', 2, 'politica', 'eua', false),
  ('nyt-technology', 'New York Times, tecnologia', 'The New York Times', 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', 2, 'tecnologia', 'eua', false),
  ('wapo-business', 'Washington Post, negócios', 'The Washington Post', 'https://feeds.washingtonpost.com/rss/business', 2, 'economia', 'eua', false),
  ('wapo-politics', 'Washington Post, política', 'The Washington Post', 'https://feeds.washingtonpost.com/rss/politics', 2, 'politica', 'eua', false),
  ('bbc-business', 'BBC, negócios', 'BBC', 'https://feeds.bbci.co.uk/news/business/rss.xml', 2, 'economia', 'global', false),
  ('bbc-us-canada', 'BBC, EUA e Canadá', 'BBC', 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', 2, 'politica', 'eua', false),
  ('estadao-internacional', 'Estadão, internacional', 'Estadão', 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/internacional/', 2, 'br_media', 'br', false),
  ('folha-tec', 'Folha de S.Paulo, tecnologia', 'Folha de S.Paulo', 'https://feeds.folha.uol.com.br/tec/rss091.xml', 2, 'br_media', 'br', false),
  ('g1-tecnologia', 'G1 Tecnologia', 'G1', 'https://g1.globo.com/rss/g1/tecnologia/', 2, 'br_media', 'br', false),
  ('valor-empresas', 'Valor Econômico, empresas', 'Valor Econômico', 'https://pox.globo.com/rss/valor/empresas/', 2, 'br_media', 'br', false),
  ('valor-financas', 'Valor Econômico, finanças', 'Valor Econômico', 'https://pox.globo.com/rss/valor/financas/', 2, 'br_media', 'br', false)
) as v(source_key, name, company_name, url, priority, category, region, ligar)
where p.id = '00000000-0000-4000-8000-000000000001'
  and not exists (
    select 1 from public.project_news_sources s
    where s.project_id = p.id and s.source_key = v.source_key
  );

-- Quem já existia (por ter rodado 2026-10-06-fontes-quentes.sql antes, com
-- tudo desligado) é ligado aqui. Os outros 13 não são tocados.
update public.project_news_sources
set enabled = true, updated_at = now()
where project_id = '00000000-0000-4000-8000-000000000001'
  and source_key in (
    'cnbc-technology', 'cnbc-markets', 'fortune', 'business-insider', 'semafor',
    'bloomberg-linea-br', 'estadao-economia', 'exame', 'neofeed',
    'cnbc-politics', 'estadao-politica', 'folha-poder', 'poder360', 'cnn-brasil'
  )
  and not enabled;

-- 3. As buscas do Google News continuam LIGADAS, por decisão do dono
-- (06/10/2026): nem as fixas desta tabela nem as de tendência são desligadas.

commit;

-- Conferência -------------------------------------------------------------------

select
  settings -> 'linha' ->> 'politica_brasileira' as politica_brasileira,
  settings -> 'capacidades' ->> 'calor' as calor,
  settings -> 'capacidades' ->> 'quente_da_tarde' as quente_da_tarde,
  settings -> 'quente_da_tarde' as config_da_tarde,
  (select count(*) from public.project_news_sources s
     where s.project_id = p.id and s.enabled) as fontes_ativas,
  (select count(*) from public.project_news_sources s
     where s.project_id = p.id and s.enabled and s.url like 'https://news.google.com/%') as google_news_ativas,
  (select string_agg(s.source_key, ', ' order by s.source_key) from public.project_news_sources s
     where s.project_id = p.id and s.enabled
       and s.source_key in (
         'cnbc-technology', 'cnbc-markets', 'fortune', 'business-insider', 'semafor',
         'bloomberg-linea-br', 'estadao-economia', 'exame', 'neofeed',
         'cnbc-politics', 'estadao-politica', 'folha-poder', 'poder360', 'cnn-brasil'
       )) as quentes_ligadas
from public.projects p
where p.id = '00000000-0000-4000-8000-000000000001';
-- Esperado: eleicao | dry_run | dry_run | {"horario": "15:30", ...} | 64 (50 + 14) | 7 | as 14 chaves.

-- As buscas de TENDÊNCIA do Google News (busca-dinamica.ts) não estão nesta
-- tabela, e a candidata não grava de que busca veio (source_key é nulo nas
-- 3.857 candidatas da semana), então elas não dão para medir em separado. O
-- que dá: das 1.734 candidatas do Google News em 7 dias (fixas e de tendência
-- juntas), nenhuma foi aprovada, e as 361 que passaram da linha morreram em
-- poucos fatos (320) ou fonte não resolvida (41), porque o link do agregador
-- não chega à matéria. A tendência continua entrando pelo calor, que lê o
-- Google Trends e a Wikipédia direto. Para desligá-las também, no EasyPanel
-- (serviço web): EDITORIAL_BUSCA_DINAMICA=off.
