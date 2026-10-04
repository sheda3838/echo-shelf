"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { Groq } from "groq-sdk";
import { client } from "@/sanity/lib/client";
import { writeClient } from "@/sanity/lib/writeClient";
import { validateGroqClusters } from "@/lib/clusters/validateGroqClusters";

const GROQ_MODEL = "openai/gpt-oss-120b";
const MIN_LIBRARY_ITEMS = 4;

export interface GenerateClustersResponse {
  success: boolean;
  status: "success" | "too_few_items" | "no_meaningful_clusters" | "error";
  clusterCount?: number;
  message: string;
}

interface SavedItemDoc {
  _id: string;
  title: string;
  description?: string;
  tags?: string[];
  contentType?: string;
}

const ALL_SAVED_ITEMS_QUERY = `*[_type == "savedItem" && !(_id in path("drafts.**")) && owner._ref == $ownerId] | order(savedAt desc) {
  _id,
  title,
  description,
  tags,
  contentType
}`;

const EXISTING_CLUSTERS_QUERY = `*[_type == "knowledgeCluster" && owner._ref == $ownerId]._id`;

/**
 * Server Action: Knowledge Clusters Generation & Refresh.
 * Fetches lightweight metadata of saved items, uses Groq to identify thematic clusters,
 * validates the structure, and cleanly replaces prior clusters in Sanity.
 */
export async function generateKnowledgeClustersAction(): Promise<GenerateClustersResponse> {
  try {
    const { requireEchoUser } = await import("@/lib/auth/echoUser");
    const echoUser = await requireEchoUser();

    // 1. Fetch lightweight metadata for all non-draft saved items owned by current user
    const items = await client
      .withConfig({ useCdn: false })
      .fetch<SavedItemDoc[]>(ALL_SAVED_ITEMS_QUERY, { ownerId: echoUser.id });

    console.log("[Knowledge Clusters]", {
      stage: "fetch-items",
      itemCount: items?.length || 0,
    });

    // 2. Minimum library size check
    if (!items || items.length < MIN_LIBRARY_ITEMS) {
      return {
        success: false,
        status: "too_few_items",
        message: "Add a few more items before generating knowledge clusters.",
      };
    }

    // 3. Prepare lightweight metadata only (no full note bodies, no raw files, no images)
    const allowedItemIds = new Set(items.map((i) => i._id));
    const itemsForGroq = items.map((i) => {
      const itemPayload: Record<string, unknown> = {
        _id: i._id,
        title: i.title,
        contentType: i.contentType || "note",
      };

      if (i.description) {
        const trimmedDesc = i.description.trim();
        if (trimmedDesc) {
          // Truncate description to approx 100-120 characters to keep prompt compact
          itemPayload.description =
            trimmedDesc.length > 120
              ? `${trimmedDesc.slice(0, 117)}...`
              : trimmedDesc;
        }
      }

      if (i.tags && Array.isArray(i.tags)) {
        const cleanTags = i.tags
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 6);
        if (cleanTags.length > 0) {
          itemPayload.tags = cleanTags;
        }
      }

      return itemPayload;
    });

    // 4. Verify Groq API configuration
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error("[Knowledge Clusters] Missing GROQ_API_KEY");
      return {
        success: false,
        status: "error",
        message: "AI service configuration is missing.",
      };
    }

    // 5. Build prompt
    const systemPrompt = `You are organizing a personal knowledge library into meaningful thematic clusters based on conceptual relationships.

Rules:
1. Identify natural themes from the saved items. Prefer 4-6 distinct clusters when the library contains enough clearly separable themes.
2. Maximum 6 clusters. Do NOT force exactly 6 clusters if fewer genuine themes exist.
3. Minimum 2 items per cluster (never create 1-item clusters).
4. Merge themes only when genuinely closely related; avoid overly broad catch-all clusters.
5. Do not force every saved item into a cluster if it does not fit.
6. An item may belong to multiple clusters when genuinely useful (many-to-many).
7. Keep cluster summaries to 1 concise sentence explaining the conceptual connection.
8. Include at most 4 tags per cluster.
9. Return JSON only matching this exact schema:
{
  "clusters": [
    {
      "title": "Theme Title",
      "summary": "One concise sentence explaining why these items relate.",
      "itemIds": ["valid-id-1", "valid-id-2"],
      "tags": ["tag1", "tag2"]
    }
  ]
}`;

    const userPrompt = `Saved Items Library (${itemsForGroq.length} items):\n${JSON.stringify(itemsForGroq)}`;

    // 6. Invoke Groq API
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
        max_completion_tokens: 4096,
        reasoning_effort: "low",
      });

      rawContent = completion.choices[0]?.message?.content || null;
    } catch (groqErr: unknown) {
      let failureCategory:
        | "json_validate_failed"
        | "rate_limit_exceeded"
        | "timeout"
        | "other_api_error" = "other_api_error";
      let errorDetail = "Unknown Groq error";

      if (groqErr && typeof groqErr === "object") {
        const errAny = groqErr as {
          status?: number;
          code?: string;
          message?: string;
          error?: { code?: string; type?: string; message?: string };
        };

        const code = errAny.code || errAny.error?.code || "";
        const message = errAny.message || errAny.error?.message || "";
        const status = errAny.status;

        if (
          code === "json_validate_failed" ||
          message.includes("json_validate_failed") ||
          message.includes("Failed to generate JSON") ||
          message.includes("Failed to validate JSON")
        ) {
          failureCategory = "json_validate_failed";
        } else if (
          code === "rate_limit_exceeded" ||
          status === 413 ||
          status === 429 ||
          message.includes("rate_limit") ||
          message.includes("Tokens per minute") ||
          message.includes("TPM")
        ) {
          failureCategory = "rate_limit_exceeded";
        } else if (
          code === "timeout" ||
          message.toLowerCase().includes("timeout") ||
          message.toLowerCase().includes("timed out")
        ) {
          failureCategory = "timeout";
        }

        errorDetail = `[status ${status || "unknown"}] ${code || failureCategory}: ${message.slice(0, 150)}`;
      } else if (typeof groqErr === "string") {
        errorDetail = groqErr.slice(0, 150);
      }

      console.error("[Knowledge Clusters]", {
        stage: "groq-completion-error",
        category: failureCategory,
        detail: errorDetail,
      });
      return {
        success: false,
        status: "error",
        message: "Could not generate clusters right now. Please try again.",
      };
    }

    // 7. Parse & validate JSON response
    let parsed: unknown;
    try {
      parsed = rawContent ? JSON.parse(rawContent) : null;
    } catch {
      console.error("[Knowledge Clusters]", { stage: "json-parse-error" });
      return {
        success: false,
        status: "error",
        message: "Failed to parse AI response. Please try again.",
      };
    }

    const validation = validateGroqClusters(parsed, allowedItemIds);
    console.log("[Knowledge Clusters]", {
      stage: "validation",
      validClusterCount: validation.clusters.length,
      errorsCount: validation.errors.length,
    });

    if (!validation.valid || validation.clusters.length === 0) {
      return {
        success: true,
        status: "no_meaningful_clusters",
        clusterCount: 0,
        message:
          "No meaningful clusters could be identified yet. Add more varied saved knowledge and try again later.",
      };
    }

    // 8. Atomic replacement in Sanity
    // Failure safety: Old clusters are only removed after new clusters are received and validated.
    const existingClusterIds = await client
      .withConfig({ useCdn: false })
      .fetch<string[]>(EXISTING_CLUSTERS_QUERY, { ownerId: echoUser.id });

    const tx = writeClient.transaction();

    // Remove old clusters belonging to current user only
    for (const oldId of existingClusterIds) {
      tx.delete(oldId);
    }

    // Create new cluster documents with current user as owner
    const timestamp = new Date().toISOString();
    for (const cluster of validation.clusters) {
      tx.create({
        _type: "knowledgeCluster",
        owner: {
          _type: "reference",
          _ref: echoUser.id,
        },
        title: cluster.title,
        slug: { _type: "slug", current: cluster.slug },
        summary: cluster.summary,
        tags: cluster.tags,
        generatedAt: timestamp,
        items: cluster.itemIds.map((itemId) => ({
          _type: "reference",
          _ref: itemId,
          _key: crypto.randomUUID ? crypto.randomUUID() : `item-${itemId}-${Math.random().toString(36).slice(2, 7)}`,
        })),
      });
    }

    await tx.commit();

    console.log("[Knowledge Clusters]", {
      stage: "persisted-to-sanity",
      persistedClusterCount: validation.clusters.length,
    });

    try {
      revalidatePath("/clusters");
      revalidatePath("/");
    } catch {
      // Ignored when invoked outside Next.js request context (e.g. test scripts)
    }

    return {
      success: true,
      status: "success",
      clusterCount: validation.clusters.length,
      message: `Generated ${validation.clusters.length} knowledge cluster${
        validation.clusters.length === 1 ? "" : "s"
      }.`,
    };
  } catch (err) {
    console.error("[Knowledge Clusters]", {
      stage: "unexpected-error",
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return {
      success: false,
      status: "error",
      message: "An unexpected error occurred while organizing clusters.",
    };
  }
}
