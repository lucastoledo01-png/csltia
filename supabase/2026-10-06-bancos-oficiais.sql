-- Os bancos de imagem oficiais (06/10/2026), ligados no projeto eua.journal.
--
-- Liga `settings.imagens.bancos_oficiais`, que o resolvedor lê em
-- `bancosOficiaisLigados`. Sem esta chave, o código trata como desligado e a
-- resolução de imagem é a de antes.
--
-- Mexe só na chave `imagens.bancos_oficiais`: o resto de `settings` (e o resto
-- de `settings.imagens`, se um dia existir) fica como está. Idempotente.
-- Para desligar, troque `true` por `false` e rode de novo.

begin;

update public.projects
set settings = jsonb_set(
      coalesce(settings, '{}'::jsonb),
      '{imagens}',
      coalesce(settings -> 'imagens', '{}'::jsonb) || '{"bancos_oficiais": true}'::jsonb,
      true
    ),
    updated_at = now()
where id = '00000000-0000-4000-8000-000000000001';

-- Conferência: tem que devolver uma linha com `true`.
select id, slug, settings -> 'imagens' -> 'bancos_oficiais' as bancos_oficiais
from public.projects
where id = '00000000-0000-4000-8000-000000000001';

commit;
