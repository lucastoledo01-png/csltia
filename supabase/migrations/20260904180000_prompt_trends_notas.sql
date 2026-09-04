-- `prompt_trends` ganha o motivo da triagem e a URL de origem.
--
-- A triagem da etapa 1 decide se uma tendência vira conceito, e o critério
-- dela é subjetivo por natureza ("dá pra fazer alguém querer refazer isso?").
-- Sem o motivo gravado, uma triagem apertada ou frouxa demais é invisível: só
-- se vê o veredito, nunca o raciocínio.
--
-- É a mesma lição do portão do QA da newsletter, que reprovava e não dizia por
-- quê — ver `aprendizados-e-incidentes.md`. Portão sem motivo registrado não é
-- auditável, é uma parada inexplicável.

alter table public.prompt_trends
  add column if not exists notes text,
  add column if not exists raw_url text;
