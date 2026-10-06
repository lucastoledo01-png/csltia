-- O aprendizado da fila de aprovação, por peça e por canal (06/10/2026).
--
-- O dono: "de nada adianta esse esforço manual se não houver aprendizado".
-- Até esta data a memória de reprovação (RF-29) só alimentava o texto, e
-- misturava os canais: o erro apontado na legenda do post entrava na voz da
-- newsletter. O código que usa o que está aqui mora em
-- `src/lib/server/aprendizado/`, e só lê com a fila fora de `off`.
--
-- ## O que entra
--
--   reprovacoes.detalhes     o que a etapa reprovada TINHA: a pauta (fonte,
--                            atores, eixo), a foto e a decisão de arte. É o
--                            que a seleção, o resolvedor de imagem e a arte
--                            do canal aprendem a evitar.
--   regras_propostas.ramo    a regra é de UM canal. NOT NULL, e por isso a
--                            pré-condição abaixo: a tabela estava vazia em
--                            produção em 06/10/2026 (lida pelo PostgREST).
--   regras_propostas.origem  'reprovacoes' (o mesmo erro três vezes) ou
--                            'edicoes' (o resumo semanal das edições à mão).
--                            A proposta das edições pode nascer com menos de
--                            três exemplos; a da reprovação continua com três.
--   edicoes_do_editor        o antes e o depois de cada edição manual na fila.
--
-- ## Regras do projeto que isto segue
--
-- `project_id` NOT NULL e SEM default ("DEFAULT de project_id é dívida").
-- Unicidade sem coluna nullable ("UNIQUE sobre coluna nullable não protege
-- nada"): por isso `ramo` é NOT NULL antes de entrar na unicidade.
-- RLS ligada e nada para anon e authenticated, como `aprovacoes`,
-- `reprovacoes` e `regras_propostas`.
--
-- Termina num `select` de propósito: se o SQL Editor devolver as linhas, rodou.

begin;

-- Pré-condição: regra antiga sem canal não tem dono. Aborta tudo em vez de
-- inventar um canal para ela.
do $$
declare
  n integer;
begin
  select count(*) into n from public.regras_propostas;
  if n > 0 then
    raise exception 'FALHOU: regras_propostas tem % linha(s) anteriores ao canal. Anote-as, apague-as e rode de novo; o aprendizado as propõe outra vez, já por canal.', n;
  end if;
end $$;

-- 1. O que a peça reprovada tinha, para a etapa certa aprender.
alter table public.reprovacoes
  add column if not exists detalhes jsonb not null default '{}'::jsonb;

-- A memória agora é lida por canal e por etapa.
create index if not exists reprovacoes_por_canal
  on public.reprovacoes (project_id, ramo, etapa, created_at desc);

-- 2. A regra proposta é de um canal, e diz de onde veio.
alter table public.regras_propostas
  add column if not exists ramo text;

update public.regras_propostas set ramo = 'post' where ramo is null; -- nenhuma linha, pela pré-condição

alter table public.regras_propostas
  alter column ramo set not null;

alter table public.regras_propostas
  drop constraint if exists regras_propostas_ramo_check;
alter table public.regras_propostas
  add constraint regras_propostas_ramo_check check (ramo in ('newsletter', 'artigo', 'post'));

alter table public.regras_propostas
  add column if not exists origem text not null default 'reprovacoes';

alter table public.regras_propostas
  drop constraint if exists regras_propostas_origem_check;
alter table public.regras_propostas
  add constraint regras_propostas_origem_check check (origem in ('reprovacoes', 'edicoes'));

-- O piso de três é da reprovação repetida. A proposta das edições traz os
-- exemplos que a sustentam, e pode ter dois.
alter table public.regras_propostas
  drop constraint if exists regras_propostas_ocorrencias_check;
alter table public.regras_propostas
  add constraint regras_propostas_ocorrencias_check check (
    ocorrencias >= 1 and (origem = 'edicoes' or ocorrencias >= 3)
  );

-- A unicidade passa a ser por canal: o mesmo erro no post e na newsletter são
-- duas propostas, decididas separadamente.
alter table public.regras_propostas
  drop constraint if exists regras_propostas_unica;
alter table public.regras_propostas
  add constraint regras_propostas_unica unique (project_id, ramo, etapa, chave);

create index if not exists regras_propostas_por_canal
  on public.regras_propostas (project_id, ramo, etapa, estado);

-- 3. As edições do editor, antes e depois.
create table if not exists public.edicoes_do_editor (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id),
  ramo          text not null check (ramo in ('newsletter', 'artigo', 'post')),
  -- social_posts.id, news_editions.id ou articles.id, conforme o ramo.
  peca_id       uuid not null,
  aprovacao_id  uuid references public.aprovacoes(id) on delete set null,
  etapa         text not null default 'texto' check (etapa in ('selecao', 'texto', 'imagem', 'arte')),
  antes         text not null,
  depois        text not null,
  editado_por   text not null,
  criado_em     timestamptz not null default now(),
  -- Edição que não muda nada não ensina nada.
  constraint edicoes_do_editor_mudou check (antes is distinct from depois)
);

create index if not exists edicoes_do_editor_por_canal
  on public.edicoes_do_editor (project_id, ramo, criado_em desc);

alter table public.edicoes_do_editor enable row level security;
revoke all on public.edicoes_do_editor from anon, authenticated;

commit;

select c.relname as tabela, c.relrowsecurity as rls, k.conname, pg_get_constraintdef(k.oid) as definicao
  from pg_class c
  left join pg_constraint k on k.conrelid = c.oid
 where c.relname in ('regras_propostas', 'edicoes_do_editor', 'reprovacoes')
   and c.relnamespace = 'public'::regnamespace
 order by c.relname, k.conname;
