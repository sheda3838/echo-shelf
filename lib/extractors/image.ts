import path from "path";

/**
 * Maximum image file size allowed for Groq Vision Smart Capture: 10 MB.
 */
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export interface PreparedImage {
  sourceType: "image";
  fileName: string;
  mimeType: string;
  size: number;
  base64DataUrl: string;
}

export type ImagePreparationResult =
  | { success: true; data: PreparedImage }
  | { success: false; error: string };

/**
 * Validates image extension and MIME type.
 * Supported extensions: .png, .jpg, .jpeg, .webp
 * Supported MIME types: image/png, image/jpeg, image/webp
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

  // If provided MIME strongly conflicts with an image (e.g. application/pdf, text/plain)
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

  // Known unsupported image types (e.g., gif, svg, bmp, tiff)
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
 * Validates and prepares an uploaded image buffer for Groq Vision input.
 * Converts to a base64 Data URL without exposing raw data in logs.
 */
export function prepareImage(
  buffer: Buffer,
  fileName: string,
  mimeType?: string
): ImagePreparationResult {
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

  const base64 = buffer.toString("base64");
  const base64DataUrl = `data:${formatCheck.normalizedMime};base64,${base64}`;

  return {
    success: true,
    data: {
      sourceType: "image",
      fileName,
      mimeType: formatCheck.normalizedMime,
      size: buffer.length,
      base64DataUrl,
    },
  };
}
