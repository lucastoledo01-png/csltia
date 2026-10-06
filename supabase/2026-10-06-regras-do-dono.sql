-- As regras do dono depois da fila de 07/10/2026, como regras APROVADAS do
-- aprendizado da fila (06/10/2026).
--
-- O dono leu os cinco posts do Instagram de 07/10 e devolveu cinco pontos. Cada
-- um virou código (a guarda do post, o render da arte e a legenda), e aqui
-- vira também regra fixa do canal em `regras_propostas`, que é o que entra no
-- bloco "não repetir" dos redatores (`errosRecentesDaEtapa`, só as aprovadas,
-- por canal e por etapa). As regras de manchete valem para os três canais,
-- cada um com a sua linha, porque o aprendizado nunca mistura canal: a regra
-- do post não chega à voz da newsletter.
--
-- `origem = 'reprovacoes'` porque nasceram da reprovação do dono, e
-- `ocorrencias = 3` é o piso do CHECK para essa origem
-- (`ocorrencias >= 1 and (origem = 'edicoes' or ocorrencias >= 3)`): é a regra
-- fixa decidida pelo dono, e não uma contagem medida.
--
-- Idempotente: rodar de novo reescreve as mesmas linhas com o mesmo texto e as
-- mantém aprovadas. Não apaga nada. Termina numa conferência: se o SQL Editor
-- devolver as linhas, rodou.

begin;

-- Pré-condição: a migration do aprendizado (`20261006120000_aprendizado_da_fila.sql`)
-- já rodou, com `ramo` e `origem` na tabela. Sem elas, aborta tudo.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'regras_propostas' and column_name = 'ramo'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'regras_propostas' and column_name = 'origem'
  ) then
    raise exception 'FALHOU: regras_propostas sem ramo ou origem. Rode antes supabase/migrations/20261006120000_aprendizado_da_fila.sql.';
  end if;
end $$;

insert into public.regras_propostas
  (project_id, ramo, etapa, chave, regra, ocorrencias, exemplos, origem, estado, decidido_por, decidido_em)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  v.ramo,
  v.etapa,
  v.chave,
  v.regra,
  3,
  v.exemplos,
  'reprovacoes',
  'aprovada',
  'dono',
  now()
from (values
  -- 1. Citação com contexto: quem fala é apresentado e a fala carrega o assunto.
  ('post', 'texto', 'dono:citacao-com-contexto',
   'Citação na manchete: quem fala é conhecido do grande público brasileiro ou entra apresentado pelo cargo ou pela empresa famosa ("Bret Taylor, presidente do conselho da OpenAI,"). A fala carrega o assunto sozinha: "tal padrão", "isso", "esse acordo" ou "eles" dentro das aspas exigem o referente nomeado na manchete, fora das aspas; sem como nomear, corte a fala ou escolha outra.',
   '["Bret Taylor: “É uma espécie de caos até que tal padrão exista”"]'::jsonb),
  ('newsletter', 'texto', 'dono:citacao-com-contexto',
   'Citação no título: quem fala é conhecido do grande público brasileiro ou entra apresentado pelo cargo ou pela empresa famosa. A fala carrega o assunto sozinha: "tal padrão", "isso" ou "eles" dentro das aspas exigem o referente nomeado fora delas.',
   '["Bret Taylor: “É uma espécie de caos até que tal padrão exista”"]'::jsonb),
  ('artigo', 'texto', 'dono:citacao-com-contexto',
   'Citação no título: quem fala é conhecido do grande público brasileiro ou entra apresentado pelo cargo ou pela empresa famosa. A fala carrega o assunto sozinha: "tal padrão", "isso" ou "eles" dentro das aspas exigem o referente nomeado fora delas.',
   '["Bret Taylor: “É uma espécie de caos até que tal padrão exista”"]'::jsonb),

  -- 2. Valor com unidade não quebra de linha na arte.
  ('post', 'arte', 'dono:valor-nao-quebra',
   'Dinheiro e número com a unidade nunca quebram de linha na arte: "US$ 45.000", "R$ 5", "US$ 2,9 bilhões" e "8%" ficam inteiros na mesma linha, em toda peça (capa, slides e recorte).',
   '["Anthropic amplia programa para startups com até US$ 45.000 em descontos e créditos (US$ no fim de uma linha, 45.000 na outra)"]'::jsonb),

  -- 3. Crédito da foto: só o nome de quem fotografou.
  ('post', 'texto', 'dono:credito-so-nome',
   'O crédito da foto na legenda leva só o nome de quem fotografou: "Fotos: Lucio Bernardo Jr. e Leonardo Prado"; uma foto, "Foto: Nome". Sem banco ou agência, sem sigla de licença, sem barra. Sem pessoa, o nome da instituição ("Foto: NASA").',
   '["Fotos: Lucio Bernardo Jr./Câmara dos Deputados (CC BY) e Leonardo Prado/Câmara dos Deputados (CC BY)", "Foto: Bruno Sanchez-Andrade Nuño from Washington, DC, USA (CC BY)"]'::jsonb),

  -- 4. Variação nomeia a métrica.
  ('post', 'texto', 'dono:variacao-com-metrica',
   'Toda variação (sobe, cai, avança, recua, dispara, despenca) com percentual ou valor nomeia a métrica que variou: as ações, o valor de mercado, a avaliação, a receita, o índice. Vale para a manchete e para o lide da legenda. Errado: "SpaceX sobe quase 8%". Certo: "Ações da SpaceX sobem quase 8%".',
   '["SpaceX sobe quase 8%, atinge maior nível desde meados de junho e devolve Musk ao status de trilionário"]'::jsonb),
  ('newsletter', 'texto', 'dono:variacao-com-metrica',
   'Toda variação (sobe, cai, avança, recua, dispara, despenca) com percentual ou valor nomeia a métrica que variou: as ações, o valor de mercado, a avaliação, a receita, o índice. Errado: "SpaceX sobe quase 8%". Certo: "Ações da SpaceX sobem quase 8%".',
   '["SpaceX sobe quase 8%, atinge maior nível desde meados de junho e devolve Musk ao status de trilionário"]'::jsonb),
  ('artigo', 'texto', 'dono:variacao-com-metrica',
   'Toda variação (sobe, cai, avança, recua, dispara, despenca) com percentual ou valor nomeia a métrica que variou: as ações, o valor de mercado, a avaliação, a receita, o índice. Errado: "SpaceX sobe quase 8%". Certo: "Ações da SpaceX sobem quase 8%".',
   '["SpaceX sobe quase 8%, atinge maior nível desde meados de junho e devolve Musk ao status de trilionário"]'::jsonb),

  -- 5. A manchete se explica sozinha para o público brasileiro.
  ('post', 'texto', 'dono:manchete-se-explica',
   'A manchete comunica a um brasileiro que não leu a matéria quem ou o quê e por que importa, com o sujeito explícito. Pessoa pouco conhecida entra com o cargo ou com o que disputa ("Douglas Ruas, candidato ao governo do Rio"); o fato vem antes do lugar.',
   '["Douglas Ruas pode vencer no primeiro turno se votos de Garotinho forem anulados no RJ", "Ronaldo Caiado oficializa apoio a Flávio Bolsonaro no segundo turno em Goiânia"]'::jsonb),
  ('newsletter', 'texto', 'dono:manchete-se-explica',
   'O título comunica a um brasileiro que não leu a matéria quem ou o quê e por que importa, com o sujeito explícito. Pessoa pouco conhecida entra com o cargo ou com o que disputa.',
   '["Douglas Ruas pode vencer no primeiro turno se votos de Garotinho forem anulados no RJ"]'::jsonb),
  ('artigo', 'texto', 'dono:manchete-se-explica',
   'O título comunica a um brasileiro que não leu a matéria quem ou o quê e por que importa, com o sujeito explícito. Pessoa pouco conhecida entra com o cargo ou com o que disputa.',
   '["Douglas Ruas pode vencer no primeiro turno se votos de Garotinho forem anulados no RJ"]'::jsonb)
) as v(ramo, etapa, chave, regra, exemplos)
on conflict (project_id, ramo, etapa, chave) do update
set regra        = excluded.regra,
    exemplos     = excluded.exemplos,
    ocorrencias  = greatest(public.regras_propostas.ocorrencias, excluded.ocorrencias),
    origem       = excluded.origem,
    estado       = 'aprovada',
    decidido_por = coalesce(public.regras_propostas.decidido_por, excluded.decidido_por),
    decidido_em  = coalesce(public.regras_propostas.decidido_em, excluded.decidido_em),
    updated_at   = now();

-- Conferência: tem que devolver 11 linhas, todas `aprovada`.
select ramo, etapa, chave, estado, ocorrencias, origem, decidido_por, left(regra, 80) as regra
from public.regras_propostas
where project_id = '00000000-0000-4000-8000-000000000001'
  and chave like 'dono:%'
order by chave, ramo, etapa;

commit;
