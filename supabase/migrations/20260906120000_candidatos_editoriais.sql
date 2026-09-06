-- Camada de candidatos editoriais, e a ligação do post social com ela.
--
-- PROPOSTA. Não aplicar sem leitura. Nenhum comando aqui apaga dado: são
-- `add column if not exists` e troca de CHECK que só amplia o conjunto de
-- valores aceitos. A única alteração de forma é a chave única de
-- `news_candidates`, e ela é segura porque a tabela tem zero linhas hoje.
--
-- ## Por que evoluir `news_candidates` em vez de criar tabela nova
--
-- Ela já existe desde a primeira migration do newsroom, nunca recebeu uma
-- linha e nunca foi lida por nenhum código: a única menção a ela no
-- repositório é um comentário em `newsroom-service.ts` que a cita como o
-- exemplo do que acontece quando se cria uma coluna que ninguém alimenta.
-- Criar uma segunda tabela com a mesma função deixaria duas, e uma delas
-- continuaria vazia.
--
-- O schema atual é da vertical de IA: `category` com default 'ia', nenhum
-- `project_id`, nenhum país, nenhuma entidade. O que segue é o que falta para
-- ela representar uma candidata já processada pela Fase 1.
--
-- ## O que esta camada NÃO é
--
-- Não é banco de notícias e não é fila de publicação. Uma linha aqui é uma
-- CANDIDATA classificada uma vez. Quem publica é `social_posts` (Instagram) e
-- `news_editions` (newsletter), e os dois apontam para cá. É o que evita
-- classificar a mesma matéria três vezes em três pipelines.

-- ---------------------------------------------------------------------------
-- 1. Identidade e projeto
-- ---------------------------------------------------------------------------

alter table public.news_candidates
  -- Sem isto a tabela é monoprojeto, e o sistema não é.
  add column if not exists project_id uuid references public.projects(id),
  -- Mesma identidade da Fase 1: `gerarStoryId` em editorial/history.ts.
  add column if not exists story_id text,
  add column if not exists canonical_url text,
  add column if not exists source_domain text,
  -- Google News é descoberta. Sem resolver para o veículo, não publica.
  add column if not exists source_resolved boolean not null default false,
  add column if not exists summary text not null default '';

-- A unicidade era global por URL. Com multi-projeto, a mesma matéria pode ser
-- candidata de duas publicações diferentes. Seguro agora: a tabela está vazia.
alter table public.news_candidates drop constraint if exists news_candidates_url_key;
create unique index if not exists news_candidates_projeto_url
  on public.news_candidates (project_id, url);

-- ---------------------------------------------------------------------------
-- 2. O que a classificação da Fase 1 já produz
--
-- Um para um com `ClassificacaoSchema` em editorial/classificador.ts. Os nomes
-- ficam em inglês porque a tabela já é assim; o mapeamento está no comentário.
-- ---------------------------------------------------------------------------

alter table public.news_candidates
  -- pais: EUA | Brasil | outro
  add column if not exists country text,
  -- imigracao: a pauta trata de visto, status ou vida do imigrante
  add column if not exists is_immigration boolean,
  -- leitura: oportunidade | neutra | desfavoravel (efeito do FATO no leitor)
  add column if not exists editorial_reading text,
  -- eixo: oportunidade | processo | decisao_judicial | custo_de_vida |
  --       deterioracao_brasil | outro
  add column if not exists editorial_axis text,
  -- natureza: official_action | political_statement | outro
  add column if not exists event_nature text,
  -- relevancia: 0 a 10
  add column if not exists relevance numeric,
  add column if not exists actors jsonb not null default '[]'::jsonb,
  add column if not exists places jsonb not null default '[]'::jsonb,
  add column if not exists organizations jsonb not null default '[]'::jsonb,
  add column if not exists event_terms jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. Identidade de acontecimento e de assunto
--
-- `event_fingerprint` já existe em `editorial_history` e é gerado por
-- `impressaoDoAcontecimento`. Repetir a mesma coluna aqui é de propósito: é o
-- que permite comparar uma candidata de hoje contra o que já foi publicado sem
-- recomputar nada.
--
-- `topic_id` é novo e existe para o item de diversidade: EB-2 NIW, green card
-- profissional e caso NIW do USCIS são três títulos e um assunto só.
-- ---------------------------------------------------------------------------

alter table public.news_candidates
  add column if not exists event_fingerprint text,
  add column if not exists topic_id text,
  -- O vetor mora aqui como jsonb porque pgvector ainda não está instalado.
  -- Guardar o vetor evita reembeddar a mesma pauta em cada canal.
  add column if not exists embedding jsonb,
  add column if not exists embedding_model text;

-- ---------------------------------------------------------------------------
-- 4. Decisão editorial e pacote factual
-- ---------------------------------------------------------------------------

alter table public.news_candidates
  add column if not exists editorial_score numeric,
  add column if not exists decision_reason text,
  add column if not exists classification_status text not null default 'pending',
  add column if not exists classified_at timestamptz,
  add column if not exists enrichment_status text not null default 'pending',
  add column if not exists enriched_chars integer not null default 0,
  -- O pacote factual é grande e é reaproveitado por todos os canais. Fica em
  -- jsonb aqui, e `social_posts` aponta para a candidata em vez de copiar.
  add column if not exists factual_package jsonb,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

-- O CHECK antigo só aceitava os estados da coleta. A camada editorial precisa
-- distinguir "reprovada pela linha" de "cortada por teto de composição", que
-- hoje é justamente o corte que desaparece sem registro.
alter table public.news_candidates drop constraint if exists news_candidates_status_check;
alter table public.news_candidates
  add constraint news_candidates_status_check check (status in (
    'collected',        -- coletada, ainda não classificada
    'classified',       -- classificada, ainda não decidida
    'approved',         -- passou na linha editorial
    'selected',         -- entrou numa edição ou num post
    'rejected',         -- reprovada pela linha editorial, ver decision_reason
    'capped',           -- aprovada, cortada por teto de composição do dia
    'duplicate',
    'filtered',
    'too_old',
    'already_published'
  ));

create index if not exists news_candidates_projeto_dia
  on public.news_candidates (project_id, published_at desc, status);
create index if not exists news_candidates_story
  on public.news_candidates (project_id, story_id);
create index if not exists news_candidates_fingerprint
  on public.news_candidates (project_id, event_fingerprint);
create index if not exists news_candidates_topico
  on public.news_candidates (project_id, topic_id);

-- ---------------------------------------------------------------------------
-- 5. `social_posts` passa a apontar para a candidata
--
-- O post social guarda a EXECUÇÃO: qual candidata, em que slot, com que arte,
-- com que resultado da guarda. Não guarda a matéria de novo.
-- ---------------------------------------------------------------------------

alter table public.social_posts
  add column if not exists candidate_id uuid references public.news_candidates(id),
  add column if not exists story_id text,
  add column if not exists topic_id text,
  add column if not exists event_fingerprint text,
  -- Reaproveitamento planejado entre canais: o post do Instagram diz de qual
  -- pauta da newsletter ele nasceu. Mesmo par de campos de `editorial_history`.
  add column if not exists origin_channel text,
  add column if not exists origin_story_id text,
  add column if not exists editorial_score numeric,
  add column if not exists visual_asset_id uuid references public.visual_assets(id),
  add column if not exists social_guard_status text,
  add column if not exists social_guard_reasons jsonb not null default '[]'::jsonb,
  add column if not exists scheduled_slot text,
  add column if not exists generation_version text;

-- ---------------------------------------------------------------------------
-- 6. Publicação na Meta: registrar a intenção antes de agir
--
-- Hoje o worker publica e depois grava. Entre o `media_publish` que deu certo
-- e o UPDATE da linha existe uma janela em que o post existe no Instagram e
-- não existe no banco, e o próximo giro republica. Pior: os três UPDATEs do
-- worker descartam o erro do supabase-js, então a falha é silenciosa.
--
-- `provider_creation_id` é o identificador do container, que existe ANTES do
-- publish. Gravá-lo antes de publicar transforma "não sei se publiquei" em
-- "sei qual container eu tentei publicar".
-- ---------------------------------------------------------------------------

alter table public.social_posts
  add column if not exists provider_creation_id text,
  add column if not exists publish_attempted_at timestamptz;

-- Duas linhas nunca reivindicam a mesma mídia publicada.
create unique index if not exists social_posts_media_unica
  on public.social_posts (provider_post_id)
  where provider_post_id is not null;

create index if not exists social_posts_por_story
  on public.social_posts (project_id, story_id);
create index if not exists social_posts_por_candidata
  on public.social_posts (candidate_id);
