import { getSupabaseAdminClient } from "../supabase-admin";
import { DEFAULT_PROJECT_ID } from "../projects";
import type { InstagramCarouselContent } from "../social/instagram/schemas";

/**
 * Etapa 6 — o carrossel do formato `prompt`, montado dos assets da campanha.
 *
 * Capa mais um slide de tela cheia por resultado gerado. É o que liga
 * `prompt_assets` ao `bg_image_url` dos slides: as imagens eram geradas na
 * etapa 4 e ficavam no banco sem nunca chegar a um post.
 *
 * **Montado sem chamar LLM, de propósito.** As outras duas formas precisam de
 * um modelo porque partem de texto corrido — uma edição de newsletter, um
 * artigo. Esta parte de dados que já existem: o hook do conceito, as
 * aplicações e as imagens. Passar isso por um modelo só acrescentaria uma
 * chance de o post do dia falhar, e um risco de alucinação num conteúdo cuja
 * razão de existir é entregar prompts exatos.
 *
 * A consequência é que o mesmo conceito sempre gera o mesmo post. Para este
 * formato isso é desejável: o carrossel é a vitrine dos resultados, e a
 * variação criativa mora no conceito, não na montagem.
 */

const MAX_SLIDES = 12;

/** Corta no limite do schema sem cortar palavra no meio. */
function limitar(texto: string, max: number): string {
  const limpo = texto.trim().replace(/\s+/g, " ");
  if (limpo.length <= max) return limpo;

  const cortado = limpo.slice(0, max - 1);
  const ultimoEspaco = cortado.lastIndexOf(" ");
  return (ultimoEspaco > max * 0.6 ? cortado.slice(0, ultimoEspaco) : cortado).trim() + "…";
}

/** Completa até o mínimo do schema sem inventar conteúdo novo. */
function aoMenos(texto: string, min: number, complemento: string): string {
  const base = texto.trim();
  if (base.length >= min) return base;
  return `${base} ${complemento}`.trim();
}

export type CarrosselDeCampanha = {
  carousel: InstagramCarouselContent;
  campanha: { id: string; keyword: string; theme: string };
  semImagem: number;
};

export async function montarCarrosselDeCampanha(
  campaignId: string,
): Promise<CarrosselDeCampanha> {
  const supabase = getSupabaseAdminClient();

  const { data: campanha } = await supabase
    .from("prompt_campaigns")
    .select("id, keyword, theme, concept_id")
    .eq("id", campaignId)
    .eq("project_id", DEFAULT_PROJECT_ID)
    .maybeSingle();

  if (!campanha) throw new Error(`Campanha ${campaignId} não encontrada.`);

  const [{ data: conceito }, { data: assets }] = await Promise.all([
    campanha.concept_id
      ? supabase
          .from("prompt_concepts")
          .select("concept, hook, applications")
          .eq("id", campanha.concept_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("prompt_assets")
      .select("label, prompt_text, image_url")
      .eq("campaign_id", campaignId)
      .order("label"),
  ]);

  const comImagem = (assets ?? []).filter((a) => a.image_url);
  const semImagem = (assets ?? []).length - comImagem.length;

  if (comImagem.length === 0) {
    throw new Error(
      "A campanha não tem nenhum asset com imagem. Rode a geração visual " +
        "(etapa 4) antes de montar o post — o corpo deste formato são as imagens.",
    );
  }

  const keyword = String(campanha.keyword);
  const tema = String(campanha.theme ?? "").trim();
  const hook = String(conceito?.hook ?? "").trim();
  const conceitoTexto = String(conceito?.concept ?? "").trim();

  const titulo = hook || tema || `Os prompts de ${keyword}`;
  const aplicacoes = Array.isArray(conceito?.applications)
    ? (conceito.applications as unknown[]).map((a) => String(a ?? "").trim()).filter(Boolean)
    : [];

  // A capa reusa a primeira imagem: ela é o resultado mais forte, e é o que a
  // etapa 6 pede — a pessoa vê primeiro o que poderia criar.
  const slides: InstagramCarouselContent["slides"] = [
    {
      index: 1,
      type: "cover" as const,
      eyebrow: "ULTRAPROMPT",
      title: limitar(titulo, 120),
      body: limitar(conceitoTexto, 1200),
      bullet_points: [],
      highlight_text: "",
      variant: "",
      cover_variant: "dark_speaker" as const,
      headline_style: "clean" as const,
      cover_image_prompt: "",
      bg_image_url: comImagem[0].image_url as string,
      cta_text: "",
    },
  ];

  for (const asset of comImagem.slice(0, MAX_SLIDES - 1)) {
    slides.push({
      index: slides.length + 1,
      type: "gallery" as const,
      eyebrow: "",
      // O título não aparece no slide de tela cheia, mas o schema exige e ele
      // serve de legenda interna no preview do painel.
      title: limitar(asset.label as string, 120),
      body: "",
      bullet_points: [],
      highlight_text: "",
      variant: "",
      cover_variant: "dark_speaker" as const,
      headline_style: "clean" as const,
      cover_image_prompt: "",
      bg_image_url: asset.image_url as string,
      cta_text: "",
    });
  }

  const chamada = `Comente ${keyword} e eu te mando os prompts exatos no Direct.`;
  const resumo = aoMenos(
    conceitoTexto || titulo,
    20,
    "Os prompts exatos que geraram estes resultados.",
  );

  const legenda = [
    titulo,
    "",
    resumo,
    "",
    ...(aplicacoes.length ? aplicacoes.slice(0, 5).map((a) => `• ${a}`) : []),
    "",
    chamada,
    "",
    "Agora você está desbugado.",
  ].join("\n");

  return {
    campanha: { id: campanha.id as string, keyword, theme: tema },
    semImagem,
    carousel: {
      title: limitar(titulo, 100),
      edition_date: new Date().toISOString().slice(0, 10),
      primary_topic: limitar(tema || titulo, 80),
      target_audience_focus: "Criadores, Vendedores & Empreendedores",
      format: "prompt" as const,
      slides,
      caption: {
        headline: aoMenos(limitar(titulo, 100), 10, "— UltraPrompt"),
        intro_summary: limitar(resumo, 300),
        // O schema exige ao menos dois; as aplicações são a fonte natural, e o
        // fallback nomeia o que a pessoa recebe em vez de encher linguiça.
        key_takeaways:
          aplicacoes.length >= 2
            ? aplicacoes.slice(0, 5).map((a) => limitar(a, 120))
            : ["Os prompts exatos, um por resultado", "O que trocar para adaptar ao seu caso"],
        cta_call: limitar(chamada, 150),
        hashtags: ["#ia", "#prompts", "#inteligenciaartificial", "#desbuguei", "#criadoresdeconteudo"],
        full_caption: limitar(aoMenos(legenda, 50, chamada), 2000),
      },
    },
  };
}

/**
 * Agenda o post da campanha, para o worker consumir no horário.
 *
 * Vai por `social_posts` como qualquer outro post: é lá que a fila entre o
 * servidor e o worker vive, e o worker é quem tem Chromium para renderizar.
 * Um caminho próprio para este formato duplicaria retentativa, marcação de
 * falha e alerta.
 *
 * A montagem roda **antes** do agendamento, de propósito: se a campanha não
 * tem imagem gerada, é melhor recusar aqui — com a mensagem dizendo para rodar
 * a etapa 4 — que agendar uma vaga que vai falhar no worker daqui a quinze
 * minutos, quando ninguém estiver olhando.
 */
export async function agendarPostDaCampanha(
  campaignId: string,
  quando: Date = new Date(),
): Promise<{ socialPostId: string; slides: number; semImagem: number }> {
  const { carousel, campanha, semImagem } = await montarCarrosselDeCampanha(campaignId);

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("social_posts")
    .upsert(
      {
        project_id: DEFAULT_PROJECT_ID,
        campaign_id: campaignId,
        edition_date: quando.toISOString().slice(0, 10),
        platform: "instagram",
        post_type: "carousel",
        title: carousel.title,
        status: "scheduled",
        scheduled_at: quando.toISOString(),
        // Uma campanha rende um post: a keyword é única por projeto, então ela
        // já é a chave. Reagendar a mesma campanha atualiza a vaga em vez de
        // criar uma segunda.
        idempotency_key: `prompt-${campanha.keyword}`,
        content_json: { format: "prompt", campaign_id: campaignId, keyword: campanha.keyword },
        dry_run: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,idempotency_key" },
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Falha ao agendar o post da campanha: ${error?.message}`);
  }

  return { socialPostId: data.id as string, slides: carousel.slides.length, semImagem };
}
