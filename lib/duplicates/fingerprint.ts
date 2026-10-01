import crypto from "crypto";

/**
 * Normalizes a URL for deterministic duplicate detection.
 * - Lowercases hostname
 * - Removes URL fragment/hash
 * - Strips trailing slashes on pathnames
 * - Removes common tracking query parameters (utm_*, fbclid, gclid)
 * - Preserves meaningful query parameters (e.g. YouTube 'v', search queries)
 * - Deterministically sorts remaining query parameters
 */
export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed.toLowerCase();
  }

  // 1. Lowercase protocol and hostname
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();

  // 2. Remove fragment / hash
  parsed.hash = "";

  // 3. Remove trailing slashes on subpath
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  // 4. Filter tracking query parameters
  const TRACKING_PARAMS = new Set([
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "fbclid",
    "gclid",
  ]);

  const remainingParams: [string, string][] = [];
  parsed.searchParams.forEach((value, key) => {
    if (!TRACKING_PARAMS.has(key.toLowerCase())) {
      remainingParams.push([key, value]);
    }
  });

  // 5. Deterministically sort remaining query parameters
  remainingParams.sort(([aKey, aVal], [bKey, bVal]) => {
    if (aKey === bKey) return aVal.localeCompare(bVal);
    return aKey.localeCompare(bKey);
  });

  // Rebuild clean search string
  parsed.search = "";
  for (const [key, value] of remainingParams) {
    parsed.searchParams.append(key, value);
  }

  return parsed.toString();
}

/**
 * Normalizes note content for exact text duplicate detection.
 * - Trims leading / trailing whitespace
 * - Normalizes line endings (\r\n -> \n)
 * - Collapses repeated whitespace to single spaces
 * - Lowercases for case-insensitive exact content comparison
 */
export function normalizeNoteText(rawText: string): string {
  return rawText
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Computes SHA-256 hash of a UTF-8 string using Node.js crypto.
 */
export function hashString(str: string): string {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

/**
 * Computes SHA-256 hash of raw file bytes using Node.js crypto.
 */
export function hashBuffer(buf: Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Constructs a deterministic duplicate fingerprint for a URL source.
 * Format: url:<sha256>
 */
export function buildUrlFingerprint(rawUrl: string): string {
  const normalized = normalizeUrl(rawUrl);
  return `url:${hashString(normalized)}`;
}

/**
 * Constructs a deterministic duplicate fingerprint for a note source.
 * Format: note:<sha256>
 */
export function buildNoteFingerprint(rawText: string): string {
  const normalized = normalizeNoteText(rawText);
  return `note:${hashString(normalized)}`;
}

/**
 * Constructs a deterministic duplicate fingerprint for an uploaded file source (document/image).
 * Format: file:<sha256>
 */
export function buildFileFingerprint(buf: Buffer | Uint8Array): string {
  return `file:${hashBuffer(buf)}`;
}

/**
 * High-level helper to generate a duplicate fingerprint from available source inputs.
 */
export function buildDuplicateFingerprint(params: {
  contentType: string;
  sourceUrl?: string;
  sourceText?: string;
  fileBuffer?: Buffer | Uint8Array;
}): string | null {
  const { contentType, sourceUrl, sourceText, fileBuffer } = params;

  if (["article", "video", "repo", "url"].includes(contentType) && sourceUrl) {
    return buildUrlFingerprint(sourceUrl);
  }

  if (contentType === "note" && sourceText) {
    return buildNoteFingerprint(sourceText);
  }

  if (["document", "image"].includes(contentType) && fileBuffer) {
    return buildFileFingerprint(fileBuffer);
  }

  if (contentType === "other") {
    if (fileBuffer) {
      return buildFileFingerprint(fileBuffer);
    }
    if (sourceUrl) {
      return buildUrlFingerprint(sourceUrl);
    }
    if (sourceText) {
      return buildNoteFingerprint(sourceText);
    }
  }

  return null;
}
