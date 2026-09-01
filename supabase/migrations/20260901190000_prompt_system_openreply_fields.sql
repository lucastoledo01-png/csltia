-- Sistema PROMPT — Fase 1: campos de copy do Direct (etapas 9 e 9b).
--
-- "Config, não código" (docs/sistema-prompt-arquitetura.md, etapa 9): a copy
-- do Direct e do upsell são geradas/editadas no csltia e empurradas junto com
-- a criação da automação no OpenReply (D1, fork mínimo). Persistir aqui serve
-- de registro auditável do nosso lado — o OpenReply é quem efetivamente
-- dispara, mas não é nossa única cópia do que foi configurado.

alter table public.prompt_campaigns
  add column if not exists dm_message text,
  add column if not exists opening_dm_message text,
  add column if not exists follow_up_enabled boolean not null default false,
  add column if not exists follow_up_delay_minutes int,
  add column if not exists follow_up_message text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'prompt_campaigns_follow_up_delay_check'
      and conrelid = 'public.prompt_campaigns'::regclass
  ) then
    alter table public.prompt_campaigns
      add constraint prompt_campaigns_follow_up_delay_check
        check (follow_up_delay_minutes is null or follow_up_delay_minutes > 0);
  end if;
end $$;
