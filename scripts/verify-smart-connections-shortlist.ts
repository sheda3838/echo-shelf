import fs from "fs";
import path from "path";
import { createClient } from "next-sanity";
import {
  shortlistCandidates,
  fetchCandidatePool,
  normalizeTag,
  normalizeTags,
  tokenizeKeywords,
  computeOverlap,
  computeTagSimilarity,
  type ConnectionCandidateInput,
  type CandidateDocument,
} from "../lib/connections/candidateShortlist";

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

function printCandidateDebug(title: string, candidates: ReturnType<typeof shortlistCandidates>) {
  console.log(`\n===============================================================`);
  console.log(`🔍 ${title}`);
  console.log(`Returned Candidates: ${candidates.length}`);
  console.log(`---------------------------------------------------------------`);
  if (candidates.length === 0) {
    console.log("  [No candidates above threshold — empty shortlist []]");
    return;
  }
  candidates.forEach((cand, idx) => {
    console.log(
      `  #${idx + 1} "${cand.item.title}"\n` +
      `     Internal Score : ${cand.score.toFixed(4)}\n` +
      `     Tag Overlap    : ${cand.breakdown.tagScore.toFixed(4)} (matches: [${cand.breakdown.tagMatches.join(", ")}])\n` +
      `     Title Overlap  : ${cand.breakdown.titleScore.toFixed(4)} (matches: [${cand.breakdown.titleMatches.join(", ")}])\n` +
      `     Desc Overlap   : ${cand.breakdown.descriptionScore.toFixed(4)} (matches: [${cand.breakdown.descriptionMatches.join(", ")}])`
    );
  });
}

function runUnitTests() {
  console.log("\n🧪 Running Focused Unit Tests...");

  // 1. Tag normalization
  const singleNorm = normalizeTag("  NextJS-Forms  ");
  if (singleNorm !== "nextjs-forms") throw new Error(`Tag normalization failed: ${singleNorm}`);

  // 2. Duplicate tags & whitespace
  const tagList = ["Docker", "docker ", " DOCKER", "", "  ", "containers"];
  const normalizedTags = normalizeTags(tagList);
  if (normalizedTags.length !== 2 || !normalizedTags.includes("docker") || !normalizedTags.includes("containers")) {
    throw new Error(`Duplicate tag normalization failed: ${JSON.stringify(normalizedTags)}`);
  }

  // 3. Keyword normalization & stop words
  const titleTokens = tokenizeKeywords("The Basics of Building an Introduction to Docker Networks");
  // "the", "basics", "of", "an", "introduction", "to" are stop words
  if (titleTokens.includes("basic") || titleTokens.includes("introduct") || titleTokens.includes("the")) {
    throw new Error(`Stop word filtering failed: ${JSON.stringify(titleTokens)}`);
  }
  if (!titleTokens.includes("docker") || !titleTokens.includes("network")) {
    throw new Error(`Tokenization failed to retain valid keywords: ${JSON.stringify(titleTokens)}`);
  }

  // 4. Case-insensitive matching
  const tagsA = ["REACT", "NextJS"];
  const tagsB = ["react", "nextjs"];
  const tagSim = computeTagSimilarity(tagsA, tagsB);
  if (tagSim.score !== 1.0) throw new Error(`Case-insensitive tag match failed: ${tagSim.score}`);

  // 5. Title overlap
  const overlapTitle = computeOverlap(tokenizeKeywords("React Server Components"), tokenizeKeywords("Server Components in React"));
  if (overlapTitle.score < 0.9) throw new Error(`Title overlap failed: ${overlapTitle.score}`);

  // 6. Description overlap
  const descTokensA = tokenizeKeywords("Notes about how Docker bridge networks allow containers to communicate");
  const descTokensB = tokenizeKeywords("Enables container-to-container communication on bridge networks");
  const descOverlap = computeOverlap(descTokensA, descTokensB);
  if (descOverlap.score <= 0) throw new Error("Description overlap failed");

  // 7. Exclusion of current item
  const mockCandidates: CandidateDocument[] = [
    { _id: "item-1", title: "Item One", description: "First item", tags: ["tech"] },
    { _id: "item-2", title: "Item Two", description: "Second item", tags: ["tech"] },
  ];
  const excludedResult = shortlistCandidates(
    { title: "Item One", description: "First item", tags: ["tech"], excludeId: "item-1" },
    mockCandidates
  );
  if (excludedResult.some((c) => c.item._id === "item-1")) {
    throw new Error("Current item was not excluded!");
  }

  // 8. Top-5 limit
  const manyCandidates: CandidateDocument[] = Array.from({ length: 10 }, (_, i) => ({
    _id: `cand-${i}`,
    title: `Docker Networking Part ${i}`,
    description: "Docker containers and networking basics",
    tags: ["docker", "networking"],
  }));
  const limited = shortlistCandidates(
    { title: "Docker Networking", description: "Docker containers", tags: ["docker", "networking"] },
    manyCandidates
  );
  if (limited.length !== 5) {
    throw new Error(`Top-5 limit failed: got ${limited.length}`);
  }

  // 9. No-match behavior
  const noMatchCandidates: CandidateDocument[] = [
    { _id: "doc-1", title: "Quantum Physics", description: "Particle physics and spin", tags: ["physics", "quantum"] },
  ];
  const emptyResult = shortlistCandidates(
    { title: "Baking Sourdough Bread", description: "Flour, water, yeast, starter hydration", tags: ["baking", "bread"] },
    noMatchCandidates
  );
  if (emptyResult.length !== 0) {
    throw new Error("Expected empty result for unrelated item, but got matches");
  }

  console.log("✅ All focused unit tests passed successfully!\n");
}

async function verifyAgainstSeedDataset() {
  console.log("Fetching live candidate pool from Sanity Content Lake...");
  const pool = await fetchCandidatePool(client);
  console.log(`Fetched ${pool.length} candidate documents from Sanity.`);

  // Verify seed dataset exists
  const seedItems = pool.filter((doc) => doc._id.startsWith("seed-smart-connections-"));
  console.log(`Identified ${seedItems.length} seed items in the pool.`);
  if (seedItems.length < 12) {
    console.warn(`⚠️ Warning: Expected 12 seed items, found ${seedItems.length}. Make sure to run 'npm run seed:connections'.`);
  }

  // -------------------------------------------------------------
  // Test A — Strong Docker Match
  // -------------------------------------------------------------
  const testAInput: ConnectionCandidateInput = {
    title: "Docker Bridge Networks Explained",
    description:
      "Notes about how Docker bridge networks allow containers to communicate while remaining isolated from external networks.",
    tags: ["docker", "networking", "containers", "bridge-network"],
  };
  const testAResults = shortlistCandidates(testAInput, pool);
  printCandidateDebug("Test A — Strong Docker Match", testAResults);

  const topATitles = testAResults.map((c) => c.item.title);
  if (!topATitles.includes("Docker Networking Basics")) {
    throw new Error("Test A failed: 'Docker Networking Basics' not found in shortlist");
  }
  if (!topATitles.includes("Container Port Mapping")) {
    throw new Error("Test A failed: 'Container Port Mapping' not found in shortlist");
  }
  if (!topATitles.includes("Kubernetes Service Discovery")) {
    throw new Error("Test A failed: 'Kubernetes Service Discovery' not found in shortlist");
  }
  console.log("  ✓ Test A expectations met (Docker Networking Basics, Container Port Mapping, Kubernetes Service Discovery).");

  // -------------------------------------------------------------
  // Test B — Next.js / React Match
  // -------------------------------------------------------------
  const testBInput: ConnectionCandidateInput = {
    title: "Handling Mutations with Next.js Server Actions",
    description:
      "Using server actions for form submissions and server-side mutations in the Next.js App Router.",
    tags: ["nextjs", "react", "server-actions", "forms"],
  };
  const testBResults = shortlistCandidates(testBInput, pool);
  printCandidateDebug("Test B — Next.js / React Match", testBResults);

  const topBTitles = testBResults.map((c) => c.item.title);
  if (!topBTitles.includes("Next.js Server Actions")) {
    throw new Error("Test B failed: 'Next.js Server Actions' not found in shortlist");
  }
  if (!topBTitles.includes("React Server Components")) {
    throw new Error("Test B failed: 'React Server Components' not found in shortlist");
  }
  if (!topBTitles.includes("REST API Route Design")) {
    throw new Error("Test B failed: 'REST API Route Design' not found in shortlist");
  }
  console.log("  ✓ Test B expectations met (Next.js Server Actions, React Server Components, REST API Route Design).");

  // -------------------------------------------------------------
  // Test C — Knowledge / Semantic Match
  // -------------------------------------------------------------
  const testCInput: ConnectionCandidateInput = {
    title: "Connecting Saved Knowledge with Semantic Similarity",
    description:
      "Exploring ways to connect related saved information using semantic relationships and similarity techniques.",
    tags: ["semantic", "similarity", "knowledge-management", "relationships"],
  };
  const testCResults = shortlistCandidates(testCInput, pool);
  printCandidateDebug("Test C — Knowledge / Semantic Match", testCResults);

  const topCTitles = testCResults.map((c) => c.item.title);
  if (!topCTitles.includes("Knowledge Graph Fundamentals")) {
    throw new Error("Test C failed: 'Knowledge Graph Fundamentals' not found in shortlist");
  }
  if (!topCTitles.includes("Semantic Search Concepts")) {
    throw new Error("Test C failed: 'Semantic Search Concepts' not found in shortlist");
  }
  if (!topCTitles.includes("Personal Knowledge Management")) {
    throw new Error("Test C failed: 'Personal Knowledge Management' not found in shortlist");
  }
  console.log("  ✓ Test C expectations met (Knowledge Graph Fundamentals, Semantic Search Concepts, Personal Knowledge Management).");

  // -------------------------------------------------------------
  // Test D — Unrelated Item
  // -------------------------------------------------------------
  const testDInput: ConnectionCandidateInput = {
    title: "Beginner Home Gardening Checklist",
    description: "Notes about watering vegetables, soil preparation, sunlight, and seasonal planting.",
    tags: ["gardening", "vegetables", "soil", "plants"],
  };
  const testDResults = shortlistCandidates(testDInput, pool);
  printCandidateDebug("Test D — Unrelated Item", testDResults);

  if (testDResults.length !== 0) {
    throw new Error(`Test D failed: expected [] (0 candidates), but got ${testDResults.length}`);
  }
  console.log("  ✓ Test D expectations met: returned [] (no meaningful candidates).");

  console.log("\n🎉 ALL SEED DATASET VERIFICATION CHECKS PASSED!");
}

async function verifyServerAction() {
  console.log("\n===============================================================");
  console.log("🚀 Verifying lookupConnectionCandidatesAction Server Action");
  console.log("===============================================================");

  const { lookupConnectionCandidatesAction } = await import("../app/add/connection-actions");

  // 1. Minimum metadata requirement
  const emptyRes = await lookupConnectionCandidatesAction({
    title: "",
    description: "",
    tags: ["tech"],
  });
  if (emptyRes.success || !emptyRes.message?.includes("Please provide a title or description")) {
    throw new Error(`Expected minimum metadata rejection, got: ${JSON.stringify(emptyRes)}`);
  }
  console.log("  ✓ Minimum metadata requirement enforced (requires title or description).");

  // 2. Test A via Server Action (Docker)
  const actARes = await lookupConnectionCandidatesAction({
    title: "Docker Bridge Networks Explained",
    description: "Notes about Docker bridge networks, container communication, and network isolation.",
    tags: ["docker", "networking", "containers", "bridge-network"],
  });
  if (!actARes.success || actARes.candidates.length === 0) {
    throw new Error("lookupConnectionCandidatesAction Test A failed");
  }
  // Verify no internal scores exposed
  for (const c of actARes.candidates) {
    if ("score" in c || "breakdown" in c) {
      throw new Error(`Security leak: candidate exposed internal score: ${JSON.stringify(c)}`);
    }
  }
  console.log(`  ✓ Test A returned ${actARes.candidates.length} candidates safely without exposing internal scores.`);

  // 3. Test D via Server Action (Unrelated)
  const actDRes = await lookupConnectionCandidatesAction({
    title: "Beginner Home Gardening Checklist",
    description: "Soil preparation, watering vegetables, sunlight, and planting.",
    tags: ["gardening", "vegetables", "soil", "plants"],
  });
  if (!actDRes.success || actDRes.candidates.length !== 0) {
    throw new Error(`lookupConnectionCandidatesAction Test D expected [] but got ${actDRes.candidates.length}`);
  }
  console.log("  ✓ Test D returned [] (no unrelated candidates forced).");

  console.log("🎉 SERVER ACTION PRE-SAVE VERIFICATIONS PASSED!\n");
}

async function main() {
  try {
    runUnitTests();
    await verifyAgainstSeedDataset();
    await verifyServerAction();
  } catch (err) {
    console.error("\n❌ Verification failed:", err);
    process.exit(1);
  }
}

main();
