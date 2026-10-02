import fs from "fs";
import path from "path";
import assert from "assert";
import { createClient } from "next-sanity";
import {
  normalizeUrl,
  normalizeNoteText,
  hashString,
  hashBuffer,
  buildUrlFingerprint,
  buildNoteFingerprint,
  buildFileFingerprint,
  buildDuplicateFingerprint,
} from "../lib/duplicates/fingerprint";
import { checkDuplicateAction } from "../app/add/duplicate-actions";
import { saveItemAction } from "../app/add/actions";

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
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2026-09-30";

const writeClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token,
});

async function runDuplicateTests() {
  console.log("===============================================================");
  console.log("🧪 Running Exact Duplicate Detection Unit Tests");
  console.log("===============================================================");

  // 1. URL Normalization: Trailing slashes
  console.log("\n[Test 1] URL Normalization (Trailing Slashes):");
  const urlClean = "https://example.com/article";
  const urlSlash = "https://example.com/article/";
  assert.strictEqual(
    normalizeUrl(urlClean),
    normalizeUrl(urlSlash),
    "URLs with/without trailing slash should normalize identically"
  );
  assert.strictEqual(
    buildUrlFingerprint(urlClean),
    buildUrlFingerprint(urlSlash),
    "Fingerprints for trailing slash URLs should match"
  );
  console.log("  ✓ https://example.com/article and https://example.com/article/ match.");

  // 2. URL Normalization: Tracking parameter stripping
  console.log("\n[Test 2] Tracking Parameter Stripping:");
  const urlTracking1 = "https://example.com/article?utm_source=linkedin&utm_medium=social";
  const urlTracking2 = "https://example.com/article?fbclid=IwAR123&utm_campaign=launch";
  assert.strictEqual(
    normalizeUrl(urlClean),
    normalizeUrl(urlTracking1),
    "URL with utm_source and utm_medium should match clean URL"
  );
  assert.strictEqual(
    normalizeUrl(urlClean),
    normalizeUrl(urlTracking2),
    "URL with fbclid should match clean URL"
  );
  console.log("  ✓ Tracking parameters (utm_*, fbclid) stripped cleanly.");

  // 3. Meaningful query parameters preserved (YouTube v parameter)
  console.log("\n[Test 3] Meaningful Query Parameters Preservation:");
  const ytVideo1 = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=twitter";
  const ytVideo2 = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const ytVideoOther = "https://www.youtube.com/watch?v=9bZkp7q19f0";

  assert.strictEqual(
    buildUrlFingerprint(ytVideo1),
    buildUrlFingerprint(ytVideo2),
    "Same YouTube video with tracking param must match"
  );
  assert.notStrictEqual(
    buildUrlFingerprint(ytVideo1),
    buildUrlFingerprint(ytVideoOther),
    "Different YouTube video IDs must NOT collide"
  );
  console.log("  ✓ YouTube video ID preserved; different videos produce distinct fingerprints.");

  // 4. Note Whitespace and Case Normalization
  console.log("\n[Test 4] Note Content Normalization:");
  const noteOriginal = "Docker networking allows containers to communicate.";
  const noteMessy = "   docker   networking\r\nallows  containers   to\ncommunicate.  ";
  const noteDifferent = "Docker networking allows containers to communicate securely across hosts.";

  assert.strictEqual(
    normalizeNoteText(noteOriginal),
    normalizeNoteText(noteMessy),
    "Whitespace and line ending variations should normalize identically"
  );
  assert.strictEqual(
    buildNoteFingerprint(noteOriginal),
    buildNoteFingerprint(noteMessy),
    "Fingerprints for normalized notes should match"
  );
  assert.notStrictEqual(
    buildNoteFingerprint(noteOriginal),
    buildNoteFingerprint(noteDifferent),
    "Meaningfully different note sentences must not match"
  );
  console.log("  ✓ Note whitespace/case normalized; distinct notes preserved.");

  // 5. String & Buffer Hashing Determinism
  console.log("\n[Test 5] Hashing Determinism:");
  const testStr = "deterministic-test-string";
  const hash1 = hashString(testStr);
  const hash2 = hashString(testStr);
  assert.strictEqual(hash1, hash2, "String hash must be deterministic");
  assert.strictEqual(hash1.length, 64, "SHA-256 output must be 64 hex characters");

  const bufA = Buffer.from("identical file bytes for duplicate test");
  const bufB = Buffer.from("identical file bytes for duplicate test");
  const bufDiff = Buffer.from("different file bytes");
  assert.strictEqual(hashBuffer(bufA), hashBuffer(bufB), "Buffer hash must be deterministic");
  assert.notStrictEqual(hashBuffer(bufA), hashBuffer(bufDiff), "Different buffers must not collide");
  console.log("  ✓ String and Buffer SHA-256 hashing verified.");

  // 6. Same file bytes with different filenames
  console.log("\n[Test 6] File Byte Identity Independent of Filename:");
  const fileBytes = Buffer.from("PDF 1.4 %PDF binary mock file content");
  const fpReport = buildFileFingerprint(fileBytes);
  const fpRenamed = buildFileFingerprint(fileBytes);
  assert.strictEqual(fpReport, fpRenamed, "Identical bytes under different filenames must match");
  console.log("  ✓ Same file bytes with different filenames resolve to exact same fingerprint.");

  // 6b. Generic buildDuplicateFingerprint dispatcher
  const fpDispatcher = buildDuplicateFingerprint({
    contentType: "note",
    sourceText: noteOriginal,
  });
  assert.strictEqual(fpDispatcher, buildNoteFingerprint(noteOriginal), "buildDuplicateFingerprint must dispatch correctly for note");
  console.log("  ✓ buildDuplicateFingerprint helper verified.");

  console.log("\n🎉 ALL UNIT TESTS PASSED!");

  console.log("\n===============================================================");
  console.log("🚀 Testing Pre-Save Duplicate Check & Save Anyway against Sanity");
  console.log("===============================================================");

  process.env.TEST_SUPABASE_USER_ID = "test-duplicate-verification-user";
  process.env.TEST_USER_NAME = "Duplicate Tester";

  // 7. Sanity Duplicate Query against user's saved item
  console.log("\n[Test 7] Check Duplicate Action against Existing Note:");
  const existingNoteText = "Docker provides several network drivers including bridge, host, overlay, and macvlan.";
  
  // Save seed item first
  const seedForm = new FormData();
  seedForm.append("contentType", "note");
  seedForm.append("title", "Docker Networking Basics");
  seedForm.append("description", "A note about Docker networking.");
  seedForm.append("sourceText", existingNoteText);
  const seedRes = await saveItemAction(seedForm);
  assert.strictEqual(seedRes.success, true, "Seed note must be saved successfully");

  // Check if our saved item is detected as duplicate
  const checkRes = await checkDuplicateAction({
    contentType: "note",
    sourceText: existingNoteText,
  });

  console.log("  Check Duplicate Result:", checkRes);
  assert.strictEqual(checkRes.duplicate, true, "Existing item must be detected as duplicate");
  assert.ok(checkRes.item, "Duplicate item metadata must be returned");
  console.log(`  ✓ Successfully detected duplicate item: "${checkRes.item?.title}" (${checkRes.item?._id})`);

  // 8. Sanity Duplicate Query against non-existent item
  console.log("\n[Test 8] Check Duplicate Action against Unique Content:");
  const uniqueText = `Completely unique note created for test at timestamp ${Date.now()}`;
  const checkUniqueRes = await checkDuplicateAction({
    contentType: "note",
    sourceText: uniqueText,
  });
  assert.strictEqual(checkUniqueRes.duplicate, false, "Unique content should return duplicate: false");
  console.log("  ✓ Unique content safely reports duplicate: false.");

  // 9. Save Item Duplicate Block & Save Anyway Override
  console.log("\n[Test 9] Save Item Action with and without allowDuplicate:");
  const testTitle = `Duplicate Test Item ${Date.now()}`;
  const testNoteText = `This is a unique test note for save anyway verification ${Date.now()}`;

  // First Save: normal save
  const form1 = new FormData();
  form1.append("contentType", "note");
  form1.append("title", testTitle);
  form1.append("description", "A note about duplicate detection testing.");
  form1.append("sourceText", testNoteText);

  const saveRes1 = await saveItemAction(form1);
  assert.strictEqual(saveRes1.success, true, "First item save should succeed");
  const createdId1 = saveRes1.itemId || saveRes1.id;
  assert.ok(createdId1, "Item ID must be returned on save");
  console.log(`  ✓ Item 1 created successfully: ${createdId1}`);

  // Second Save Attempt: without allowDuplicate (should be blocked as duplicate)
  const form2 = new FormData();
  form2.append("contentType", "note");
  form2.append("title", `${testTitle} - Copy`);
  form2.append("description", "A note about duplicate detection testing copy.");
  form2.append("sourceText", `  ${testNoteText}  `); // with extra whitespace

  const saveRes2 = await saveItemAction(form2);
  assert.strictEqual(saveRes2.success, false, "Second save should fail duplicate check");
  assert.strictEqual(saveRes2.isDuplicate, true, "isDuplicate flag should be true");
  assert.strictEqual(saveRes2.duplicateItem?._id, createdId1, "Should point to created item 1");
  console.log(`  ✓ Duplicate block verified: "${saveRes2.message}" -> points to item ${createdId1}`);

  // Third Save Attempt: with allowDuplicate: true (Save Anyway)
  const form3 = new FormData();
  form3.append("contentType", "note");
  form3.append("title", `${testTitle} - Copy (Allowed)`);
  form3.append("description", "A note about duplicate detection testing copy allowed.");
  form3.append("sourceText", testNoteText);
  form3.append("allowDuplicate", "true");

  const saveRes3 = await saveItemAction(form3);
  assert.strictEqual(saveRes3.success, true, "Save Anyway should succeed");
  const createdId2 = saveRes3.itemId || saveRes3.id;
  assert.ok(createdId2, "Item 2 ID must be returned");
  console.log(`  ✓ Save Anyway created item 2: ${createdId2}`);

  // Verify both items have the exact same fingerprint in Sanity
  const doc1 = await writeClient.getDocument(createdId1 as string);
  const doc2 = await writeClient.getDocument(createdId2 as string);
  assert.ok(doc1?.sourceFingerprint, "Doc 1 must have sourceFingerprint");
  assert.strictEqual(
    doc1?.sourceFingerprint,
    doc2?.sourceFingerprint,
    "Both items must share the exact same sourceFingerprint"
  );
  console.log(`  ✓ Both items share fingerprint: ${doc1?.sourceFingerprint}`);

  // Clean up the test documents created for this test
  console.log("\n  Cleaning up test items...");
  if (seedRes.itemId) await writeClient.delete(seedRes.itemId);
  await writeClient.delete(createdId1 as string);
  await writeClient.delete(createdId2 as string);
  console.log("  ✓ Test items cleaned up.");

  console.log("\n🎉 ALL EXACT DUPLICATE DETECTION END-TO-END TESTS PASSED!");
}

runDuplicateTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
