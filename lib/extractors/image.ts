import path from "path";
import { createWorker } from "tesseract.js";

/**
 * Maximum image file size allowed for Smart Capture OCR: 10 MB.
 */
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Maximum character limit for normalized OCR text sent to Groq.
 */
export const MAX_IMAGE_TEXT_CHARS = 12000;

/**
 * Minimum meaningful characters required to avoid sending pure OCR noise to Groq.
 */
export const MIN_MEANINGFUL_TEXT_CHARS = 20;

export interface ExtractedImage {
  sourceType: "image";
  fileName: string;
  mimeType: string;
  text: string;
  ocrConfidence?: number;
  width?: number;
  height?: number;
}

export type ImageExtractionResult =
  | { success: true; data: ExtractedImage }
  | { success: false; error: string };

/**
 * Normalizes extracted OCR text:
 * - normalizes line endings
 * - collapses repeated whitespace on each line while trimming trailing spaces
 * - collapses excessive blank lines (>2 empty lines)
 * - preserves meaningful paragraph and line separation
 * - truncates to MAX_IMAGE_TEXT_CHARS if needed
 */
export function normalizeOcrText(text: string): string {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length > MAX_IMAGE_TEXT_CHARS) {
    return normalized.slice(0, MAX_IMAGE_TEXT_CHARS).trim() + "\n\n[Content truncated]";
  }
  return normalized;
}

/**
 * Count meaningful alphanumeric characters to detect noise or empty OCR results.
 */
function countMeaningfulCharacters(text: string): number {
  const matches = text.match(/[a-zA-Z0-9]/g);
  return matches ? matches.length : 0;
}

/**
 * Validates image extension and MIME type.
 * Supports: .png, .jpg, .jpeg, .webp
 * MIME types: image/png, image/jpeg, image/webp
 */
function validateImageFormat(
  fileName: string,
  mimeType?: string
): { valid: boolean; normalizedMime: string; error?: string } {
  const ext = path.extname(fileName || "").toLowerCase();
  const cleanMime = (mimeType || "").toLowerCase().trim();

  const supportedExtensions = [".png", ".jpg", ".jpeg", ".webp"];
  const supportedMimes = ["image/png", "image/jpeg", "image/webp"];

  const hasSupportedExt = supportedExtensions.includes(ext);
  const hasSupportedMime = supportedMimes.includes(cleanMime);

  // If both are provided and strongly conflict (e.g. extension is .png but MIME is application/pdf)
  if (
    cleanMime &&
    !cleanMime.startsWith("image/") &&
    !cleanMime.includes("octet-stream")
  ) {
    return {
      valid: false,
      normalizedMime: cleanMime,
      error: "Please upload a valid image file.",
    };
  }

  // Reject unsupported formats cleanly
  if (!hasSupportedExt && !hasSupportedMime) {
    return {
      valid: false,
      normalizedMime: cleanMime,
      error: "This image format is not supported yet. Please use PNG, JPG, JPEG, or WEBP.",
    };
  }

  // If MIME type is a known unsupported image type (e.g. image/gif, image/svg+xml, image/bmp)
  const unsupportedImageMimes = [
    "image/gif",
    "image/svg+xml",
    "image/bmp",
    "image/tiff",
    "image/x-icon",
  ];
  if (unsupportedImageMimes.includes(cleanMime)) {
    return {
      valid: false,
      normalizedMime: cleanMime,
      error: "This image format is not supported yet. Please use PNG, JPG, JPEG, or WEBP.",
    };
  }

  let finalMime = cleanMime;
  if (!finalMime || finalMime === "application/octet-stream") {
    if (ext === ".png") finalMime = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") finalMime = "image/jpeg";
    else if (ext === ".webp") finalMime = "image/webp";
    else finalMime = "image/png";
  }

  return { valid: true, normalizedMime: finalMime };
}

/**
 * Server-side extractor for images using Tesseract.js OCR.
 * Extracts visible text, validates file bounds and format, and normalizes output.
 */
export async function extractImage(
  buffer: Buffer,
  fileName: string,
  mimeType?: string
): Promise<ImageExtractionResult> {
  const formatCheck = validateImageFormat(fileName, mimeType);
  if (!formatCheck.valid) {
    return {
      success: false,
      error: formatCheck.error || "Please upload a valid image file.",
    };
  }

  if (!buffer || buffer.length === 0) {
    return {
      success: false,
      error: "Please upload a valid image file.",
    };
  }

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    return {
      success: false,
      error: "This image is too large to analyze. Please upload an image smaller than 10 MB.",
    };
  }

  let worker;
  try {
    worker = await createWorker("eng");
    const result = await worker.recognize(buffer);

    const rawText = result.data.text || "";
    const confidence =
      typeof result.data.confidence === "number" ? Math.round(result.data.confidence) : undefined;
    const normalized = normalizeOcrText(rawText);

    const meaningfulChars = countMeaningfulCharacters(normalized);

    console.log("[Image Smart Capture]", {
      stage: "ocr-extracted",
      fileName,
      mimeType: formatCheck.normalizedMime,
      size: buffer.length,
      ocrConfidence: confidence,
      characterCount: normalized.length,
      meaningfulCharCount: meaningfulChars,
    });

    if (meaningfulChars < MIN_MEANINGFUL_TEXT_CHARS) {
      return {
        success: false,
        error: "Not enough readable text was found in this image. Add a description manually.",
      };
    }

    return {
      success: true,
      data: {
        sourceType: "image",
        fileName,
        mimeType: formatCheck.normalizedMime,
        text: normalized,
        ocrConfidence: confidence,
      },
    };
  } catch (err: unknown) {
    console.error("[Image Smart Capture]", {
      stage: "ocr-error",
      fileName,
      mimeType: formatCheck.normalizedMime,
      size: buffer.length,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      error: "Could not read text from this image. Please try another image.",
    };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (termErr) {
        console.error("[Image Smart Capture] Failed to terminate worker cleanly:", termErr);
      }
    }
  }
}
