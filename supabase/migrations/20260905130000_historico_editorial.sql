-- Histórico editorial: o que já foi publicado, em qualquer canal.
--
-- Hoje não existe. `news_candidates` tem a coluna `dedupe_key` e está vazia:
-- ninguém escreve nela. E `rankAndFilterCandidates` aceita uma lista de URLs
-- já publicadas que o serviço nunca passa. Ou seja, a proteção contra
-- repetição existe no formato de duas peças desligadas, e a única coisa que
-- de fato roda compara pautas dentro da coleta do mesmo dia.
--
-- Esta tabela é a fonte de verdade para a verificação. Nada é apagado por ela;
-- ela só acrescenta.
--
-- ## Pauta e distribuição são coisas diferentes
--
-- `story_id` identifica o ACONTECIMENTO. `channel` identifica onde ele foi
-- distribuído. A mesma notícia na newsletter e no Instagram são duas linhas
-- com o mesmo `story_id` e canais diferentes, e isso é reaproveitamento
-- planejado, não repetição.
--
-- `origin_story_id` marca o conteúdo derivado de outro, para o relatório
-- distinguir "post feito a partir da matéria de hoje" de "pauta nova".
--
-- O que é repetição: dois `story_id` diferentes descrevendo o mesmo fato. É
-- isso que as quatro camadas de verificação existem para pegar antes de virar
-- linha aqui.

create table if not exists public.editorial_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,

  -- Identidade do acontecimento. Duas distribuições compartilham o mesmo.
  story_id text not null,
  -- Quando este conteúdo nasceu de outro (post derivado da matéria).
  origin_story_id text,

  channel text not null,
  content_type text not null default 'story',

  title text not null,
  summary text not null default '',

  url text not null default '',
  canonical_url text not null default '',
  domain text not null default '',

  -- {atores, lugares, acontecimento}
  entities jsonb not null default '{}'::jsonb,
  event_fingerprint text not null default '',

  category text not null default '',
  country text not null default '',
  -- positive | neutral | negative, do ponto de vista da linha editorial
  editorial_sentiment text not null default 'neutral',

  -- Vetor como jsonb, comparado em memória. Ver o comentário em
  -- `embeddings.ts` sobre por que não é pgvector ainda.
  embedding jsonb,
  embedding_model text,

  image_url text,
  image_source text,
  image_license text,
  image_author text,
  image_attribution text,
  image_asset_id text,
  image_canonical_url text,

  newsletter_id uuid,
  instagram_post_id uuid,

  -- Como a pauta entrou: coletada hoje ou reconstruída do que já existia.
  provenance text not null default 'pipeline',
  decision_code text,

  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint editorial_history_channel_check
    check (channel in ('newsletter', 'instagram', 'article')),

  constraint editorial_history_sentiment_check
    check (editorial_sentiment in ('positive', 'neutral', 'negative')),

  -- Uma linha por pauta por canal. Republicar a mesma pauta no mesmo canal é
  -- exatamente o que não pode acontecer, então o banco recusa em vez de
  -- confiar que a verificação rodou.
  constraint editorial_history_unico unique (project_id, story_id, channel)
);

-- A consulta quente é "o que saiu nos últimos N dias neste projeto".
create index if not exists editorial_history_janela
  on public.editorial_history (project_id, published_at desc);

create index if not exists editorial_history_canonical
  on public.editorial_history (project_id, canonical_url)
  where canonical_url <> '';

create index if not exists editorial_history_impressao
  on public.editorial_history (project_id, event_fingerprint)
  where event_fingerprint <> '';

-- Foto repetida é o outro tipo de repetição, e tem janela própria.
create index if not exists editorial_history_imagem
  on public.editorial_history (project_id, image_canonical_url)
  where image_canonical_url is not null;

alter table public.editorial_history enable row level security;
revoke all on public.editorial_history from anon, authenticated;
