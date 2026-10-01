"use server";

import { client } from "@/sanity/lib/client";
import { buildDuplicateFingerprint } from "@/lib/duplicates/fingerprint";

export interface DuplicateCheckInput {
  contentType: string;
  sourceUrl?: string;
  sourceText?: string;
  sourceFile?: File | null;
}

export interface DuplicateCheckResult {
  duplicate: boolean;
  item?: {
    _id: string;
    title: string;
    contentType?: string;
    description?: string;
    savedAt: string;
  };
  message?: string;
}

/**
 * Server action to check whether an exact duplicate source or content
 * already exists in Echo Shelf before saving.
 */
export async function checkDuplicateAction(
  input: DuplicateCheckInput | FormData
): Promise<DuplicateCheckResult> {
  try {
    let contentType = "";
    let sourceUrl: string | undefined;
    let sourceText: string | undefined;
    let fileBuffer: Buffer | undefined;

    if (typeof (input as FormData)?.get === "function") {
      const fd = input as FormData;
      contentType = (fd.get("contentType") as string)?.trim() || "";
      sourceUrl = (fd.get("sourceUrl") as string)?.trim() || undefined;
      sourceText = (fd.get("sourceText") as string)?.trim() || undefined;

      const rawFile = fd.get("sourceFile");
      if (
        rawFile &&
        typeof rawFile === "object" &&
        "arrayBuffer" in rawFile &&
        typeof (rawFile as File).arrayBuffer === "function"
      ) {
        const file = rawFile as File;
        if (file.size > 0) {
          const ab = await file.arrayBuffer();
          fileBuffer = Buffer.from(ab);
        }
      }
    } else {
      const raw = input as DuplicateCheckInput;
      contentType = raw.contentType?.trim() || "";
      sourceUrl = raw.sourceUrl?.trim() || undefined;
      sourceText = raw.sourceText?.trim() || undefined;

      if (raw.sourceFile && raw.sourceFile.size > 0) {
        const ab = await raw.sourceFile.arrayBuffer();
        fileBuffer = Buffer.from(ab);
      }
    }

    if (!contentType) {
      return { duplicate: false };
    }

    const fingerprint = buildDuplicateFingerprint({
      contentType,
      sourceUrl,
      sourceText,
      fileBuffer,
    });

    if (!fingerprint) {
      return { duplicate: false };
    }

    // Query Sanity for any existing savedItem with the exact fingerprint
    const query = `*[
      _type == "savedItem" &&
      sourceFingerprint == $fingerprint &&
      !(_id in path("drafts.**"))
    ][0]{
      _id,
      title,
      contentType,
      description,
      savedAt
    }`;

    const sanityClient = client.withConfig({ useCdn: false });
    const existing = await sanityClient.fetch<{
      _id: string;
      title: string;
      contentType?: string;
      description?: string;
      savedAt: string;
    } | null>(query, { fingerprint });

    if (existing && existing._id) {
      return {
        duplicate: true,
        item: existing,
      };
    }

    return {
      duplicate: false,
    };
  } catch (error) {
    console.error("[checkDuplicateAction] Error querying Sanity:", error);
    // On unexpected errors, fail open so duplicate checking does not block normal use
    return {
      duplicate: false,
      message: "Could not verify duplicates at this time.",
    };
  }
}
