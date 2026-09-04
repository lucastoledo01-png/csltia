-- Destino externo da automação, e a campanha permanente do projeto.
--
-- Até aqui o destino do link do Direct era sempre uma página deste site
-- (`/ultraprompts/<keyword>` ou `/newsletter`), montada a partir do registro
-- da campanha. O projeto imigra.us não tem página própria: o Direct manda a
-- pessoa direto para o VisaMatch, com UTM.
--
-- `destination_url` é entrada, não saída. `lp_url` continua sendo preenchido
-- pelo OpenReply com o link rastreado, então não dá para usá-lo como origem
-- do destino: ele é sobrescrito na publicação.
--
-- Nulo mantém o comportamento antigo, que é o que os outros projetos usam.

alter table public.prompt_campaigns
  add column if not exists destination_url text;

-- Campanha permanente: uma keyword que vale para TODOS os posts do projeto,
-- em vez de uma campanha por post.
--
-- O modelo original era um post, uma campanha, uma keyword. O funil de análise
-- de perfil inverte isso: a mesma palavra em toda publicação, levando sempre
-- ao mesmo destino. Sem esta marca, o worker não teria como saber qual
-- campanha usar ao publicar uma notícia, que não nasce de campanha nenhuma.
--
-- Parcial e única: um projeto tem no máximo uma permanente. Duas fariam a
-- escolha ser arbitrária no momento de publicar, que é o pior lugar para uma
-- ambiguidade.
alter table public.prompt_campaigns
  add column if not exists is_evergreen boolean not null default false;

create unique index if not exists prompt_campaigns_uma_permanente_por_projeto
  on public.prompt_campaigns (project_id)
  where is_evergreen;
