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
