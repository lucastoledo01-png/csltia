-- ============================================================================
-- NOTA DE 06/09, DEPOIS DE APLICADA
--
-- Esta migration foi aplicada em partes e duas coisas que ela dizia estavam
-- erradas. Ficam registradas aqui em vez de reescritas, porque o arquivo é o
-- histórico do que foi rodado.
--
-- 1. A unicidade global em `url` NÃO existia. `20260827030000_multi_project_base`
--    já a havia trocado por `news_candidates_project_url_key (project_id, url)`
--    em 27 de agosto. As duas primeiras pós-condições verificavam algo que já
--    era verdade, e o `create unique index news_candidates_projeto_url` teria
--    criado um índice duplicado sobre as mesmas colunas.
--
-- 2. A pós-condição de RLS abortou a transação com "FALHOU: RLS desligada", e
--    estava certa: `news_candidates`, `news_editions` e `newsroom_runs` estavam
--    legíveis pela chave anônima. Corrigido em `20260906150000_rls_do_newsroom`.
--
-- O que faltou depois disso foi só a troca do CHECK de status, feita em
-- `20260906160000_check_de_status.sql`.
-- ============================================================================

-- Camada de candidatos editoriais, e a ligação do post social com ela.
--
-- ## Como esta migration se protege
--
-- Ela roda inteira numa transação. Antes de qualquer DDL, checa que a tabela
-- está vazia e aborta se não estiver: trocar constraint em tabela com dado é
-- decisão de gente, não de script. Depois de todo o DDL, ela PROVA o estado
-- final e lança exceção se algo não bater, o que desfaz tudo.
--
-- Não existe DELETE, TRUNCATE, DROP TABLE nem DROP COLUMN em lugar nenhum
-- deste arquivo. Toda coluna entra com `if not exists`, então rodar duas vezes
-- não quebra.
--
-- Os dois DROP CONSTRAINT existem e são intencionais: a unicidade global de
-- `url` e o CHECK antigo de `status`. Nenhum dos dois carrega dado. Eles são
-- procurados pela COLUNA, nunca pelo nome: um `drop constraint if exists` com
-- o nome errado não derruba nada e não dá erro, e o resultado seria a regra
-- velha valendo em silêncio ao lado da nova.
--
-- ## Por que evoluir `news_candidates` em vez de criar tabela nova
--
-- Ela existe desde a primeira migration do newsroom, tem zero linhas e nenhuma
-- referência em código: a única menção no repositório é um comentário que a
-- cita como exemplo do que acontece quando se cria coluna que ninguém
-- alimenta. Criar uma segunda com a mesma função deixaria duas, e uma delas
-- continuaria vazia.
--
-- ## O que esta camada NÃO é
--
-- Não é banco de notícias e não é fila de publicação. Uma linha aqui é uma
-- CANDIDATA classificada UMA vez. Quem publica é `social_posts` e
-- `news_editions`, e os dois apontam para cá. É o que evita classificar a
-- mesma matéria três vezes em três pipelines.

begin;

-- ---------------------------------------------------------------------------
-- 0. Pré-condições
-- ---------------------------------------------------------------------------

do $$
declare
  linhas bigint;
begin
  select count(*) into linhas from public.news_candidates;

  if linhas <> 0 then
    raise exception
      'ABORTADA: news_candidates tem % linha(s). Esta migration troca constraints e foi escrita para a tabela vazia. Revise antes de rodar.',
      linhas;
  end if;

  raise notice 'pré-condição ok: news_candidates com 0 linhas';
end $$;

-- ---------------------------------------------------------------------------
-- 1. Identidade e projeto
-- ---------------------------------------------------------------------------

alter table public.news_candidates
  -- Já existe desde a migration multi-projeto; fica aqui para a migration
  -- ser completa em si mesma. O `if not exists` a torna inofensiva.
  add column if not exists project_id uuid references public.projects(id),
  -- Mesma identidade da Fase 1: `gerarStoryId` em editorial/history.ts.
  add column if not exists story_id text,
  add column if not exists canonical_url text,
  add column if not exists source_domain text,
  -- A chave da fonte no `project_news_sources`, não o nome de exibição.
  -- É o que torna possível medir aproveitamento POR FONTE depois: quantas
  -- coletou, quantas foram aprovadas, quantas viraram post. Uma fonte que
  -- traz 500 itens e nunca gera nada precisa aparecer nesse número.
  add column if not exists source_key text,
  -- Google News é descoberta. Sem resolver para o veículo, não publica.
  add column if not exists source_resolved boolean not null default false,
  add column if not exists summary text not null default '';

-- A unicidade era global por URL. Com multi-projeto, a mesma matéria pode ser
-- candidata de duas publicações diferentes.
--
-- O `drop constraint if exists` pelo nome padrão do Postgres seria um risco
-- silencioso: se o constraint tiver outro nome, o `if exists` não derruba
-- nada, não dá erro, e a unicidade global continua valendo ao lado do índice
-- novo. O bloco abaixo procura o constraint pela COLUNA, não pelo nome, e
-- avisa no log o que derrubou.
do $$
declare
  nome text;
begin
  for nome in
    select c.conname
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = any (c.conkey)
     where c.conrelid = 'public.news_candidates'::regclass
       and c.contype = 'u'
       and array_length(c.conkey, 1) = 1
       and a.attname = 'url'
  loop
    execute format('alter table public.news_candidates drop constraint %I', nome);
    raise notice 'unicidade global de url removida: %', nome;
  end loop;
end $$;

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
-- Mesmo cuidado com o CHECK: procurado pela coluna, não pelo nome. Deixar o
-- antigo de pé faria o `insert` de uma candidata em 'classified' falhar em
-- produção e em lugar nenhum antes disso.
do $$
declare
  nome text;
begin
  for nome in
    select c.conname
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = any (c.conkey)
     where c.conrelid = 'public.news_candidates'::regclass
       and c.contype = 'c'
       and a.attname = 'status'
  loop
    execute format('alter table public.news_candidates drop constraint %I', nome);
    raise notice 'check antigo de status removido: %', nome;
  end loop;
end $$;

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

-- Aproveitamento por fonte, que é a consulta do futuro painel de fontes.
create index if not exists news_candidates_por_fonte
  on public.news_candidates (project_id, source_key, status);

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


-- ---------------------------------------------------------------------------
-- 7. Pós-condições. Se alguma falhar, a transação inteira volta atrás.
-- ---------------------------------------------------------------------------

do $$
declare
  n int;
  definicao text;
  v text;
  faltando text[] := '{}';
  esperados text[] := array[
    'collected', 'classified', 'approved', 'selected', 'rejected',
    'capped', 'duplicate', 'filtered', 'too_old', 'already_published'
  ];
begin
  -- 1. Nenhuma unicidade global em `url`.
  select count(*) into n
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.news_candidates'::regclass
     and c.contype = 'u'
     and array_length(c.conkey, 1) = 1
     and a.attname = 'url';

  if n <> 0 then
    raise exception 'PÓS-CONDIÇÃO FALHOU: ainda existe % constraint unique só em url', n;
  end if;

  select count(*) into n
    from pg_indexes
   where schemaname = 'public'
     and tablename = 'news_candidates'
     and indexdef ilike '%unique%'
     and indexdef ilike '%(url)%'
     and indexdef not ilike '%project_id%';

  if n <> 0 then
    raise exception 'PÓS-CONDIÇÃO FALHOU: ainda existe índice unique só em url';
  end if;

  -- 2. A unicidade nova, por projeto, existe e é unique.
  select count(*) into n
    from pg_indexes
   where schemaname = 'public'
     and tablename = 'news_candidates'
     and indexname = 'news_candidates_projeto_url'
     and indexdef ilike '%unique%';

  if n <> 1 then
    raise exception 'PÓS-CONDIÇÃO FALHOU: índice unique (project_id, url) não encontrado';
  end if;

  -- 3. Exatamente um CHECK de status, e ele aceita os dez valores.
  select count(*) into n
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.news_candidates'::regclass
     and c.contype = 'c'
     and a.attname = 'status';

  if n <> 1 then
    raise exception 'PÓS-CONDIÇÃO FALHOU: existem % CHECK de status, o esperado é 1', n;
  end if;

  select pg_get_constraintdef(c.oid) into definicao
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.news_candidates'::regclass
     and c.contype = 'c'
     and a.attname = 'status';

  foreach v in array esperados loop
    if position(v in definicao) = 0 then
      faltando := faltando || v;
    end if;
  end loop;

  if array_length(faltando, 1) > 0 then
    raise exception 'PÓS-CONDIÇÃO FALHOU: o CHECK de status não aceita %. Definição: %', faltando, definicao;
  end if;

  -- 4. Nenhuma linha apareceu nem sumiu.
  select count(*) into n from public.news_candidates;
  if n <> 0 then
    raise exception 'PÓS-CONDIÇÃO FALHOU: news_candidates deixou de estar vazia (% linhas)', n;
  end if;

  -- 5. RLS continua ligada. A tabela nasceu com RLS e revoke para anon e
  --    authenticated, e nada aqui deve ter mexido nisso.
  select count(*) into n
    from pg_class
   where oid = 'public.news_candidates'::regclass
     and relrowsecurity;

  if n <> 1 then
    raise exception 'PÓS-CONDIÇÃO FALHOU: RLS de news_candidates não está habilitada';
  end if;

  raise notice 'pós-condições ok: unicidade por projeto, um CHECK de status com 10 valores, 0 linhas, RLS ligada';
end $$;

commit;

-- ---------------------------------------------------------------------------
-- 8. Conferência independente, para rodar DEPOIS e ler com os olhos
-- ---------------------------------------------------------------------------
--
-- Constraints finais:
--   select conname, contype, pg_get_constraintdef(oid)
--     from pg_constraint where conrelid = 'public.news_candidates'::regclass
--    order by contype, conname;
--
-- Índices finais:
--   select indexname, indexdef from pg_indexes
--    where tablename = 'news_candidates' order by indexname;
--
-- Colunas finais:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'news_candidates'
--    order by ordinal_position;
--
-- RLS e policies:
--   select relrowsecurity from pg_class where oid = 'public.news_candidates'::regclass;
--   select policyname, cmd, qual from pg_policies
--    where schemaname = 'public' and tablename = 'news_candidates';
--
-- Linhas:
--   select count(*) from public.news_candidates;
--
-- Teste funcional do CHECK, que insere e desfaz sem deixar rastro:
--   begin;
--   insert into public.news_candidates (url, title, source_name, published_at, status)
--   select 'https://teste.local/' || v, 'teste', 'teste', now(), v
--     from unnest(array['collected','classified','approved','selected','rejected',
--                       'capped','duplicate','filtered','too_old','already_published']) as v;
--   select status, count(*) from public.news_candidates group by status order by status;
--   rollback;
