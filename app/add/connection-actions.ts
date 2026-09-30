"use server";

import { client } from "@/sanity/lib/client";
import {
  fetchCandidatePool,
  shortlistCandidates,
  type ConnectionCandidateInput,
} from "@/lib/connections/candidateShortlist";

export interface PreSaveCandidate {
  _id: string;
  title: string;
  description: string;
  tags: string[];
  contentType?: string;
}

export interface CandidateLookupResponse {
  success: boolean;
  candidates: PreSaveCandidate[];
  message?: string;
}

/**
 * Server Action to look up pre-save related candidate items from Sanity.
 * Reuses the Phase 1 metadata shortlist engine (lib/connections/candidateShortlist.ts).
 * Never exposes raw similarity scores, GROQ errors, or sensitive config.
 */
export async function lookupConnectionCandidatesAction(input: {
  title?: string;
  description?: string;
  tags?: string[];
  excludeId?: string;
}): Promise<CandidateLookupResponse> {
  const title = input.title?.trim() || "";
  const description = input.description?.trim() || "";
  const tags = Array.isArray(input.tags)
    ? input.tags
        .filter((t) => typeof t === "string")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    : [];

  // Minimum metadata requirement: title OR description must exist
  if (!title && !description) {
    return {
      success: false,
      candidates: [],
      message: "Please provide a title or description to find related items.",
    };
  }

  try {
    const candidateInput: ConnectionCandidateInput = {
      title,
      description,
      tags,
      excludeId: input.excludeId?.trim(),
    };

    // Use live Sanity client (useCdn: false) to ensure latest dataset items are visible
    const pool = await fetchCandidatePool(client.withConfig({ useCdn: false }), candidateInput.excludeId);

    // Reuse the exact deterministic shortlist logic from Phase 1
    const scoredCandidates = shortlistCandidates(candidateInput, pool);

    // Map to safe user-facing candidate shape without internal numeric similarity scores
    const safeCandidates: PreSaveCandidate[] = scoredCandidates.map((sc) => ({
      _id: sc.item._id,
      title: sc.item.title,
      description: sc.item.description,
      tags: sc.item.tags || [],
      contentType: sc.item.contentType,
    }));

    return {
      success: true,
      candidates: safeCandidates,
    };
  } catch (err) {
    console.error("[Candidate Shortlist Server Action Error]", err);
    return {
      success: false,
      candidates: [],
      message: "Could not check related items right now.",
    };
  }
}
