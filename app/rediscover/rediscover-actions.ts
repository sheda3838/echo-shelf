"use server";

import { revalidatePath } from "next/cache";
import { Groq } from "groq-sdk";
import { client } from "@/sanity/lib/client";
import { writeClient } from "@/sanity/lib/writeClient";
import { searchGNews, type NewsArticle } from "@/lib/news/gnews";
import {
  buildClusterSearchTopics,
  type KnowledgeClusterSource,
} from "@/lib/rediscovery/buildNewsQueries";
import { validateGroqRediscovery } from "@/lib/rediscovery/validateGroqRediscovery";

const GROQ_MODEL = "openai/gpt-oss-120b";

export interface RediscoverResponse {
  success: boolean;
  status:
    | "success"
    | "no_clusters"
    | "missing_config"
    | "no_news"
    | "no_meaningful_matches"
    | "error";
  matchCount?: number;
  message: string;
}

interface SavedItemSummary {
  _id: string;
  title: string;
  description?: string;
  tags?: string[];
  contentType?: string;
}

interface ClusterWithItems extends KnowledgeClusterSource {
  items?: SavedItemSummary[];
}

const CLUSTERS_WITH_ITEMS_QUERY = `*[_type == "knowledgeCluster"] | order(generatedAt desc) {
  _id,
  title,
  summary,
  tags,
  generatedAt,
  "itemCount": count(items),
  items[]-> {
    _id,
    title,
    description,
    tags,
    contentType
  }
}`;

const EXISTING_REDISCOVERY_IDS_QUERY = `*[_type == "rediscoveryResult"]._id`;

/**
 * Server Action: Triggers Contextual Rediscovery run.
 * Fetches knowledge clusters, issues targeted topic queries to GNews,
 * prompts Groq to evaluate genuine conceptual relevance, validates results,
 * and atomically persists the matches in Sanity.
 */
export async function triggerRediscoveryAction(): Promise<RediscoverResponse> {
  try {
    // 1. Fetch Knowledge Clusters from Sanity
    const clusters = await client
      .withConfig({ useCdn: false })
      .fetch<ClusterWithItems[]>(CLUSTERS_WITH_ITEMS_QUERY);

    if (!clusters || clusters.length === 0) {
      return {
        success: false,
        status: "no_clusters",
        message:
          "Generate Knowledge Clusters first so Echo Shelf knows which topics to monitor.",
      };
    }

    // 2. Build targeted, concise search topics (at most 4 queries)
    const searchTopics = buildClusterSearchTopics(clusters);
    if (searchTopics.length === 0) {
      return {
        success: false,
        status: "no_clusters",
        message:
          "Generate Knowledge Clusters first so Echo Shelf knows which topics to monitor.",
      };
    }

    // 3. Verify GNews configuration
    const gnewsApiKey = process.env.GNEWS_API_KEY;
    if (!gnewsApiKey) {
      return {
        success: false,
        status: "missing_config",
        message: "Current-news rediscovery is not configured yet.",
      };
    }

    console.log("[Contextual Rediscovery]", {
      stage: "start-news-fetch",
      topicCount: searchTopics.length,
      topics: searchTopics.map((t) => t.query),
    });

    // 4. Fetch news articles sequentially from GNews to respect rate limits
    const allFetchedArticles: Array<{ article: NewsArticle; clusterId: string; clusterTitle: string }> = [];
    const seenArticleUrls = new Set<string>();
    let encounteredQuotaError = false;

    for (const topic of searchTopics) {
      // Respect GNews rate limit (1 req/sec) with controlled spacing
      if (allFetchedArticles.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }

      const res = await searchGNews({
        query: topic.query,
        max: 5,
        fromDaysAgo: 7,
      });

      if (!res.success && res.isQuotaOrAuthError) {
        encounteredQuotaError = true;
        break;
      }

      if (res.success && res.articles.length > 0) {
        for (const art of res.articles) {
          const norm = art.url.trim().toLowerCase();
          if (!seenArticleUrls.has(norm)) {
            seenArticleUrls.add(norm);
            allFetchedArticles.push({
              article: art,
              clusterId: topic.clusterId,
              clusterTitle: topic.clusterTitle,
            });
          }
        }
      }
    }

    if (encounteredQuotaError && allFetchedArticles.length === 0) {
      return {
        success: false,
        status: "error",
        message: "News search limit reached. Please try again later.",
      };
    }

    if (allFetchedArticles.length === 0) {
      return {
        success: true,
        status: "no_news",
        matchCount: 0,
        message:
          "No recent news articles were found for your knowledge topics. Check again later.",
      };
    }

    console.log("[Contextual Rediscovery]", {
      stage: "news-fetched",
      articleCount: allFetchedArticles.length,
    });

    // 5. Build first-stage candidate matching sets
    // Associate articles with items from their originating cluster
    const clusterMap = new Map<string, ClusterWithItems>();
    for (const c of clusters) {
      clusterMap.set(c._id, c);
    }

    const allowedArticleUrls = new Set(allFetchedArticles.map((a) => a.article.url));
    const allowedSavedItemIds = new Set<string>();
    const allowedClusterIds = new Set<string>(clusters.map((c) => c._id));

    // Prepare compact cluster-bounded comparison data for Groq to stay within token limits
    const comparisonContext = searchTopics
      .map((topic) => {
        const cluster = clusterMap.get(topic.clusterId);
        const clusterItems = (cluster?.items || []).filter(Boolean);

        for (const item of clusterItems) {
          allowedSavedItemIds.add(item._id);
        }

        const clusterArticles = allFetchedArticles
          .filter((a) => a.clusterId === topic.clusterId)
          .slice(0, 4)
          .map((a) => ({
            title: a.article.title,
            description: a.article.description ? a.article.description.slice(0, 120) : "",
            url: a.article.url,
            publishedAt: a.article.publishedAt,
            source: a.article.sourceName || "News Source",
          }));

        if (clusterArticles.length === 0 || clusterItems.length === 0) {
          return null;
        }

        return {
          clusterId: topic.clusterId,
          clusterTitle: topic.clusterTitle,
          savedItemsInCluster: clusterItems.slice(0, 4).map((item) => ({
            _id: item._id,
            title: item.title,
            description: item.description ? item.description.slice(0, 100) : "",
            tags: (item.tags || []).slice(0, 3),
            contentType: item.contentType || "note",
          })),
          recentNewsArticles: clusterArticles,
        };
      })
      .filter(Boolean);

    if (comparisonContext.length === 0 || allowedSavedItemIds.size === 0) {
      return {
        success: true,
        status: "no_news",
        matchCount: 0,
        message: "No articles could be correlated with saved topics. Check again later.",
      };
    }

    // 6. Verify Groq API configuration
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return {
        success: false,
        status: "error",
        message: "AI service configuration is missing.",
      };
    }

    // 7. Prompt Groq for contextual relevance analysis
    const systemPrompt = `You are an AI assistant helping a user rediscover previously saved personal knowledge when a current news development makes that knowledge relevant again.

For every supplied news article, compare it against the saved knowledge items in the corresponding cluster.
Only return a match when:
- There is a clear, meaningful conceptual connection.
- The saved item would genuinely help the user understand the news, OR the news meaningfully updates, extends, or revisits something in the saved item.
- The relevance is "strong" or "moderate".

Reject:
- Superficial keyword matches or vague buzzword overlap.
- Generic similarities that do not provide genuine insight.
- Weak connections.

For every valid match, explain in 1-2 thoughtful sentences ("reason") specifically why the saved item matters in light of this news development.

Return strict JSON matching this exact structure:
{
  "matches": [
    {
      "articleUrl": "https://exact-article-url.com",
      "savedItemId": "exact-saved-item-id",
      "clusterId": "exact-cluster-id",
      "relevance": "strong",
      "reason": "This new development directly builds on the container networking architecture documented in your saved note, showing a production implementation of those principles.",
      "connectionType": "updates"
    }
  ]
}

Valid connectionType values: "updates", "extends", "related-development", "new-application", "changes", "revisits".`;

    const userPrompt = `Evaluate these recent news stories against the user's saved Echo Shelf knowledge:\n\n${JSON.stringify(
      comparisonContext,
      null,
      2
    )}`;

    let rawContent: string | null = null;
    try {
      const groq = new Groq({ apiKey: groqApiKey });
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
      console.error("[Contextual Rediscovery] Groq completion error:", groqErr);
      return {
        success: false,
        status: "error",
        message: "Could not evaluate news relevance right now. Please try again later.",
      };
    }

    // 8. Parse and validate Groq response
    let parsed: unknown;
    try {
      parsed = rawContent ? JSON.parse(rawContent) : null;
    } catch {
      console.error("[Contextual Rediscovery] JSON parse error from Groq response");
      return {
        success: false,
        status: "error",
        message: "Failed to parse AI rediscovery response.",
      };
    }

    const validation = validateGroqRediscovery(
      parsed,
      allowedArticleUrls,
      allowedSavedItemIds,
      allowedClusterIds
    );

    console.log("[Contextual Rediscovery]", {
      stage: "matches-validated",
      validMatchCount: validation.matches.length,
      errorsCount: validation.errors.length,
    });

    if (!validation.valid || validation.matches.length === 0) {
      return {
        success: true,
        status: "no_meaningful_matches",
        matchCount: 0,
        message:
          "Nothing strongly relevant right now. Your saved knowledge does not have a strong connection to the recent stories we checked. Check again later.",
      };
    }

    // Map each article URL to its article metadata
    const articleMap = new Map<string, NewsArticle>();
    for (const a of allFetchedArticles) {
      articleMap.set(a.article.url, a.article);
    }

    // 9. Atomic persistence replacement in Sanity
    // Failure safety: Old rediscovery records are deleted ONLY after new results are received & validated.
    const existingIds = await client
      .withConfig({ useCdn: false })
      .fetch<string[]>(EXISTING_REDISCOVERY_IDS_QUERY);

    const tx = writeClient.transaction();

    for (const oldId of existingIds) {
      tx.delete(oldId);
    }

    const timestamp = new Date().toISOString();

    for (const match of validation.matches) {
      const art = articleMap.get(match.articleUrl);
      if (!art) continue;

      tx.create({
        _type: "rediscoveryResult",
        articleTitle: art.title,
        articleDescription: art.description || "",
        articleUrl: art.url,
        articleImageUrl: art.imageUrl || undefined,
        articleSource: art.sourceName || "Web News",
        publishedAt: art.publishedAt || timestamp,
        savedItem: {
          _type: "reference",
          _ref: match.savedItemId,
        },
        cluster: {
          _type: "reference",
          _ref: match.clusterId,
          _weak: true,
        },
        relevance: match.relevance,
        connectionType: match.connectionType,
        reason: match.reason,
        discoveredAt: timestamp,
      });
    }

    await tx.commit();

    console.log("[Contextual Rediscovery]", {
      stage: "persisted-to-sanity",
      persistedCount: validation.matches.length,
    });

    try {
      revalidatePath("/rediscover");
      revalidatePath("/");
    } catch {
      // Ignored outside Next.js request context (e.g. test scripts)
    }

    return {
      success: true,
      status: "success",
      matchCount: validation.matches.length,
      message: `Discovered ${validation.matches.length} relevant connection${
        validation.matches.length === 1 ? "" : "s"
      } to current news.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Contextual Rediscovery] Unexpected error:", message);
    return {
      success: false,
      status: "error",
      message: "An unexpected error occurred while checking current developments.",
    };
  }
}
