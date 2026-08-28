import { callOpenAIJSON, getAIProviderConfig } from "../newsroom/ai-provider";

export type TopicSuggestion = {
  topic: string;
  referenceUrls: string[];
  origin: "github" | "instagram";
  originDetail: string;
};

type PickResult = { suggestion: TopicSuggestion | null; reason?: string };

const INSTAGRAM_HASHTAGS = ["ia", "inteligenciaartificial", "claudecode", "chatgpt"];
const GITHUB_TOPICS = ["claude-code", "mcp-server", "ai-agent"];

/**
 * Alterna a fonte de inspiração por dia-do-ano: dias pares buscam um
 * repositório em alta no GitHub, dias ímpares "escutam" um post em alta no
 * Instagram via busca de hashtag. Autoexplicativo e sem precisar de estado
 * persistido — se um dia falhar ou for pulado, o padrão continua correto.
 */
export function pickSourceForToday(now = new Date()): "github" | "instagram" {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start) / 86_400_000);
  return dayOfYear % 2 === 0 ? "github" : "instagram";
}

function dayOfYearFor(now: Date): number {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  return Math.floor((now.getTime() - start) / 86_400_000);
}

/**
 * Busca o repositório mais popular criado/atualizado recentemente com temas
 * relacionados a Claude Code / agentes de IA / MCP, via API de busca pública
 * do GitHub (sem necessidade de autenticação, sujeita a rate limit menor).
 *
 * A busca por repositórios do GitHub NÃO suporta OR entre parênteses
 * combinado com outros qualificadores (`(topic:a OR topic:b) pushed:>data`
 * devolve 0 resultados silenciosamente, mesmo com milhares de repositórios
 * em cada tópico isoladamente, verificado manualmente) — por isso um único
 * tópico por vez, alternado por dia, em vez de tentar combinar vários numa
 * query só.
 */
export async function pickGitHubTrendingTopic(
  now = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<PickResult> {
  const dayOfYear = dayOfYearFor(now);
  const topic = GITHUB_TOPICS[dayOfYear % GITHUB_TOPICS.length];

  const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const query = `topic:${topic} pushed:>${since}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=10`;

  const res = await fetcher(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "desbuguei.ia-TutorialBot/1.0",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const reason = `GitHub: falha na busca (${res.status}) para topic:${topic} — ${bodyText.slice(0, 200)}`;
    console.warn(`[TUTORIAL] ${reason}`);
    return { suggestion: null, reason };
  }

  const json = await res.json().catch(() => ({}));
  const items = (json?.items ?? []) as Array<{ full_name: string; description?: string; html_url: string }>;
  if (items.length === 0) {
    const reason = `GitHub: nenhum repositório para topic:${topic} pushed:>${since}.`;
    console.warn(`[TUTORIAL] ${reason}`);
    return { suggestion: null, reason };
  }

  // Rotaciona entre os top 5 por dia, em vez de sempre pegar o #1, pra não
  // repetir o mesmo repositório toda vez que esse tópico voltar a ser sorteado.
  const repo = items[dayOfYear % Math.min(items.length, 5)];

  return {
    suggestion: {
      topic: `Como usar o repositório "${repo.full_name}" (${repo.description || "ferramenta para Claude Code"}) — guia prático`,
      referenceUrls: [repo.html_url],
      origin: "github",
      originDetail: repo.full_name,
    },
  };
}

/**
 * "Escuta" o Instagram via Hashtag Search da Graph API: acha o post com mais
 * engajamento numa hashtag do dia e usa a legenda como inspiração de assunto
 * em alta — não define o tema sozinho, só dá o gancho/ângulo do momento.
 * Precisa de conta Business conectada (INSTAGRAM_ACCOUNT_ID/ACCESS_TOKEN) e
 * do token ter o escopo instagram_basic; Hashtag Search é limitada a 30
 * hashtags únicas por período de 7 dias.
 */
export async function pickInstagramTrendingTopic(
  now = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<PickResult> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID?.trim();
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  if (!accountId || !accessToken) {
    const reason = "Instagram: INSTAGRAM_ACCOUNT_ID/ACCESS_TOKEN não configurados.";
    console.warn(`[TUTORIAL] ${reason}`);
    return { suggestion: null, reason };
  }

  const hashtag = INSTAGRAM_HASHTAGS[dayOfYearFor(now) % INSTAGRAM_HASHTAGS.length];

  const searchUrl = `https://graph.facebook.com/v22.0/ig_hashtag_search?user_id=${accountId}&q=${encodeURIComponent(hashtag)}&access_token=${encodeURIComponent(accessToken)}`;
  const searchRes = await fetcher(searchUrl, { signal: AbortSignal.timeout(10000) });
  const searchJson = await searchRes.json().catch(() => ({}));
  const hashtagId = searchJson?.data?.[0]?.id;

  if (!searchRes.ok || !hashtagId) {
    const reason = `Instagram: busca da hashtag #${hashtag} falhou (${searchRes.status}) — ${searchJson?.error?.message ?? "sem detalhe"}`;
    console.warn(`[TUTORIAL] ${reason}`);
    return { suggestion: null, reason };
  }

  const mediaUrl =
    `https://graph.facebook.com/v22.0/${hashtagId}/top_media?user_id=${accountId}` +
    `&fields=caption,like_count,comments_count,permalink&access_token=${encodeURIComponent(accessToken)}`;
  const mediaRes = await fetcher(mediaUrl, { signal: AbortSignal.timeout(10000) });
  const mediaJson = await mediaRes.json().catch(() => ({}));

  if (!mediaRes.ok) {
    const reason = `Instagram: top_media da hashtag #${hashtag} falhou (${mediaRes.status}) — ${mediaJson?.error?.message ?? "sem detalhe"}`;
    console.warn(`[TUTORIAL] ${reason}`);
    return { suggestion: null, reason };
  }

  const items = (mediaJson?.data ?? []) as Array<{
    caption?: string;
    like_count?: number;
    comments_count?: number;
    permalink?: string;
  }>;

  const top = items
    .filter((i) => i.caption)
    .sort((a, b) => (b.like_count ?? 0) + (b.comments_count ?? 0) - ((a.like_count ?? 0) + (a.comments_count ?? 0)))[0];

  if (!top) {
    const reason = `Instagram: nenhum post com legenda em alta para #${hashtag}.`;
    console.warn(`[TUTORIAL] ${reason}`);
    return { suggestion: null, reason };
  }

  const { editorModel } = getAIProviderConfig();
  const { data } = await callOpenAIJSON<{ topic: string }>(
    [
      {
        role: "system",
        content:
          "Devolva APENAS um JSON {\"topic\": \"...\"}. Dado um post em alta no Instagram, sugira UM tema específico de tutorial sobre Claude Code, um repositório do GitHub relacionado, ou uma skill de IA, que aproveite esse gancho/assunto do momento. O tema deve ser uma frase objetiva pronta para virar título de tutorial.",
      },
      {
        role: "user",
        content: `Post em alta na hashtag #${hashtag} (${(top.like_count ?? 0) + (top.comments_count ?? 0)} interações):\n"${top.caption}"`,
      },
    ],
    editorModel,
  );

  if (!data?.topic) {
    return { suggestion: null, reason: "Instagram: modelo não devolveu tema a partir da legenda." };
  }

  return {
    suggestion: {
      topic: data.topic,
      referenceUrls: top.permalink ? [top.permalink] : [],
      origin: "instagram",
      originDetail: `#${hashtag}`,
    },
  };
}

export async function pickTodaysTopic(
  now = new Date(),
): Promise<{ suggestion: TopicSuggestion | null; reasons: string[] }> {
  const primary = pickSourceForToday(now);
  const fallback = primary === "github" ? "instagram" : "github";

  const tryPick = (source: "github" | "instagram") =>
    source === "github" ? pickGitHubTrendingTopic(now) : pickInstagramTrendingTopic(now);

  const reasons: string[] = [];

  const first = await tryPick(primary);
  if (first.suggestion) return { suggestion: first.suggestion, reasons };
  if (first.reason) reasons.push(first.reason);

  const second = await tryPick(fallback);
  if (second.suggestion) return { suggestion: second.suggestion, reasons };
  if (second.reason) reasons.push(second.reason);

  return { suggestion: null, reasons };
}
