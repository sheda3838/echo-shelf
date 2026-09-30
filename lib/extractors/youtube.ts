export type ExtractedYouTubeVideo = {
  sourceType: "video";
  provider: "youtube";
  sourceUrl: string;
  videoId: string;
  title: string;
  description?: string;
  channelTitle?: string;
  channelId?: string;
  publishedAt?: string;
  tags?: string[];
  duration?: string;
  thumbnailUrl?: string;
};

export type YouTubeExtractionResult =
  | { success: true; data: ExtractedYouTubeVideo }
  | { success: false; error: string };

/**
 * Maximum character limit for YouTube video description context passed to Groq.
 */
export const MAX_YOUTUBE_TEXT_LENGTH = 15000;

/**
 * Request timeout for YouTube API calls in milliseconds.
 */
const YOUTUBE_FETCH_TIMEOUT_MS = 10000;

/**
 * Cleans excessive whitespace and collapses multiple blank lines.
 */
function cleanWhitespace(str: string): string {
  return str
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * Parses and formats ISO 8601 duration string (e.g. PT3M33S -> 3m 33s).
 */
function formatDuration(isoDuration?: string): string | undefined {
  if (!isoDuration) return undefined;
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return isoDuration;
  const hours = match[1] ? `${match[1]}h ` : "";
  const minutes = match[2] ? `${match[2]}m ` : "";
  const seconds = match[3] ? `${match[3]}s` : "";
  const readable = `${hours}${minutes}${seconds}`.trim();
  return readable || isoDuration;
}

/**
 * Extracts the 11-character YouTube video ID and verifies if the URL belongs to YouTube.
 */
export function extractYouTubeVideoId(inputUrl: string): {
  videoId: string | null;
  isYouTubeDomain: boolean;
} {
  const trimmed = inputUrl.trim();
  if (!trimmed) {
    return { videoId: null, isYouTubeDomain: false };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { videoId: null, isYouTubeDomain: false };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { videoId: null, isYouTubeDomain: false };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const isYouTube = host === "youtube.com" || host === "youtu.be";
  if (!isYouTube) {
    return { videoId: null, isYouTubeDomain: false };
  }

  let videoId: string | null = null;

  if (host === "youtu.be") {
    // Format: https://youtu.be/VIDEO_ID
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      videoId = segments[0];
    }
  } else if (host === "youtube.com") {
    const pathname = parsed.pathname;
    if (pathname === "/watch") {
      // Format: https://youtube.com/watch?v=VIDEO_ID
      videoId = parsed.searchParams.get("v");
    } else if (pathname.startsWith("/shorts/")) {
      // Format: https://youtube.com/shorts/VIDEO_ID
      const segments = pathname.split("/").filter(Boolean);
      if (segments.length >= 2) {
        videoId = segments[1];
      }
    } else if (pathname.startsWith("/embed/")) {
      // Format: https://youtube.com/embed/VIDEO_ID
      const segments = pathname.split("/").filter(Boolean);
      if (segments.length >= 2) {
        videoId = segments[1];
      }
    } else if (pathname.startsWith("/v/")) {
      // Format: https://youtube.com/v/VIDEO_ID
      const segments = pathname.split("/").filter(Boolean);
      if (segments.length >= 2) {
        videoId = segments[1];
      }
    }
  }

  if (videoId) {
    videoId = videoId.trim();
    // Validate standard YouTube 11-character video ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return { videoId, isYouTubeDomain: true };
    }
  }

  return { videoId: null, isYouTubeDomain: true };
}

/**
 * Server-only extractor for YouTube videos using the official YouTube Data API v3.
 * Never exposes the YOUTUBE_API_KEY, raw API responses, or internal stack traces.
 */
export async function extractYouTubeVideo(
  inputUrl: string
): Promise<YouTubeExtractionResult> {
  const { videoId, isYouTubeDomain } = extractYouTubeVideoId(inputUrl);

  // Reject unsupported video providers (e.g. Vimeo, Dailymotion)
  if (!isYouTubeDomain) {
    return {
      success: false,
      error: "This video provider is not supported yet. Echo Shelf currently supports YouTube videos.",
    };
  }

  // Reject invalid YouTube URLs (e.g. homepage, channel URL, malformed ID)
  if (!videoId) {
    return {
      success: false,
      error: "Please enter a valid YouTube video URL.",
    };
  }

  // Verify server-side API key configuration
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    console.error("YOUTUBE_API_KEY is not configured in server environment.");
    return {
      success: false,
      error: "YouTube extraction is not configured.",
    };
  }

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(
    videoId
  )}&key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), YOUTUBE_FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return {
        success: false,
        error: "Could not access YouTube metadata. Please try again.",
      };
    }
    return {
      success: false,
      error: "Could not access YouTube metadata. Please try again.",
    };
  } finally {
    clearTimeout(timeoutId);
  }

  // Check HTTP response status and error messages
  if (!response.ok) {
    let errorReason = "";
    let errorMessage = "";
    try {
      const errJson = (await response.json()) as {
        error?: {
          errors?: Array<{ reason?: string }>;
          message?: string;
        };
      };
      errorReason = errJson.error?.errors?.[0]?.reason || "";
      errorMessage = errJson.error?.message || "";
    } catch {
      // Ignore JSON parse errors on failure response
    }

    if (
      response.status === 429 ||
      errorReason === "quotaExceeded" ||
      errorMessage.toLowerCase().includes("quota")
    ) {
      return {
        success: false,
        error: "YouTube API quota reached. Please try again later.",
      };
    }

    if (errorReason === "keyInvalid" || errorMessage.includes("API key not valid")) {
      return {
        success: false,
        error: "YouTube extraction is not configured.",
      };
    }

    return {
      success: false,
      error: "Could not access YouTube metadata. Please try again.",
    };
  }

  let data: {
    items?: Array<{
      id?: string;
      snippet?: {
        title?: string;
        description?: string;
        channelTitle?: string;
        channelId?: string;
        publishedAt?: string;
        tags?: string[];
        thumbnails?: {
          maxres?: { url?: string };
          high?: { url?: string };
          medium?: { url?: string };
          default?: { url?: string };
        };
      };
      contentDetails?: {
        duration?: string;
      };
    }>;
  };

  try {
    data = (await response.json()) as typeof data;
  } catch {
    return {
      success: false,
      error: "Could not access YouTube metadata. Please try again.",
    };
  }

  // If items array is empty, video is deleted, private, or nonexistent
  if (!data.items || data.items.length === 0) {
    return {
      success: false,
      error: "YouTube video not found or unavailable.",
    };
  }

  const item = data.items[0];
  const snippet = item.snippet;
  const contentDetails = item.contentDetails;

  const rawTitle = snippet?.title?.trim() || "";
  if (!rawTitle) {
    return {
      success: false,
      error: "YouTube video not found or unavailable.",
    };
  }

  const title = cleanWhitespace(rawTitle);

  let description: string | undefined = undefined;
  if (snippet?.description) {
    const cleanedDesc = cleanWhitespace(snippet.description);
    if (cleanedDesc) {
      description =
        cleanedDesc.length > MAX_YOUTUBE_TEXT_LENGTH
          ? cleanedDesc.slice(0, MAX_YOUTUBE_TEXT_LENGTH).trim() + "..."
          : cleanedDesc;
    }
  }

  const channelTitle = snippet?.channelTitle?.trim() || undefined;
  const channelId = snippet?.channelId?.trim() || undefined;
  const publishedAt = snippet?.publishedAt?.trim() || undefined;

  let tags: string[] | undefined = undefined;
  if (Array.isArray(snippet?.tags)) {
    const cleanedTags = snippet.tags
      .map((t) => (typeof t === "string" ? cleanWhitespace(t) : ""))
      .filter((t) => t.length > 0);
    if (cleanedTags.length > 0) {
      tags = cleanedTags;
    }
  }

  const duration = formatDuration(contentDetails?.duration);
  const thumbnailUrl =
    snippet?.thumbnails?.maxres?.url ||
    snippet?.thumbnails?.high?.url ||
    snippet?.thumbnails?.medium?.url ||
    snippet?.thumbnails?.default?.url ||
    undefined;

  return {
    success: true,
    data: {
      sourceType: "video",
      provider: "youtube",
      sourceUrl: canonicalUrl,
      videoId,
      title,
      description,
      channelTitle,
      channelId,
      publishedAt,
      tags,
      duration,
      thumbnailUrl,
    },
  };
}
