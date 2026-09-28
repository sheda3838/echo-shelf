"use server";

import { Groq } from "groq-sdk";

export interface SmartCaptureInput {
  contentType: string;
  sourceUrl?: string;
  sourceText?: string;
  existingTitle?: string;
  existingDescription?: string;
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
  input: SmartCaptureInput
): Promise<SmartCaptureResult> {
  const { contentType, sourceUrl, sourceText, existingTitle, existingDescription } = input;

  // 1. Check supported content types for first version
  if (contentType === "image" || contentType === "document") {
    return {
      success: false,
      message: "AI extraction for images and documents will be added later.",
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

  // 3. Assess context sufficiency to avoid hallucinations
  const cleanUrl = sourceUrl?.trim() || "";
  const cleanText = sourceText?.trim() || "";
  const cleanTitle = existingTitle?.trim() || "";
  const cleanDesc = existingDescription?.trim() || "";

  if (contentType === "note") {
    if (!cleanText || cleanText.length < 10) {
      return {
        success: false,
        message: "Please provide a bit more note text for Smart Capture to analyze (at least 10 characters).",
      };
    }
  } else if (["article", "video", "repo", "url"].includes(contentType)) {
    if (!cleanUrl && !cleanText && !cleanDesc) {
      return {
        success: false,
        message: "Please enter a source URL or some text context for this item.",
      };
    }

    // Check if only a bare domain/short URL without path was provided and no text context
    if (cleanUrl && !cleanText && !cleanDesc) {
      try {
        const parsed = new URL(cleanUrl);
        const pathSegments = parsed.pathname.split("/").filter((s) => s.length > 0);
        // If domain has no path, or just "/" or single-letter slug
        if (pathSegments.length === 0 || (pathSegments.length === 1 && pathSegments[0].length < 3)) {
          return {
            success: false,
            message:
              "Only a basic URL was provided. Please add some notes, key takeaways, or an excerpt so the AI has enough context.",
          };
        }
      } catch {
        return {
          success: false,
          message: "Please enter a valid source URL or provide some text notes.",
        };
      }
    }
  } else if (contentType === "other") {
    if (!cleanUrl && !cleanText && !cleanDesc) {
      return {
        success: false,
        message: "Please provide some source text, notes, or URL context.",
      };
    }
  }

  // 4. Build prompt context safely
  const contextParts: string[] = [`Content Type: ${contentType}`];
  if (cleanUrl) contextParts.push(`Source URL: ${cleanUrl}`);
  if (cleanText) contextParts.push(`Source Text / Content:\n${cleanText}`);
  if (cleanTitle) contextParts.push(`User Title Hint: ${cleanTitle}`);
  if (cleanDesc) contextParts.push(`User Context Notes: ${cleanDesc}`);

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
  } catch (error: unknown) {
    // Log error internally without leaking credentials or raw stack traces to the user
    console.error("Groq AI completion error:", error instanceof Error ? error.message : "Unknown error");
    return {
      success: false,
      message: "AI suggestion service encountered an error. Please try again or fill in the fields manually.",
    };
  }
}
