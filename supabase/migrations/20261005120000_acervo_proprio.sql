-- O acervo de imagens próprio (decisão do dono, 29/09/2026).
--
-- Três tabelas novas e um bucket novo. Nada existente é alterado, apagado ou
-- renomeado, então rodar isto não muda o comportamento de produção: o código
-- só consulta o acervo quando o projeto declarar
-- settings.capacidades.acervo = 'dry_run' ou 'enforce'.
--
-- Regras do projeto que este arquivo segue:
--   - project_id NOT NULL e SEM default (lição de 03/09/2026: default de
--     projeto grava no projeto errado em silêncio);
--   - unicidade e CHECK entram agora, com as tabelas vazias;
--   - nenhuma unicidade sobre coluna nullable;
--   - RLS ligada e nada concedido a anon/authenticated, como as vizinhas
--     (20260906150000_rls_do_newsroom): só o servidor lê, com a chave de serviço.
--
-- Roda inteiro numa transação, e no fim PROVA o estado e aborta se algo não
-- bater. Pode rodar duas vezes: tudo é "if not exists" ou "on conflict".

begin;

-- ---------------------------------------------------------------------------
-- 1. As fotos do acervo
-- ---------------------------------------------------------------------------
-- Uma linha por foto. O nome do arquivo é o metadado
-- (grupo-pais-assunto-detalhe-numero.jpg); tom e orientação são medidos nos
-- pixels pela ingestão. A linha grava EM QUAL repositório o derivado mora, para
-- a mudança de casa (por volta de 2.500 fotos) ser cópia mais update.

create table if not exists public.acervo_imagens (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects(id),
  arquivo              text not null,
  grupo                text not null,
  pais                 text not null,
  assunto              text not null,
  detalhe              text not null default '',
  numero               integer not null,
  tag                  text not null,
  no_catalogo          boolean not null,
  repositorio          text not null,
  bucket               text not null,
  caminho              text not null,
  url_publica          text not null,
  original_repositorio text not null default 'drive',
  original_ref         text,
  largura              integer not null,
  altura               integer not null,
  largura_original     integer not null,
  altura_original      integer not null,
  orientacao           text not null,
  tom                  text not null,
  luminancia           numeric(4,3) not null,
  luminancia_topo      numeric(4,3) not null,
  autor                text not null default '',
  licenca              text not null default 'acervo próprio',
  -- Gravado, nunca barreira: "as travas de licença saem, o registro fica".
  rights_status        text not null default 'verified',
  sha256               text not null,
  status               text not null default 'ativa',
  usos                 integer not null default 0,
  ultimo_uso_em        timestamptz,
  criado_em            timestamptz not null default now(),

  constraint acervo_imagens_projeto_arquivo_key unique (project_id, arquivo),
  constraint acervo_imagens_projeto_sha256_key  unique (project_id, sha256),
  constraint acervo_imagens_repositorio_check   check (repositorio in ('supabase_storage')),
  constraint acervo_imagens_original_check      check (original_repositorio in ('drive')),
  constraint acervo_imagens_orientacao_check    check (orientacao in ('retrato', 'paisagem', 'quadrada')),
  constraint acervo_imagens_tom_check           check (tom in ('claro', 'escuro')),
  constraint acervo_imagens_status_check        check (status in ('ativa', 'retirada')),
  constraint acervo_imagens_rights_check        check (rights_status in ('verified', 'unknown', 'revoked', 'needs_review')),
  -- A régua de país: cena e lugar só da cobertura; retrato (grupo pessoas) de qualquer país.
  constraint acervo_imagens_pais_check          check (grupo = 'pessoas' or pais in ('eua', 'br')),
  constraint acervo_imagens_tag_check           check (tag = grupo || '/' || assunto)
);

create index if not exists acervo_imagens_busca_por_tag
  on public.acervo_imagens (project_id, tag, pais, status, ultimo_uso_em);
create index if not exists acervo_imagens_busca_por_assunto
  on public.acervo_imagens (project_id, assunto, status, ultimo_uso_em);

-- ---------------------------------------------------------------------------
-- 2. A lista de compras: toda tag (ou entidade) pedida e não atendida
-- ---------------------------------------------------------------------------
-- Uma linha por (pauta, tipo, chave): a mesma pauta resolvida duas vezes não é
-- demanda dobrada, e a lista é ordenada justamente por frequência.

create table if not exists public.acervo_faltas (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  story_id   text not null,
  tipo       text not null,
  chave      text not null,
  pais       text not null default '',
  motivo     text not null,
  titulo     text not null default '',
  criado_em  timestamptz not null default now(),

  constraint acervo_faltas_pauta_key    unique (project_id, story_id, tipo, chave),
  constraint acervo_faltas_tipo_check   check (tipo in ('cena', 'entidade')),
  constraint acervo_faltas_motivo_check check (motivo in ('vazio', 'janela'))
);

create index if not exists acervo_faltas_por_data
  on public.acervo_faltas (project_id, criado_em desc);

-- Para o SQL Editor: a lista de produção da última semana, por frequência.
-- `with (...)` no CREATE VIEW deu erro de sintaxe no SQL Editor em 05/10/2026;
-- a opção entra logo abaixo, por ALTER VIEW, que tem o mesmo efeito.
create or replace view public.acervo_lista_de_compras as
select project_id,
       tipo,
       chave,
       pais,
       count(distinct story_id)                              as pautas,
       count(*) filter (where motivo = 'vazio')              as vazio,
       count(*) filter (where motivo = 'janela')             as janela,
       max(criado_em)                                        as ultimo_pedido
  from public.acervo_faltas
 where criado_em >= now() - interval '7 days'
 group by project_id, tipo, chave, pais
 order by pautas desc, ultimo_pedido desc;

alter view public.acervo_lista_de_compras set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 3. A imagem de cada pauta, resolvida uma vez e reusada pelos ramos
-- ---------------------------------------------------------------------------
-- O worker do Instagram é outro contêiner; é por aqui que ele reusa o que o
-- web resolveu. Só é gravada com acervo em 'enforce'.

create table if not exists public.imagem_da_pauta (
  project_id uuid not null references public.projects(id),
  story_id   text not null,
  resultado  jsonb not null,
  fonte      text,
  status     text not null,
  criado_em  timestamptz not null default now(),

  constraint imagem_da_pauta_pkey primary key (project_id, story_id),
  constraint imagem_da_pauta_status_check check (status in ('SELECTED', 'NO_VALID_IMAGE'))
);

-- ---------------------------------------------------------------------------
-- 4. RLS, como as vizinhas
-- ---------------------------------------------------------------------------

alter table public.acervo_imagens  enable row level security;
alter table public.acervo_faltas   enable row level security;
alter table public.imagem_da_pauta enable row level security;

revoke all on public.acervo_imagens          from anon, authenticated;
revoke all on public.acervo_faltas           from anon, authenticated;
revoke all on public.imagem_da_pauta         from anon, authenticated;
revoke all on public.acervo_lista_de_compras from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. O bucket do derivado de 2160x2880
-- ---------------------------------------------------------------------------
-- Separado de public_assets: as artes publicadas são descartáveis, o acervo
-- não. Público para LEITURA, porque a foto vai no e-mail e na arte, e a escrita
-- é só da chave de serviço (que ignora RLS), por isso nenhuma policy de
-- INSERT/UPDATE é criada. 10 MB cobre com folga um JPEG 2160x2880 a 85.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('acervo', 'acervo', true, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Prova do estado final
-- ---------------------------------------------------------------------------

do $$
declare
  faltando text;
begin
  select string_agg(t, ', ') into faltando
    from unnest(array['acervo_imagens', 'acervo_faltas', 'imagem_da_pauta']) as t
   where not exists (
     select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relrowsecurity
   );
  if faltando is not null then
    raise exception 'FALHOU: tabela ausente ou com RLS desligada: %', faltando;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name in ('acervo_imagens', 'acervo_faltas', 'imagem_da_pauta')
       and column_name = 'project_id'
       and (is_nullable <> 'NO' or column_default is not null)
  ) then
    raise exception 'FALHOU: project_id precisa ser NOT NULL e sem default';
  end if;

  if not exists (select 1 from storage.buckets where id = 'acervo' and public) then
    raise exception 'FALHOU: bucket acervo ausente ou não público';
  end if;

  raise notice 'acervo próprio: três tabelas com RLS, project_id sem default, bucket público';
end $$;

commit;

-- Conferência depois de rodar (deve devolver 0 linhas e nenhum erro):
--   select * from public.acervo_lista_de_compras limit 5;
--
-- Para LIGAR, depois de ingerir as fotos (comece pelo ensaio):
--   update public.projects
--      set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{capacidades,acervo}', '"dry_run"', true)
--    where id = '00000000-0000-4000-8000-000000000001';
