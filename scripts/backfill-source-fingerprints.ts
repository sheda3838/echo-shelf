import fs from "fs";
import path from "path";
import { createClient } from "next-sanity";
import {
  buildUrlFingerprint,
  buildNoteFingerprint,
  buildFileFingerprint,
} from "../lib/duplicates/fingerprint";

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

if (!projectId || !dataset || !token) {
  console.error("❌ Missing Sanity configuration in environment (projectId, dataset, or write token).");
  process.exit(1);
}

const writeClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token,
});

interface ExistingSavedItem {
  _id: string;
  title: string;
  contentType: string;
  sourceFingerprint?: string;
  source?: {
    url?: string;
    text?: string;
    file?: {
      asset?: {
        _id: string;
        url: string;
      };
    };
  };
  image?: {
    asset?: {
      _id: string;
      url: string;
    };
  };
}

async function backfillSourceFingerprints() {
  console.log("===============================================================");
  console.log("🔄 Starting One-Time Source Fingerprints Backfill");
  console.log("===============================================================");

  const query = `*[_type == "savedItem" && !(_id in path("drafts.**"))]{
    _id,
    title,
    contentType,
    sourceFingerprint,
    source {
      url,
      text,
      file {
        asset-> {
          _id,
          url
        }
      }
    },
    image {
      asset-> {
        _id,
        url
      }
    }
  }`;

  const items: ExistingSavedItem[] = await writeClient.fetch(query);
  console.log(`Found ${items.length} total savedItem document(s) in Sanity.\n`);

  let updatedCount = 0;
  let alreadyHasCount = 0;
  let skippedCount = 0;

  for (const item of items) {
    if (item.sourceFingerprint) {
      console.log(`  [SKIP - ALREADY SET] "${item.title}" (${item._id}) -> ${item.sourceFingerprint}`);
      alreadyHasCount++;
      continue;
    }

    let calculatedFingerprint: string | null = null;

    // 1. URL-based content
    if (
      ["article", "video", "repo", "url"].includes(item.contentType) ||
      (item.source?.url && !item.source?.text && !item.source?.file)
    ) {
      if (item.source?.url) {
        calculatedFingerprint = buildUrlFingerprint(item.source.url);
      }
    }

    // 2. Note content
    if (!calculatedFingerprint && (item.contentType === "note" || item.source?.text)) {
      if (item.source?.text) {
        calculatedFingerprint = buildNoteFingerprint(item.source.text);
      }
    }

    // 3. Document / Image uploaded assets
    if (!calculatedFingerprint) {
      const assetUrl =
        item.source?.file?.asset?.url || item.image?.asset?.url;

      if (assetUrl) {
        try {
          console.log(`    Fetching asset bytes for "${item.title}" from: ${assetUrl.slice(0, 60)}...`);
          const res = await fetch(assetUrl);
          if (res.ok) {
            const ab = await res.arrayBuffer();
            const buf = Buffer.from(ab);
            calculatedFingerprint = buildFileFingerprint(buf);
          }
        } catch (fetchErr) {
          console.warn(`    ⚠️ Could not fetch asset bytes for item "${item.title}":`, fetchErr);
        }
      }
    }

    if (calculatedFingerprint) {
      try {
        await writeClient
          .patch(item._id)
          .set({ sourceFingerprint: calculatedFingerprint })
          .commit();
        console.log(`  ✓ [BACKFILLED] "${item.title}" (${item.contentType}) -> ${calculatedFingerprint}`);
        updatedCount++;
      } catch (patchErr) {
        console.error(`  ❌ Failed to patch item "${item.title}":`, patchErr);
      }
    } else {
      console.log(`  ⚠️ [SKIPPED - NO SOURCE IDENTITY] "${item.title}" (${item._id})`);
      skippedCount++;
    }
  }

  console.log("\n===============================================================");
  console.log("🏁 Backfill Summary:");
  console.log(`   Total Items Inspected: ${items.length}`);
  console.log(`   Backfilled Fingerprints: ${updatedCount}`);
  console.log(`   Already Had Fingerprint: ${alreadyHasCount}`);
  console.log(`   Skipped (No source data): ${skippedCount}`);
  console.log("===============================================================\n");
}

backfillSourceFingerprints().catch((err) => {
  console.error("Backfill failed with error:", err);
  process.exit(1);
});
