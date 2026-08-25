import { defaultNewsSources, NewsSourceConfig } from "./news-sources";

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
  score: number;
  dedupe_key: string;
  window_hours: number;
};

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

function parseRSSItems(xml: string, source: NewsSourceConfig): Array<{ title: string; url: string; publishedAt: string; description: string; content: string; author?: string }> {
  const items: Array<{ title: string; url: string; publishedAt: string; description: string; content: string; author?: string }> = [];

  // Match <item> ou <entry>
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
      });
    }
  }

  return items;
}

export async function collectFromSource(
  source: NewsSourceConfig,
  fetcher: typeof fetch = fetch
): Promise<NewsCandidate[]> {
  if (!source.enabled) return [];

  try {
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
    const rawItems = parseRSSItems(xmlText, source);

    return rawItems.map((item) => ({
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
  sources: NewsSourceConfig[] = defaultNewsSources,
  fetcher: typeof fetch = fetch
): Promise<{ candidates: NewsCandidate[]; sourcesAttempted: number; windowHours: number }> {
  const activeSources = sources.filter((s) => s.enabled);
  const results = await Promise.all(activeSources.map((source) => collectFromSource(source, fetcher)));

  const allCollected = results.flat();
  const now = Date.now();

  // Testar janela de 24 horas primeiro
  let windowHours = 24;
  let filtered = filterByWindow(allCollected, now, windowHours);

  // Se houver menos de 4 notícias elegíveis, expandir para 36h
  if (filtered.length < 4) {
    windowHours = 36;
    filtered = filterByWindow(allCollected, now, windowHours);
  }

  // Se ainda houver menos de 4 notícias elegíveis, expandir para 48h
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
