import path from "path";
import os from "os";
import fs from "fs";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pptxParse = require("pptx-text-parser");

/**
 * Maximum document file size allowed for extraction: 20 MB.
 */
export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * Maximum character limit for normalized document context sent to Groq.
 */
export const MAX_DOCUMENT_TEXT_CHARS = 20000;

export type SupportedDocumentType = "pdf" | "docx" | "pptx" | "xlsx";

export interface ExtractedDocument {
  sourceType: "document";
  fileType: SupportedDocumentType;
  fileName: string;
  mimeType?: string;
  text: string;
  pageCount?: number;
  slideCount?: number;
  sheetNames?: string[];
}

export type DocumentExtractionResult =
  | { success: true; data: ExtractedDocument }
  | { success: false; error: string };

/**
 * Clean and normalize extracted text:
 * - normalizes line endings
 * - trims trailing spaces per line
 * - collapses excessive blank lines
 * - preserves meaningful paragraph / slide / sheet boundaries
 */
function normalizeDocumentText(text: string): string {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length > MAX_DOCUMENT_TEXT_CHARS) {
    return normalized.slice(0, MAX_DOCUMENT_TEXT_CHARS).trim() + "\n\n[Content truncated]";
  }
  return normalized;
}

/**
 * Detects whether the file format is supported or legacy/unsupported.
 */
function detectDocumentFormat(
  fileName: string,
  mimeType?: string
): {
  supportedType?: SupportedDocumentType;
  isLegacy?: boolean;
  conflict?: boolean;
} {
  const ext = path.extname(fileName || "").toLowerCase();
  const cleanMime = (mimeType || "").toLowerCase().trim();

  // Legacy formats check
  const legacyExtensions = [".doc", ".ppt", ".xls"];
  const legacyMimes = [
    "application/msword",
    "application/vnd.ms-powerpoint",
    "application/vnd.ms-excel",
  ];

  if (legacyExtensions.includes(ext) || legacyMimes.includes(cleanMime)) {
    return { isLegacy: true };
  }

  // Known extensions mapping
  let extType: SupportedDocumentType | undefined;
  if (ext === ".pdf") extType = "pdf";
  else if (ext === ".docx") extType = "docx";
  else if (ext === ".pptx") extType = "pptx";
  else if (ext === ".xlsx") extType = "xlsx";

  // Known MIME types mapping
  let mimeTypeDerived: SupportedDocumentType | undefined;
  if (cleanMime.includes("application/pdf") || cleanMime.includes("application/x-pdf")) {
    mimeTypeDerived = "pdf";
  } else if (
    cleanMime.includes("wordprocessingml.document") ||
    cleanMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    mimeTypeDerived = "docx";
  } else if (
    cleanMime.includes("presentationml.presentation") ||
    cleanMime === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    mimeTypeDerived = "pptx";
  } else if (
    cleanMime.includes("spreadsheetml.sheet") ||
    cleanMime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    mimeTypeDerived = "xlsx";
  }

  // Conflict check: if both are explicitly identified but don't match
  if (extType && mimeTypeDerived && extType !== mimeTypeDerived) {
    return { conflict: true };
  }

  // Strong conflict check: extension is document, but MIME is image/audio/video
  if (
    extType &&
    cleanMime &&
    (cleanMime.startsWith("image/") ||
      cleanMime.startsWith("audio/") ||
      cleanMime.startsWith("video/"))
  ) {
    return { conflict: true };
  }

  const supportedType = extType || mimeTypeDerived;
  return { supportedType };
}

/**
 * Extracts text and metadata from PDF files using pdf-parse.
 */
async function extractPdf(fileBuffer: Buffer): Promise<{ text: string; pageCount?: number }> {
  const parsed = await pdfParse(fileBuffer);
  const text = (parsed.text || "").trim();
  const pageCount = typeof parsed.numpages === "number" ? parsed.numpages : undefined;
  return { text, pageCount };
}

/**
 * Extracts raw readable text from DOCX files using mammoth.
 */
async function extractDocx(fileBuffer: Buffer): Promise<{ text: string }> {
  const result = await mammoth.extractRawText({ buffer: fileBuffer });
  const text = (result.value || "").trim();
  return { text };
}

/**
 * Extracts slide text and presentation order from PPTX files using pptx-text-parser.
 */
async function extractPptx(
  fileBuffer: Buffer
): Promise<{ text: string; slideCount?: number }> {
  const tempPath = path.join(os.tmpdir(), `echoshelf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.pptx`);
  await fs.promises.writeFile(tempPath, fileBuffer);

  try {
    const jsonResult = (await pptxParse(tempPath, "json")) as Record<string, string>;

    if (!jsonResult || typeof jsonResult !== "object") {
      return { text: "", slideCount: 0 };
    }

    // Sort slide keys numerically (Slide 0, Slide 1, Slide 2...)
    const slideKeys = Object.keys(jsonResult).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });

    const slideCount = slideKeys.length;
    const formattedSlides: string[] = [];

    for (let i = 0; i < slideKeys.length; i++) {
      const key = slideKeys[i];
      const slideContent = (jsonResult[key] || "").trim();
      if (slideContent) {
        formattedSlides.push(`Slide ${i + 1}:\n${slideContent}`);
      }
    }

    return {
      text: formattedSlides.join("\n\n"),
      slideCount,
    };
  } finally {
    try {
      if (fs.existsSync(tempPath)) {
        await fs.promises.unlink(tempPath);
      }
    } catch {
      // Ignore cleanup error
    }
  }
}

/**
 * Extracts structured workbook data from XLSX files using SheetJS.
 */
function extractXlsx(fileBuffer: Buffer): { text: string; sheetNames: string[] } {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const allSheetNames = workbook.SheetNames || [];
  const processedSections: string[] = [];
  const nonBlankSheetNames: string[] = [];

  for (const sheetName of allSheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rawRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
    });

    const formattedRows: string[] = [];

    for (const row of rawRows) {
      if (!Array.isArray(row)) continue;

      const cells = row.map((cell) =>
        cell !== undefined && cell !== null ? String(cell).trim() : ""
      );

      // Find last non-empty index
      let lastIdx = -1;
      for (let i = cells.length - 1; i >= 0; i--) {
        if (cells[i] !== "") {
          lastIdx = i;
          break;
        }
      }

      if (lastIdx >= 0) {
        formattedRows.push(cells.slice(0, lastIdx + 1).join(" | "));
      }
    }

    if (formattedRows.length > 0) {
      nonBlankSheetNames.push(sheetName);
      processedSections.push(`Sheet: ${sheetName}\n\n${formattedRows.join("\n")}`);
    }
  }

  return {
    text: processedSections.join("\n\n"),
    sheetNames: nonBlankSheetNames.length > 0 ? nonBlankSheetNames : allSheetNames,
  };
}

/**
 * Dedicated server-side document extractor.
 * Accepts a file buffer, original file name, and optional MIME type.
 * Normalizes extracted text across PDF, DOCX, PPTX, and XLSX formats.
 */
export async function extractDocument(
  fileBuffer: Buffer,
  fileName: string,
  mimeType?: string
): Promise<DocumentExtractionResult> {
  // 1. Validate file size
  if (!fileBuffer || fileBuffer.length === 0) {
    return {
      success: false,
      error: "The uploaded document file is empty.",
    };
  }

  if (fileBuffer.length > MAX_DOCUMENT_SIZE_BYTES) {
    return {
      success: false,
      error: "This document is too large to analyze. Please upload a smaller file.",
    };
  }

  // 2. Detect format and check restrictions
  const { supportedType, isLegacy, conflict } = detectDocumentFormat(fileName, mimeType);

  if (isLegacy) {
    return {
      success: false,
      error: "This document format is not supported yet. Please use PDF, DOCX, PPTX, or XLSX.",
    };
  }

  if (conflict) {
    return {
      success: false,
      error: "Document format could not be verified. Please ensure the file extension and format match.",
    };
  }

  if (!supportedType) {
    return {
      success: false,
      error: "This document format is not supported yet. Please use PDF, DOCX, PPTX, or XLSX.",
    };
  }

  // 3. Extract based on type
  try {
    let rawText = "";
    let pageCount: number | undefined;
    let slideCount: number | undefined;
    let sheetNames: string[] | undefined;

    if (supportedType === "pdf") {
      const res = await extractPdf(fileBuffer);
      rawText = res.text;
      pageCount = res.pageCount;
      if (!rawText.trim()) {
        return {
          success: false,
          error: "No readable text was found in this PDF. It may be a scanned document or image-only PDF.",
        };
      }
    } else if (supportedType === "docx") {
      const res = await extractDocx(fileBuffer);
      rawText = res.text;
      if (!rawText.trim()) {
        return {
          success: false,
          error: "No readable text was found in this Word document.",
        };
      }
    } else if (supportedType === "pptx") {
      const res = await extractPptx(fileBuffer);
      rawText = res.text;
      slideCount = res.slideCount;
      if (!rawText.trim()) {
        return {
          success: false,
          error: "No readable slide text was found in this PowerPoint presentation.",
        };
      }
    } else if (supportedType === "xlsx") {
      const res = extractXlsx(fileBuffer);
      rawText = res.text;
      sheetNames = res.sheetNames;
      if (!rawText.trim()) {
        return {
          success: false,
          error: "No readable text or cell data was found in this spreadsheet.",
        };
      }
    }

    const normalizedText = normalizeDocumentText(rawText);

    return {
      success: true,
      data: {
        sourceType: "document",
        fileType: supportedType,
        fileName: path.basename(fileName || `document.${supportedType}`),
        mimeType,
        text: normalizedText,
        pageCount,
        slideCount,
        sheetNames,
      },
    };
  } catch (error) {
    console.error("[Document Smart Capture]", {
      stage: "parser-execution",
      fileName: path.basename(fileName || "unknown"),
      mimeType,
      size: fileBuffer.length,
      detectedType: supportedType,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: "Could not read the document content. The file may be corrupt or encrypted.",
    };
  }
}
