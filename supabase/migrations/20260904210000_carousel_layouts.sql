-- Layouts desenhados à mão, por formato e tipo de slide.
--
-- O que muda de conceito: até aqui o layout era código (as variantes em
-- `variants.ts`) e o painel só escolhia entre as prontas e trocava cor e fonte.
-- Quem quer um layout diferente precisava de um deploy.
--
-- Aqui o layout vira dado: uma lista de blocos posicionados, cada um ligado a
-- um "slot" de conteúdo (título, chapéu, corpo, imagem de fundo). A IA passa a
-- preencher os slots em vez de escolher a forma.
--
-- `blocks` é jsonb e não tabela filha de propósito: um layout só é lido e
-- gravado inteiro, nunca por bloco, e a ordem dos blocos (z-index) faz parte do
-- dado. Normalizar aqui só criaria junções para reconstruir o mesmo array.
--
-- A unicidade é (project_id, format, slide_type): um layout ativo por
-- combinação. Dois layouts para "capa de notícia" fariam a escolha entre eles
-- ser arbitrária no momento de renderizar — que é o pior lugar para uma
-- ambiguidade, porque o post já está sendo publicado.

create table if not exists public.carousel_layouts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  format text not null,
  slide_type text not null,
  name text not null default '',
  -- Canvas de referência em que o layout foi desenhado. As posições dos blocos
  -- são percentuais, então o layout sobrevive a uma mudança de proporção — mas
  -- guardar o canvas original permite avisar quando ela mudou.
  canvas jsonb not null default '{"width": 1080, "height": 1440}'::jsonb,
  blocks jsonb not null default '[]'::jsonb,
  -- Layout desligado volta para a variante de código, sem perder o desenho.
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,

  constraint carousel_layouts_format_check
    check (format in ('noticia', 'tutorial', 'prompt')),

  constraint carousel_layouts_unico
    unique (project_id, format, slide_type)
);

create index if not exists carousel_layouts_lookup
  on public.carousel_layouts (project_id, format, slide_type)
  where enabled;

alter table public.carousel_layouts enable row level security;

revoke all on public.carousel_layouts from anon, authenticated;
