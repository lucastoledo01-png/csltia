-- Biblioteca de imagens licenciadas, por entidade.
--
-- A fase 1 guardava a URL da foto na linha da publicação e mais nada. Isso
-- responde "que foto saiu naquela edição" e não responde nada do que importa
-- agora: de quem é a foto, sob que licença ela entrou, que página prova isso,
-- e que outras fotos válidas existem da mesma pessoa para a próxima vez.
--
-- Uma linha aqui é um ARQUIVO validado de uma ENTIDADE, não uma publicação. A
-- mesma foto do Trump serve dez edições e continua sendo uma linha, com
-- `usage_count` subindo.
--
-- Regra que a estrutura impõe: nunca existe imagem sem origem e sem licença.
-- `source_page_url`, `license` e `rights_status` são NOT NULL de propósito.

create table if not exists public.visual_assets (
  id uuid primary key default gen_random_uuid(),

  -- Identidade visual
  entity_name text not null,
  entity_normalized text not null,
  entity_type text not null,
  primary_entity text,
  primary_entity_type text,

  -- Origem
  source text not null,
  source_asset_id text not null,
  source_page_url text not null,
  image_url text not null,

  -- Direitos
  author text not null default '',
  license text not null,
  license_url text not null default '',
  attribution text not null default '',
  rights_statement text not null default '',
  rights_status text not null default 'unknown',
  rights_checked_at timestamptz,
  source_last_checked_at timestamptz,

  -- Arquivo
  width integer not null default 0,
  height integer not null default 0,
  mime_type text not null default '',
  storage_path text,
  perceptual_hash text,
  content_hash text,

  -- Uso
  image_relevance_score numeric not null default 0,
  status text not null default 'active',
  usage_count integer not null default 0,
  last_used_at timestamptz,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,

  constraint visual_assets_rights_status_check
    check (rights_status in ('verified', 'unknown', 'revoked', 'needs_review')),

  constraint visual_assets_status_check
    check (status in ('active', 'blocked', 'retired')),

  -- O mesmo arquivo da mesma origem é uma linha só. É esta chave que faz a
  -- biblioteca crescer sem duplicar quando duas pautas acham a mesma foto.
  constraint visual_assets_unico_por_origem unique (source, source_asset_id)
);

-- A consulta quente é "que fotos válidas eu tenho desta entidade".
create index if not exists visual_assets_por_entidade
  on public.visual_assets (entity_normalized, status, rights_status);

create index if not exists visual_assets_por_uso
  on public.visual_assets (entity_normalized, last_used_at desc nulls first);

create index if not exists visual_assets_por_url
  on public.visual_assets (image_url);

alter table public.visual_assets enable row level security;
revoke all on public.visual_assets from anon, authenticated;

-- Liga a publicação ao asset. As outras colunas de imagem já existem desde a
-- fase 1 e continuam valendo; esta diz QUAL arquivo da biblioteca foi usado.
alter table public.editorial_history
  add column if not exists visual_asset_id uuid references public.visual_assets(id);
