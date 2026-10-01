"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { Groq } from "groq-sdk";
import { client } from "@/sanity/lib/client";
import { writeClient } from "@/sanity/lib/writeClient";
import {
  fetchCandidatePool,
  shortlistCandidates,
  type CandidateDocument,
} from "@/lib/connections/candidateShortlist";

export type ConnectionStrength = "strong" | "moderate" | "weak";

export interface ValidatedConnection {
  itemId: string;
  strength: ConnectionStrength;
  relationshipType: string;
  explanation: string;
}

export interface SanityConnectionRecord {
  _key: string;
  _type: "connection";
  item: {
    _type: "reference";
    _ref: string;
  };
  strength: ConnectionStrength;
  relationshipType: string;
  explanation: string;
}

export interface GenerateConnectionsResponse {
  success: boolean;
  status: "success" | "no_candidates" | "no_meaningful_connections" | "error";
  connectionCount?: number;
  message?: string;
}

interface CurrentItemDoc {
  _id: string;
  title: string;
  description?: string;
  tags?: string[];
  contentType?: string;
  sourceText?: string;
}

import {
  validateGroqConnections,
  MAX_FINAL_CONNECTIONS,
} from "@/lib/connections/validateGroqConnections";

const GROQ_MODEL = "openai/gpt-oss-120b";

const CURRENT_ITEM_QUERY = `*[_type == "savedItem" && _id == $id][0] {
  _id,
  title,
  description,
  tags,
  contentType,
  "sourceText": source.text
}`;

/**
 * Server Action: Smart Connections Phase 2B.
 * Evaluates candidates via candidate shortlist engine, queries Groq for semantic verification,
 * validates the response, and persists connections to Sanity Content Lake.
 */
export async function generateItemConnectionsAction(
  itemId: string
): Promise<GenerateConnectionsResponse> {
  const cleanId = itemId?.trim();
  if (!cleanId) {
    return {
      success: false,
      status: "error",
      message: "A valid item ID is required to generate connections.",
    };
  }

  try {
    // 1. Fetch current item metadata
    const currentItem = await client.withConfig({ useCdn: false }).fetch<CurrentItemDoc | null>(
      CURRENT_ITEM_QUERY,
      { id: cleanId }
    );

    if (!currentItem) {
      return {
        success: false,
        status: "error",
        message: "Saved item not found in Echo Shelf.",
      };
    }

    // 2. Shortlist candidates from Sanity using Phase 1 heuristics
    const pool = await fetchCandidatePool(client.withConfig({ useCdn: false }), cleanId);
    const scoredCandidates = shortlistCandidates(
      {
        title: currentItem.title || "",
        description: currentItem.description || "",
        tags: currentItem.tags || [],
        excludeId: cleanId,
      },
      pool,
      { limit: MAX_FINAL_CONNECTIONS }
    );

    const shortlisted = scoredCandidates.map((sc) => sc.item);

    console.log("[Smart Connections]", {
      itemId: cleanId,
      stage: "candidate-shortlist",
      candidatePoolCount: pool.length,
      shortlistCount: shortlisted.length,
    });

    // 3. Handle zero heuristic candidates: do NOT call Groq
    if (shortlisted.length === 0) {
      return {
        success: true,
        status: "no_candidates",
        connectionCount: 0,
        message: "No related saved items were found yet.",
      };
    }

    // 4. Prepare candidate data for Groq (No internal scores, only clean metadata)
    const allowedCandidateIds = new Set(shortlisted.map((c) => c._id));
    const candidateDataForGroq = shortlisted.map((c: CandidateDocument) => ({
      _id: c._id,
      title: c.title,
      description: c.description || "",
      tags: c.tags || [],
      contentType: c.contentType || "note",
    }));

    // 5. Build Groq relationship analysis prompt
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error("[Smart Connections] Missing GROQ_API_KEY");
      return {
        success: false,
        status: "error",
        message: "AI service configuration is missing.",
      };
    }

    const systemPrompt = `You are analyzing relationships inside a personal knowledge library (Echo Shelf).
Compare the current saved item against the supplied candidate items.
Only return genuinely useful relationships.
Do NOT force a connection merely because an item was shortlisted. Candidates may be false positives from metadata heuristics.

For every accepted connection determine:
1. "itemId": Must exactly match one of the candidate IDs supplied.
2. "strength": Must be one of:
   - "strong": Substantial topic/concept overlap. Directly useful together. One clearly extends, explains, contrasts, or complements the other.
   - "moderate": Meaningful relationship exists. Useful contextual overlap, but not central to both items.
   - "weak": Legitimate but secondary connection. Should still provide useful knowledge value.
   Do not include candidates whose relationship is merely superficial.
3. "relationshipType": A concise, readable relationship label (e.g. complementary, extends, prerequisite, implementation-detail, conceptual-overlap, alternative-approach, related-concept, practical-application, contrast).
4. "explanation": A useful 1–2 sentence explanation describing what connects the items, how they differ or complement each other, and why seeing them together may be useful. Avoid generic phrases like "These items are related because they are about technology." Prefer specific concepts, tools, or ideas.

If none of the candidates have a genuinely meaningful relationship to the current item, return an empty array for connections: {"connections": []}.

You must respond in valid JSON matching this schema:
{
  "connections": [
    {
      "itemId": "candidate-id",
      "strength": "strong",
      "relationshipType": "complementary",
      "explanation": "..."
    }
  ]
}`;

    const userPrompt = `Current Saved Item:
ID: ${currentItem._id}
Title: ${currentItem.title}
Content Type: ${currentItem.contentType || "note"}
Description: ${currentItem.description || "N/A"}
Tags: ${(currentItem.tags || []).join(", ") || "None"}
${currentItem.sourceText ? `Source Text Excerpt:\n${currentItem.sourceText.slice(0, 1000)}` : ""}

Candidate Items to Compare Against:
${JSON.stringify(candidateDataForGroq, null, 2)}`;

    // 6. Query Groq API
    let rawContent: string | null = null;
    try {
      const groq = new Groq({ apiKey });
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      rawContent = completion.choices[0]?.message?.content || null;
    } catch (groqErr) {
      console.error("[Smart Connections]", {
        itemId: cleanId,
        stage: "groq-completion-error",
        error: groqErr instanceof Error ? groqErr.message : "Unknown Groq error",
      });
      return {
        success: false,
        status: "error",
        message: "Could not generate connections right now. Please try again.",
      };
    }

    // 7. Parse and validate Groq response
    let parsed: unknown;
    try {
      parsed = rawContent ? JSON.parse(rawContent) : null;
    } catch {
      console.error("[Smart Connections]", {
        itemId: cleanId,
        stage: "json-parse-error",
      });
      return {
        success: false,
        status: "error",
        message: "Could not generate connections right now. Please try again.",
      };
    }

    const { valid, connections: validatedConnections } = validateGroqConnections(
      parsed,
      allowedCandidateIds,
      cleanId,
      MAX_FINAL_CONNECTIONS
    );

    if (!valid) {
      console.error("[Smart Connections]", {
        itemId: cleanId,
        stage: "validation-failed",
      });
      return {
        success: false,
        status: "error",
        message: "Could not generate connections right now. Please try again.",
      };
    }

    // 8. Transform to Sanity connection schema objects
    const sanityConnections: SanityConnectionRecord[] = validatedConnections.map((conn) => {
      const randomKey = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      return {
        _key: randomKey,
        _type: "connection",
        item: {
          _type: "reference",
          _ref: conn.itemId,
        },
        strength: conn.strength,
        relationshipType: conn.relationshipType,
        explanation: conn.explanation,
      };
    });

    // 9. Persist connections to Sanity Content Lake
    await writeClient
      .patch(cleanId)
      .set({ connections: sanityConnections })
      .commit();

    console.log("[Smart Connections]", {
      itemId: cleanId,
      stage: "persisted-to-sanity",
      connectionsCount: sanityConnections.length,
    });

    // 10. Revalidate Next.js cache so the updated document renders immediately
    try {
      revalidatePath(`/item/${cleanId}`);
      revalidatePath("/");
    } catch {
      // Ignored when invoked outside Next.js request context (e.g. test scripts)
    }

    if (sanityConnections.length === 0) {
      return {
        success: true,
        status: "no_meaningful_connections",
        connectionCount: 0,
        message: "No meaningful Smart Connections were found.",
      };
    }

    return {
      success: true,
      status: "success",
      connectionCount: sanityConnections.length,
      message: `Successfully connected ${sanityConnections.length} related item${
        sanityConnections.length === 1 ? "" : "s"
      }.`,
    };
  } catch (err) {
    console.error("[Smart Connections]", {
      itemId: cleanId,
      stage: "unhandled-error",
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return {
      success: false,
      status: "error",
      message: "Could not generate connections right now. Please try again.",
    };
  }
}
