import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export type ExtractedContent = {
  sourceType: "article" | "url";
  sourceUrl: string;
  title?: string;
  text: string;
  excerpt?: string;
  author?: string;
  siteName?: string;
};

export type ExtractionResult =
  | { success: true; data: ExtractedContent }
  | { success: false; error: string };

/**
 * Maximum character limit for extracted body text sent to Groq.
 * Keeps context within high-quality token limits while preserving
 * the beginning and main body of the article.
 */
export const MAX_EXTRACTED_TEXT_LENGTH = 15000;

/**
 * Request timeout for webpage fetching in milliseconds.
 */
const FETCH_TIMEOUT_MS = 10000;

/**
 * Cleans and collapses excess whitespace and multiple line breaks.
 */
function cleanWhitespace(str: string): string {
  return str
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * Server-side extractor for Article and generic Webpage content.
 * Uses jsdom and @mozilla/readability to extract clean article text.
 * Never leaks raw HTML, API keys, or raw stack traces.
 */
export async function extractWebArticle(
  inputUrl: string,
  sourceType: "article" | "url" = "article"
): Promise<ExtractionResult> {
  const trimmed = inputUrl.trim();
  if (!trimmed) {
    return { success: false, error: "Please enter a valid webpage URL." };
  }

  // 1. Protocol and URL validation
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return { success: false, error: "Please enter a valid web URL." };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      success: false,
      error: "This page type is not supported yet (only http and https URLs are allowed).",
    };
  }

  // Reject local/private network addresses for security
  const hostname = parsedUrl.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return {
      success: false,
      error: "Local or private network URLs cannot be accessed.",
    };
  }

  // 2. Fetch webpage HTML on the server with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(parsedUrl.href, {
      signal: controller.signal,
      headers: {
        // Standard browser headers to ensure clean access to public articles
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Ch-Ua":
          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
      cache: "no-store",
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return {
        success: false,
        error: "Could not access this webpage (request timed out).",
      };
    }
    return {
      success: false,
      error: "Could not access this webpage. Please verify the URL and try again.",
    };
  } finally {
    clearTimeout(timeoutId);
  }

  // 3. Reject failed or non-HTML responses with precise error categorization
  if (!response.ok) {
    if (response.status === 401) {
      return {
        success: false,
        error: "This webpage requires authentication or login to access.",
      };
    }
    if (response.status === 403) {
      return {
        success: false,
        error:
          "This website blocked automated reading. You can paste the relevant text manually instead.",
      };
    }
    if (response.status === 404) {
      return {
        success: false,
        error: "Webpage not found (404). Please verify the link.",
      };
    }
    return {
      success: false,
      error: `Could not access this webpage (HTTP ${response.status}).`,
    };
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (
    contentType &&
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml+xml")
  ) {
    return {
      success: false,
      error: "This page type is not supported yet (webpage is not HTML).",
    };
  }

  let html: string;
  try {
    html = await response.text();
  } catch {
    return {
      success: false,
      error: "Could not read the webpage content.",
    };
  }

  if (!html || html.trim().length === 0) {
    return {
      success: false,
      error: "The webpage returned an empty response.",
    };
  }

  // 4. Create DOM and extract readable article via Mozilla Readability
  let dom: JSDOM;
  try {
    dom = new JSDOM(html, { url: parsedUrl.href });
  } catch {
    return {
      success: false,
      error: "Could not parse webpage content.",
    };
  }

  const document = dom.window.document;

  // Remove scripts, styles, and noscript elements before parsing
  const unwantedNodes = document.querySelectorAll("script, style, noscript, svg");
  unwantedNodes.forEach((node) => node.remove());

  // Extract meta tags for fallback metadata
  const metaDescription =
    document.querySelector('meta[name="description" i]')?.getAttribute("content") ||
    document.querySelector('meta[property="og:description" i]')?.getAttribute("content") ||
    undefined;

  const metaAuthor =
    document.querySelector('meta[name="author" i]')?.getAttribute("content") ||
    document.querySelector('meta[property="article:author" i]')?.getAttribute("content") ||
    undefined;

  const metaSiteName =
    document.querySelector('meta[property="og:site_name" i]')?.getAttribute("content") ||
    undefined;

  const docTitle = document.title?.trim() || undefined;

  let article;
  try {
    const reader = new Readability(document);
    article = reader.parse();
  } catch {
    // Readability parse error
    article = null;
  }

  // Check if meaningful readable content was extracted
  const rawTextContent = article?.textContent ? cleanWhitespace(article.textContent) : "";

  // If Readability succeeded and found substantial text
  let finalArticleText = "";
  if (rawTextContent && rawTextContent.length >= 80) {
    finalArticleText = rawTextContent;
  } else {
    // Fallback: Check if document body has meaningful content (e.g. minimalist essays, plain web pages)
    const bodyText = document.body ? cleanWhitespace(document.body.textContent || "") : "";
    if (bodyText.length >= 100) {
      finalArticleText = bodyText;
    }
  }

  if (!finalArticleText || finalArticleText.length < 80) {
    return {
      success: false,
      error: "No readable article content was found. The page might require JavaScript or login.",
    };
  }

  // 5. Apply text cap
  const cappedText =
    finalArticleText.length > MAX_EXTRACTED_TEXT_LENGTH
      ? finalArticleText.slice(0, MAX_EXTRACTED_TEXT_LENGTH).trim() + "..."
      : finalArticleText;

  const title = (article?.title?.trim() || docTitle || "").trim() || undefined;
  const excerpt = (article?.excerpt?.trim() || metaDescription?.trim() || "").trim() || undefined;
  const author = (article?.byline?.trim() || metaAuthor?.trim() || "").trim() || undefined;
  const siteName =
    (article?.siteName?.trim() || metaSiteName?.trim() || parsedUrl.hostname.replace(/^www\./, "")).trim() ||
    undefined;

  return {
    success: true,
    data: {
      sourceType,
      sourceUrl: parsedUrl.href,
      title,
      text: cappedText,
      excerpt,
      author,
      siteName,
    },
  };
}
