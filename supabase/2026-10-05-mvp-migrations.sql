-- MVP do eua.journal: as quatro migrations de 05/10/2026, na ordem, num arquivo so.
--
-- Para colar inteiro no SQL Editor. Rodar isto NAO liga nada: cada parte fica
-- atras de uma capacidade do projeto que continua desligada. Cada bloco tem a
-- propria transacao e confere o proprio resultado; se um falhar, os anteriores
-- ficam e o arquivo pode ser rodado de novo (todos usam if not exists).

-- ======================================================================
-- 20261005120000_acervo_proprio.sql
-- ======================================================================

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

-- ======================================================================
-- 20261005120000_fila_de_aprovacao.sql
-- ======================================================================

-- Fila de aprovação, portão de publicação e memória de reprovação (05/10/2026).
--
-- RF-20 a RF-29 do PRD do MVP. Até esta data o eua.journal publicava sozinho;
-- a fila é a peça que põe uma pessoa entre a pauta e o ar. O código que usa
-- estas tabelas está em `src/lib/server/aprovacao/` e só as lê quando o
-- projeto declara `settings.capacidades.aprovacao` diferente de `off`. Rodar
-- esta migration NÃO liga nada: liga quem trocar a capacidade no painel.
--
-- ## O que entra
--
--   aprovacoes          uma linha por peça e por projeto, com o hash da versão
--                       aprovada. É o "registro de aprovação" do RF-20.
--   reprovacoes         a memória: etapa culpada, motivo do editor, texto
--                       reprovado. Alimenta o bloco "não repetir" dos prompts.
--   regras_propostas    erro repetido três vezes vira PROPOSTA de regra fixa.
--                       Nada vira regra sem o dono aprovar.
--   social_posts        o CHECK de status ganha `cancelled` (RF-28). O
--                       incidente de 16/09 ("não existe post cancelado, só
--                       rascunho") pediu isto para "quando a tabela for
--                       alterada por outro motivo". É este.
--
-- ## Por que as constraints entram agora
--
-- As três tabelas nascem vazias, e unicidade e CHECK entram na janela em que a
-- tabela está vazia ("Constraint acrescentada com a tabela vazia não pode
-- falhar", aprendizados-e-incidentes.md). `project_id` é `not null` SEM
-- default (RNF-12, e "DEFAULT de project_id é dívida").
--
-- ## O CHECK de social_posts
--
-- Medido em produção em 05/10/2026, pelo PostgREST: os status presentes são
-- draft (7), failed (8), published (88) e scheduled (4). O CHECK novo contém
-- todos eles, mais `generated` e `approved`, que o worker usa e a migration
-- original declarava. A pré-condição abaixo aborta tudo se aparecer um status
-- fora da lista, em vez de deixar o ALTER falhar no meio.
--
-- Termina num `select` de propósito: se o SQL Editor devolver as linhas, rodou.

begin;

do $$
declare
  fora text;
begin
  select string_agg(distinct status, ', ') into fora
    from public.social_posts
   where status not in ('draft', 'generated', 'approved', 'scheduled', 'published', 'failed', 'cancelled');
  if fora is not null then
    raise exception 'FALHOU: social_posts tem status fora da lista nova: %', fora;
  end if;
end $$;

alter table public.social_posts
  drop constraint if exists social_posts_status_check;

alter table public.social_posts
  add constraint social_posts_status_check check (status in (
    'draft',       -- rascunho, ou peça na fila de aprovação ainda não liberada
    'generated',   -- vaga reivindicada pelo worker
    'approved',    -- herdado do desenho original
    'scheduled',   -- na vaga do worker: só a fila (ou a fila desligada) grava isto
    'published',
    'failed',
    'cancelled'    -- cancelado pelo editor ou descartado pela fila, motivo em error_message
  ));

create table if not exists public.aprovacoes (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id),
  ramo           text not null check (ramo in ('newsletter', 'artigo', 'post')),
  -- A peça: social_posts.id, news_editions.id ou articles.id, conforme o ramo.
  peca_id        uuid not null,
  -- SHA-256 da versão exata aprovada. Ver aprovacao/hash.ts.
  hash_artefato  text not null check (hash_artefato ~ '^[0-9a-f]{64}$'),
  publicar_em    timestamptz,
  estado         text not null default 'aguardando' check (estado in (
                   'aguardando', 'aprovada', 'reprovada', 'refazendo', 'descartada', 'cancelada')),
  automatica     boolean not null default false,
  decidido_por   text,
  decidido_em    timestamptz,
  motivo         text,
  etapa_culpada  text check (etapa_culpada is null or etapa_culpada in ('selecao', 'texto', 'imagem', 'arte')),
  refazimentos   integer not null default 0 check (refazimentos between 0 and 2),
  avisos         jsonb not null default '[]'::jsonb,
  resumo         jsonb not null default '{}'::jsonb,
  avisado_em     timestamptz,
  liberado_em    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint aprovacoes_peca_unica unique (project_id, ramo, peca_id),
  -- Aprovação sem quem e quando não é "aprovação registrada" (RF-20).
  constraint aprovacoes_decisao_registrada check (
    estado in ('aguardando', 'refazendo') or (decidido_por is not null and decidido_em is not null)
  ),
  -- Só peça aprovada é liberada para o ar.
  constraint aprovacoes_liberacao_so_aprovada check (liberado_em is null or estado = 'aprovada')
);

create index if not exists aprovacoes_fila_aberta
  on public.aprovacoes (project_id, estado, publicar_em);

create table if not exists public.reprovacoes (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id),
  aprovacao_id    uuid references public.aprovacoes(id) on delete set null,
  ramo            text not null check (ramo in ('newsletter', 'artigo', 'post')),
  etapa           text not null check (etapa in ('selecao', 'texto', 'imagem', 'arte')),
  motivo          text not null check (length(btrim(motivo)) > 0),
  texto_reprovado text not null default '',
  decidido_por    text not null,
  created_at      timestamptz not null default now()
);

create index if not exists reprovacoes_por_etapa
  on public.reprovacoes (project_id, etapa, created_at desc);

create table if not exists public.regras_propostas (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id),
  etapa         text not null check (etapa in ('selecao', 'texto', 'imagem', 'arte')),
  chave         text not null check (length(chave) > 0),
  regra         text not null check (length(btrim(regra)) > 0),
  ocorrencias   integer not null check (ocorrencias >= 3),
  exemplos      jsonb not null default '[]'::jsonb,
  estado        text not null default 'proposta' check (estado in ('proposta', 'aprovada', 'recusada')),
  decidido_por  text,
  decidido_em   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint regras_propostas_unica unique (project_id, etapa, chave),
  constraint regras_propostas_decisao check (
    estado = 'proposta' or (decidido_por is not null and decidido_em is not null)
  )
);

-- Como as vizinhas do newsroom: RLS ligada e nada para anon/authenticated. Só
-- o servidor lê, com a chave de serviço.
alter table public.aprovacoes       enable row level security;
alter table public.reprovacoes      enable row level security;
alter table public.regras_propostas enable row level security;

revoke all on public.aprovacoes       from anon, authenticated;
revoke all on public.reprovacoes      from anon, authenticated;
revoke all on public.regras_propostas from anon, authenticated;

commit;

select c.relname as tabela, c.relrowsecurity as rls,
       pg_get_constraintdef(k.oid) as constraint_de_status
  from pg_class c
  left join pg_constraint k
    on k.conrelid = c.oid and k.conname = 'social_posts_status_check'
 where c.relname in ('aprovacoes', 'reprovacoes', 'regras_propostas', 'social_posts')
 order by c.relname;

-- ======================================================================
-- 20261005150000_perfis_de_referencia.sql
-- ======================================================================

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

-- ======================================================================
-- 20261005170000_instrucoes_editoriais.sql
-- ======================================================================

-- Instrução editorial versionada, por projeto e por etapa (RF-26, 05/10/2026).
--
-- ## Por que uma tabela, e não `projects.settings`
--
-- A cadência e as capacidades moram em `settings` porque são poucos valores e
-- o último vale. Instrução é texto longo com HISTÓRICO: o painel precisa
-- mostrar a versão 3, comparar com a 5 e voltar para a 3. Guardar isso num
-- jsonb seria regravar o objeto inteiro de configuração a cada edição de texto,
-- com o risco que o comentário de `capacidades/route.ts` descreve (apagar as
-- outras chaves na primeira gravação errada).
--
-- ## O que NÃO muda ao rodar isto
--
-- Nada no ciclo. O código só lê esta tabela com a capacidade `instrucoes` em
-- `enforce` no projeto, e sem versão ativa vale o texto do código. Rodar a
-- migration com a tabela vazia é inócuo, e é a janela certa para as
-- constraints (ver "Constraint acrescentada com a tabela vazia" no registro
-- de incidentes).
--
-- ## Regras do projeto que esta tabela segue
--
-- `project_id` NOT NULL e SEM default ("DEFAULT de project_id é dívida").
-- Unicidade sem coluna nullable ("UNIQUE sobre coluna nullable").
-- RLS ligada e nenhum acesso para anon e authenticated, como as vizinhas
-- `news_candidates`, `news_editions` e `newsroom_runs`: só o servidor lê, com
-- a chave de serviço.

begin;

create table if not exists public.instrucoes_editoriais (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  etapa       text not null,
  texto       text not null,
  versao      integer not null,
  criado_por  text not null,
  criado_em   timestamptz not null default now(),
  ativo       boolean not null default false,

  constraint instrucoes_editoriais_versao_positiva check (versao > 0),
  -- O mesmo piso e teto de `motivoParaRecusarTexto`, em `instrucoes.ts`.
  constraint instrucoes_editoriais_tamanho check (char_length(btrim(texto)) between 40 and 40000),
  -- Lista fechada: etapa desconhecida gravada por fora do painel seria uma
  -- linha que nenhum prompt lê, e que o painel mostraria como se valesse.
  constraint instrucoes_editoriais_etapa check (etapa in (
    'linha_editorial_leitor',
    'linha_editorial_relevancia',
    'newsletter_redacao',
    'newsletter_assunto',
    'manchete',
    'social_copy',
    'carrossel_copy',
    'voz_social'
  )),
  constraint instrucoes_editoriais_versao_unica unique (project_id, etapa, versao)
);

-- No máximo UMA versão ativa por etapa. Duas ativas seria o prompt dependendo
-- da ordem de leitura do banco.
create unique index if not exists instrucoes_editoriais_uma_ativa
  on public.instrucoes_editoriais (project_id, etapa)
  where ativo;

alter table public.instrucoes_editoriais enable row level security;
revoke all on public.instrucoes_editoriais from anon, authenticated;

commit;

-- Conferência. As três linhas devem aparecer, e relrowsecurity deve ser true.
select conname, pg_get_constraintdef(oid) as definicao
  from pg_constraint
 where conrelid = 'public.instrucoes_editoriais'::regclass;

select relname, relrowsecurity
  from pg_class
 where relname = 'instrucoes_editoriais';
