-- `social_posts` ganha vínculo com a campanha do Sistema PROMPT.
--
-- Sem ele não havia caminho de uma campanha para um post: `social_posts` só
-- referenciava `news_editions` e `articles`, que são as origens de `noticia` e
-- `tutorial`. O formato `prompt` não tinha de onde sair — as imagens eram
-- geradas e ficavam em `prompt_assets` sem nunca chegar a um slide.
--
-- ON DELETE SET NULL, não CASCADE: apagar uma campanha não pode apagar o
-- registro de um post que já foi ao ar. O histórico de publicação sobrevive à
-- campanha que o originou.

alter table public.social_posts
  add column if not exists campaign_id uuid references public.prompt_campaigns(id) on delete set null;

create index if not exists social_posts_campaign_idx
  on public.social_posts (campaign_id) where campaign_id is not null;
