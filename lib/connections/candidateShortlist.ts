import type { SanityClient } from "next-sanity";

/**
 * Clean input shape for candidate shortlisting
 */
export type ConnectionCandidateInput = {
  title: string;
  description: string;
  tags: string[];
  excludeId?: string;
};

/**
 * Shape of existing candidate documents fetched from Sanity
 */
export interface CandidateDocument {
  _id: string;
  title: string;
  description: string;
  tags: string[];
  contentType?: string;
}

/**
 * Detailed scoring breakdown for development diagnostics
 */
export interface CandidateScoringBreakdown {
  tagScore: number;
  titleScore: number;
  descriptionScore: number;
  tagMatches: string[];
  titleMatches: string[];
  descriptionMatches: string[];
}

/**
 * Ranked candidate result with internal score and debug breakdown
 */
export interface ScoredCandidate {
  item: CandidateDocument;
  score: number;
  breakdown: CandidateScoringBreakdown;
}

export interface ShortlistOptions {
  threshold?: number;
  limit?: number;
}

/**
 * Lightweight stop words set for keyword filtering.
 * Excludes grammatical glue words and common generic documentation filler tokens.
 */
export const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "at",
  "by", "from", "as", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "it", "its", "this", "that",
  "these", "those", "how", "what", "why", "when", "where", "which", "who",
  "whom", "basics", "introduction", "overview", "guide", "notes", "using",
  "explore", "exploring", "about", "into", "all", "any", "both", "each",
  "some", "such", "than", "too", "very", "can", "will", "just", "should",
]);

/**
 * Configurable weights for deterministic scoring
 */
export const SCORING_WEIGHTS = {
  tag: 0.60,
  title: 0.25,
  description: 0.15,
} as const;

export const DEFAULT_THRESHOLD = 0.04;
export const DEFAULT_LIMIT = 5;

/**
 * Normalizes a single tag: lowercase, trimmed, collapsed whitespace
 */
export function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim().replace(/\s+/g, "-");
}

/**
 * Normalizes an array of tags: lowercased, trimmed, empty removed, deduplicated
 */
export function normalizeTags(tags: string[] | undefined | null): string[] {
  if (!tags || !Array.isArray(tags)) return [];
  const set = new Set<string>();
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const cleaned = normalizeTag(raw);
    if (cleaned.length > 0) {
      set.add(cleaned);
    }
  }
  return Array.from(set);
}

/**
 * Lightweight rule-based suffix normalizer (stemmer)
 * Keeps code zero-dependency and predictable.
 */
export function stemWord(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("ing") && word.length > 5) {
    const base = word.slice(0, -3);
    // Double consonant at end, e.g. mapping -> map
    if (base.length > 3 && base[base.length - 1] === base[base.length - 2]) {
      return base.slice(0, -1);
    }
    return base;
  }
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) {
    if (word.endsWith("es") && word.length > 4) {
      if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("ches") || word.endsWith("shes")) {
        return word.slice(0, -2);
      }
      return word.slice(0, -1);
    }
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Tokenizes text into normalized, stemmed keywords.
 * - lowercase
 * - punctuation removed
 * - stop words removed
 * - tokens length <= 2 ignored
 */
export function tokenizeKeywords(text: string | undefined | null): string[] {
  if (!text || typeof text !== "string") return [];
  const rawWords = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/[\s_]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  return rawWords.map((w) => stemWord(w));
}

/**
 * Checks whether token A matches token B (exact match or common root prefix)
 */
export function tokenMatches(tokenA: string, tokenB: string): boolean {
  if (tokenA === tokenB) return true;
  if (tokenA.length >= 4 && tokenB.length >= 4) {
    if (tokenA.startsWith(tokenB) || tokenB.startsWith(tokenA)) {
      return true;
    }
  }
  return false;
}

/**
 * Computes Dice overlap coefficient between two token arrays with root awareness
 */
export function computeOverlap(tokensA: string[], tokensB: string[]): {
  score: number;
  matches: string[];
} {
  if (tokensA.length === 0 || tokensB.length === 0) {
    return { score: 0, matches: [] };
  }
  const setA = Array.from(new Set(tokensA));
  const setB = Array.from(new Set(tokensB));
  const matches: string[] = [];

  for (const itemA of setA) {
    if (setB.some((itemB) => tokenMatches(itemA, itemB))) {
      matches.push(itemA);
    }
  }

  if (matches.length === 0) {
    return { score: 0, matches: [] };
  }

  const score = (2 * matches.length) / (setA.length + setB.length);
  return { score, matches };
}

/**
 * Computes Jaccard similarity between two tag arrays
 */
export function computeTagSimilarity(tagsA: string[], tagsB: string[]): {
  score: number;
  matches: string[];
} {
  const normA = normalizeTags(tagsA);
  const normB = normalizeTags(tagsB);
  if (normA.length === 0 || normB.length === 0) {
    return { score: 0, matches: [] };
  }

  const setA = new Set(normA);
  const setB = new Set(normB);
  const matches: string[] = [];

  for (const tag of setA) {
    if (setB.has(tag)) {
      matches.push(tag);
    }
  }

  const unionSize = new Set([...normA, ...normB]).size;
  const score = unionSize > 0 ? matches.length / unionSize : 0;

  return { score, matches };
}

/**
 * Scores a single candidate document against the incoming item input
 */
export function scoreCandidate(
  input: ConnectionCandidateInput,
  candidate: CandidateDocument
): ScoredCandidate {
  const queryTitleTokens = tokenizeKeywords(input.title);
  const queryDescTokens = tokenizeKeywords(input.description);
  const queryAllTokens = tokenizeKeywords(`${input.title} ${input.description}`);

  const candTitleTokens = tokenizeKeywords(candidate.title);
  const candDescTokens = tokenizeKeywords(candidate.description);
  const candAllTokens = tokenizeKeywords(`${candidate.title} ${candidate.description}`);

  // 1. Tag overlap (weight: 60%)
  const { score: tagScore, matches: tagMatches } = computeTagSimilarity(
    input.tags,
    candidate.tags
  );

  // 2. Title overlap (weight: 25%)
  // Measures direct title-to-title keyword overlap, and cross-relevance when
  // candidate title concepts appear in the query content (e.g. "route" in "App Router")
  const directTitle = computeOverlap(queryTitleTokens, candTitleTokens);

  const candTitleInQueryMatches = candTitleTokens.filter((ct) =>
    queryAllTokens.some((qt) => tokenMatches(ct, qt))
  );
  const candTitleInQueryScore =
    candTitleTokens.length > 0 ? (candTitleInQueryMatches.length / candTitleTokens.length) * 0.7 : 0;

  const titleScore = Math.max(directTitle.score, candTitleInQueryScore);
  const titleMatches = Array.from(new Set([...directTitle.matches, ...candTitleInQueryMatches]));

  // 3. Description keyword overlap (weight: 15%)
  const directDesc = computeOverlap(queryDescTokens, candDescTokens);
  const allText = computeOverlap(queryAllTokens, candAllTokens);
  const descScore = Math.max(directDesc.score, allText.score * 0.7);
  const descriptionMatches = Array.from(new Set([...directDesc.matches, ...allText.matches]));

  // 4. Deterministic weighted score
  const totalScore =
    tagScore * SCORING_WEIGHTS.tag +
    titleScore * SCORING_WEIGHTS.title +
    descScore * SCORING_WEIGHTS.description;

  return {
    item: candidate,
    score: Number(totalScore.toFixed(4)),
    breakdown: {
      tagScore: Number(tagScore.toFixed(4)),
      titleScore: Number(titleScore.toFixed(4)),
      descriptionScore: Number(descScore.toFixed(4)),
      tagMatches,
      titleMatches,
      descriptionMatches,
    },
  };
}

/**
 * Shortlists and ranks candidate documents based on metadata heuristics
 */
export function shortlistCandidates(
  input: ConnectionCandidateInput,
  candidates: CandidateDocument[],
  options?: ShortlistOptions
): ScoredCandidate[] {
  const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
  const limit = options?.limit ?? DEFAULT_LIMIT;

  const excludeId = input.excludeId?.trim();

  // Filter out ineligible candidates
  const eligibleCandidates = candidates.filter((cand) => {
    if (!cand || !cand._id) return false;

    // Exclude current item if _id provided
    if (excludeId) {
      if (cand._id === excludeId || cand._id.replace(/^drafts\./, "") === excludeId.replace(/^drafts\./, "")) {
        return false;
      }
    }

    // Exclude drafts
    if (cand._id.startsWith("drafts.")) {
      return false;
    }

    // Exclude documents missing meaningful metadata
    const hasTitle = typeof cand.title === "string" && cand.title.trim().length > 0;
    const hasDesc = typeof cand.description === "string" && cand.description.trim().length > 0;
    const hasTags = Array.isArray(cand.tags) && cand.tags.some((t) => typeof t === "string" && t.trim().length > 0);

    if (!hasTitle || (!hasDesc && !hasTags)) {
      return false;
    }

    return true;
  });

  // Score all eligible candidates
  const scored = eligibleCandidates.map((cand) => scoreCandidate(input, cand));

  // Filter by minimum threshold and sort descending by score
  const qualified = scored
    .filter((cand) => cand.score >= threshold)
    .sort((a, b) => b.score - a.score);

  // Return top N
  return qualified.slice(0, limit);
}

/**
 * Lightweight GROQ query to retrieve candidate source documents from Sanity Content Lake.
 * Avoids pulling full source text, uploaded files, or images.
 */
export const CANDIDATE_POOL_QUERY = `*[_type == "savedItem" && !(_id in path("drafts.**")) && (!defined($excludeId) || _id != $excludeId) && (!defined($ownerId) || owner._ref == $ownerId)]{
  _id,
  title,
  description,
  tags,
  contentType
}`;

/**
 * Server-side function to fetch candidate pool from Sanity, scoped by owner if provided
 */
export async function fetchCandidatePool(
  sanityClient: SanityClient,
  excludeId?: string,
  ownerId?: string
): Promise<CandidateDocument[]> {
  const params: Record<string, string | null> = {
    excludeId: excludeId || null,
    ownerId: ownerId || null,
  };

  const results = await sanityClient.fetch<CandidateDocument[]>(
    CANDIDATE_POOL_QUERY,
    params
  );

  return results || [];
}
