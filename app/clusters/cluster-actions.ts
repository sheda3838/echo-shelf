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

const ALL_SAVED_ITEMS_QUERY = `*[_type == "savedItem" && !(_id in path("drafts.**"))] | order(savedAt desc) {
  _id,
  title,
  description,
  tags,
  contentType
}`;

const EXISTING_CLUSTERS_QUERY = `*[_type == "knowledgeCluster"]._id`;

/**
 * Server Action: Knowledge Clusters Generation & Refresh.
 * Fetches lightweight metadata of saved items, uses Groq to identify thematic clusters,
 * validates the structure, and cleanly replaces prior clusters in Sanity.
 */
export async function generateKnowledgeClustersAction(): Promise<GenerateClustersResponse> {
  try {
    // 1. Fetch lightweight metadata for all non-draft saved items
    const items = await client
      .withConfig({ useCdn: false })
      .fetch<SavedItemDoc[]>(ALL_SAVED_ITEMS_QUERY);

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
    const itemsForGroq = items.map((i) => ({
      _id: i._id,
      title: i.title,
      description: i.description || "",
      tags: i.tags || [],
      contentType: i.contentType || "note",
    }));

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
    const systemPrompt = `You are organizing a personal knowledge library into meaningful thematic clusters.
Group saved items based on actual conceptual relationships, not superficial word overlap.
Create useful themes such as:
- DevOps & Containers
- Web Development
- AI & Knowledge Systems
- Career Development
- Cloud & AWS
(These are examples only. Determine themes from the actual content).

Rules:
1. Do not force every item into a cluster if it does not fit meaningfully.
2. A saved item may appear in more than one cluster when genuinely useful (many-to-many).
3. Minimum 2 items per cluster (avoid one-item clusters).
4. Avoid creating a cluster for every minor subtopic.
5. Avoid dumping everything into one giant cluster.
6. Target around 2-6 clusters depending on the data.
7. Return strict JSON matching this exact structure:
{
  "clusters": [
    {
      "title": "Theme Title",
      "summary": "Clear, concise 1-2 sentence thematic summary explaining why these items relate.",
      "itemIds": ["valid-id-1", "valid-id-2"],
      "tags": ["topic1", "topic2"]
    }
  ]
}`;

    const userPrompt = `Saved Items Library (${itemsForGroq.length} items):
${JSON.stringify(itemsForGroq, null, 2)}`;

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
      });

      rawContent = completion.choices[0]?.message?.content || null;
    } catch (groqErr) {
      console.error("[Knowledge Clusters]", {
        stage: "groq-completion-error",
        error: groqErr instanceof Error ? groqErr.message : "Unknown error",
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
      .fetch<string[]>(EXISTING_CLUSTERS_QUERY);

    const tx = writeClient.transaction();

    // Remove old clusters
    for (const oldId of existingClusterIds) {
      tx.delete(oldId);
    }

    // Create new cluster documents
    const timestamp = new Date().toISOString();
    for (const cluster of validation.clusters) {
      tx.create({
        _type: "knowledgeCluster",
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
