/**
 * Validation logic for Groq Knowledge Clusters output.
 * Model output is treated as untrusted and strictly verified against existing items.
 */

export interface RawClusterCandidate {
  title?: unknown;
  summary?: unknown;
  itemIds?: unknown;
  tags?: unknown;
}

export interface ValidatedCluster {
  title: string;
  slug: string;
  summary: string;
  itemIds: string[];
  tags: string[];
}

export interface ClusterValidationResult {
  valid: boolean;
  clusters: ValidatedCluster[];
  errors: string[];
}

export const MIN_ITEMS_PER_CLUSTER = 2;
export const MAX_CLUSTERS = 8;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validates untrusted Groq cluster response against a set of allowed saved item IDs.
 */
export function validateGroqClusters(
  raw: unknown,
  allowedItemIds: Set<string>
): ClusterValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    return {
      valid: false,
      clusters: [],
      errors: ["Response is not an object"],
    };
  }

  const rawObj = raw as { clusters?: unknown };
  if (!Array.isArray(rawObj.clusters)) {
    return {
      valid: false,
      clusters: [],
      errors: ["'clusters' property is missing or not an array"],
    };
  }

  const validatedClusters: ValidatedCluster[] = [];
  const seenTitleKeys = new Set<string>();
  const seenSlugs = new Set<string>();

  for (let i = 0; i < rawObj.clusters.length; i++) {
    if (validatedClusters.length >= MAX_CLUSTERS) {
      break;
    }

    const item = rawObj.clusters[i] as RawClusterCandidate;
    if (!item || typeof item !== "object") {
      errors.push(`Cluster #${i + 1}: Not an object`);
      continue;
    }

    // 1. Validate title
    const rawTitle = typeof item.title === "string" ? item.title.trim() : "";
    if (!rawTitle || rawTitle.length < 2 || rawTitle.length > 100) {
      errors.push(`Cluster #${i + 1}: Title invalid or out of bounds (2-100 chars)`);
      continue;
    }

    // Deduplicate near-identical cluster titles
    const normalizedTitleKey = rawTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seenTitleKeys.has(normalizedTitleKey)) {
      errors.push(`Cluster #${i + 1}: Duplicate cluster title '${rawTitle}'`);
      continue;
    }

    // 2. Validate summary
    const rawSummary = typeof item.summary === "string" ? item.summary.trim() : "";
    if (!rawSummary || rawSummary.length < 10 || rawSummary.length > 1000) {
      errors.push(`Cluster #${i + 1}: Summary invalid or too short (< 10 chars)`);
      continue;
    }

    // 3. Validate itemIds
    if (!Array.isArray(item.itemIds)) {
      errors.push(`Cluster #${i + 1}: 'itemIds' must be an array`);
      continue;
    }

    // Filter to valid item IDs that exist in allowedItemIds and deduplicate
    const uniqueValidItemIds: string[] = [];
    const seenItemIdsInCluster = new Set<string>();

    for (const rawId of item.itemIds) {
      if (typeof rawId !== "string") continue;
      const cleanId = rawId.trim();
      if (!cleanId || seenItemIdsInCluster.has(cleanId)) continue;

      if (allowedItemIds.has(cleanId)) {
        seenItemIdsInCluster.add(cleanId);
        uniqueValidItemIds.push(cleanId);
      }
    }

    // Heuristic: Minimum 2 items per cluster (avoid one-item clusters)
    if (uniqueValidItemIds.length < MIN_ITEMS_PER_CLUSTER) {
      errors.push(
        `Cluster #${i + 1} ('${rawTitle}'): Too few valid items (${uniqueValidItemIds.length} < ${MIN_ITEMS_PER_CLUSTER})`
      );
      continue;
    }

    // 4. Validate tags (optional)
    const validTags: string[] = [];
    if (Array.isArray(item.tags)) {
      const seenTags = new Set<string>();
      for (const t of item.tags) {
        if (typeof t === "string") {
          const cleanTag = t.trim().toLowerCase().replace(/^#/, "");
          if (cleanTag && cleanTag.length <= 40 && !seenTags.has(cleanTag)) {
            seenTags.add(cleanTag);
            validTags.push(cleanTag);
            if (validTags.length >= 10) break;
          }
        }
      }
    }

    // Generate unique slug
    const baseSlug = slugify(rawTitle) || `cluster-${i + 1}`;
    let finalSlug = baseSlug;
    let counter = 2;
    while (seenSlugs.has(finalSlug)) {
      finalSlug = `${baseSlug}-${counter}`;
      counter++;
    }

    seenTitleKeys.add(normalizedTitleKey);
    seenSlugs.add(finalSlug);

    validatedClusters.push({
      title: rawTitle,
      slug: finalSlug,
      summary: rawSummary,
      itemIds: uniqueValidItemIds,
      tags: validTags,
    });
  }

  return {
    valid: validatedClusters.length > 0,
    clusters: validatedClusters,
    errors,
  };
}
