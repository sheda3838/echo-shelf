import assert from "node:assert";
import { createClient } from "@sanity/client";
import { getSanityUserId, getOrCreateEchoUser } from "../lib/auth/echoUser";
import { checkDuplicateAction } from "../app/add/duplicate-actions";
import { saveItemAction } from "../app/add/actions";
import { fetchCandidatePool } from "../lib/connections/candidateShortlist";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-02-19";
const token = process.env.SANITY_API_WRITE_TOKEN;

if (!projectId || !dataset || !token) {
  console.error("Missing required Sanity environment variables");
  process.exit(1);
}

const sanityClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token,
});

async function runIsolationSuite() {
  console.log("===============================================================");
  console.log("👥 Echo Shelf Phase 2: User Ownership & Data Isolation Suite");
  console.log("===============================================================\n");

  const supabaseUserAId = "11111111-aaaa-4444-8888-aaaaaaaaaaaa";
  const supabaseUserBId = "22222222-bbbb-4444-8888-bbbbbbbbbbbb";

  // Test 1: Deterministic Sanity User IDs & Privacy Rule
  console.log("[Test 1] Deterministic Sanity User ID & Privacy Rule:");
  const expectedSanityIdA = getSanityUserId(supabaseUserAId);
  const expectedSanityIdB = getSanityUserId(supabaseUserBId);

  assert.ok(expectedSanityIdA.startsWith("user."), "User A ID should start with user.");
  assert.ok(expectedSanityIdB.startsWith("user."), "User B ID should start with user.");
  assert.notStrictEqual(expectedSanityIdA, expectedSanityIdB, "Users must have distinct IDs");

  const echoUserA = await getOrCreateEchoUser({
    id: supabaseUserAId,
    app_metadata: {},
    user_metadata: { name: "Alice Researcher" },
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as unknown as import("@supabase/supabase-js").User);

  const echoUserB = await getOrCreateEchoUser({
    id: supabaseUserBId,
    app_metadata: {},
    user_metadata: { name: "Bob Builder" },
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as unknown as import("@supabase/supabase-js").User);

  assert.strictEqual(echoUserA.id, expectedSanityIdA);
  assert.strictEqual(echoUserB.id, expectedSanityIdB);

  // Inspect user doc in Sanity to ensure NO email is stored
  const fetchedUserA = await sanityClient.getDocument(echoUserA.id);
  assert.strictEqual(fetchedUserA?.displayName, "Alice Researcher");
  assert.strictEqual((fetchedUserA as Record<string, unknown>)?.email, undefined, "Sanity User document must NOT contain email");
  console.log("  ✓ Deterministic ID generated:", echoUserA.id);
  console.log("  ✓ Privacy rule verified: No email stored in Sanity user document.");

  // Test 2: User A & User B Item Creation
  console.log("\n[Test 2] Create Items for User A and User B:");
  process.env.TEST_SUPABASE_USER_ID = supabaseUserAId;
  process.env.TEST_USER_NAME = "Alice Researcher";

  // Create User A Item 1
  const formA1 = new FormData();
  formA1.append("contentType", "note");
  formA1.append("title", "User A — Docker Networking");
  formA1.append("description", "A note about container network namespaces.");
  formA1.append("sourceText", "Bridge networks enable container isolation with virtual ethernet interfaces.");
  formA1.append("tags", "docker, networking");
  const resA1 = await saveItemAction(formA1);
  assert.strictEqual(resA1.success, true);
  const itemA1Id = resA1.itemId!;

  // Create User A Item 2
  const formA2 = new FormData();
  formA2.append("contentType", "note");
  formA2.append("title", "User A — Kubernetes Pods");
  formA2.append("description", "A note about multi-container pods sharing network namespace.");
  formA2.append("sourceText", "Pods share localhost and port space.");
  formA2.append("tags", "kubernetes, networking");
  const resA2 = await saveItemAction(formA2);
  assert.strictEqual(resA2.success, true);
  const itemA2Id = resA2.itemId!;

  // Switch to User B
  process.env.TEST_SUPABASE_USER_ID = supabaseUserBId;
  process.env.TEST_USER_NAME = "Bob Builder";

  // Create User B Item 1
  const formB1 = new FormData();
  formB1.append("contentType", "article");
  formB1.append("title", "User B — Sourdough Bread Baking");
  formB1.append("description", "A culinary guide to wild yeast fermentation.");
  formB1.append("sourceUrl", "https://example.com/baking-bread");
  formB1.append("tags", "baking, recipes");
  const resB1 = await saveItemAction(formB1);
  assert.strictEqual(resB1.success, true);
  const itemB1Id = resB1.itemId!;

  console.log(`  ✓ User A created items: ${itemA1Id}, ${itemA2Id}`);
  console.log(`  ✓ User B created item: ${itemB1Id}`);

  // Test 3: Library Query Isolation
  console.log("\n[Test 3] Library Query Ownership Scoping:");
  const LIBRARY_QUERY = `*[_type == "savedItem" && !(_id in path("drafts.**")) && owner._ref == $ownerId] | order(savedAt desc) { _id, title }`;

  const userAItems = await sanityClient.fetch<{ _id: string; title: string }[]>(LIBRARY_QUERY, {
    ownerId: echoUserA.id,
  });
  const userBItems = await sanityClient.fetch<{ _id: string; title: string }[]>(LIBRARY_QUERY, {
    ownerId: echoUserB.id,
  });

  assert.strictEqual(userAItems.length, 2, "User A should see exactly 2 items");
  assert.strictEqual(userBItems.length, 1, "User B should see exactly 1 item");
  assert.ok(userAItems.some((i) => i._id === itemA1Id));
  assert.ok(userAItems.some((i) => i._id === itemA2Id));
  assert.ok(!userAItems.some((i) => i._id === itemB1Id), "User A must NOT see User B items");
  assert.ok(userBItems.some((i) => i._id === itemB1Id));
  assert.ok(!userBItems.some((i) => i._id === itemA1Id), "User B must NOT see User A items");
  console.log("  ✓ User A library contains only User A items.");
  console.log("  ✓ User B library contains only User B items.");

  // Test 4: Cross-User Item Detail Access
  console.log("\n[Test 4] Cross-User Item Detail Protection:");
  const ITEM_QUERY = `*[_type == "savedItem" && _id == $id && owner._ref == $ownerId][0] { _id, title }`;

  const fetchAsOwner = await sanityClient.fetch(ITEM_QUERY, {
    id: itemA1Id,
    ownerId: echoUserA.id,
  });
  assert.ok(fetchAsOwner, "User A should access their own item");

  const fetchAsOther = await sanityClient.fetch(ITEM_QUERY, {
    id: itemA1Id,
    ownerId: echoUserB.id,
  });
  assert.strictEqual(fetchAsOther, null, "User B must receive null when requesting User A item");
  console.log("  ✓ User B attempting to view User A item returns null (triggers 404 notFound).");

  // Test 5: Exact Duplicate Isolation
  console.log("\n[Test 5] Duplicate Isolation Across Users:");
  const sharedUrl = "https://example.com/common-developer-doc";

  // User A saves sharedUrl
  process.env.TEST_SUPABASE_USER_ID = supabaseUserAId;
  const formDupA1 = new FormData();
  formDupA1.append("contentType", "article");
  formDupA1.append("title", "Common Doc");
  formDupA1.append("description", "A shared doc.");
  formDupA1.append("sourceUrl", sharedUrl);
  const saveDupA1 = await saveItemAction(formDupA1);
  assert.strictEqual(saveDupA1.success, true);
  const dupDocAId = saveDupA1.itemId!;

  // User A checks duplicate on the same URL -> MUST detect duplicate
  const checkDupA = await checkDuplicateAction({
    contentType: "article",
    sourceUrl: sharedUrl,
  });
  assert.strictEqual(checkDupA.duplicate, true, "User A must receive duplicate warning for their own item");
  console.log("  ✓ User A duplicate check correctly detects duplicate.");

  // User B checks duplicate on the exact same URL -> MUST NOT detect duplicate!
  process.env.TEST_SUPABASE_USER_ID = supabaseUserBId;
  const checkDupB = await checkDuplicateAction({
    contentType: "article",
    sourceUrl: sharedUrl,
  });
  assert.strictEqual(checkDupB.duplicate, false, "User B must NOT receive duplicate warning caused by User A");
  console.log("  ✓ User B can save the exact same URL without false duplicate warnings.");

  // Test 6: Potentially Related Candidates Isolation
  console.log("\n[Test 6] Potentially Related Candidate Pool Isolation:");
  const poolA = await fetchCandidatePool(sanityClient, undefined, echoUserA.id);
  const poolB = await fetchCandidatePool(sanityClient, undefined, echoUserB.id);

  assert.ok(poolA.every((c) => c._id !== itemB1Id), "Pool A must not contain User B items");
  assert.ok(poolB.every((c) => c._id !== itemA1Id && c._id !== itemA2Id), "Pool B must not contain User A items");
  console.log("  ✓ Candidate pool for User A contains only User A items.");
  console.log("  ✓ Candidate pool for User B contains only User B items.");

  // Test 7: Knowledge Cluster Isolation
  console.log("\n[Test 7] Knowledge Cluster Isolation:");
  const clusterA = await sanityClient.create({
    _type: "knowledgeCluster",
    owner: { _type: "reference", _ref: echoUserA.id },
    title: "User A Cluster",
    slug: { _type: "slug", current: "user-a-cluster" },
    summary: "A cluster for user A",
    items: [{ _type: "reference", _ref: itemA1Id, _key: "k1" }, { _type: "reference", _ref: itemA2Id, _key: "k2" }],
    generatedAt: new Date().toISOString(),
  });

  const CLUSTERS_QUERY = `*[_type == "knowledgeCluster" && owner._ref == $ownerId] { _id }`;
  const clustersUserA = await sanityClient.fetch(CLUSTERS_QUERY, { ownerId: echoUserA.id });
  const clustersUserB = await sanityClient.fetch(CLUSTERS_QUERY, { ownerId: echoUserB.id });

  assert.strictEqual(clustersUserA.length, 1);
  assert.strictEqual(clustersUserB.length, 0, "User B must see 0 clusters");

  // User B refreshes clusters (simulated replace)
  const userBClusterIds = await sanityClient.fetch<string[]>(
    `*[_type == "knowledgeCluster" && owner._ref == $ownerId]._id`,
    { ownerId: echoUserB.id }
  );
  // User B deletion only touches userBClusterIds (length 0)
  assert.strictEqual(userBClusterIds.length, 0);

  // User A cluster still exists
  const checkClusterA = await sanityClient.getDocument(clusterA._id);
  assert.ok(checkClusterA, "User A cluster must remain untouched by User B");
  console.log("  ✓ User A clusters isolated from User B.");

  // Test 8: Contextual Rediscovery Isolation
  console.log("\n[Test 8] Contextual Rediscovery Isolation:");
  const rediscoveryA = await sanityClient.create({
    _type: "rediscoveryResult",
    owner: { _type: "reference", _ref: echoUserA.id },
    articleTitle: "Breaking News for Alice",
    articleUrl: "https://example.com/alice-news",
    articleSource: "Tech Daily",
    publishedAt: new Date().toISOString(),
    discoveredAt: new Date().toISOString(),
    relevance: "strong",
    connectionType: "extends",
    reason: "Directly relates to Alice's Docker research",
    savedItem: { _type: "reference", _ref: itemA1Id },
  });

  const REDISCOVERY_QUERY = `*[_type == "rediscoveryResult" && owner._ref == $ownerId] { _id }`;
  const rediscoveryUserA = await sanityClient.fetch(REDISCOVERY_QUERY, { ownerId: echoUserA.id });
  const rediscoveryUserB = await sanityClient.fetch(REDISCOVERY_QUERY, { ownerId: echoUserB.id });

  assert.strictEqual(rediscoveryUserA.length, 1);
  assert.strictEqual(rediscoveryUserB.length, 0, "User B must see 0 rediscovery results");

  // User B refresh deletes only User B's results
  const userBRediscoveryIds = await sanityClient.fetch<string[]>(
    `*[_type == "rediscoveryResult" && owner._ref == $ownerId]._id`,
    { ownerId: echoUserB.id }
  );
  assert.strictEqual(userBRediscoveryIds.length, 0);

  const checkRediscoveryA = await sanityClient.getDocument(rediscoveryA._id);
  assert.ok(checkRediscoveryA, "User A rediscovery result must remain untouched");
  console.log("  ✓ User A rediscovery results isolated from User B.");

  // Clean up test documents
  console.log("\nCleaning up test documents...");
  const tx = sanityClient.transaction();
  tx.delete(itemA1Id);
  tx.delete(itemA2Id);
  tx.delete(itemB1Id);
  tx.delete(dupDocAId);
  tx.delete(clusterA._id);
  tx.delete(rediscoveryA._id);
  tx.delete(echoUserA.id);
  tx.delete(echoUserB.id);
  await tx.commit();
  console.log("  ✓ Test documents cleaned up cleanly.");

  console.log("\n🎉 ALL PHASE 2 USER OWNERSHIP & DATA ISOLATION TESTS PASSED!");
}

runIsolationSuite().catch((err) => {
  console.error("Isolation tests failed:", err);
  process.exit(1);
});
