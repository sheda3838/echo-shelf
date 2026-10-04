import fs from "fs";
import path from "path";
import { createClient } from "next-sanity";
import { Groq } from "groq-sdk";
import { validateGroqClusters } from "../lib/clusters/validateGroqClusters";

// 1. Load .env.local
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

const GROQ_MODEL = "openai/gpt-oss-120b";
const MIN_LIBRARY_ITEMS = 4;

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;
const token = process.env.SANITY_API_WRITE_TOKEN;
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2026-09-27";
const apiKey = process.env.GROQ_API_KEY;

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

interface SavedItemDoc {
  _id: string;
  title: string;
  description?: string;
  tags?: string[];
  contentType?: string;
  owner?: { _ref: string };
}

const ALL_SAVED_ITEMS_QUERY = `*[_type == "savedItem" && !(_id in path("drafts.**")) && owner._ref == $ownerId] | order(savedAt desc) {
  _id,
  title,
  description,
  tags,
  contentType
}`;

async function main() {
  console.log("=================================================");
  console.log("🔍 Checking Users and Saved Items in Sanity");
  console.log("=================================================");

  // Find all users and item counts
  const users = await client.fetch<Array<{ _id: string; displayName: string }>>(`*[_type == "user"] { _id, displayName }`);
  console.log(`Found ${users.length} user document(s):`);

  let targetOwnerId: string | null = null;
  let maxItems = 0;

  for (const u of users) {
    const count = await client.fetch<number>(`count(*[_type == "savedItem" && owner._ref == $ownerId])`, { ownerId: u._id });
    console.log(`- User ${u._id} ("${u.displayName}"): ${count} saved item(s)`);
    if (count > maxItems) {
      maxItems = count;
      targetOwnerId = u._id;
    }
  }

  // Also check if any savedItem exists without owner or under any owner
  const totalItems = await client.fetch<number>(`count(*[_type == "savedItem"])`);
  console.log(`Total savedItem documents across all users: ${totalItems}`);

  if (!targetOwnerId || maxItems === 0) {
    console.log("No owner found with saved items. Checking all savedItem owners...");
    const sampleItems = await client.fetch<SavedItemDoc[]>(`*[_type == "savedItem"][0...5] { _id, title, owner }`);
    console.log("Sample items:", sampleItems);
    return;
  }

  console.log(`\nTargeting ownerId: ${targetOwnerId} with ${maxItems} items.`);

  // Fetch the items exactly as generateKnowledgeClustersAction does
  const items = await client.fetch<SavedItemDoc[]>(ALL_SAVED_ITEMS_QUERY, { ownerId: targetOwnerId });
  console.log(`Fetched ${items.length} items for target owner.`);

  if (items.length < MIN_LIBRARY_ITEMS) {
    console.log("Too few items for clustering (< 4).");
    return;
  }

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

  console.log("\nItems metadata for Groq (safe summary):");
  itemsForGroq.forEach((it, idx) => {
    console.log(`  [${idx + 1}] ID: ${it._id} | Type: ${it.contentType} | Title: "${it.title}" | Tags: [${((it.tags as string[]) || []).join(", ")}]`);
  });

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

  const promptCharLength = systemPrompt.length + userPrompt.length;
  console.log(`\nNew Prompt Characters: ${promptCharLength} (~${Math.round(promptCharLength / 3.8)} tokens)`);

  if (!apiKey) {
    console.error("Missing GROQ_API_KEY");
    process.exit(1);
  }

  const groq = new Groq({ apiKey });

  console.log("\n=================================================");
  console.log("🚀 Starting 5-Run Repeatability Diagnostic");
  console.log("=================================================");

  const runsSummary: Array<{
    run: number;
    success: boolean;
    clusterCount: number;
    clusterTitles: string[];
    failureReason?: string;
  }> = [];

  const rawResponsesDir = path.join(process.cwd(), ".next");

  for (let runIndex = 1; runIndex <= 5; runIndex++) {
    if (runIndex > 1) {
      console.log("Pausing 5s between runs to respect TPM window...");
      await new Promise((res) => setTimeout(res, 5000));
    }

    console.log(`\n--- RUN ${runIndex} ---`);

    let rawContent: string | null = null;
    let groqError: string = "none";
    let parseError: string = "none";
    let validationResultStr: string = "pending";
    let validationFailureReason: string = "none";
    let parsedClusterCount = 0;
    let clusterNames: string[] = [];
    let itemCountPerCluster: Record<string, number> = {};
    const invalidItemReferences: string[] = [];
    const duplicateReferences: string[] = [];
    let isSuccess = false;

    try {
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
    } catch (err) {
      groqError = err instanceof Error ? err.message : String(err);
    }

    if (rawContent) {
      // Save raw response to gitignored .next directory
      const rawFilePath = path.join(rawResponsesDir, `debug-cluster-run-${runIndex}.json`);
      fs.writeFileSync(rawFilePath, rawContent, "utf8");
    }

    let parsed: unknown = null;
    if (rawContent) {
      try {
        parsed = JSON.parse(rawContent);
      } catch (err) {
        parseError = err instanceof Error ? err.message : String(err);
      }
    }

    if (parsed) {
      // Analyze candidate itemIds before validation
      const rawObj = parsed as { clusters?: Array<{ title?: string; itemIds?: unknown }> };
      if (Array.isArray(rawObj.clusters)) {
        parsedClusterCount = rawObj.clusters.length;
        rawObj.clusters.forEach((c) => {
          const title = c.title || "Untitled";
          clusterNames.push(title);
          if (Array.isArray(c.itemIds)) {
            itemCountPerCluster[title] = c.itemIds.length;
            const seenInThisCluster = new Set<string>();
            c.itemIds.forEach((id: unknown) => {
              if (typeof id === "string") {
                if (!allowedItemIds.has(id)) {
                  invalidItemReferences.push(`${title} -> invalid: ${id}`);
                }
                if (seenInThisCluster.has(id)) {
                  duplicateReferences.push(`${title} -> dupe in cluster: ${id}`);
                }
                seenInThisCluster.add(id);
              } else {
                invalidItemReferences.push(`${title} -> non-string id: ${JSON.stringify(id)}`);
              }
            });
          }
        });
      }

      const validation = validateGroqClusters(parsed, allowedItemIds);
      if (validation.valid && validation.clusters.length > 0) {
        isSuccess = true;
        validationResultStr = "VALID";
        clusterNames = validation.clusters.map((c) => c.title);
        itemCountPerCluster = {};
        validation.clusters.forEach((c) => {
          itemCountPerCluster[c.title] = c.itemIds.length;
        });
      } else {
        isSuccess = false;
        validationResultStr = "INVALID";
        validationFailureReason = validation.errors.join("; ") || "Zero valid clusters returned";
      }
    } else {
      validationResultStr = "FAILED_BEFORE_VALIDATION";
      validationFailureReason = parseError !== "none" ? `JSON parse error: ${parseError}` : `Groq API error: ${groqError}`;
    }

    // Required diagnostic output format
    console.log(`[clusters-debug] saved item count: ${items.length}`);
    console.log(`[clusters-debug] model: ${GROQ_MODEL}`);
    console.log(`[clusters-debug] raw response received: ${rawContent ? "yes" : "no"}`);
    console.log(`[clusters-debug] parsed cluster count: ${parsedClusterCount}`);
    console.log(`[clusters-debug] cluster names: ${clusterNames.join(" | ") || "none"}`);
    console.log(`[clusters-debug] item count per cluster: ${JSON.stringify(itemCountPerCluster)}`);
    console.log(`[clusters-debug] invalid item references: ${invalidItemReferences.join(", ") || "none"}`);
    console.log(`[clusters-debug] duplicate references: ${duplicateReferences.join(", ") || "none"}`);
    console.log(`[clusters-debug] validation result: ${validationResultStr}`);
    console.log(`[clusters-debug] validation failure reason: ${validationFailureReason}`);
    console.log(`[clusters-debug] parsing error: ${parseError}`);
    console.log(`[clusters-debug] Groq/API error: ${groqError}`);

    runsSummary.push({
      run: runIndex,
      success: isSuccess,
      clusterCount: isSuccess ? clusterNames.length : 0,
      clusterTitles: clusterNames,
      failureReason: isSuccess ? undefined : validationFailureReason,
    });
  }

  console.log("\n=================================================");
  console.log("📊 Summary of 5 Repeatability Runs");
  console.log("=================================================");
  runsSummary.forEach((r) => {
    console.log(
      `Run ${r.run}: ${r.success ? "success" : "failure"}, cluster count: ${r.clusterCount}, cluster titles: [${r.clusterTitles.join(", ")}]${
        r.failureReason ? ` (Reason: ${r.failureReason})` : ""
      }`
    );
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
