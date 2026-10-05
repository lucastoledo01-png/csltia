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
