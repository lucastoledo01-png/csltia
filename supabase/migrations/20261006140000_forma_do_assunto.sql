-- A forma do assunto da newsletter (06/10/2026).
--
-- O assunto do e-mail segue o método do The News em cinco formas (pergunta,
-- nomes, personagem, cena ou número, momento), e o dono decidiu que elas
-- giram em código: cada edição grava a forma escolhida, e a seguinte pede a
-- forma da vez a partir das gravadas (`src/lib/server/newsroom/assunto.ts`).
--
-- Nullable de propósito: as edições anteriores não têm forma, e a esteira
-- grava nulo quando a escolha não passou pelo rodízio. O CHECK aceita nulo e
-- as cinco formas, nada mais.
--
-- Antes desta migration o código grava a edição sem a coluna (o upsert é
-- refeito sem ela) e lê a forma das edições pelo texto do assunto. Nada quebra
-- se ela demorar a ser aplicada.

alter table public.news_editions
  add column if not exists subject_form text;

alter table public.news_editions
  drop constraint if exists news_editions_subject_form_check;

alter table public.news_editions
  add constraint news_editions_subject_form_check
  check (subject_form is null or subject_form in ('pergunta', 'nomes', 'personagem', 'cena', 'momento'));
