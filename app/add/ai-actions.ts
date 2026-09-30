"use server";

import { Groq } from "groq-sdk";
import { extractWebArticle } from "@/lib/extractors/webArticle";
import { extractRepository } from "@/lib/extractors/repository";
import { extractYouTubeVideo } from "@/lib/extractors/youtube";
import { extractDocument } from "@/lib/extractors/document";

export interface SmartCaptureInput {
  contentType: string;
  sourceUrl?: string;
  sourceText?: string;
  existingTitle?: string;
  existingDescription?: string;
  sourceFile?: File | null;
}

export interface SmartCaptureResult {
  success: boolean;
  data?: {
    title: string;
    description: string;
    tags: string[];
  };
  message?: string;
}

// Allowed Groq model with JSON mode support
const GROQ_MODEL = "openai/gpt-oss-120b";

/**
 * Server Action for Smart Capture.
 * Communicates with Groq API exclusively on the server side using GROQ_API_KEY.
 * Never exposes the API key, system prompts, or raw provider errors to the client.
 */
export async function generateSmartCaptureAction(
  input: SmartCaptureInput | FormData
): Promise<SmartCaptureResult> {
  try {
    let contentType: string;
    let sourceUrl: string | undefined;
    let sourceText: string | undefined;
    let existingTitle: string | undefined;
    let existingDescription: string | undefined;
    let sourceFile: File | null = null;

    if (typeof (input as FormData)?.get === "function") {
      const fd = input as FormData;
      contentType = (fd.get("contentType") as string)?.trim() || "";
      sourceUrl = (fd.get("sourceUrl") as string)?.trim() || undefined;
      sourceText = (fd.get("sourceText") as string)?.trim() || undefined;
      existingTitle = (fd.get("existingTitle") as string)?.trim() || undefined;
      existingDescription = (fd.get("existingDescription") as string)?.trim() || undefined;

      const rawFile = fd.get("sourceFile");
      const isFile =
        typeof rawFile === "object" &&
        rawFile !== null &&
        "name" in rawFile &&
        "size" in rawFile &&
        "arrayBuffer" in rawFile &&
        typeof (rawFile as File).arrayBuffer === "function";
      sourceFile = isFile ? (rawFile as File) : null;
    } else {
      const rawInput = input as SmartCaptureInput;
      contentType = rawInput.contentType;
      sourceUrl = rawInput.sourceUrl;
      sourceText = rawInput.sourceText;
      existingTitle = rawInput.existingTitle;
      existingDescription = rawInput.existingDescription;
      sourceFile = rawInput.sourceFile || null;
    }

  // 1. Check supported content types for first version
  if (contentType === "image") {
    return {
      success: false,
      message: "AI extraction for images will be added later.",
    };
  }

  // 2. Validate API key availability
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("GROQ_API_KEY is not configured in server environment.");
    return {
      success: false,
      message: "AI service is not configured. Please verify server settings.",
    };
  }

  // 3. Assess context and perform source extraction when applicable
  const cleanUrl = sourceUrl?.trim() || "";
  const cleanText = sourceText?.trim() || "";
  const cleanTitle = existingTitle?.trim() || "";
  const cleanDesc = existingDescription?.trim() || "";

  const contextParts: string[] = [];

  if (contentType === "note") {
    if (!cleanText || cleanText.length < 10) {
      return {
        success: false,
        message: "Please provide a bit more note text for Smart Capture to analyze (at least 10 characters).",
      };
    }
    contextParts.push(`Content Type: Note`);
    if (cleanTitle) contextParts.push(`User Title Hint: ${cleanTitle}`);
    if (cleanDesc) contextParts.push(`User Context Notes: ${cleanDesc}`);
    contextParts.push(`Note Content:\n${cleanText}`);
  } else if (contentType === "article" || contentType === "url") {
    if (!cleanUrl && !cleanText && !cleanDesc) {
      return {
        success: false,
        message: "Please enter a webpage URL for Smart Capture to read.",
      };
    }

    if (cleanUrl) {
      // Perform server-side readable webpage extraction
      const extraction = await extractWebArticle(cleanUrl, contentType);
      if (!extraction.success) {
        return {
          success: false,
          message: extraction.error,
        };
      }

      const extracted = extraction.data;
      contextParts.push(`Source type: ${contentType === "article" ? "Article" : "Generic Webpage"}`);
      contextParts.push(`Source URL: ${extracted.sourceUrl}`);
      if (extracted.title) contextParts.push(`Extracted title: ${extracted.title}`);
      if (extracted.siteName) contextParts.push(`Site: ${extracted.siteName}`);
      if (extracted.author) contextParts.push(`Author: ${extracted.author}`);
      if (extracted.excerpt) contextParts.push(`Excerpt: ${extracted.excerpt}`);
      if (cleanTitle) contextParts.push(`User Title Hint: ${cleanTitle}`);
      if (cleanDesc) contextParts.push(`User Context Notes: ${cleanDesc}`);
      if (cleanText) contextParts.push(`User Additional Notes:\n${cleanText}`);
      contextParts.push(`Main text:\n${extracted.text}`);
    } else {
      // User did not provide URL but provided notes/text
      contextParts.push(`Content Type: ${contentType === "article" ? "Article" : "URL"}`);
      if (cleanTitle) contextParts.push(`User Title Hint: ${cleanTitle}`);
      if (cleanDesc) contextParts.push(`User Context Notes: ${cleanDesc}`);
      if (cleanText) contextParts.push(`Source Text / Content:\n${cleanText}`);
    }
  } else if (contentType === "repo") {
    if (!cleanUrl && !cleanText && !cleanDesc) {
      return {
        success: false,
        message: "Please enter a repository URL for Smart Capture to read.",
      };
    }

    if (cleanUrl) {
      const extraction = await extractRepository(cleanUrl);
      if (!extraction.success) {
        return {
          success: false,
          message: extraction.error,
        };
      }

      const repo = extraction.data;
      contextParts.push(`Source type: Repository`);
      contextParts.push(`Provider: ${repo.provider === "github" ? "GitHub" : "GitLab"}`);
      contextParts.push(`Repository: ${repo.fullName}`);
      if (repo.description) contextParts.push(`Description: ${repo.description}`);
      if (repo.primaryLanguage) contextParts.push(`Primary language: ${repo.primaryLanguage}`);
      if (repo.topics && repo.topics.length > 0) contextParts.push(`Topics: ${repo.topics.join(", ")}`);
      if (repo.stars !== undefined) contextParts.push(`Stars: ${repo.stars}`);
      if (repo.defaultBranch) contextParts.push(`Default branch: ${repo.defaultBranch}`);
      if (repo.homepage) contextParts.push(`Homepage: ${repo.homepage}`);
      if (cleanTitle) contextParts.push(`User Title Hint: ${cleanTitle}`);
      if (cleanDesc) contextParts.push(`User Context Notes: ${cleanDesc}`);
      if (cleanText) contextParts.push(`User Additional Notes:\n${cleanText}`);
      if (repo.readme) {
        contextParts.push(`README:\n${repo.readme}`);
      }
    } else {
      contextParts.push(`Content Type: Repository`);
      if (cleanTitle) contextParts.push(`User Title Hint: ${cleanTitle}`);
      if (cleanDesc) contextParts.push(`User Context Notes: ${cleanDesc}`);
      if (cleanText) contextParts.push(`Source Text / Content:\n${cleanText}`);
    }
  } else if (contentType === "video") {
    if (!cleanUrl && !cleanText && !cleanDesc) {
      return {
        success: false,
        message: "Please enter a YouTube video URL for Smart Capture to analyze.",
      };
    }

    if (cleanUrl) {
      const extraction = await extractYouTubeVideo(cleanUrl);
      if (!extraction.success) {
        return {
          success: false,
          message: extraction.error,
        };
      }

      const video = extraction.data;
      contextParts.push(`Source type: Video`);
      contextParts.push(`Provider: YouTube`);
      contextParts.push(`Video title: ${video.title}`);
      if (video.channelTitle) contextParts.push(`Channel: ${video.channelTitle}`);
      if (video.publishedAt) contextParts.push(`Published: ${video.publishedAt}`);
      if (video.duration) contextParts.push(`Duration: ${video.duration}`);
      if (video.tags && video.tags.length > 0) contextParts.push(`YouTube tags: ${video.tags.join(", ")}`);
      if (cleanTitle) contextParts.push(`User Title Hint: ${cleanTitle}`);
      if (cleanDesc) contextParts.push(`User Context Notes: ${cleanDesc}`);
      if (cleanText) contextParts.push(`User Additional Notes:\n${cleanText}`);
      if (video.description) {
        contextParts.push(`Video description:\n${video.description}`);
      }
    } else {
      contextParts.push(`Content Type: Video`);
      if (cleanTitle) contextParts.push(`User Title Hint: ${cleanTitle}`);
      if (cleanDesc) contextParts.push(`User Context Notes: ${cleanDesc}`);
      if (cleanText) contextParts.push(`Source Text / Content:\n${cleanText}`);
    }
  } else if (contentType === "document") {
    if (!sourceFile || sourceFile.size === 0) {
      if (!cleanText && !cleanDesc) {
        return {
          success: false,
          message: "Please select a document file (.pdf, .docx, .pptx, or .xlsx) for Smart Capture to read.",
        };
      }
      contextParts.push(`Content Type: Document`);
      if (cleanTitle) contextParts.push(`User Title Hint: ${cleanTitle}`);
      if (cleanDesc) contextParts.push(`User Context Notes: ${cleanDesc}`);
      if (cleanText) contextParts.push(`Source Text / Content:\n${cleanText}`);
    } else {
      console.log("[Document Smart Capture]", {
        stage: "receive-file",
        fileName: sourceFile.name,
        mimeType: sourceFile.type,
        size: sourceFile.size,
      });

      let fileBuffer: Buffer;
      try {
        const arrayBuffer = await sourceFile.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);
        console.log("[Document Smart Capture]", {
          stage: "buffer-conversion",
          fileName: sourceFile.name,
          mimeType: sourceFile.type,
          size: sourceFile.size,
          bufferLength: fileBuffer.length,
        });
      } catch (convErr) {
        console.error("[Document Smart Capture]", {
          stage: "buffer-conversion",
          fileName: sourceFile.name,
          error: convErr instanceof Error ? convErr.message : String(convErr),
        });
        return {
          success: false,
          message: "Could not read the uploaded document buffer. Please try again.",
        };
      }

      const extraction = await extractDocument(fileBuffer, sourceFile.name, sourceFile.type);

      if (!extraction.success) {
        console.error("[Document Smart Capture]", {
          stage: "extraction-failed",
          fileName: sourceFile.name,
          mimeType: sourceFile.type,
          size: sourceFile.size,
          error: extraction.error,
        });
        return {
          success: false,
          message: extraction.error,
        };
      }

      const doc = extraction.data;
      console.log("[Document Smart Capture]", {
        stage: "extraction-success",
        fileName: doc.fileName,
        fileType: doc.fileType,
        extractedCharacters: doc.text.length,
        pageCount: doc.pageCount,
        slideCount: doc.slideCount,
        sheetNames: doc.sheetNames,
      });

      contextParts.push(`Source type: Document`);
      contextParts.push(`File name: ${doc.fileName}`);
      contextParts.push(`File type: ${doc.fileType.toUpperCase()}`);
      if (doc.fileType === "pdf" && doc.pageCount !== undefined) {
        contextParts.push(`Pages: ${doc.pageCount}`);
      } else if (doc.fileType === "pptx" && doc.slideCount !== undefined) {
        contextParts.push(`Slides: ${doc.slideCount}`);
      } else if (doc.fileType === "xlsx" && doc.sheetNames && doc.sheetNames.length > 0) {
        contextParts.push(`Sheets: ${doc.sheetNames.join(", ")}`);
      }
      if (cleanTitle) contextParts.push(`User Title Hint: ${cleanTitle}`);
      if (cleanDesc) contextParts.push(`User Context Notes: ${cleanDesc}`);
      if (cleanText) contextParts.push(`User Additional Notes:\n${cleanText}`);
      contextParts.push(
        doc.fileType === "pptx"
          ? `Extracted slide text:\n${doc.text}`
          : `Extracted content:\n${doc.text}`
      );
    }
  } else if (contentType === "other") {
    if (!cleanUrl && !cleanText && !cleanDesc) {
      return {
        success: false,
        message: "Please provide some source text, notes, or URL context.",
      };
    }
    contextParts.push(`Content Type: Other`);
    if (cleanUrl) contextParts.push(`Source URL: ${cleanUrl}`);
    if (cleanTitle) contextParts.push(`User Title Hint: ${cleanTitle}`);
    if (cleanDesc) contextParts.push(`User Context Notes: ${cleanDesc}`);
    if (cleanText) contextParts.push(`Source Text / Content:\n${cleanText}`);
  }

  const userPrompt = contextParts.join("\n\n");

  try {
    const groq = new Groq({ apiKey });

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: `You are a metadata assistant for Echo Shelf, a personal knowledge management application.
Your goal is to extract structured, accurate metadata from user-provided source context.

Requirements:
- "title": A concise, descriptive title representing the content (max 80 characters).
- "description": A clear, informative summary of the content's purpose and key takeaways (2 to 3 sentences).
- "tags": An array of 3 to 6 short, lowercase, relevant keyword tags (hyphenated if multi-word, no spaces, no '#', no duplicates).
- Do NOT hallucinate or invent facts that are not supported by the provided context.

You must reply with valid JSON matching exactly this schema:
{
  "title": "string",
  "description": "string",
  "tags": ["string"]
}`,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const rawResponse = completion.choices[0]?.message?.content;
    if (!rawResponse) {
      return {
        success: false,
        message: "AI did not return any suggestions. Please try again with more details.",
      };
    }

    // 5. Parse and validate JSON structure safely
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawResponse);
    } catch {
      return {
        success: false,
        message: "Failed to parse AI response. Please try again.",
      };
    }

    if (typeof parsed !== "object" || parsed === null) {
      return {
        success: false,
        message: "Received invalid data structure from AI. Please try again.",
      };
    }

    const record = parsed as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const description = typeof record.description === "string" ? record.description.trim() : "";
    
    const rawTags = Array.isArray(record.tags) ? record.tags : [];
    const tagsSet = new Set<string>();
    for (const tag of rawTags) {
      if (typeof tag === "string") {
        const cleaned = tag.replace(/^#/, "").trim().toLowerCase();
        if (cleaned.length > 0 && cleaned.length < 30) {
          tagsSet.add(cleaned);
        }
      }
    }
    const tags = Array.from(tagsSet).slice(0, 6);

    if (!title || !description) {
      return {
        success: false,
        message: "AI could not generate complete metadata from the provided context. Please add more details.",
      };
    }

    return {
      success: true,
      data: {
        title,
        description,
        tags,
      },
    };
  } catch (groqError: unknown) {
    console.error("[Document Smart Capture]", {
      stage: "groq-completion",
      error: groqError instanceof Error ? groqError.message : "Unknown error",
    });
    return {
      success: false,
      message: "Unable to reach the AI assistant. Please try again or enter metadata manually.",
    };
  }
} catch (topError: unknown) {
  console.error("[Document Smart Capture]", {
    stage: "server-action-unhandled",
    error: topError instanceof Error ? topError.message : "Unknown error",
  });
  return {
    success: false,
    message: "An error occurred while analyzing the document. Please try again.",
  };
}
}
