-- Perfis de referência do Instagram, como SINAL de pauta (RF-16, RF-17).
--
-- 05/10/2026. O dono cadastra no painel os perfis que acompanha; o sistema lê
-- os posts recentes de cada um pela Business Discovery da Graph API, acha o que
-- está rendendo acima do normal DAQUELE perfil, extrai o assunto e busca a
-- fonte primária. O post nunca é republicado: é sinal, não fonte.
--
-- ## Por que duas tabelas, e por que a segunda existe
--
-- `instagram_reference_profiles` é o cadastro. `instagram_reference_readings`
-- é o RNF-02: cada leitura fica no banco, com o que foi lido, quando, o
-- resultado e o custo. O usuário `deploy` não alcança log de contêiner, e uma
-- conta que virou pessoal precisa aparecer no painel como tal, com data, e
-- não como um perfil que silenciosamente parou de trazer pauta.
--
-- ## Regras do projeto que esta migration segue
--
-- - `project_id not null` SEM default. Default do projeto semente é dívida:
--   um call site esquecido gravaria no projeto errado sem erro nenhum.
-- - Unicidade e CHECK entram agora, com as tabelas vazias. Depois, um par
--   duplicado impede a constraint e o conserto vira limpeza manual.
-- - `handle` é `not null`, então o UNIQUE (project_id, handle) protege de
--   verdade. UNIQUE sobre coluna nullable não protege nada.
-- - RLS ligada e nada para anon/authenticated, como as tabelas do newsroom:
--   só o servidor lê, com a chave de serviço.
--
-- Remover um perfil não apaga as leituras dele: `profile_id` vira nulo e o
-- `handle` fica na linha, para a auditoria continuar respondendo.
--
-- Shipping desta migration não liga nada. Quem liga é
-- `projects.settings.capacidades.perfis_referencia`, e sem declaração é `off`.

create table if not exists public.instagram_reference_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  handle text not null check (handle ~ '^[a-z0-9._]{1,30}$'),
  note text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_reference_profiles_projeto_handle_key unique (project_id, handle)
);

create table if not exists public.instagram_reference_readings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid references public.instagram_reference_profiles(id) on delete set null,
  handle text not null,
  read_at timestamptz not null default now(),
  modo text not null check (modo in ('dry_run', 'enforce', 'manual')),
  status text not null check (status in (
    'ok',
    'nao_encontrado_ou_nao_business',
    'limite_da_api',
    'token_invalido',
    'sem_credencial',
    'erro'
  )),
  http_status integer,
  error_code integer,
  error_subcode integer,
  error_message text,
  followers_count integer,
  posts_lidos integer not null default 0 check (posts_lidos >= 0),
  linha_de_base numeric,
  sinais jsonb not null default '[]'::jsonb,
  topicos jsonb not null default '[]'::jsonb,
  candidatas integer not null default 0 check (candidatas >= 0),
  aprovadas integer not null default 0 check (aprovadas >= 0),
  custo_usd numeric(12, 6) not null default 0 check (custo_usd >= 0),
  tokens integer not null default 0 check (tokens >= 0),
  etapa text not null,
  ramo text not null,
  observacao text
);

create index if not exists instagram_reference_readings_projeto_handle_idx
  on public.instagram_reference_readings (project_id, handle, read_at desc);

alter table public.instagram_reference_profiles enable row level security;
alter table public.instagram_reference_readings enable row level security;

revoke all on public.instagram_reference_profiles from anon, authenticated;
revoke all on public.instagram_reference_readings from anon, authenticated;

-- Conferência: as duas devem responder true.
--   select relname, relrowsecurity from pg_class
--    where relname in ('instagram_reference_profiles', 'instagram_reference_readings');
