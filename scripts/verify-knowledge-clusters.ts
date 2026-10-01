import fs from "fs";
import path from "path";
import assert from "assert";
import { createClient } from "next-sanity";
import {
  validateGroqClusters,
  MIN_ITEMS_PER_CLUSTER,
  MAX_CLUSTERS,
} from "../lib/clusters/validateGroqClusters";

// Load .env.local when run standalone
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
  console.log("🧪 Running Knowledge Clusters Unit Tests");
  console.log("===============================================================");

  const allowed = new Set(["item-1", "item-2", "item-3", "item-4", "item-5"]);

  // Test 1: Valid clusters
  const validRaw = {
    clusters: [
      {
        title: "DevOps & Containers",
        summary: "Saved knowledge about Docker, Kubernetes, and container orchestration.",
        itemIds: ["item-1", "item-2"],
        tags: ["devops", "docker"],
      },
      {
        title: "Modern Web Frameworks",
        summary: "Covers Next.js server actions, React components, and modern full-stack workflows.",
        itemIds: ["item-3", "item-4"],
        tags: ["react", "nextjs"],
      },
    ],
  };

  const res1 = validateGroqClusters(validRaw, allowed);
  assert.strictEqual(res1.valid, true, "Should be valid");
  assert.strictEqual(res1.clusters.length, 2, "Should have 2 valid clusters");
  assert.strictEqual(res1.clusters[0].itemIds.length, 2);
  assert.strictEqual(res1.clusters[0].slug, "devops-containers");
  console.log("  ✓ Test 1 Passed: Valid cluster payload accepted with clean slugs.");

  // Test 2: Invalid item IDs filtered out
  const invalidItemsRaw = {
    clusters: [
      {
        title: "DevOps",
        summary: "Container networking and Docker fundamentals.",
        itemIds: ["item-1", "non-existent-id-xyz", "item-2"],
      },
    ],
  };
  const res2 = validateGroqClusters(invalidItemsRaw, allowed);
  assert.strictEqual(res2.valid, true);
  assert.strictEqual(res2.clusters[0].itemIds.length, 2);
  assert.deepStrictEqual(res2.clusters[0].itemIds, ["item-1", "item-2"]);
  console.log("  ✓ Test 2 Passed: Non-existent item IDs safely filtered out.");

  // Test 3: Duplicate item IDs in cluster deduplicated
  const duplicateItemsRaw = {
    clusters: [
      {
        title: "DevOps",
        summary: "Container networking and Docker fundamentals.",
        itemIds: ["item-1", "item-1", "item-2", "item-2"],
      },
    ],
  };
  const res3 = validateGroqClusters(duplicateItemsRaw, allowed);
  assert.strictEqual(res3.valid, true);
  assert.strictEqual(res3.clusters[0].itemIds.length, 2);
  assert.deepStrictEqual(res3.clusters[0].itemIds, ["item-1", "item-2"]);
  console.log("  ✓ Test 3 Passed: Duplicate item IDs inside cluster deduplicated.");

  // Test 4: One-item cluster rejection (< 2 valid items)
  const oneItemRaw = {
    clusters: [
      {
        title: "Solitary Topic",
        summary: "This cluster only has a single item and must be dropped.",
        itemIds: ["item-1"],
      },
      {
        title: "Faux Cluster",
        summary: "Has one valid item and one non-existent item.",
        itemIds: ["item-2", "fake-item-999"],
      },
    ],
  };
  const res4 = validateGroqClusters(oneItemRaw, allowed);
  assert.strictEqual(res4.valid, false, "Should be invalid when all clusters have < 2 items");
  assert.strictEqual(res4.clusters.length, 0);
  console.log("  ✓ Test 4 Passed: Clusters with fewer than 2 valid items rejected.");

  // Test 5: Duplicate cluster titles rejection
  const duplicateTitlesRaw = {
    clusters: [
      {
        title: "DevOps & Containers",
        summary: "Container networking and Docker fundamentals.",
        itemIds: ["item-1", "item-2"],
      },
      {
        title: "Devops & containers!", // Same normalized title
        summary: "Duplicate DevOps cluster that should be rejected.",
        itemIds: ["item-3", "item-4"],
      },
    ],
  };
  const res5 = validateGroqClusters(duplicateTitlesRaw, allowed);
  assert.strictEqual(res5.valid, true);
  assert.strictEqual(res5.clusters.length, 1, "Only first cluster with unique title kept");
  console.log("  ✓ Test 5 Passed: Duplicate / near-identical cluster titles rejected.");

  // Test 6: Max cluster cap enforcement
  const manyClustersRaw = {
    clusters: Array.from({ length: 15 }, (_, i) => ({
      title: `Cluster Number ${i + 1}`,
      summary: `A meaningful summary for cluster number ${i + 1} explaining relationships.`,
      itemIds: ["item-1", "item-2"],
    })),
  };
  const res6 = validateGroqClusters(manyClustersRaw, allowed);
  assert.strictEqual(res6.clusters.length, MAX_CLUSTERS, `Should cap at max ${MAX_CLUSTERS}`);
  console.log(`  ✓ Test 6 Passed: Cluster count strictly capped at ${MAX_CLUSTERS}.`);

  console.log("🎉 ALL KNOWLEDGE CLUSTERS UNIT TESTS PASSED!\n");
}

async function runEndToEndTests() {
  console.log("===============================================================");
  console.log("🚀 Testing Knowledge Clusters End-to-End against Sanity & Groq");
  console.log("===============================================================");

  const { generateKnowledgeClustersAction } = await import(
    "../app/clusters/cluster-actions"
  );

  // 1. Trigger generateKnowledgeClustersAction
  console.log("\n🔍 Step 1: Triggering Knowledge Clusters generation...");
  const result1 = await generateKnowledgeClustersAction();
  console.log("  Generation Result:", result1);

  assert.strictEqual(result1.success, true, "Generation should succeed");
  assert.strictEqual(result1.status, "success");
  assert(result1.clusterCount && result1.clusterCount >= 2, "Should generate at least 2 clusters");

  // 2. Query Sanity to inspect persisted clusters
  const persistedClusters = await client.fetch<
    Array<{
      _id: string;
      title: string;
      slug: { current: string };
      summary: string;
      tags?: string[];
      items: Array<{ _ref: string }>;
    }>
  >(`*[_type == "knowledgeCluster"] | order(generatedAt desc) {
    _id,
    title,
    slug,
    summary,
    tags,
    items
  }`);

  console.log(`\n  Sanity Persisted Clusters: ${persistedClusters.length}`);
  assert.strictEqual(
    persistedClusters.length,
    result1.clusterCount,
    "Persisted cluster count must match action result"
  );

  let manyToManyFound = false;
  const itemClusterMembershipCount = new Map<string, number>();

  persistedClusters.forEach((c, i) => {
    console.log(`\n  [Cluster #${i + 1}] "${c.title}" (${c.items.length} items)`);
    console.log(`    Slug: ${c.slug?.current}`);
    console.log(`    Summary: ${c.summary}`);
    console.log(`    Tags: ${(c.tags || []).join(", ") || "None"}`);
    console.log(`    Item Refs: ${c.items.map((it) => it._ref).join(", ")}`);

    assert(c.items.length >= MIN_ITEMS_PER_CLUSTER, "Every cluster must have >= 2 items");

    for (const it of c.items) {
      const count = (itemClusterMembershipCount.get(it._ref) || 0) + 1;
      itemClusterMembershipCount.set(it._ref, count);
      if (count > 1) {
        manyToManyFound = true;
      }
    }
  });

  console.log(`\n  Many-to-Many membership detected: ${manyToManyFound}`);

  // 3. Test Refresh Replacement Behavior
  console.log("\n🔍 Step 2: Testing Refresh Clusters replacement behavior...");
  const oldIds = new Set(persistedClusters.map((c) => c._id));
  const result2 = await generateKnowledgeClustersAction();
  console.log("  Refresh Result:", result2);

  assert.strictEqual(result2.success, true, "Refresh should succeed");

  const refreshedClusters = await client.fetch<
    Array<{
      _id: string;
      title: string;
    }>
  >(`*[_type == "knowledgeCluster"] { _id, title }`);

  console.log(`  Clusters count after refresh: ${refreshedClusters.length}`);
  assert.strictEqual(
    refreshedClusters.length,
    result2.clusterCount,
    "Refreshed count must match result count (no duplicate accumulation)"
  );
  // Check that old cluster IDs were replaced cleanly
  const currentIds = new Set(refreshedClusters.map((c) => c._id));
  const overlap = [...oldIds].filter((id) => currentIds.has(id));
  console.log(`  Overlap with previous document IDs (should be 0 for full clean recreation): ${overlap.length}`);

  console.log("\n🎉 ALL KNOWLEDGE CLUSTERS END-TO-END VERIFICATIONS PASSED!");
}

async function main() {
  await runUnitTests();
  await runEndToEndTests();
}

main().catch((err) => {
  console.error("❌ Knowledge Clusters verification failed:", err);
  process.exit(1);
});
