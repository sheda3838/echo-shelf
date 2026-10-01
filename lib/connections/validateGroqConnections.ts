export type ConnectionStrength = "strong" | "moderate" | "weak";

export interface ValidatedConnection {
  itemId: string;
  strength: ConnectionStrength;
  relationshipType: string;
  explanation: string;
}

export const MAX_FINAL_CONNECTIONS = 5;

/**
 * Validates the raw JSON object returned by Groq.
 * Discards hallucinated candidate IDs, self-references, duplicates, and malformed items.
 */
export function validateGroqConnections(
  rawParsed: unknown,
  allowedCandidateIds: Set<string>,
  currentItemId: string,
  maxLimit = MAX_FINAL_CONNECTIONS
): { valid: boolean; connections: ValidatedConnection[] } {
  if (typeof rawParsed !== "object" || rawParsed === null) {
    return { valid: false, connections: [] };
  }

  const record = rawParsed as Record<string, unknown>;
  if (!Array.isArray(record.connections)) {
    return { valid: false, connections: [] };
  }

  const validConnections: ValidatedConnection[] = [];
  const seenIds = new Set<string>();

  for (const item of record.connections) {
    if (typeof item !== "object" || item === null) continue;

    const cand = item as Record<string, unknown>;
    const itemId = typeof cand.itemId === "string" ? cand.itemId.trim() : "";
    const strengthRaw = typeof cand.strength === "string" ? cand.strength.trim().toLowerCase() : "";
    const relationshipType = typeof cand.relationshipType === "string" ? cand.relationshipType.trim() : "";
    const explanation = typeof cand.explanation === "string" ? cand.explanation.trim() : "";

    // Candidate ID must be in the supplied candidate shortlist
    if (!itemId || !allowedCandidateIds.has(itemId)) {
      continue;
    }

    // Must not reference the current item
    if (itemId === currentItemId) {
      continue;
    }

    // Must not be duplicate
    if (seenIds.has(itemId)) {
      continue;
    }

    // Strength must be one of: strong, moderate, weak
    if (strengthRaw !== "strong" && strengthRaw !== "moderate" && strengthRaw !== "weak") {
      continue;
    }

    // Relationship type and explanation must be non-empty strings
    if (!relationshipType || relationshipType.length > 80) {
      continue;
    }

    if (!explanation || explanation.length > 600) {
      continue;
    }

    seenIds.add(itemId);
    validConnections.push({
      itemId,
      strength: strengthRaw as ConnectionStrength,
      relationshipType,
      explanation,
    });

    if (validConnections.length >= maxLimit) {
      break;
    }
  }

  return { valid: true, connections: validConnections };
}
