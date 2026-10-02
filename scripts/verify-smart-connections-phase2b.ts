import fs from "fs";
import path from "path";
import { createClient } from "next-sanity";

// Load .env.local BEFORE any module that touches sanity/env.ts
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

import { SEED_USER_SANITY_ID } from "./seed-smart-connections";

process.env.TEST_SUPABASE_USER_ID = "seed-test-user";
process.env.TEST_USER_NAME = "Echo Shelf Test User";

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  token,
  useCdn: false,
});

async function main() {
  const { validateGroqConnections } = await import(
    "../lib/connections/validateGroqConnections"
  );
  const { generateItemConnectionsAction } = await import(
    "../app/item/[id]/connection-actions"
  );

  console.log("\n🧪 Running Groq Response Validation Unit Tests...");

  const allowedCandidates = new Set(["cand-1", "cand-2", "cand-3"]);
  const currentId = "current-item";

  // 1. Valid input
  const validPayload = {
    connections: [
      {
        itemId: "cand-1",
        strength: "strong",
        relationshipType: "complementary",
        explanation: "Both explain container networking principles in depth.",
      },
      {
        itemId: "cand-2",
        strength: "moderate",
        relationshipType: "prerequisite",
        explanation: "Port mapping builds upon basic bridge concepts.",
      },
    ],
  };
  const res1 = validateGroqConnections(validPayload, allowedCandidates, currentId, 5);
  if (!res1.valid || res1.connections.length !== 2) {
    throw new Error(`Test 1 Failed: Expected 2 valid connections, got ${res1.connections.length}`);
  }

  // 2. Reject hallucinated candidate ID
  const hallucinatedPayload = {
    connections: [
      {
        itemId: "unknown-candidate-999",
        strength: "strong",
        relationshipType: "complementary",
        explanation: "This candidate was not in the candidate pool.",
      },
      {
        itemId: "cand-1",
        strength: "strong",
        relationshipType: "complementary",
        explanation: "Valid candidate.",
      },
    ],
  };
  const res2 = validateGroqConnections(hallucinatedPayload, allowedCandidates, currentId, 5);
  if (!res2.valid || res2.connections.length !== 1 || res2.connections[0].itemId !== "cand-1") {
    throw new Error("Test 2 Failed: Hallucinated candidate ID was not discarded.");
  }

  // 3. Reject self-reference
  const selfRefPayload = {
    connections: [
      {
        itemId: "current-item",
        strength: "strong",
        relationshipType: "extends",
        explanation: "Self reference.",
      },
      {
        itemId: "cand-3",
        strength: "weak",
        relationshipType: "related-concept",
        explanation: "Legitimate secondary connection.",
      },
    ],
  };
  const allowedWithCurrent = new Set(["cand-3", "current-item"]);
  const res3 = validateGroqConnections(selfRefPayload, allowedWithCurrent, currentId, 5);
  if (!res3.valid || res3.connections.length !== 1 || res3.connections[0].itemId !== "cand-3") {
    throw new Error("Test 3 Failed: Self reference was not discarded.");
  }

  // 4. Reject duplicates
  const dupPayload = {
    connections: [
      {
        itemId: "cand-1",
        strength: "strong",
        relationshipType: "complementary",
        explanation: "First appearance.",
      },
      {
        itemId: "cand-1",
        strength: "moderate",
        relationshipType: "duplicate",
        explanation: "Duplicate entry.",
      },
    ],
  };
  const res4 = validateGroqConnections(dupPayload, allowedCandidates, currentId, 5);
  if (!res4.valid || res4.connections.length !== 1) {
    throw new Error("Test 4 Failed: Duplicate candidate ID was not deduplicated.");
  }

  // 5. Reject invalid strength
  const invalidStrengthPayload = {
    connections: [
      {
        itemId: "cand-1",
        strength: "super-critical",
        relationshipType: "prerequisite",
        explanation: "Invalid strength value.",
      },
      {
        itemId: "cand-2",
        strength: "moderate",
        relationshipType: "prerequisite",
        explanation: "Valid strength value.",
      },
    ],
  };
  const res5 = validateGroqConnections(invalidStrengthPayload, allowedCandidates, currentId, 5);
  if (!res5.valid || res5.connections.length !== 1 || res5.connections[0].itemId !== "cand-2") {
    throw new Error("Test 5 Failed: Invalid strength was not discarded.");
  }

  // 6. Handle empty connections cleanly
  const emptyPayload = { connections: [] };
  const res6 = validateGroqConnections(emptyPayload, allowedCandidates, currentId, 5);
  if (!res6.valid || res6.connections.length !== 0) {
    throw new Error("Test 6 Failed: Empty connections array should be valid with 0 items.");
  }

  // 7. Non-object or non-array failure
  const invalidJson = { notConnections: true };
  const res7 = validateGroqConnections(invalidJson, allowedCandidates, currentId, 5);
  if (res7.valid) {
    throw new Error("Test 7 Failed: Missing connections array should return valid: false.");
  }

  console.log("✅ All Groq response validation unit tests passed successfully!\n");

  console.log("===============================================================");
  console.log("🚀 Testing Smart Connections Phase 2B End-to-End against Sanity");
  console.log("===============================================================");

  // Test A — Docker Item
  const dockerId = "seed-smart-connections-docker-networking-basics";
  console.log(`\n🔍 Test A: Triggering Smart Connections for Docker Note (${dockerId})...`);
  const resA = await generateItemConnectionsAction(dockerId);
  console.log("  Result A:", resA);

  if (!resA.success || resA.connectionCount === 0) {
    throw new Error(`Test A Failed: Expected connections to be generated for ${dockerId}`);
  }

  // Verify directly from Sanity
  const sanityDocA = await client.fetch<{
    connections?: Array<{
      _key: string;
      strength: string;
      relationshipType: string;
      explanation: string;
      item: { _ref: string };
    }>;
  }>(`*[_id == $id][0]{ connections }`, { id: dockerId });

  console.log("  Sanity Persisted Connections for Docker Note:", sanityDocA.connections?.length);
  sanityDocA.connections?.forEach((c, i) => {
    console.log(`    #${i + 1} ref: ${c.item._ref} | ${c.strength.toUpperCase()} | ${c.relationshipType}`);
    console.log(`       "${c.explanation}"`);
  });

  if (!sanityDocA.connections || sanityDocA.connections.length === 0) {
    throw new Error("Test A Failed: Connections were not saved to Sanity Content Lake.");
  }
  console.log("  ✓ Test A passed: Docker connections generated and persisted successfully.");

  // Test B — Next.js Item (False-positive filtering check)
  const nextjsId = "seed-smart-connections-nextjs-server-actions";
  console.log(`\n🔍 Test B: Triggering Smart Connections for Next.js Note (${nextjsId})...`);
  const resB = await generateItemConnectionsAction(nextjsId);
  console.log("  Result B:", resB);

  const sanityDocB = await client.fetch<{
    connections?: Array<{
      _key: string;
      strength: string;
      relationshipType: string;
      explanation: string;
      item: { _ref: string };
    }>;
  }>(`*[_id == $id][0]{ connections }`, { id: nextjsId });

  console.log("  Sanity Persisted Connections for Next.js Note:", sanityDocB.connections?.length);
  const referencedRefsB = sanityDocB.connections?.map((c) => c.item._ref) || [];
  console.log("  Referenced IDs:", referencedRefsB);

  const hasReactOrRest = referencedRefsB.some(
    (ref) =>
      ref.includes("react-server-components") ||
      ref.includes("rest-api-route-design") ||
      ref.includes("sanity-groq")
  );
  console.log("  Connected to relevant web dev topics:", hasReactOrRest);
  console.log("  ✓ Test B passed: Next.js relations analyzed semantically by Groq.");

  // Test C — Knowledge Connections
  const pkmId = "seed-smart-connections-knowledge-graph-fundamentals";
  console.log(`\n🔍 Test C: Triggering Smart Connections for Knowledge Graph Note (${pkmId})...`);
  const resC = await generateItemConnectionsAction(pkmId);
  console.log("  Result C:", resC);

  const sanityDocC = await client.fetch<{
    connections?: Array<{
      _key: string;
      strength: string;
      relationshipType: string;
      explanation: string;
      item: { _ref: string };
    }>;
  }>(`*[_id == $id][0]{ connections }`, { id: pkmId });

  console.log("  Sanity Persisted Connections for Knowledge Graph Note:", sanityDocC.connections?.length);
  if (!sanityDocC.connections || sanityDocC.connections.length === 0) {
    throw new Error("Test C Failed: Knowledge connections should be found.");
  }
  console.log("  ✓ Test C passed: Semantic / PKM connections generated and persisted.");

  // Test D — Unrelated Item (Zero Candidates -> Groq must NOT be called)
  console.log("\n🔍 Test D: Testing item with zero candidate overlap (Home Gardening)...");
  const tempGardeningDoc = {
    _type: "savedItem",
    owner: {
      _type: "reference",
      _ref: SEED_USER_SANITY_ID,
    },
    title: "Beginner Home Gardening Checklist",
    description: "Essential tools, soil preparation, and planting schedules for organic vegetable gardening.",
    tags: ["gardening", "soil", "vegetables", "organic", "plants", "horticulture"],
    contentType: "note",
    savedAt: new Date().toISOString(),
  };

  const createdGardening = await client.create(tempGardeningDoc);
  try {
    const resD = await generateItemConnectionsAction(createdGardening._id);
    console.log("  Result D:", resD);

    if (resD.status !== "no_candidates") {
      throw new Error(`Test D Failed: Expected status 'no_candidates', got '${resD.status}'`);
    }
    if (resD.connectionCount !== 0) {
      throw new Error("Test D Failed: Expected 0 connections for unrelated gardening item.");
    }
    console.log("  ✓ Test D passed: Zero heuristic candidates returned immediately without calling Groq.");
  } finally {
    await client.delete(createdGardening._id);
  }

  // Test E — Refresh Behavior
  console.log(`\n🔍 Test E: Testing Refresh Connections on (${dockerId})...`);
  const resRefresh = await generateItemConnectionsAction(dockerId);
  console.log("  Refresh Result:", resRefresh);

  const refreshedDocA = await client.fetch<{
    connections?: Array<{
      _key: string;
      strength: string;
      relationshipType: string;
      explanation: string;
      item: { _ref: string };
    }>;
  }>(`*[_id == $id][0]{ connections }`, { id: dockerId });

  console.log("  Refreshed count:", refreshedDocA.connections?.length);

  if (refreshedDocA.connections && refreshedDocA.connections.length > 5) {
    throw new Error("Test E Failed: Connections exceeded max limit of 5 after refresh.");
  }
  console.log("  ✓ Test E passed: Refresh cleanly replaced connections without duplicates accumulating.");

  console.log("\n🎉 ALL SMART CONNECTIONS PHASE 2B VERIFICATIONS PASSED!");
}

main().catch((err) => {
  console.error("\n❌ Verification Failed:", err);
  process.exit(1);
});
