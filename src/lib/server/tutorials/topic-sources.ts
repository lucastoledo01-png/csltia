import { callOpenAIJSON, getAIProviderConfig } from "../newsroom/ai-provider";

export type TopicSuggestion = {
  topic: string;
  referenceUrls: string[];
  origin: "github" | "instagram";
  originDetail: string;
};

const INSTAGRAM_HASHTAGS = ["ia", "inteligenciaartificial", "claudecode", "chatgpt"];

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

function hashtagForToday(now = new Date()): string {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start) / 86_400_000);
  return INSTAGRAM_HASHTAGS[dayOfYear % INSTAGRAM_HASHTAGS.length];
}

/**
 * Busca o repositório mais popular criado/atualizado recentemente com temas
 * relacionados a Claude Code / agentes de IA / MCP, via API de busca pública
 * do GitHub (sem necessidade de autenticação, sujeita a rate limit menor).
 */
export async function pickGitHubTrendingTopic(
  fetcher: typeof fetch = fetch,
): Promise<TopicSuggestion | null> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const query = `(topic:claude-code OR topic:mcp-server OR topic:ai-agent OR "claude code" in:name,description) pushed:>${since}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=5`;

  const res = await fetcher(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "desbuguei.ia-TutorialBot/1.0",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    console.warn(`[TUTORIAL] Falha na busca do GitHub (${res.status})`);
    return null;
  }

  const json = await res.json().catch(() => ({}));
  const repo = json?.items?.[0];
  if (!repo) return null;

  return {
    topic: `Como usar o repositório "${repo.full_name}" (${repo.description || "ferramenta para Claude Code"}) — guia prático`,
    referenceUrls: [repo.html_url],
    origin: "github",
    originDetail: repo.full_name,
  };
}

/**
 * "Escuta" o Instagram via Hashtag Search da Graph API: acha o post com mais
 * engajamento numa hashtag do dia e usa a legenda como inspiração de assunto
 * em alta — não define o tema sozinho, só dá o gancho/ângulo do momento.
 * Precisa de conta Business conectada (INSTAGRAM_ACCOUNT_ID/ACCESS_TOKEN).
 */
export async function pickInstagramTrendingTopic(
  fetcher: typeof fetch = fetch,
): Promise<TopicSuggestion | null> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID?.trim();
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  if (!accountId || !accessToken) {
    console.warn("[TUTORIAL] INSTAGRAM_ACCOUNT_ID/ACCESS_TOKEN não configurados, pulando fonte Instagram.");
    return null;
  }

  const hashtag = hashtagForToday();

  const searchUrl = `https://graph.facebook.com/v22.0/ig_hashtag_search?user_id=${accountId}&q=${encodeURIComponent(hashtag)}&access_token=${encodeURIComponent(accessToken)}`;
  const searchRes = await fetcher(searchUrl, { signal: AbortSignal.timeout(10000) });
  const searchJson = await searchRes.json().catch(() => ({}));
  const hashtagId = searchJson?.data?.[0]?.id;

  if (!searchRes.ok || !hashtagId) {
    console.warn(`[TUTORIAL] Hashtag #${hashtag} não encontrada ou falha na busca:`, searchJson?.error?.message);
    return null;
  }

  const mediaUrl =
    `https://graph.facebook.com/v22.0/${hashtagId}/top_media?user_id=${accountId}` +
    `&fields=caption,like_count,comments_count,permalink&access_token=${encodeURIComponent(accessToken)}`;
  const mediaRes = await fetcher(mediaUrl, { signal: AbortSignal.timeout(10000) });
  const mediaJson = await mediaRes.json().catch(() => ({}));
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
    console.warn(`[TUTORIAL] Sem posts com legenda para #${hashtag}.`);
    return null;
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

  if (!data?.topic) return null;

  return {
    topic: data.topic,
    referenceUrls: top.permalink ? [top.permalink] : [],
    origin: "instagram",
    originDetail: `#${hashtag}`,
  };
}

export async function pickTodaysTopic(now = new Date()): Promise<TopicSuggestion | null> {
  const primary = pickSourceForToday(now);
  const fallback = primary === "github" ? "instagram" : "github";

  const tryPick = (source: "github" | "instagram") =>
    source === "github" ? pickGitHubTrendingTopic() : pickInstagramTrendingTopic();

  return (await tryPick(primary)) ?? (await tryPick(fallback));
}
