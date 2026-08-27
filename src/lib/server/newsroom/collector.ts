import { NewsSourceConfig } from "./news-sources";

export type NewsCandidate = {
  id: string;
  url: string;
  title: string;
  source_name: string;
  company_name?: string;
  priority: 1 | 2;
  author?: string;
  published_at: string;
  description: string;
  content: string;
  category: string;
  image_url?: string;
  score: number;
  dedupe_key: string;
  window_hours: number;
};

const DEFAULT_EDITORIAL_IMAGES = [
  "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=80",
];

function getRandomFallbackImage(seedStr: string): string {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % DEFAULT_EDITORIAL_IMAGES.length;
  return DEFAULT_EDITORIAL_IMAGES[index];
}

function cleanText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function generateDedupeKey(title: string, url: string): string {
  const cleanTitle = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return `${host}-${cleanTitle.slice(0, 40)}`;
  } catch {
    return cleanTitle.slice(0, 50);
  }
}

function parseRSSItems(
  xml: string,
  source: NewsSourceConfig
): Array<{ title: string; url: string; publishedAt: string; description: string; content: string; author?: string; imageUrl?: string }> {
  const items: Array<{ title: string; url: string; publishedAt: string; description: string; content: string; author?: string; imageUrl?: string }> = [];

  const itemMatches = xml.match(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi) || [];

  for (const rawItem of itemMatches) {
    const titleMatch = rawItem.match(/<title[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i);
    const rawTitle = titleMatch ? (titleMatch[1] || titleMatch[2] || "").trim() : "";

    const linkMatch = rawItem.match(/<link[^>]*href=["']([^"']+)["'][^>]*>|<link[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/link>/i);
    const rawLink = linkMatch ? (linkMatch[1] || linkMatch[2] || linkMatch[3] || "").trim() : "";

    const dateMatch = rawItem.match(/<(?:pubDate|published|updated|dc:date)[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/(?:pubDate|published|updated|dc:date)>/i);
    const rawDate = dateMatch ? (dateMatch[1] || dateMatch[2] || "").trim() : "";

    const descMatch = rawItem.match(/<(?:description|summary|content:encoded)[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/(?:description|summary|content:encoded)>/i);
    const rawDesc = descMatch ? (descMatch[1] || descMatch[2] || "").trim() : "";

    const authorMatch = rawItem.match(/<(?:dc:creator|author|name)[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/(?:dc:creator|author|name)>/i);
    const rawAuthor = authorMatch ? (authorMatch[1] || authorMatch[2] || "").trim() : undefined;

    // Extração de imagem oficial (media:content, enclosure, og:image ou img src)
    const mediaMatch = rawItem.match(/<(?:media:content|enclosure)[^>]*url=["']([^"']+)["'][^>]*>/i);
    const imgMatch = rawItem.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp|avif)[^"']*)["']/i);
    let extractedImgUrl = mediaMatch ? mediaMatch[1] : imgMatch ? imgMatch[1] : undefined;

    if (extractedImgUrl && !extractedImgUrl.startsWith("http")) {
      extractedImgUrl = undefined;
    }

    if (rawTitle && rawLink) {
      const pubDate = rawDate ? new Date(rawDate) : new Date();
      const validDate = isNaN(pubDate.getTime()) ? new Date() : pubDate;

      items.push({
        title: cleanText(rawTitle),
        url: rawLink,
        publishedAt: validDate.toISOString(),
        description: cleanText(rawDesc).slice(0, 600),
        content: cleanText(rawDesc).slice(0, 1500),
        author: rawAuthor ? cleanText(rawAuthor) : undefined,
        imageUrl: extractedImgUrl || getRandomFallbackImage(rawTitle),
      });
    }
  }

  return items;
}

type RawItem = {
  title: string;
  url: string;
  publishedAt: string;
  description: string;
  content: string;
  author?: string;
  imageUrl?: string;
};

/**
 * Business Discovery: lê os posts recentes de OUTRA conta Instagram
 * Business/Criador pública, usando a nossa própria conta configurada
 * (INSTAGRAM_ACCOUNT_ID/INSTAGRAM_ACCESS_TOKEN) como ponto de acesso.
 * Não funciona para contas pessoais nem exige consentimento do alvo —
 * é um recurso público da Graph API, mas sujeito a limite de taxa.
 */
async function fetchInstagramProfilePosts(
  source: NewsSourceConfig,
  fetcher: typeof fetch
): Promise<RawItem[]> {
  const accountId = process.env.INSTAGRAM_ACCOUNT_ID?.trim();
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const targetUsername = source.url.replace(/^@/, "").trim();

  if (!accountId || !accessToken) {
    console.warn(`[NEWSROOM] Fonte Instagram ${source.name}: INSTAGRAM_ACCOUNT_ID/ACCESS_TOKEN não configurados.`);
    return [];
  }
  if (!targetUsername) {
    console.warn(`[NEWSROOM] Fonte Instagram ${source.name}: nenhum @username configurado.`);
    return [];
  }

  const fields =
    `business_discovery.username(${encodeURIComponent(targetUsername)})` +
    `{username,media{caption,media_url,permalink,timestamp,media_type}}`;
  const url = `https://graph.facebook.com/v22.0/${accountId}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;

  const res = await fetcher(url, { signal: AbortSignal.timeout(10000) });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail = json?.error?.message || res.statusText;
    console.warn(`[NEWSROOM] Falha ao coletar perfil @${targetUsername} (${res.status}): ${detail}`);
    return [];
  }

  const media = json?.business_discovery?.media?.data as
    | Array<{ caption?: string; media_url?: string; permalink?: string; timestamp?: string }>
    | undefined;

  if (!media) return [];

  return media
    .filter((m) => m.caption && m.permalink)
    .map((m) => {
      const caption = m.caption as string;
      const firstLine = caption.split("\n")[0].slice(0, 140) || caption.slice(0, 140);
      return {
        title: firstLine,
        url: m.permalink as string,
        publishedAt: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
        description: caption.slice(0, 600),
        content: caption.slice(0, 1500),
        author: `@${targetUsername}`,
        imageUrl: m.media_url,
      };
    });
}

function matchesKeywords(item: RawItem, keywords: string[] | undefined): boolean {
  if (!keywords || keywords.length === 0) return true;
  const haystack = `${item.title} ${item.description}`.toLowerCase();
  return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

export async function collectFromSource(
  source: NewsSourceConfig,
  fetcher: typeof fetch = fetch
): Promise<NewsCandidate[]> {
  if (!source.enabled) return [];

  try {
    const rawItems =
      source.type === "instagram_profile"
        ? await fetchInstagramProfilePosts(source, fetcher)
        : await (async () => {
            const res = await fetcher(source.url, {
              headers: {
                "User-Agent": "desbuguei.ia-NewsroomBot/1.0 (+https://desbuguei.ia)",
                Accept: "application/rss+xml, application/xml, text/xml, application/atom+xml, text/html",
              },
              signal: AbortSignal.timeout(10000),
            });

            if (!res.ok) {
              console.warn(`[NEWSROOM] Falha ao coletar fonte ${source.name} (${res.status})`);
              return [];
            }

            const xmlText = await res.text();
            return parseRSSItems(xmlText, source);
          })();

    const filtered = rawItems.filter((item) => matchesKeywords(item, source.keywords));

    return filtered.map((item) => ({
      id: `cand-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url: item.url,
      title: item.title,
      source_name: source.name,
      company_name: source.companyName,
      priority: source.priority,
      author: item.author,
      published_at: item.publishedAt,
      description: item.description,
      content: item.content,
      category: source.category,
      image_url: item.imageUrl || getRandomFallbackImage(item.title),
      score: source.priority === 1 ? 75 : 60,
      dedupe_key: generateDedupeKey(item.title, item.url),
      window_hours: 24,
    }));
  } catch (err) {
    console.warn(`[NEWSROOM] Erro de timeout/conecção na fonte ${source.name}:`, err);
    return [];
  }
}

export async function collectAllNews(
  sources: NewsSourceConfig[],
  fetcher: typeof fetch = fetch
): Promise<{ candidates: NewsCandidate[]; sourcesAttempted: number; windowHours: number }> {
  const activeSources = sources.filter((s) => s.enabled);
  const results = await Promise.all(activeSources.map((source) => collectFromSource(source, fetcher)));

  const allCollected = results.flat();
  const now = Date.now();

  let windowHours = 24;
  let filtered = filterByWindow(allCollected, now, windowHours);

  if (filtered.length < 4) {
    windowHours = 36;
    filtered = filterByWindow(allCollected, now, windowHours);
  }

  if (filtered.length < 4) {
    windowHours = 48;
    filtered = filterByWindow(allCollected, now, windowHours);
  }

  return {
    candidates: filtered.map((c) => ({ ...c, window_hours: windowHours })),
    sourcesAttempted: activeSources.length,
    windowHours,
  };
}

function filterByWindow(items: NewsCandidate[], nowMs: number, windowHours: number): NewsCandidate[] {
  const windowMs = windowHours * 60 * 60 * 1000;
  return items.filter((item) => {
    const itemDate = new Date(item.published_at).getTime();
    if (isNaN(itemDate)) return false;
    const age = nowMs - itemDate;
    return age >= 0 && age <= windowMs;
  });
}
