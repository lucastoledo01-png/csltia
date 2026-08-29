-- Design dos carrosséis de Instagram editável pelo painel.
--
-- Duas tabelas de OVERRIDE: linha/chave ausente => o código usa o default do
-- repo (`src/lib/carousel-templates/`). "Restaurar padrão" no painel = apagar
-- a linha/chave. Nenhum HTML mora aqui — só tokens de design e a escolha de
-- qual variante de layout usar por tipo de slide.

-- Tokens globais de design (cores, escala tipográfica, raio, eyebrows, CTAs).
-- Linha única (id = 1).
create table if not exists public.carousel_theme (
  id int primary key default 1 check (id = 1),
  tokens jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Config por formato: qual variante de layout por tipo de slide, e overrides
-- de texto do eyebrow e do CTA.
create table if not exists public.carousel_format_config (
  format text primary key check (format in ('noticia', 'tutorial', 'prompt')),
  variant_by_slide_type jsonb not null default '{}'::jsonb,
  eyebrow_label text,
  cta_text text,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.carousel_theme enable row level security;
revoke all on public.carousel_theme from anon, authenticated;

alter table public.carousel_format_config enable row level security;
revoke all on public.carousel_format_config from anon, authenticated;
