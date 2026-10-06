-- Fontes quentes para o eua.journal (06/10/2026).
--
-- ATUALIZADO no mesmo dia: o dono aprovou os dois grupos (e a política
-- brasileira entrou na linha). Rode 2026-10-06-linha-quente.sql, que insere
-- estas mesmas fontes, LIGA os dois grupos e desliga as buscas fixas do
-- Google News. Este arquivo fica como registro da conferência das URLs; rodar
-- os dois, em qualquer ordem, dá o mesmo resultado.
--
-- Para o DONO rodar no SQL Editor. Nada aqui foi executado.
--
-- Todas entram DESLIGADAS (enabled = false). O motivo está na auditoria
-- docs/auditorias/noticia-quente-2026-10-06.md: o pool da semana JÁ tinha
-- Trump, Musk, Bezos, o acordo de IA na Casa Branca e o dólar abaixo de
-- R$ 5, e a linha os recusou. Ligar fonte nova sem decidir a linha só paga
-- classificação de mais candidatas recusadas. Cada URL abaixo foi conferida
-- em 06/10/2026 com o agente honesto do projeto (eua.journal/1.0): HTTP 200,
-- XML de RSS e itens das últimas 24 horas.
--
-- Não entram, e por quê:
--   Reuters        sem RSS público; o sitemap de notícias não é RSS e o coletor não o lê
--   AP             403 para agente declarado
--   Axios, seções  404; o feed geral de Axios já está ativo
--   CNN Brasil, seções   404; só o feed geral responde (ele está abaixo)
--   InfoMoney, seções    feed vazio; o geral já está ativo
--   Metrópoles     o feed geral é moda e estilo de vida; o de política estava parado havia dois dias
--   Yahoo Finance  404
--   Forbes Brasil  topo do feed é moda
--   ABC, Guardian US     ABC mistura esporte; Guardian US é quase todo notícia ruim dos EUA, que a linha recusa

insert into public.project_news_sources
  (project_id, source_key, name, company_name, type, url, enabled, priority, category, region, keywords)
select p.id, v.source_key, v.name, v.company_name, 'rss', v.url, false, v.priority, v.category, v.region, '{}'::text[]
from public.projects p
cross join (values
  -- EUA: negócios, tecnologia e política com gente conhecida no centro
  ('cnbc-politics', 'CNBC, política', 'CNBC', 'https://www.cnbc.com/id/10000113/device/rss/rss.html', 1, 'politica', 'eua'),
  ('cnbc-technology', 'CNBC, tecnologia', 'CNBC', 'https://www.cnbc.com/id/19854910/device/rss/rss.html', 1, 'tecnologia', 'eua'),
  ('cnbc-markets', 'CNBC, mercados', 'CNBC', 'https://www.cnbc.com/id/15839069/device/rss/rss.html', 2, 'economia', 'eua'),
  ('fortune', 'Fortune', 'Fortune', 'https://fortune.com/feed/fortune-feeds/?id=3230629', 2, 'economia', 'eua'),
  ('business-insider', 'Business Insider', 'Business Insider', 'https://feeds.businessinsider.com/custom/all', 2, 'economia', 'eua'),
  ('semafor', 'Semafor', 'Semafor', 'https://www.semafor.com/rss.xml', 2, 'politica', 'eua'),
  ('fox-business', 'Fox Business', 'Fox Business', 'https://moxie.foxbusiness.com/google-publisher/latest.xml', 2, 'economia', 'eua'),
  ('politico-top', 'Politico, manchetes', 'Politico', 'https://rss.politico.com/politics-news.xml', 2, 'politica', 'eua'),
  ('nyt-politics', 'New York Times, política', 'The New York Times', 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml', 2, 'politica', 'eua'),
  ('nyt-technology', 'New York Times, tecnologia', 'The New York Times', 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', 2, 'tecnologia', 'eua'),
  ('wapo-business', 'Washington Post, negócios', 'The Washington Post', 'https://feeds.washingtonpost.com/rss/business', 2, 'economia', 'eua'),
  ('wapo-politics', 'Washington Post, política', 'The Washington Post', 'https://feeds.washingtonpost.com/rss/politics', 2, 'politica', 'eua'),
  ('bbc-business', 'BBC, negócios', 'BBC', 'https://feeds.bbci.co.uk/news/business/rss.xml', 2, 'economia', 'global'),
  ('bbc-us-canada', 'BBC, EUA e Canadá', 'BBC', 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', 2, 'politica', 'eua'),
  -- Brasil: mercado, dólar e a relação com os EUA
  ('bloomberg-linea-br', 'Bloomberg Línea Brasil', 'Bloomberg Línea', 'https://www.bloomberglinea.com.br/arc/outboundfeeds/rss/?outputType=xml', 2, 'br_media', 'br'),
  ('estadao-economia', 'Estadão, economia', 'Estadão', 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/economia/', 2, 'br_media', 'br'),
  ('estadao-politica', 'Estadão, política', 'Estadão', 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/politica/', 2, 'br_media', 'br'),
  ('estadao-internacional', 'Estadão, internacional', 'Estadão', 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/internacional/', 2, 'br_media', 'br'),
  ('cnn-brasil', 'CNN Brasil', 'CNN Brasil', 'https://www.cnnbrasil.com.br/feed/', 2, 'br_media', 'br'),
  ('poder360', 'Poder360', 'Poder360', 'https://www.poder360.com.br/feed/', 2, 'br_media', 'br'),
  ('folha-poder', 'Folha de S.Paulo, Poder', 'Folha de S.Paulo', 'https://feeds.folha.uol.com.br/poder/rss091.xml', 2, 'br_media', 'br'),
  ('folha-tec', 'Folha de S.Paulo, tecnologia', 'Folha de S.Paulo', 'https://feeds.folha.uol.com.br/tec/rss091.xml', 2, 'br_media', 'br'),
  ('g1-tecnologia', 'G1 Tecnologia', 'G1', 'https://g1.globo.com/rss/g1/tecnologia/', 2, 'br_media', 'br'),
  ('exame', 'Exame', 'Exame', 'https://exame.com/feed/', 2, 'br_media', 'br'),
  ('valor-empresas', 'Valor Econômico, empresas', 'Valor Econômico', 'https://pox.globo.com/rss/valor/empresas/', 2, 'br_media', 'br'),
  ('valor-financas', 'Valor Econômico, finanças', 'Valor Econômico', 'https://pox.globo.com/rss/valor/financas/', 2, 'br_media', 'br'),
  ('neofeed', 'NeoFeed', 'NeoFeed', 'https://neofeed.com.br/feed/', 2, 'br_media', 'br')
) as v(source_key, name, company_name, url, priority, category, region)
where p.slug = 'desbuguei'
  and not exists (
    select 1 from public.project_news_sources s
    where s.project_id = p.id and s.source_key = v.source_key
  );

-- Primeiro grupo para ligar, recomendado: negócio e tecnologia dos EUA com
-- gente conhecida, e o mercado brasileiro que mexe com o dólar. Cabe na linha
-- de hoje sem decisão nova.
--
-- update public.project_news_sources s set enabled = true, updated_at = now()
-- from public.projects p
-- where s.project_id = p.id and p.slug = 'desbuguei'
--   and s.source_key in ('cnbc-technology', 'cnbc-markets', 'fortune', 'business-insider',
--                        'semafor', 'bloomberg-linea-br', 'estadao-economia', 'exame', 'neofeed');
--
-- Segundo grupo, só se o dono decidir que política brasileira entra:
--   'cnbc-politics', 'estadao-politica', 'folha-poder', 'poder360', 'cnn-brasil'
--
-- E, para pagar a conta: as buscas FIXAS do Google News trouxeram 248
-- candidatas por dia e nenhuma aprovada na semana medida.
--
-- update public.project_news_sources s set enabled = false, updated_at = now()
-- from public.projects p
-- where s.project_id = p.id and p.slug = 'desbuguei'
--   and s.url like 'https://news.google.com/%' and s.enabled;
