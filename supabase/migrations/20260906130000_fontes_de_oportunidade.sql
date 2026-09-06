-- Fontes de oportunidade nos EUA para o canal social.
--
-- PROPOSTA. Não aplicar sem leitura. Só INSERT, com `on conflict do nothing`:
-- nenhuma fonte existente é alterada, desabilitada ou removida.
--
-- ## Por que estas fontes
--
-- A medição de capacidade mostrou que o gargalo do Instagram não é o filtro
-- editorial, é a oferta. Das 29 fontes em uso, quase todas são consultas do
-- Google News sobre imigração, e a imigração noticiada é majoritariamente
-- restritiva. Num dia medido, 15 pautas de relevância 8, todas dos EUA, todas
-- de imigração, e 12 delas desfavoráveis: a linha editorial remove justamente
-- o que é mais relevante, e o que sobra é notícia doméstica brasileira.
--
-- A correção é ampliar a oferta, não baixar a régua. Estas 37 cobrem mercado
-- de trabalho, expansão de empresa, investimento, agência estadual de
-- desenvolvimento econômico, pesquisa e demanda por profissional.
--
-- Todas foram testadas duas vezes por processos independentes: HTTP 200,
-- corpo de feed válido, três ou mais itens, item mais recente de 2026.
--
-- As generalistas entram com `keywords`, senão afogam o pool. O coletor já
-- aplica esse filtro em `matchesKeywords`.
--
-- ## Efeito medido
--
-- Coleta: de 1710 para 2761 itens por rodada.
-- Grupos únicos no dia: de 88..114 para 97..136.
-- Fonte direta (sem depender de resolver o Google News): quase o dobro.
-- Pool aprovado: mediana de 3 para 4, com as duas maiores notas do dia vindo
-- do feed oficial do USCIS, que é exatamente a pauta que faltava.

insert into public.project_news_sources
  (project_id, source_key, name, type, url, enabled, priority, category, region, keywords)
select v.* from public.projects p
cross join lateral (values
  (p.id, 'indeed-hiring-lab', 'Indeed Hiring Lab', 'rss', 'https://www.hiringlab.org/feed/', true, 2, 'research', 'global', '{}'::text[]),
  (p.id, 'liberty-street-economics-fed-de-nova-york', 'Liberty Street Economics (Fed de Nova York)', 'rss', 'https://libertystreeteconomics.newyorkfed.org/feed/', true, 2, 'research', 'global', array['labor', 'job', 'wage', 'employment', 'hiring', 'productivity', 'growth', 'immigra']::text[]),
  (p.id, 'bureau-of-economic-analysis-bea', 'Bureau of Economic Analysis (BEA)', 'rss', 'https://apps.bea.gov/rss/rss.xml', true, 1, 'gov_us', 'global', '{}'::text[]),
  (p.id, 'census-bureau-indicadores-economicos', 'Census Bureau - Indicadores Economicos', 'rss', 'https://www.census.gov/economic-indicators/indicator.xml', true, 1, 'gov_us', 'global', '{}'::text[]),
  (p.id, 'dallas-fed-atualizacoes-economicas', 'Dallas Fed - Atualizacoes Economicas', 'rss', 'https://www.dallasfed.org/rss/updates.xml', true, 1, 'gov_us', 'global', array['economic indicators', 'employment', 'beige book', 'jobs', 'labor', 'growth']::text[]),
  (p.id, 'atlanta-fed-gdpnow', 'Atlanta Fed - GDPNow', 'rss', 'https://www.atlantafed.org/rss/GDPNow', true, 1, 'gov_us', 'global', '{}'::text[]),
  (p.id, 'dallas-fed-comunicados', 'Dallas Fed - Comunicados', 'rss', 'https://www.dallasfed.org/rss/releases.xml', true, 1, 'gov_us', 'global', array['economic indicators', 'employment', 'beige book', 'jobs', 'labor', 'growth']::text[]),
  (p.id, 'atlanta-fed-wage-growth-tracker', 'Atlanta Fed - Wage Growth Tracker', 'rss', 'https://www.atlantafed.org/rss/WageGrowthTracker', true, 1, 'gov_us', 'global', '{}'::text[]),
  (p.id, 'uscis-alerts-avisos-processuais', 'USCIS Alerts (avisos processuais)', 'rss', 'https://www.uscis.gov/news/rss-feed/22984', true, 1, 'gov_us', 'global', '{}'::text[]),
  (p.id, 'federal-register-atos-da-uscis', 'Federal Register, atos da USCIS', 'rss', 'https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bagencies%5D%5B%5D=u-s-citizenship-and-immigration-services', true, 1, 'gov_us', 'global', array['visa', 'immigration', 'H-1B', 'employment', 'USCIS', 'green card', 'labor certification', 'nonimmigrant']::text[]),
  (p.id, 'federal-register-termo-imigrao', 'Federal Register, termo imigração', 'rss', 'https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bterm%5D=immigration', true, 1, 'gov_us', 'global', array['visa', 'immigration', 'H-1B', 'employment', 'USCIS', 'green card', 'labor certification', 'nonimmigrant']::text[]),
  (p.id, 'bal-berry-appleman-leiden', 'BAL, Berry Appleman & Leiden', 'rss', 'https://www.bal.com/feed/', true, 2, 'us_media', 'global', '{}'::text[]),
  (p.id, 'murthy-law-firm', 'Murthy Law Firm', 'rss', 'https://www.murthy.com/feed/', true, 2, 'us_media', 'global', '{}'::text[]),
  (p.id, 'klasko-immigration-law-partners', 'Klasko Immigration Law Partners', 'rss', 'https://www.klaskolaw.com/feed/', true, 2, 'us_media', 'global', '{}'::text[]),
  (p.id, 'siskind-susser-visalaw-com', 'Siskind Susser, visalaw.com', 'rss', 'https://www.visalaw.com/feed/', true, 2, 'us_media', 'global', '{}'::text[]),
  (p.id, 'area-development-anncios-de-projetos', 'Area Development - Anúncios de Projetos', 'rss', 'https://www.areadevelopment.com/rss/newsitems.xml', true, 2, 'us_media', 'global', '{}'::text[]),
  (p.id, 'site-selection-magazine', 'Site Selection Magazine', 'rss', 'https://siteselection.com/feed/', true, 2, 'us_media', 'global', '{}'::text[]),
  (p.id, 'manufacturing-dive', 'Manufacturing Dive', 'rss', 'https://www.manufacturingdive.com/feeds/news/', true, 2, 'us_media', 'global', array['plant', 'jobs', 'hiring', 'expansion', 'investment', 'factory', 'facility']::text[]),
  (p.id, 'construction-dive', 'Construction Dive', 'rss', 'https://www.constructiondive.com/feeds/news/', true, 2, 'us_media', 'global', array['hiring', 'jobs', 'workforce', 'expansion', 'project', 'investment', 'labor']::text[]),
  (p.id, 'utility-dive', 'Utility Dive', 'rss', 'https://www.utilitydive.com/feeds/news/', true, 2, 'us_media', 'global', array['investment', 'jobs', 'plant', 'expansion', 'construction', 'data center']::text[]),
  (p.id, 'department-of-energy-newsroom', 'Department of Energy - Newsroom', 'rss', 'https://www.energy.gov/rss/newsroom.xml', true, 1, 'gov_us', 'global', array['investment', 'jobs', 'plant', 'project', 'manufacturing', 'construction']::text[]),
  (p.id, 'selectflorida-agncia-de-desenvolvimento-econmico', 'SelectFlorida (agência de desenvolvimento econômico da Flórida)', 'rss', 'https://www.selectflorida.org/feed/', true, 1, 'gov_us', 'global', '{}'::text[]),
  (p.id, 'texas-edc-corporao-de-desenvolvimento-econmico-d', 'Texas EDC (corporação de desenvolvimento econômico do Texas)', 'rss', 'https://businessintexas.com/feed/', true, 1, 'gov_us', 'global', '{}'::text[]),
  (p.id, 'go-biz-califrnia-governor-s-office-of-business-a', 'GO-Biz Califórnia (Governor''s Office of Business and Economic Development)', 'rss', 'https://business.ca.gov/feed/', true, 1, 'gov_us', 'global', '{}'::text[]),
  (p.id, 'edpnc-economic-development-partnership-of-north-', 'EDPNC (Economic Development Partnership of North Carolina)', 'rss', 'https://edpnc.com/feed/', true, 1, 'gov_us', 'global', '{}'::text[]),
  (p.id, 'tnecd-tennessee-department-of-economic-and-commu', 'TNECD (Tennessee Department of Economic and Community Development)', 'rss', 'https://tnecd.com/news/feed/', true, 1, 'gov_us', 'global', '{}'::text[]),
  (p.id, 'go-utah-governor-s-office-of-economic-opportunit', 'Go Utah (Governor''s Office of Economic Opportunity)', 'rss', 'https://business.utah.gov/feed/', true, 1, 'gov_us', 'global', '{}'::text[]),
  (p.id, 'wedc-wisconsin-economic-development-corporation', 'WEDC (Wisconsin Economic Development Corporation)', 'rss', 'https://wedc.org/feed/', true, 1, 'gov_us', 'global', '{}'::text[]),
  (p.id, 'missouri-partnership-agncia-de-atrao-de-investim', 'Missouri Partnership (agência de atração de investimento do Missouri)', 'rss', 'https://www.missouripartnership.com/feed/', true, 1, 'gov_us', 'global', '{}'::text[]),
  (p.id, 'nsf-news-national-science-foundation', 'NSF News (National Science Foundation)', 'rss', 'https://www.nsf.gov/rss/rss_www_news.xml', true, 1, 'gov_us', 'global', '{}'::text[]),
  (p.id, 'ncses-estatsticas-de-cincia-e-engenharia-da-nsf', 'NCSES (estatísticas de ciência e engenharia da NSF)', 'rss', 'https://ncses.nsf.gov/rss', true, 1, 'gov_us', 'global', '{}'::text[]),
  (p.id, 'iie-institute-of-international-education', 'IIE (Institute of International Education)', 'rss', 'https://www.iie.org/feed/', true, 2, 'research', 'global', '{}'::text[]),
  (p.id, 'mit-news', 'MIT News', 'rss', 'https://news.mit.edu/rss/feed', true, 2, 'research', 'global', array['research', 'hiring', 'startup', 'jobs', 'engineer', 'career', 'international', 'graduate', 'fellowship', 'scholarship']::text[]),
  (p.id, 'harvard-gazette', 'Harvard Gazette', 'rss', 'https://news.harvard.edu/gazette/feed/', true, 2, 'research', 'global', array['research', 'economy', 'jobs', 'immigration', 'international', 'graduate', 'career', 'fellowship']::text[]),
  (p.id, 'berkeley-news-uc-berkeley', 'Berkeley News (UC Berkeley)', 'rss', 'https://news.berkeley.edu/feed/', true, 2, 'research', 'global', array['research', 'economy', 'jobs', 'immigration', 'international', 'graduate', 'career']::text[]),
  (p.id, 'georgia-tech-news', 'Georgia Tech News', 'rss', 'https://news.gatech.edu/rss.xml', true, 2, 'research', 'global', array['research', 'hiring', 'jobs', 'engineer', 'career', 'international', 'graduate']::text[]),
  (p.id, 'ieee-spectrum', 'IEEE Spectrum', 'rss', 'https://spectrum.ieee.org/feeds/feed.rss', true, 2, 'tech_media', 'global', array['jobs', 'hiring', 'career', 'engineer shortage', 'workforce', 'salary']::text[])
) as v(project_id, source_key, name, type, url, enabled, priority, category, region, keywords)
where p.slug = 'desbuguei'
on conflict do nothing;
