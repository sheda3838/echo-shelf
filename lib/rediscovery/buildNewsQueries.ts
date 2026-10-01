/**
 * Converts Knowledge Clusters into focused, concise search queries for news discovery.
 * Limits queries to at most 4 per rediscovery run and avoids sending private content.
 */

export interface KnowledgeClusterSource {
  _id: string;
  title: string;
  summary?: string;
  tags?: string[];
  itemCount?: number;
  generatedAt?: string;
  items?: Array<{ _ref?: string; _id?: string }>;
}

export interface ClusterSearchTopic {
  clusterId: string;
  clusterTitle: string;
  query: string;
}

export const MAX_CLUSTER_QUERIES = 4;

/**
 * Stopwords to remove from cluster titles/tags to construct concise news search queries.
 */
const STOPWORDS = new Set([
  "and",
  "&",
  "or",
  "the",
  "a",
  "an",
  "of",
  "for",
  "with",
  "in",
  "on",
  "at",
  "to",
  "by",
  "from",
  "up",
  "about",
  "into",
  "over",
  "after",
  "overview",
  "fundamentals",
  "notes",
  "concepts",
  "guide",
  "basics",
]);

/**
 * Cleans words and removes stopwords.
 */
function cleanTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/next\.js/gi, "nextjs")
    .replace(/[._]/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .split(/[\s_-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Constructs a single search query from a cluster's title and top tags.
 */
export function buildQueryForCluster(cluster: KnowledgeClusterSource): string {
  const titleTerms = cleanTerms(cluster.title);

  const tagTerms: string[] = [];
  if (Array.isArray(cluster.tags)) {
    for (const tag of cluster.tags) {
      if (typeof tag === "string") {
        const terms = cleanTerms(tag);
        for (const t of terms) {
          if (!tagTerms.includes(t) && !titleTerms.includes(t)) {
            tagTerms.push(t);
            if (tagTerms.length >= 3) break;
          }
        }
      }
      if (tagTerms.length >= 3) break;
    }
  }

  // Combine top distinctive terms (1-2 tag terms + 1-2 title terms)
  const combined = Array.from(new Set([...tagTerms.slice(0, 2), ...titleTerms.slice(0, 2)]));

  if (combined.length === 0) {
    return cleanTerms(cluster.title).join(" OR ") || "technology";
  }

  // Use OR joining so GNews finds recent articles matching any of the key cluster topics
  return combined.slice(0, 3).join(" OR ");
}

/**
 * Selects up to 4 clusters deterministically and constructs deduplicated news queries.
 */
export function buildClusterSearchTopics(
  clusters: KnowledgeClusterSource[]
): ClusterSearchTopic[] {
  if (!clusters || clusters.length === 0) {
    return [];
  }

  // Deterministic sorting: highest item count first, then recency, then title
  const sortedClusters = [...clusters].sort((a, b) => {
    const countA = a.itemCount || (Array.isArray(a.items) ? a.items.length : 0);
    const countB = b.itemCount || (Array.isArray(b.items) ? b.items.length : 0);
    if (countB !== countA) return countB - countA;

    const dateA = a.generatedAt ? new Date(a.generatedAt).getTime() : 0;
    const dateB = b.generatedAt ? new Date(b.generatedAt).getTime() : 0;
    if (dateB !== dateA) return dateB - dateA;

    return a.title.localeCompare(b.title);
  });

  const topics: ClusterSearchTopic[] = [];
  const seenQueries = new Set<string>();

  for (const cluster of sortedClusters) {
    if (topics.length >= MAX_CLUSTER_QUERIES) break;

    const rawQuery = buildQueryForCluster(cluster);
    const normalizedKey = rawQuery.toLowerCase().replace(/[^a-z0-9]/g, "");

    if (!normalizedKey || seenQueries.has(normalizedKey)) {
      continue;
    }

    seenQueries.add(normalizedKey);
    topics.push({
      clusterId: cluster._id,
      clusterTitle: cluster.title,
      query: rawQuery,
    });
  }

  return topics;
}
