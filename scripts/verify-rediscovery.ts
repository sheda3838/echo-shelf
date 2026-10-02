import fs from "fs";
import path from "path";
import assert from "assert";
import { createClient } from "next-sanity";
import {
  buildQueryForCluster,
  buildClusterSearchTopics,
  type KnowledgeClusterSource,
} from "../lib/rediscovery/buildNewsQueries";
import {
  normalizeArticleUrl,
  deduplicateArticles,
  type NewsArticle,
} from "../lib/news/gnews";
import {
  validateGroqRediscovery,
  MAX_REDISCOVERY_RESULTS,
} from "../lib/rediscovery/validateGroqRediscovery";

// Load .env.local BEFORE accessing env vars
const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [key, ...rest] = trimmed.split("=");
      const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  }
}

import { SEED_USER_SANITY_ID } from "./seed-smart-connections";

process.env.TEST_SUPABASE_USER_ID = "seed-test-user";
process.env.TEST_USER_NAME = "Echo Shelf Test User";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;
const token = process.env.SANITY_API_WRITE_TOKEN;
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2026-09-27";

if (!projectId || !dataset) {
  console.error("Missing Sanity configuration");
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  token,
  useCdn: false,
});

async function runUnitTests() {
  console.log("\n===============================================================");
  console.log("🧪 Running Contextual Rediscovery Unit Tests");
  console.log("===============================================================");

  // 1. Cluster -> News Query Generation
  const clusterA: KnowledgeClusterSource = {
    _id: "cluster-1",
    title: "AI-Enhanced Knowledge Management",
    tags: ["ai", "knowledge-management", "semantic-search", "embeddings"],
    items: [{ _ref: "item-1" }, { _ref: "item-2" }],
  };
  const qA = buildQueryForCluster(clusterA);
  assert(qA.length > 0, "Query should not be empty");
  assert(qA.includes("ai"), "Query should include significant terms");
  console.log(`  ✓ Test 1: Query generated: "${qA}"`);

  // 2. Duplicate query removal and topic limit cap (max 4)
  const mockClusters: KnowledgeClusterSource[] = [
    { _id: "c1", title: "Containerization & Orchestration", tags: ["docker", "kubernetes"], items: [{ _ref: "1" }, { _ref: "2" }] },
    { _id: "c2", title: "Containerization and Orchestration", tags: ["docker", "kubernetes"], items: [{ _ref: "3" }, { _ref: "4" }] }, // duplicate query
    { _id: "c3", title: "Modern Web Development", tags: ["react", "nextjs"], items: [{ _ref: "5" }, { _ref: "6" }] },
    { _id: "c4", title: "DevOps Automation", tags: ["ci-cd", "automation"], items: [{ _ref: "7" }, { _ref: "8" }] },
    { _id: "c5", title: "Database Systems", tags: ["sql", "postgres"], items: [{ _ref: "9" }, { _ref: "10" }] },
    { _id: "c6", title: "Cloud Infrastructure", tags: ["aws", "cloud"], items: [{ _ref: "11" }, { _ref: "12" }] },
  ];
  const topics = buildClusterSearchTopics(mockClusters);
  assert(topics.length <= 4, "Should cap at max 4 topics");
  assert.strictEqual(new Set(topics.map((t) => t.query)).size, topics.length, "Queries must be unique");
  console.log(`  ✓ Test 2: Capped at ${topics.length} unique topics (max 4).`);

  // 3. Article Normalization and Deduplication
  const rawArticles: NewsArticle[] = [
    {
      title: "Kubernetes 1.30 Released with Major Networking Updates",
      url: "https://example.com/k8s-130?utm_source=twitter&utm_medium=social/",
      publishedAt: "2026-10-01T00:00:00Z",
    },
    {
      title: "Kubernetes 1.30 Released with Major Networking Updates!", // duplicate normalized title
      url: "https://example.com/k8s-130", // same canonical URL
      publishedAt: "2026-10-01T01:00:00Z",
    },
    {
      title: "Next.js 15 Introduces New Server Actions Features",
      url: "https://example.com/nextjs-15",
      publishedAt: "2026-10-01T02:00:00Z",
    },
  ];
  const deduped = deduplicateArticles(rawArticles);
  assert.strictEqual(deduped.length, 2, "Duplicate article should be removed");
  assert.strictEqual(normalizeArticleUrl("https://foo.com/bar/?utm_source=abc/"), "https://foo.com/bar");
  console.log("  ✓ Test 3: Article normalization and deduplication verified.");

  // 4. Groq Match Validation: valid matches
  const allowedUrls = new Set(["https://example.com/k8s-news", "https://example.com/react-news"]);
  const allowedItems = new Set(["item-docker-basics", "item-react-rsc"]);
  const allowedClusters = new Set(["cluster-devops", "cluster-web"]);

  const validGroqPayload = {
    matches: [
      {
        articleUrl: "https://example.com/k8s-news",
        savedItemId: "item-docker-basics",
        clusterId: "cluster-devops",
        relevance: "strong",
        reason: "This recent Kubernetes update builds directly upon the Docker bridge network model in your saved item.",
        connectionType: "updates",
      },
    ],
  };

  const valRes1 = validateGroqRediscovery(validGroqPayload, allowedUrls, allowedItems, allowedClusters);
  assert.strictEqual(valRes1.valid, true);
  assert.strictEqual(valRes1.matches.length, 1);
  console.log("  ✓ Test 4: Valid Groq rediscovery matches accepted.");

  // 5. Groq Match Validation: hallucinated URLs / IDs rejected
  const hallucinatedPayload = {
    matches: [
      {
        articleUrl: "https://fake-url.com/phantom-story", // invalid URL
        savedItemId: "item-docker-basics",
        clusterId: "cluster-devops",
        relevance: "strong",
        reason: "Valid reason text explaining the connection.",
        connectionType: "updates",
      },
      {
        articleUrl: "https://example.com/k8s-news",
        savedItemId: "hallucinated-item-999", // invalid saved item ID
        clusterId: "cluster-devops",
        relevance: "strong",
        reason: "Valid reason text explaining the connection.",
        connectionType: "updates",
      },
      {
        articleUrl: "https://example.com/react-news",
        savedItemId: "item-react-rsc",
        clusterId: "cluster-web",
        relevance: "weak", // weak relevance rejected
        reason: "Valid reason text explaining the connection.",
        connectionType: "updates",
      },
    ],
  };

  const valRes2 = validateGroqRediscovery(hallucinatedPayload, allowedUrls, allowedItems, allowedClusters);
  assert.strictEqual(valRes2.valid, false, "Should be invalid when all matches have invalid fields");
  assert.strictEqual(valRes2.matches.length, 0);
  console.log("  ✓ Test 5: Hallucinated URLs, item IDs, and weak relevance rejected.");

  // 6. Result Cap Enforcement
  const manyMatches = {
    matches: Array.from({ length: 15 }, (_, i) => ({
      articleUrl: "https://example.com/k8s-news",
      savedItemId: `item-docker-basics-${i}`,
      clusterId: "cluster-devops",
      relevance: "strong",
      reason: `Explanation for connection number ${i + 1} with sufficient length.`,
      connectionType: "updates",
    })),
  };
  const bigAllowedItems = new Set(Array.from({ length: 15 }, (_, i) => `item-docker-basics-${i}`));
  const valRes3 = validateGroqRediscovery(manyMatches, allowedUrls, bigAllowedItems, allowedClusters);
  assert.strictEqual(valRes3.matches.length, MAX_REDISCOVERY_RESULTS, `Should cap at ${MAX_REDISCOVERY_RESULTS}`);
  console.log(`  ✓ Test 6: Result count strictly capped at ${MAX_REDISCOVERY_RESULTS}.`);

  console.log("🎉 ALL REDISCOVERY UNIT TESTS PASSED!\n");
}

async function runEndToEndTests() {
  console.log("===============================================================");
  console.log("🚀 Testing Contextual Rediscovery End-to-End against Sanity & GNews & Groq");
  console.log("===============================================================");

  const { triggerRediscoveryAction } = await import(
    "../app/rediscover/rediscover-actions"
  );

  console.log("\n🔍 Step 1: Triggering Contextual Rediscovery Action...");
  const result = await triggerRediscoveryAction();
  console.log("  Rediscovery Action Result:", result);

  assert.strictEqual(result.success, true, "Rediscovery action should succeed");

  if (result.status === "success") {
    // Query Sanity to verify persisted results
    const persisted = await client.fetch<
      Array<{
        _id: string;
        articleTitle: string;
        articleUrl: string;
        articleSource: string;
        publishedAt: string;
        relevance: string;
        reason: string;
        savedItem: { _ref: string };
        cluster: { _ref: string };
      }>
    >(`*[_type == "rediscoveryResult" && owner._ref == $ownerId] | order(publishedAt desc) {
      _id,
      articleTitle,
      articleUrl,
      articleSource,
      publishedAt,
      relevance,
      reason,
      savedItem,
      cluster
    }`, { ownerId: SEED_USER_SANITY_ID });

    console.log(`\n  Sanity Persisted Rediscovery Results: ${persisted.length}`);
    assert.strictEqual(persisted.length, result.matchCount);

    persisted.forEach((r, idx) => {
      console.log(`\n  [Match #${idx + 1}] "${r.articleTitle}"`);
      console.log(`    Source: ${r.articleSource} | Published: ${r.publishedAt}`);
      console.log(`    URL: ${r.articleUrl}`);
      console.log(`    Relevance: ${r.relevance.toUpperCase()}`);
      console.log(`    Saved Item Ref: ${r.savedItem?._ref}`);
      console.log(`    Cluster Ref: ${r.cluster?._ref}`);
      console.log(`    Why this matters: ${r.reason}`);

      assert(r.articleUrl.startsWith("http"), "Valid HTTP URL required");
      assert(r.reason.length >= 15, "Meaningful reason required");
      assert(r.savedItem?._ref, "Saved item reference required");
    });

    console.log("\n🔍 Step 2: Testing Check Again (Replacement Behavior)...");
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const result2 = await triggerRediscoveryAction();
    console.log("  Check Again Result:", result2);
    assert.strictEqual(result2.success, true);

    const refreshed = await client.fetch<Array<{ _id: string }>>(
      `*[_type == "rediscoveryResult" && owner._ref == $ownerId] { _id }`,
      { ownerId: SEED_USER_SANITY_ID }
    );
    console.log(`  Count after Check Again: ${refreshed.length}`);
    assert.strictEqual(refreshed.length, result2.matchCount);
  } else {
    console.log(`  Rediscovery returned non-crash state: ${result.status} ("${result.message}")`);
  }

  console.log("\n🎉 ALL CONTEXTUAL REDISCOVERY END-TO-END TESTS PASSED!");
}

async function main() {
  await runUnitTests();
  await runEndToEndTests();
}

main().catch((err) => {
  console.error("❌ Rediscovery verification failed:", err);
  process.exit(1);
});
