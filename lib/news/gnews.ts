/**
 * GNews API client integration.
 * Kept isolated and server-side only behind this module.
 */

export interface NewsArticle {
  title: string;
  description?: string;
  url: string;
  imageUrl?: string;
  publishedAt: string;
  sourceName?: string;
  sourceUrl?: string;
}

export interface GNewsFetchOptions {
  query: string;
  max?: number;
  fromDaysAgo?: number;
}

export interface GNewsResponseResult {
  success: boolean;
  articles: NewsArticle[];
  error?: string;
  isQuotaOrAuthError?: boolean;
}

interface RawGNewsSource {
  name?: string;
  url?: string;
}

interface RawGNewsArticle {
  title?: unknown;
  description?: unknown;
  content?: unknown;
  url?: unknown;
  image?: unknown;
  publishedAt?: unknown;
  source?: RawGNewsSource;
}

interface RawGNewsPayload {
  totalArticles?: number;
  articles?: RawGNewsArticle[];
  errors?: string[] | string;
}

/**
 * Normalizes an external URL for deduplication.
 */
export function normalizeArticleUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr.trim());
    // Strip common tracking parameters
    parsed.searchParams.delete("utm_source");
    parsed.searchParams.delete("utm_medium");
    parsed.searchParams.delete("utm_campaign");
    parsed.searchParams.delete("utm_term");
    parsed.searchParams.delete("utm_content");
    let normalized = parsed.toString().toLowerCase();
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return urlStr.trim().toLowerCase();
  }
}

/**
 * Deduplicates a list of NewsArticles by normalized URL first, then normalized title.
 */
export function deduplicateArticles(articles: NewsArticle[]): NewsArticle[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const deduplicated: NewsArticle[] = [];

  for (const article of articles) {
    if (!article.url || !article.title) continue;

    const normUrl = normalizeArticleUrl(article.url);
    const normTitle = article.title.toLowerCase().replace(/[^a-z0-9]/g, "");

    if (seenUrls.has(normUrl) || (normTitle && seenTitles.has(normTitle))) {
      continue;
    }

    seenUrls.add(normUrl);
    if (normTitle) seenTitles.add(normTitle);
    deduplicated.push(article);
  }

  return deduplicated;
}

/**
 * Searches current news via GNews API search endpoint.
 */
export async function searchGNews(
  options: GNewsFetchOptions
): Promise<GNewsResponseResult> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      articles: [],
      error: "GNEWS_API_KEY is not configured.",
      isQuotaOrAuthError: true,
    };
  }

  const cleanQuery = options.query?.trim();
  if (!cleanQuery) {
    return {
      success: true,
      articles: [],
    };
  }

  const maxArticles = Math.min(Math.max(options.max || 8, 1), 10);
  const endpoint = new URL("https://gnews.io/api/v4/search");
  endpoint.searchParams.set("q", cleanQuery);
  endpoint.searchParams.set("lang", "en");
  endpoint.searchParams.set("max", maxArticles.toString());
  endpoint.searchParams.set("sortby", "publishedAt");
  endpoint.searchParams.set("apikey", apiKey);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(endpoint.toString(), {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
      next: { revalidate: 0 },
    });

    clearTimeout(timeout);

    if (response.status === 429) {
      console.warn("[GNews API] Rate limit hit, backing off 1500ms and retrying once...");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const retryResponse = await fetch(endpoint.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        next: { revalidate: 0 },
      });

      if (retryResponse.status === 429) {
        console.error("[GNews API] Rate limit still hit after retry");
        return {
          success: false,
          articles: [],
          error: "News search rate limit reached. Please try again shortly.",
          isQuotaOrAuthError: true,
        };
      }

      if (retryResponse.ok) {
        const data = (await retryResponse.json()) as RawGNewsPayload;
        return parseGNewsPayload(data);
      }
    }

    if (response.status === 401 || response.status === 403) {
      console.error("[GNews API] Authentication or quota exceeded:", response.status);
      return {
        success: false,
        articles: [],
        error: "News search limit reached or API key is invalid.",
        isQuotaOrAuthError: true,
      };
    }

    if (!response.ok) {
      console.error("[GNews API] Error status:", response.status, response.statusText);
      return {
        success: false,
        articles: [],
        error: `GNews request failed with status ${response.status}`,
      };
    }

    const data = (await response.json()) as RawGNewsPayload;
    return parseGNewsPayload(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Network error";
    console.error("[GNews API] Fetch error:", message);
    return {
      success: false,
      articles: [],
      error: "Could not check current news right now. Please try again later.",
    };
  }
}

function parseGNewsPayload(data: RawGNewsPayload): GNewsResponseResult {
  if (!Array.isArray(data.articles)) {
    return {
      success: true,
      articles: [],
    };
  }

  const parsedArticles: NewsArticle[] = [];

  for (const raw of data.articles) {
    if (!raw || typeof raw !== "object") continue;

    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    const url = typeof raw.url === "string" ? raw.url.trim() : "";

    if (!title || !url) continue;

    // Validate URL protocol
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    } catch {
      continue;
    }

    const description =
      typeof raw.description === "string" ? raw.description.trim() : undefined;
    const imageUrl =
      typeof raw.image === "string" && raw.image.startsWith("http")
        ? raw.image.trim()
        : undefined;
    const publishedAt =
      typeof raw.publishedAt === "string" && raw.publishedAt.trim()
        ? raw.publishedAt.trim()
        : new Date().toISOString();
    const sourceName =
      raw.source && typeof raw.source.name === "string"
        ? raw.source.name.trim()
        : undefined;
    const sourceUrl =
      raw.source && typeof raw.source.url === "string"
        ? raw.source.url.trim()
        : undefined;

    parsedArticles.push({
      title,
      description,
      url,
      imageUrl,
      publishedAt,
      sourceName,
      sourceUrl,
    });
  }

  return {
    success: true,
    articles: deduplicateArticles(parsedArticles),
  };
}
