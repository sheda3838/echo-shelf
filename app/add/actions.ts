"use server";

import { writeClient } from "@/sanity/lib/writeClient";

export type ContentType =
  | "article"
  | "video"
  | "repo"
  | "url"
  | "image"
  | "document"
  | "note"
  | "other";

export interface ActionResponse {
  success: boolean;
  errors?: Record<string, string>;
  message?: string;
  itemId?: string;
  id?: string;
}

const ALLOWED_CONTENT_TYPES: ContentType[] = [
  "article",
  "video",
  "repo",
  "url",
  "image",
  "document",
  "note",
  "other",
];

function isValidUrl(stringUrl: string): boolean {
  try {
    const url = new URL(stringUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Server Action to save a new item to Sanity Content Lake.
 * Runs strictly on the server using writeClient and SANITY_API_WRITE_TOKEN.
 */
export async function saveItemAction(formData: FormData): Promise<ActionResponse> {
  const errors: Record<string, string> = {};

  const contentType = (formData.get("contentType") as string)?.trim() as ContentType;
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const tagsRaw = (formData.get("tags") as string)?.trim();
  const sourceUrl = (formData.get("sourceUrl") as string)?.trim();
  const sourceText = (formData.get("sourceText") as string)?.trim();
  const sourceFile = formData.get("sourceFile") as File | null;
  const previewImage = formData.get("previewImage") as File | null;

  // Validation
  if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
    errors.contentType = "Please select a valid content type.";
  }

  if (!title) {
    errors.title = "Title is required.";
  }

  if (!description) {
    errors.description = "Description is required.";
  }

  // Type-specific source validation
  if (["article", "video", "repo", "url"].includes(contentType)) {
    if (!sourceUrl) {
      errors.sourceUrl = "Source URL is required for this content type.";
    } else if (!isValidUrl(sourceUrl)) {
      errors.sourceUrl = "Please enter a valid web URL (e.g., https://example.com).";
    }
  } else if (contentType === "image") {
    if (!sourceFile || sourceFile.size === 0) {
      errors.sourceFile = "Please select an image file to upload.";
    }
  } else if (contentType === "document") {
    if (!sourceFile || sourceFile.size === 0) {
      errors.sourceFile = "Please select a document or file to upload.";
    }
  } else if (contentType === "note") {
    if (!sourceText) {
      errors.sourceText = "Note content is required.";
    }
  } else if (contentType === "other") {
    if (sourceUrl && !isValidUrl(sourceUrl)) {
      errors.sourceUrl = "Please enter a valid web URL.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      errors,
      message: "Please correct the highlighted fields before submitting.",
    };
  }

  try {
    if (!process.env.SANITY_API_WRITE_TOKEN) {
      console.error("SANITY_API_WRITE_TOKEN is missing in server environment.");
      return {
        success: false,
        message: "Server configuration error: Write token not available. Please contact support.",
      };
    }

    // Process tags (accepts JSON array string or comma-separated)
    let tags: string[] = [];
    if (tagsRaw) {
      try {
        const parsed = JSON.parse(tagsRaw);
        if (Array.isArray(parsed)) {
          tags = parsed
            .map((t) => (typeof t === "string" ? t.trim() : ""))
            .filter((t) => t.length > 0);
        } else {
          tags = tagsRaw
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
        }
      } catch {
        tags = tagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
      }
    }

    let imageAssetId: string | null = null;
    let fileAssetId: string | null = null;

    // 1. Upload preview image if provided
    if (previewImage && previewImage.size > 0) {
      const imageBuffer = Buffer.from(await previewImage.arrayBuffer());
      const asset = await writeClient.assets.upload("image", imageBuffer, {
        filename: previewImage.name,
        contentType: previewImage.type || "image/jpeg",
      });
      imageAssetId = asset._id;
    }

    // 2. Upload source file if provided
    if (sourceFile && sourceFile.size > 0) {
      const fileBuffer = Buffer.from(await sourceFile.arrayBuffer());

      if (contentType === "image") {
        // Upload as image asset
        const asset = await writeClient.assets.upload("image", fileBuffer, {
          filename: sourceFile.name,
          contentType: sourceFile.type || "image/png",
        });
        // If no separate preview image was uploaded, use this image asset for preview
        if (!imageAssetId) {
          imageAssetId = asset._id;
        }

        // Also upload as file asset for source.file field
        const fileAsset = await writeClient.assets.upload("file", fileBuffer, {
          filename: sourceFile.name,
          contentType: sourceFile.type || "application/octet-stream",
        });
        fileAssetId = fileAsset._id;
      } else {
        // Document / Other file upload
        const asset = await writeClient.assets.upload("file", fileBuffer, {
          filename: sourceFile.name,
          contentType: sourceFile.type || "application/octet-stream",
        });
        fileAssetId = asset._id;
      }
    }

    // 3. Assemble document matching savedItem schema
    const sourceObj: Record<string, unknown> = {};
    if (sourceUrl) {
      sourceObj.url = sourceUrl;
    }
    if (sourceText) {
      sourceObj.text = sourceText;
    }
    if (fileAssetId) {
      sourceObj.file = {
        _type: "file",
        asset: {
          _type: "reference",
          _ref: fileAssetId,
        },
      };
    }

    const doc: {
      _type: "savedItem";
      title: string;
      description: string;
      contentType: ContentType;
      savedAt: string;
      isFavorite: boolean;
      source?: Record<string, unknown>;
      image?: {
        _type: "image";
        asset: {
          _type: "reference";
          _ref: string;
        };
      };
      tags?: string[];
    } = {
      _type: "savedItem",
      title,
      description,
      contentType,
      savedAt: new Date().toISOString(),
      isFavorite: false,
    };

    if (Object.keys(sourceObj).length > 0) {
      doc.source = sourceObj;
    }

    if (imageAssetId) {
      doc.image = {
        _type: "image",
        asset: {
          _type: "reference",
          _ref: imageAssetId,
        },
      };
    }

    if (tags.length > 0) {
      doc.tags = tags;
    }

    const createdDoc = await writeClient.create(doc);

    return {
      success: true,
      id: createdDoc._id,
      itemId: createdDoc._id,
      message: `"${title}" has been saved to Echo Shelf successfully!`,
    };
  } catch (err: unknown) {
    console.error("Error creating savedItem in Sanity:", err);
    return {
      success: false,
      message: "An unexpected error occurred while saving to Echo Shelf. Please try again.",
    };
  }
}
