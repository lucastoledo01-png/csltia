-- `prompt_assets` guarda o crédito da foto de origem.
--
-- Quando a imagem é gerada a partir de uma foto de banco (Pexels, Unsplash), a
-- licença dos dois exige atribuição ao fotógrafo. Sem um lugar para guardar o
-- crédito no momento em que a foto é usada, a atribuição depende de alguém
-- lembrar depois — e ninguém lembra.
--
-- Mesmo princípio do `prompt_text`: o dado que comprova a origem é gravado no
-- ato, nunca reconstruído.
--
-- Nulo significa imagem gerada do zero, sem foto de base.

alter table public.prompt_assets
  add column if not exists stock_credit jsonb;
