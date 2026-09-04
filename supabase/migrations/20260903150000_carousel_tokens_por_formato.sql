-- Tokens de design passam a ter override por formato.
--
-- `carousel_theme` é linha única (`id = 1`): um tema global para os três
-- formatos. Isso bastava enquanto os três compartilhavam o mesmo sistema
-- visual. Não basta mais: o design aprovado do `tutorial` é claro
-- (fundo #F5F1ED) e o de `noticia`/`prompt` é escuro (fundo #080808), e um
-- `--s-bg` só não pode ser os dois.
--
-- A resolução vira uma cascata de três camadas, cada uma sobrescrevendo a
-- anterior apenas nas chaves que declara:
--
--   default do repo  →  carousel_theme.tokens  →  carousel_format_config.tokens
--
-- Aditivo: formato sem override continua caindo no tema global, e "restaurar
-- padrão" no painel continua sendo apagar a chave — nunca gravar o default.

alter table public.carousel_format_config
  add column if not exists tokens jsonb not null default '{}'::jsonb;
