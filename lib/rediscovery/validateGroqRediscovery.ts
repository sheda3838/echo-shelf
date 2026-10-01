/**
 * Validation logic for Groq Contextual Rediscovery matches.
 * Model output is treated as untrusted and strictly validated against fetched articles and saved items.
 */

export interface RawRediscoveryMatch {
  articleUrl?: unknown;
  savedItemId?: unknown;
  clusterId?: unknown;
  relevance?: unknown;
  reason?: unknown;
  connectionType?: unknown;
}

export interface ValidatedRediscoveryMatch {
  articleUrl: string;
  savedItemId: string;
  clusterId: string;
  relevance: "strong" | "moderate";
  reason: string;
  connectionType: string;
}

export interface RediscoveryValidationResult {
  valid: boolean;
  matches: ValidatedRediscoveryMatch[];
  errors: string[];
}

export const MAX_REDISCOVERY_RESULTS = 8;

const ALLOWED_RELEVANCE = new Set(["strong", "moderate"]);

/**
 * Validates untrusted Groq rediscovery matches against the supplied articles, saved items, and clusters.
 */
export function validateGroqRediscovery(
  raw: unknown,
  allowedArticleUrls: Set<string>,
  allowedSavedItemIds: Set<string>,
  allowedClusterIds: Set<string>
): RediscoveryValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    return {
      valid: false,
      matches: [],
      errors: ["Response is not an object"],
    };
  }

  const rawObj = raw as { matches?: unknown };
  if (!Array.isArray(rawObj.matches)) {
    return {
      valid: false,
      matches: [],
      errors: ["'matches' property is missing or not an array"],
    };
  }

  const validatedMatches: ValidatedRediscoveryMatch[] = [];
  const seenPairs = new Set<string>();

  for (let i = 0; i < rawObj.matches.length; i++) {
    if (validatedMatches.length >= MAX_REDISCOVERY_RESULTS) {
      break;
    }

    const m = rawObj.matches[i] as RawRediscoveryMatch;
    if (!m || typeof m !== "object") {
      errors.push(`Match #${i + 1}: Not an object`);
      continue;
    }

    // 1. Validate articleUrl
    const rawArticleUrl = typeof m.articleUrl === "string" ? m.articleUrl.trim() : "";
    if (!rawArticleUrl || !allowedArticleUrls.has(rawArticleUrl)) {
      errors.push(`Match #${i + 1}: Article URL does not exist in fetched articles`);
      continue;
    }

    // 2. Validate savedItemId
    const rawSavedItemId = typeof m.savedItemId === "string" ? m.savedItemId.trim() : "";
    if (!rawSavedItemId || !allowedSavedItemIds.has(rawSavedItemId)) {
      errors.push(`Match #${i + 1}: Saved item ID does not exist in candidate library`);
      continue;
    }

    // 3. Validate clusterId
    let rawClusterId = typeof m.clusterId === "string" ? m.clusterId.trim() : "";
    if (!rawClusterId || !allowedClusterIds.has(rawClusterId)) {
      // If missing or hallucinated, fallback to first allowed cluster if only 1, otherwise flag error
      if (allowedClusterIds.size === 1) {
        rawClusterId = Array.from(allowedClusterIds)[0];
      } else {
        errors.push(`Match #${i + 1}: Cluster ID does not exist in allowed clusters`);
        continue;
      }
    }

    // 4. Validate relevance ("strong" or "moderate")
    const rawRelevance =
      typeof m.relevance === "string" ? m.relevance.trim().toLowerCase() : "";
    if (!ALLOWED_RELEVANCE.has(rawRelevance)) {
      errors.push(`Match #${i + 1}: Relevance must be 'strong' or 'moderate'`);
      continue;
    }

    // 5. Validate reason
    const rawReason = typeof m.reason === "string" ? m.reason.trim() : "";
    if (!rawReason || rawReason.length < 15 || rawReason.length > 1500) {
      errors.push(`Match #${i + 1}: Reason is missing or too short (< 15 chars)`);
      continue;
    }

    // 6. Validate connectionType
    const rawConnectionType =
      typeof m.connectionType === "string" ? m.connectionType.trim().toLowerCase() : "";
    const cleanConnectionType = rawConnectionType.replace(/[^a-z0-9-]/g, "-") || "related-development";

    // 7. Deduplicate article-item pair
    const pairKey = `${rawArticleUrl}::${rawSavedItemId}`;
    if (seenPairs.has(pairKey)) {
      errors.push(`Match #${i + 1}: Duplicate article-item pair`);
      continue;
    }

    seenPairs.add(pairKey);
    validatedMatches.push({
      articleUrl: rawArticleUrl,
      savedItemId: rawSavedItemId,
      clusterId: rawClusterId,
      relevance: rawRelevance as "strong" | "moderate",
      reason: rawReason,
      connectionType: cleanConnectionType,
    });
  }

  return {
    valid: validatedMatches.length > 0,
    matches: validatedMatches,
    errors,
  };
}
