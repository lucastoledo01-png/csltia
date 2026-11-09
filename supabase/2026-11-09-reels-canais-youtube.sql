-- Reels a partir de canais de notícia do YouTube (09/11/2026). Para o dono rodar no SQL Editor.
-- Idempotente: rodar duas vezes deixa o mesmo valor. Só toca settings.reels.canais_youtube;
-- termos_youtube, perfis_ig e o resto de settings.reels ficam como estão.
--
-- Cada id foi conferido em 09/11/2026 pelo yt-dlp: o handle respondeu com este id, e a
-- playlist de uploads ("UU" mais o resto do id) devolveu o envio mais recente do canal.
--
-- Não acharam canal próprio, e por isso não entram:
--   Squawk Box (CNBC)  @SquawkBox existe sem vídeo; o programa sai no CNBC Television.
--   Meet the Press     @MeetThePress existe sem vídeo; o programa sai no NBC News.
-- U.S. Department of Defense virou Department of War: o canal é @deptofwar
-- (@DeptofDefense responde 404).
--
-- Custo de cota: a leitura do canal custa 1 unidade (playlistItems) mais 1 por 50 vídeos
-- (videos.list), e o id fixo dispensa o channels.list. Com 19 canais e a rodada de hora em
-- hora das 9h às 17h (9 rodadas), são cerca de 20 a 23 unidades por rodada, uns 200 por dia,
-- além dos ~3.640 das quatro buscas por termo. A cota é de 10.000 por dia.
--
-- Precisa de YOUTUBE_API_KEY no ambiente do web (a descoberta) e do worker.

begin;

update public.projects
set settings = jsonb_set(
      coalesce(settings, '{}'::jsonb),
      '{reels}',
      coalesce(settings -> 'reels', '{}'::jsonb) || jsonb_build_object('canais_youtube', '[
        {"id": "UCIALMKvObZNtJ6AmdCLP7Lg", "handle": "@markets", "nome": "Bloomberg Television", "idioma": "en", "credito": "Bloomberg"},
        {"id": "UCYWpWVSfndpbq1dDsWVslzA", "handle": "@BloombergOriginals", "nome": "Bloomberg Originals", "idioma": "en", "credito": "Bloomberg"},
        {"id": "UCrp_UI8XtuYfpiqluWLD7Lw", "handle": "@CNBCtelevision", "nome": "CNBC Television", "idioma": "en", "credito": "CNBC"},
        {"id": "UC8p1vwvWtl6T73JiExfWs1g", "handle": "@CBSNews", "nome": "CBS News", "idioma": "en", "credito": "CBS News"},
        {"id": "UCsN32BtMd0IoByjJRNF12cw", "handle": "@60minutes", "nome": "60 Minutes", "idioma": "en", "credito": "60 Minutes (CBS)"},
        {"id": "UCCXoCcu9Rp7NPbTzIvogpZg", "handle": "@FoxBusiness", "nome": "Fox Business", "idioma": "en", "credito": "Fox Business"},
        {"id": "UCXIJgqnII2ZOINSWNOGFThA", "handle": "@FoxNews", "nome": "Fox News", "idioma": "en", "credito": "Fox News"},
        {"id": "UCeY0bbntWzzVIaj2z3QigXg", "handle": "@NBCNews", "nome": "NBC News", "idioma": "en", "credito": "NBC News"},
        {"id": "UCBi2mrWuNuyYy4gbM6fU18Q", "handle": "@ABCNews", "nome": "ABC News", "idioma": "en", "credito": "ABC News"},
        {"id": "UCupvZG-5ko_eiXAupbDfxWw", "handle": "@CNN", "nome": "CNN", "idioma": "en", "credito": "CNN"},
        {"id": "UCvdwhh_fDyWccR42-rReZLw", "handle": "@CNNbrasil", "nome": "CNN Brasil", "idioma": "pt", "credito": "CNN Brasil"},
        {"id": "UCp6RRaz93Pt2xYZoEye_rLA", "handle": "@globonews", "nome": "GloboNews", "idioma": "pt", "credito": "GloboNews"},
        {"id": "UCP391YRAjSOdM_bwievgaZA", "handle": "@jovempannews", "nome": "Jovem Pan News", "idioma": "pt", "credito": "Jovem Pan News"},
        {"id": "UCBc9G2aqKQDaMZbeeqgNpSA", "handle": "@bloomberglineabrasil", "nome": "Bloomberg Línea Brasil", "idioma": "pt", "credito": "Bloomberg Línea"},
        {"id": "UCYxRlFDqcWM4y7FfpiAN3KQ", "handle": "@WhiteHouse", "nome": "The White House", "idioma": "en", "credito": "Casa Branca"},
        {"id": "UCb--64Gl51jIEVE-GLDAVTg", "handle": "@CSPAN", "nome": "C-SPAN", "idioma": "en", "credito": "C-SPAN"},
        {"id": "UCAzhpt9DmG6PnHXjmJTvRGQ", "handle": "@federalreserve", "nome": "Federal Reserve", "idioma": "en", "credito": "Federal Reserve"},
        {"id": "UC6ZhpmNnLxlOYipqh8wbM3A", "handle": "@StateDept", "nome": "U.S. Department of State", "idioma": "en", "credito": "Departamento de Estado dos EUA"},
        {"id": "UCpuofAxlrUAgnu7QEwKQwxw", "handle": "@deptofwar", "nome": "Department of War", "idioma": "en", "credito": "Departamento de Guerra dos EUA"}
      ]'::jsonb)
    ),
    updated_at = now()
where id = '00000000-0000-4000-8000-000000000001';

-- Conferência: tem de dizer 19.
do $$
declare
  n int;
begin
  select jsonb_array_length(settings -> 'reels' -> 'canais_youtube') into n
  from public.projects where id = '00000000-0000-4000-8000-000000000001';
  if coalesce(n, 0) <> 19 then
    raise exception 'FALHOU: settings.reels.canais_youtube tem % canais, esperado 19', n;
  end if;
  raise notice 'reels: 19 canais do YouTube gravados';
end $$;

commit;
