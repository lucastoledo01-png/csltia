-- `prompt_assets` guarda a proveniência da foto de origem.
--
-- Registro interno, não texto a publicar: a decisão editorial é não creditar
-- o fotógrafo no post, e a licença do Pexels não exige atribuição. O que esta
-- coluna resolve é outra coisa — saber de onde veio cada imagem é o que
-- permite responder a uma contestação depois.
--
-- Mesmo princípio do `prompt_text`: o dado que comprova a origem é gravado no
-- ato, nunca reconstruído. A mesma busca amanhã devolve outra foto.
--
-- Nulo significa imagem gerada do zero, sem foto de base.

alter table public.prompt_assets
  add column if not exists stock_credit jsonb;
