"use client";

import React, { useState, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NavBar from "../components/nav-bar";
import { saveItemAction, type ContentType } from "./actions";
import { generateSmartCaptureAction } from "./ai-actions";
import {
  lookupConnectionCandidatesAction,
  type PreSaveCandidate,
} from "./connection-actions";
import {
  checkDuplicateAction,
  type DuplicateCheckResult,
} from "./duplicate-actions";

interface FormErrors {
  contentType?: string;
  title?: string;
  description?: string;
  sourceUrl?: string;
  sourceFile?: string;
  sourceText?: string;
  general?: string;
}

const CONTENT_TYPES: { label: string; value: ContentType; hint: string }[] = [
  { label: "Article", value: "article", hint: "Online articles, blog posts, essays" },
  { label: "Video", value: "video", hint: "YouTube, Vimeo, talks, tutorials" },
  { label: "Repository", value: "repo", hint: "GitHub, GitLab, code repositories" },
  { label: "URL", value: "url", hint: "Websites, web apps, bookmarks" },
  { label: "Image", value: "image", hint: "Photos, screenshots, diagrams, illustrations" },
  { label: "Document", value: "document", hint: "PDFs, documents, presentations, spreadsheets" },
  { label: "Note", value: "note", hint: "Quick thoughts, copied text, personal notes" },
  { label: "Other", value: "other", hint: "Miscellaneous content" },
];

interface AiGeneratedTracking {
  generatedTitle?: string;
  generatedDescription?: string;
  generatedTags: string[];
  sourceUrl: string;
  sourceText?: string;
  sourceFileId?: string;
  contentType: ContentType;
}

function getFileId(file: File | null | undefined): string {
  if (!file) return "";
  return `${file.name}-${file.size}-${file.type}-${file.lastModified}`;
}

export default function AddItemPage() {
  const router = useRouter();
  const [contentType, setContentType] = useState<ContentType>("article");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [selectedDocumentFile, setSelectedDocumentFile] = useState<File | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  
  // Interactive tags state
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  
  // AI Smart Capture state
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isAiAssisted, setIsAiAssisted] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<{ type: "success" | "info"; text: string } | null>(null);
  const [aiGeneratedData, setAiGeneratedData] = useState<AiGeneratedTracking | null>(null);
  const activeAiRequestIdRef = useRef<number>(0);

  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Exact duplicate detection state
  const [duplicateWarning, setDuplicateWarning] = useState<NonNullable<DuplicateCheckResult["item"]> | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  function clearDuplicateWarning() {
    setDuplicateWarning(null);
    setAllowDuplicate(false);
  }

  const sourceFileInputRef = useRef<HTMLInputElement>(null);
  const previewImageInputRef = useRef<HTMLInputElement>(null);

  // Smart Connections candidate suggestions state (Phase 2A)
  const [connectionCandidates, setConnectionCandidates] = useState<PreSaveCandidate[]>([]);
  const [isShortlisting, setIsShortlisting] = useState(false);
  const [hasSearchedCandidates, setHasSearchedCandidates] = useState(false);
  const [candidateFeedback, setCandidateFeedback] = useState<string | null>(null);
  const activeCandidateRequestIdRef = useRef<number>(0);

  // Invalidate candidate shortlist when metadata or source changes
  function invalidateCandidates() {
    activeCandidateRequestIdRef.current++;
    if (isShortlisting) {
      setIsShortlisting(false);
    }
    setConnectionCandidates([]);
    setHasSearchedCandidates(false);
    setCandidateFeedback(null);
  }

  // Pre-save candidate lookup runner
  async function runCandidateLookup(overrideMetadata?: {
    title: string;
    description: string;
    tags: string[];
  }) {
    const metadataToUse = overrideMetadata || {
      title: title.trim(),
      description: description.trim(),
      tags,
    };

    if (!metadataToUse.title && !metadataToUse.description) {
      setCandidateFeedback("Please enter a title or description first to find related items.");
      return;
    }

    const thisRequestId = ++activeCandidateRequestIdRef.current;
    setIsShortlisting(true);
    setCandidateFeedback(null);

    try {
      const res = await lookupConnectionCandidatesAction({
        title: metadataToUse.title,
        description: metadataToUse.description,
        tags: metadataToUse.tags,
      });

      if (thisRequestId !== activeCandidateRequestIdRef.current) {
        return;
      }

      if (res.success) {
        setConnectionCandidates(res.candidates);
        setHasSearchedCandidates(true);
      } else {
        setCandidateFeedback(res.message || "Could not check related items right now.");
        setHasSearchedCandidates(true);
      }
    } catch (err) {
      if (thisRequestId === activeCandidateRequestIdRef.current) {
        console.error("[Candidate Shortlist Lookup Error]", err);
        setCandidateFeedback("Could not check related items right now.");
      }
    } finally {
      if (thisRequestId === activeCandidateRequestIdRef.current) {
        setIsShortlisting(false);
      }
    }
  }

  // Helper to add a tag with trimming & case-insensitive deduplication
  function addTag(tagText: string) {
    const trimmed = tagText.trim();
    if (!trimmed) return;

    // Check for case-insensitive duplicate
    const exists = tags.some((t) => t.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      setTags((prev) => [...prev, trimmed]);
      invalidateCandidates();
    }
    setTagInput("");
  }

  // Remove a specific tag by index
  function removeTag(indexToRemove: number) {
    setTags((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    invalidateCandidates();
  }

  // Handle key events in the tag input (Enter / Comma / Backspace)
  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      e.stopPropagation();
      addTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      // Remove last tag on backspace when input is empty
      e.preventDefault();
      removeTag(tags.length - 1);
    }
  }

  /**
   * Invalidate previously generated AI suggestions when source content changes.
   * Cancels any in-flight requests, clears untouched AI-generated fields,
   * removes AI-only tags, and resets tracking state with a subtle note.
   */
  function invalidateAiSuggestions(
    nextSourceUrl?: string,
    nextContentType?: ContentType,
    nextSourceText?: string,
    nextDocumentFile?: File | null,
    nextImageFile?: File | null
  ) {
    // Invalidate any in-flight AI requests immediately (prevents out-of-order race conditions)
    activeAiRequestIdRef.current++;
    if (isAiGenerating) {
      setIsAiGenerating(false);
    }

    if (!aiGeneratedData && !isAiAssisted && !aiFeedback) {
      return;
    }

    const currentAiUrl = aiGeneratedData?.sourceUrl ?? "";
    const targetUrl = nextSourceUrl !== undefined ? nextSourceUrl.trim() : sourceUrl.trim();
    const targetContentType = nextContentType !== undefined ? nextContentType : contentType;
    const targetText = nextSourceText !== undefined ? nextSourceText.trim() : sourceText.trim();
    const targetFile =
      targetContentType === "image"
        ? (nextImageFile !== undefined ? nextImageFile : selectedImageFile)
        : (nextDocumentFile !== undefined ? nextDocumentFile : selectedDocumentFile);
    const targetFileId = getFileId(targetFile);
    const currentAiFileId = aiGeneratedData?.sourceFileId ?? "";

    const isUrlBased = ["article", "url", "video", "repo"].includes(targetContentType);
    let hasSourceChanged = false;

    if (targetContentType !== (aiGeneratedData?.contentType ?? contentType)) {
      hasSourceChanged = true;
    } else if (isUrlBased) {
      hasSourceChanged = targetUrl !== currentAiUrl;
    } else if (targetContentType === "document" || targetContentType === "image") {
      hasSourceChanged = targetFileId !== currentAiFileId;
    } else if (targetContentType === "note") {
      hasSourceChanged = targetText !== (aiGeneratedData?.sourceText ?? "");
    }

    if (hasSourceChanged) {
      invalidateCandidates();
      if (aiGeneratedData) {
        // Clear title ONLY if it currently matches the AI-generated title (user hasn't manually altered it)
        if (aiGeneratedData.generatedTitle && title.trim() === aiGeneratedData.generatedTitle.trim()) {
          setTitle("");
        }

        // Clear description ONLY if it currently matches the AI-generated description
        if (aiGeneratedData.generatedDescription && description.trim() === aiGeneratedData.generatedDescription.trim()) {
          setDescription("");
        }

        // Remove ONLY the tags generated by AI, preserving all manual tags
        if (aiGeneratedData.generatedTags && aiGeneratedData.generatedTags.length > 0) {
          const aiTagSet = new Set(aiGeneratedData.generatedTags.map((t) => t.toLowerCase()));
          setTags((prev) => prev.filter((t) => !aiTagSet.has(t.toLowerCase())));
        }

        setAiFeedback({
          type: "info",
          text: "Source changed. Generate again to refresh AI suggestions.",
        });
      } else if (aiFeedback) {
        setAiFeedback(null);
      }

      setAiGeneratedData(null);
      setIsAiAssisted(false);
    }
  }

  // AI Smart Capture trigger handler
  async function handleGenerateWithAi() {
    const thisRequestId = ++activeAiRequestIdRef.current;
    const snapshotUrl = sourceUrl.trim();
    const snapshotContentType = contentType;
    const snapshotText = sourceText.trim();
    const snapshotTitle = title.trim();
    const snapshotDesc = description.trim();
    const snapshotDocumentFile = selectedDocumentFile;
    const snapshotImageFile = selectedImageFile;
    const currentSnapshotFile =
      snapshotContentType === "image" ? snapshotImageFile : snapshotDocumentFile;
    const snapshotFileId = getFileId(currentSnapshotFile);

    setAiFeedback(null);
    setIsAiGenerating(true);

    try {
      let result;
      if (snapshotContentType === "image") {
        if (!snapshotImageFile) {
          setAiFeedback({
            type: "info",
            text: "Please select an image file (.png, .jpg, .jpeg, or .webp) for Smart Capture to read.",
          });
          setIsAiGenerating(false);
          return;
        }

        const formData = new FormData();
        formData.append("contentType", snapshotContentType);
        formData.append("sourceFile", snapshotImageFile);
        if (snapshotUrl) formData.append("sourceUrl", snapshotUrl);
        if (snapshotText) formData.append("sourceText", snapshotText);
        if (snapshotTitle) formData.append("existingTitle", snapshotTitle);
        if (snapshotDesc) formData.append("existingDescription", snapshotDesc);

        result = await generateSmartCaptureAction(formData);
      } else if (snapshotContentType === "document") {
        if (!snapshotDocumentFile) {
          setAiFeedback({
            type: "info",
            text: "Please select a document file (.pdf, .docx, .pptx, or .xlsx) for Smart Capture to read.",
          });
          setIsAiGenerating(false);
          return;
        }

        const formData = new FormData();
        formData.append("contentType", snapshotContentType);
        formData.append("sourceFile", snapshotDocumentFile);
        if (snapshotUrl) formData.append("sourceUrl", snapshotUrl);
        if (snapshotText) formData.append("sourceText", snapshotText);
        if (snapshotTitle) formData.append("existingTitle", snapshotTitle);
        if (snapshotDesc) formData.append("existingDescription", snapshotDesc);

        result = await generateSmartCaptureAction(formData);
      } else {
        result = await generateSmartCaptureAction({
          contentType: snapshotContentType,
          sourceUrl: snapshotUrl,
          sourceText: snapshotText,
          existingTitle: snapshotTitle,
          existingDescription: snapshotDesc,
        });
      }

      // Prevent race conditions / out-of-order responses (Bug 5 & image/document race protection)
      if (thisRequestId !== activeAiRequestIdRef.current) {
        return;
      }
      const currentActiveFile =
        contentType === "image" ? selectedImageFile : selectedDocumentFile;
      if (
        sourceUrl.trim() !== snapshotUrl ||
        contentType !== snapshotContentType ||
        sourceText.trim() !== snapshotText ||
        getFileId(currentActiveFile) !== snapshotFileId
      ) {
        return;
      }

      if (result.success && result.data) {
        const { title: aiTitle, description: aiDesc, tags: aiTags } = result.data;

        // Check whether title was previously empty or was set by previous AI generation
        const isTitleEligibleForAi =
          !snapshotTitle ||
          Boolean(aiGeneratedData?.generatedTitle && snapshotTitle === aiGeneratedData.generatedTitle.trim());

        let newGeneratedTitle: string | undefined = undefined;
        if (isTitleEligibleForAi && aiTitle) {
          setTitle(aiTitle);
          newGeneratedTitle = aiTitle;
        }

        // Check whether description was previously empty or was set by previous AI generation
        const isDescEligibleForAi =
          !snapshotDesc ||
          Boolean(aiGeneratedData?.generatedDescription && snapshotDesc === aiGeneratedData.generatedDescription.trim());

        let newGeneratedDesc: string | undefined = undefined;
        if (isDescEligibleForAi && aiDesc) {
          setDescription(aiDesc);
          newGeneratedDesc = aiDesc;
        }

        // Bug 3: Do not accumulate stale AI tags across generations.
        // Strip previous AI-generated tags to isolate user's manual tags.
        const previousAiTagsSet = new Set(
          (aiGeneratedData?.generatedTags || []).map((t) => t.toLowerCase())
        );
        const manualTags = tags.filter((t) => !previousAiTagsSet.has(t.toLowerCase()));

        // Merge new AI tags cleanly with manual tags (no duplicates)
        const manualTagsLower = new Set(manualTags.map((t) => t.toLowerCase()));
        const appliedAiTags: string[] = [];
        if (Array.isArray(aiTags)) {
          for (const tag of aiTags) {
            if (typeof tag === "string") {
              const cleaned = tag.replace(/^#/, "").trim();
              if (
                cleaned &&
                !manualTagsLower.has(cleaned.toLowerCase()) &&
                !appliedAiTags.some((t) => t.toLowerCase() === cleaned.toLowerCase())
              ) {
                appliedAiTags.push(cleaned);
              }
            }
          }
        }

        setTags([...manualTags, ...appliedAiTags]);

        // Track specifically what AI generated for this source
        setAiGeneratedData({
          generatedTitle: newGeneratedTitle,
          generatedDescription: newGeneratedDesc,
          generatedTags: appliedAiTags,
          sourceUrl: snapshotUrl,
          sourceText: snapshotText,
          sourceFileId: snapshotFileId,
          contentType: snapshotContentType,
        });

        setIsAiAssisted(true);

        const newTagsCount = appliedAiTags.length;
        if (newGeneratedTitle && newGeneratedDesc) {
          setAiFeedback({
            type: "success",
            text: `Generated title, description, and ${newTagsCount} tags! You can review or edit any field before saving.`,
          });
        } else if (newGeneratedTitle || newGeneratedDesc) {
          setAiFeedback({
            type: "success",
            text: `Updated metadata and added ${newTagsCount} tags. Your manual inputs were preserved.`,
          });
        } else {
          setAiFeedback({
            type: "success",
            text: `Preserved manual title and description. Applied ${newTagsCount} AI tags.`,
          });
        }

        // Automatically trigger pre-save candidate shortlist lookup using fresh resolved metadata
        const resolvedTitle = newGeneratedTitle !== undefined ? newGeneratedTitle : snapshotTitle;
        const resolvedDesc = newGeneratedDesc !== undefined ? newGeneratedDesc : snapshotDesc;
        const resolvedTags = [...manualTags, ...appliedAiTags];

        if (resolvedTitle.trim() || resolvedDesc.trim()) {
          runCandidateLookup({
            title: resolvedTitle.trim(),
            description: resolvedDesc.trim(),
            tags: resolvedTags,
          });
        }
      } else {
        setAiFeedback({
          type: "info",
          text: result.message || "Could not generate metadata with the provided information.",
        });
      }
    } catch (err) {
      if (thisRequestId === activeAiRequestIdRef.current) {
        console.error("[Smart Capture Client Exception]", err);
        setAiFeedback({
          type: "info",
          text:
            err instanceof Error && err.message
              ? err.message
              : "Unable to reach the AI assistant. Please try again or enter metadata manually.",
        });
      }
    } finally {
      if (thisRequestId === activeAiRequestIdRef.current) {
        setIsAiGenerating(false);
      }
    }
  }

  // Clear only the metadata generated by Smart Capture (Bug 2)
  function handleClearAiSuggestions() {
    if (!aiGeneratedData) return;

    // Clear title if it matches the generated title
    if (aiGeneratedData.generatedTitle && title.trim() === aiGeneratedData.generatedTitle.trim()) {
      setTitle("");
    }

    // Clear description if it matches the generated description
    if (aiGeneratedData.generatedDescription && description.trim() === aiGeneratedData.generatedDescription.trim()) {
      setDescription("");
    }

    // Remove only tags that were added by AI
    if (aiGeneratedData.generatedTags && aiGeneratedData.generatedTags.length > 0) {
      const aiTagSet = new Set(aiGeneratedData.generatedTags.map((t) => t.toLowerCase()));
      setTags((prev) => prev.filter((t) => !aiTagSet.has(t.toLowerCase())));
    }

    // Reset AI state & feedback completely
    setAiGeneratedData(null);
    setIsAiAssisted(false);
    setAiFeedback(null);
    invalidateCandidates();
  }

  // Validate on the client before network request
  function validateClient(): FormErrors {
    const errs: FormErrors = {};

    if (!contentType) {
      errs.contentType = "Please select a content type.";
    }

    if (!title.trim()) {
      errs.title = "Title is required.";
    }

    if (!description.trim()) {
      errs.description = "Description is required.";
    }

    if (["article", "video", "repo", "url"].includes(contentType)) {
      if (!sourceUrl.trim()) {
        errs.sourceUrl = "Source URL is required for this content type.";
      } else {
        try {
          const parsed = new URL(sourceUrl.trim());
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            errs.sourceUrl = "URL must start with http:// or https://";
          }
        } catch {
          errs.sourceUrl = "Please enter a valid web URL (e.g., https://example.com).";
        }
      }
    } else if (contentType === "image") {
      const file = sourceFileInputRef.current?.files?.[0];
      if (!file) {
        errs.sourceFile = "Please select an image file to upload.";
      }
    } else if (contentType === "document") {
      const file = sourceFileInputRef.current?.files?.[0];
      if (!file) {
        errs.sourceFile = "Please select a document or file to upload.";
      }
    } else if (contentType === "note") {
      if (!sourceText.trim()) {
        errs.sourceText = "Note content is required.";
      }
    } else if (contentType === "other") {
      if (sourceUrl.trim()) {
        try {
          const parsed = new URL(sourceUrl.trim());
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            errs.sourceUrl = "URL must start with http:// or https://";
          }
        } catch {
          errs.sourceUrl = "Please enter a valid web URL.";
        }
      }
    }

    return errs;
  }

  function handleReset() {
    activeAiRequestIdRef.current++;
    setIsAiGenerating(false);
    setTitle("");
    setDescription("");
    setSourceUrl("");
    setSourceText("");
    setTags([]);
    setTagInput("");
    setErrors({});
    setIsAiAssisted(false);
    setAiGeneratedData(null);
    setAiFeedback(null);
    setSelectedDocumentFile(null);
    setSelectedImageFile(null);
    clearDuplicateWarning();
    if (sourceFileInputRef.current) sourceFileInputRef.current.value = "";
    if (previewImageInputRef.current) previewImageInputRef.current.value = "";
    invalidateCandidates();
  }

  // Prevent unexpected form submissions when pressing Enter in ordinary single-line inputs
  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    executeSave(false);
  }

  function handleSaveAnyway() {
    setAllowDuplicate(true);
    executeSave(true);
  }

  function executeSave(isExplicitOverride: boolean) {
    setSuccessMessage(null);

    // If there's an unadded tag in the tag input, add it before submitting
    const finalTags = [...tags];
    if (tagInput.trim()) {
      const trimmed = tagInput.trim();
      if (!finalTags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
        finalTags.push(trimmed);
        setTags(finalTags);
      }
      setTagInput("");
    }

    const clientErrors = validateClient();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setErrors({});

    const formData = new FormData();
    formData.append("contentType", contentType);
    formData.append("title", title.trim());
    formData.append("description", description.trim());
    formData.append("tags", JSON.stringify(finalTags));
    formData.append("sourceUrl", sourceUrl.trim());
    formData.append("sourceText", sourceText.trim());

    if (isExplicitOverride || allowDuplicate) {
      formData.append("allowDuplicate", "true");
    }

    const sourceFile = sourceFileInputRef.current?.files?.[0];
    if (sourceFile) {
      formData.append("sourceFile", sourceFile);
    }

    const previewImage = previewImageInputRef.current?.files?.[0];
    if (previewImage) {
      formData.append("previewImage", previewImage);
    }

    startTransition(async () => {
      try {
        // Step A: Pre-save duplicate check unless overridden
        if (!isExplicitOverride && !allowDuplicate) {
          const dupCheckData = new FormData();
          dupCheckData.append("contentType", contentType);
          if (sourceUrl.trim()) dupCheckData.append("sourceUrl", sourceUrl.trim());
          if (sourceText.trim()) dupCheckData.append("sourceText", sourceText.trim());
          if (sourceFile) dupCheckData.append("sourceFile", sourceFile);

          const dupCheckRes = await checkDuplicateAction(dupCheckData);
          if (dupCheckRes.duplicate && dupCheckRes.item) {
            setDuplicateWarning(dupCheckRes.item);
            return;
          }
        }

        // Step B: Actual save action
        const res = await saveItemAction(formData);
        if (res.isDuplicate && res.duplicateItem) {
          setDuplicateWarning(res.duplicateItem);
          return;
        }

        if (res.success) {
          const createdId = res.id || res.itemId;
          if (createdId) {
            router.push(`/item/${createdId}`);
            return;
          }
          setSuccessMessage(res.message || "Item saved successfully to Echo Shelf!");
          handleReset();
        } else {
          setErrors({
            general: res.message || "Failed to save item.",
            ...res.errors,
          });
        }
      } catch {
        setErrors({
          general: "A network or server error occurred. Please try again.",
        });
      }
    });
  }

  const isUrlType = ["article", "video", "repo", "url"].includes(contentType);
  const isArticleOrUrl = contentType === "article" || contentType === "url";
  const isRepo = contentType === "repo";
  const isVideo = contentType === "video";
  const isImage = contentType === "image";
  const isDocument = contentType === "document";
  const isNote = contentType === "note";
  const isOther = contentType === "other";

  // Check if source URL has valid http/https format
  const isValidSourceUrl = (() => {
    const trimmed = sourceUrl.trim();
    if (!trimmed) return false;
    try {
      const u = new URL(trimmed);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  })();

  // Check if enough source context exists to enable Smart Capture
  const hasImageFile = Boolean(selectedImageFile && selectedImageFile.size > 0);
  const hasDocumentFile = Boolean(selectedDocumentFile && selectedDocumentFile.size > 0);
  const hasSourceContext =
    (isImage && hasImageFile) ||
    (isDocument && hasDocumentFile) ||
    (isNote && sourceText.trim().length >= 5) ||
    ((isArticleOrUrl || isRepo || isVideo) && (isValidSourceUrl || sourceText.trim().length > 0 || description.trim().length > 0)) ||
    (isUrlType && (sourceUrl.trim().length > 0 || sourceText.trim().length > 0 || description.trim().length > 0)) ||
    (isOther && (sourceUrl.trim().length > 0 || sourceText.trim().length > 0 || description.trim().length > 0));

  const isAiAvailable = hasSourceContext;

  // Determine whether AI-generated suggestions are currently active
  const hasAiSuggestions = Boolean(
    aiGeneratedData &&
      (aiGeneratedData.generatedTitle ||
        aiGeneratedData.generatedDescription ||
        (aiGeneratedData.generatedTags && aiGeneratedData.generatedTags.length > 0))
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Navigation & Header */}
        <NavBar current="add" />
        <header className="mb-8 -mt-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Add to Echo Shelf
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Save articles, videos, code, notes, and visual resources to your knowledge lake.
          </p>
        </header>

        {/* Global Notifications */}
        {successMessage && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
              <p className="text-sm font-medium">{successMessage}</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <Link
                href="/studio"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold hover:text-emerald-700 dark:hover:text-emerald-300"
              >
                View in Studio
              </Link>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {errors.general && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200"
          >
            <p className="text-sm font-medium">{errors.general}</p>
          </div>
        )}

        {/* Main Form */}
        <form
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
          noValidate
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 sm:p-8 shadow-sm space-y-6"
        >
          {/* 1. Content Type Selection (8 simplified types) */}
          <div>
            <label
              htmlFor="contentType"
              className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1"
            >
              Content Type <span className="text-rose-500">*</span>
            </label>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
              Select the type of content you are saving. The source fields below will adjust dynamically.
            </p>
            <select
              id="contentType"
              name="contentType"
              value={contentType}
              onChange={(e) => {
                const nextType = e.target.value as ContentType;
                setContentType(nextType);
                clearDuplicateWarning();
                setErrors((prev) => ({
                  ...prev,
                  sourceUrl: undefined,
                  sourceFile: undefined,
                  sourceText: undefined,
                }));
                invalidateAiSuggestions(sourceUrl, nextType, sourceText, selectedDocumentFile, selectedImageFile);
              }}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
            >
              {CONTENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label} — {type.hint}
                </option>
              ))}
            </select>
            {errors.contentType && (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                {errors.contentType}
              </p>
            )}
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          {/* 2. Dynamic Source Fields */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Source Information
            </h2>

            {/* URL Source (Article / Video / Repo / URL / Other) */}
            {(isUrlType || isOther) && (
              <div>
                <label
                  htmlFor="sourceUrl"
                  className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1"
                >
                  Source URL {isUrlType && <span className="text-rose-500">*</span>}
                  {isOther && <span className="text-xs text-zinc-400 font-normal"> (optional)</span>}
                </label>
                <input
                  type="url"
                  id="sourceUrl"
                  name="sourceUrl"
                  value={sourceUrl}
                  onChange={(e) => {
                    const nextUrl = e.target.value;
                    setSourceUrl(nextUrl);
                    clearDuplicateWarning();
                    if (errors.sourceUrl) {
                      setErrors((prev) => ({ ...prev, sourceUrl: undefined }));
                    }
                    invalidateAiSuggestions(nextUrl, contentType, sourceText);
                  }}
                  placeholder="https://example.com/article-or-resource"
                  className={`w-full px-3.5 py-2 rounded-lg border text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    errors.sourceUrl
                      ? "border-rose-400 dark:border-rose-600 ring-1 ring-rose-400"
                      : "border-zinc-300 dark:border-zinc-700"
                  }`}
                />
                {errors.sourceUrl && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                    {errors.sourceUrl}
                  </p>
                )}
              </div>
            )}

            {/* File Upload for Image */}
            {isImage && (
              <div>
                <label
                  htmlFor="sourceFile"
                  className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1"
                >
                  Upload Image <span className="text-rose-500">*</span>
                </label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                  Photos, screenshots, diagrams, illustrations. PNG, JPG, JPEG, WEBP. Up to 10 MB. Stored in Sanity Assets.
                </p>
                <input
                  type="file"
                  id="sourceFile"
                  name="sourceFile"
                  ref={sourceFileInputRef}
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setSelectedImageFile(file);
                    clearDuplicateWarning();
                    if (errors.sourceFile) {
                      setErrors((prev) => ({ ...prev, sourceFile: undefined }));
                    }
                    invalidateAiSuggestions(sourceUrl, contentType, sourceText, selectedDocumentFile, file);
                  }}
                  className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-zinc-100 file:text-zinc-800 hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-200 dark:hover:file:bg-zinc-700"
                />
                {errors.sourceFile && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                    {errors.sourceFile}
                  </p>
                )}
              </div>
            )}

            {/* File Upload for Document */}
            {isDocument && (
              <div>
                <label
                  htmlFor="sourceFile"
                  className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1"
                >
                  Upload Document <span className="text-rose-500">*</span>
                </label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                  PDF (.pdf), Word (.docx), PowerPoint (.pptx), Excel (.xlsx). Up to 20 MB. Stored in Sanity File Assets.
                </p>
                <input
                  type="file"
                  id="sourceFile"
                  name="sourceFile"
                  ref={sourceFileInputRef}
                  accept=".pdf,.docx,.pptx,.xlsx,.doc,.ppt,.xls"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setSelectedDocumentFile(file);
                    clearDuplicateWarning();
                    if (errors.sourceFile) {
                      setErrors((prev) => ({ ...prev, sourceFile: undefined }));
                    }
                    invalidateAiSuggestions(sourceUrl, contentType, sourceText, file);
                  }}
                  className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-zinc-100 file:text-zinc-800 hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-200 dark:hover:file:bg-zinc-700"
                />
                {errors.sourceFile && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                    {errors.sourceFile}
                  </p>
                )}
              </div>
            )}

            {/* Textarea for Note */}
            {(isNote || isOther) && (
              <div>
                <label
                  htmlFor="sourceText"
                  className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1"
                >
                  {isNote ? "Note Content" : "Text Content"} {isNote && <span className="text-rose-500">*</span>}
                  {isOther && <span className="text-xs text-zinc-400 font-normal"> (optional)</span>}
                </label>
                <textarea
                  id="sourceText"
                  name="sourceText"
                  rows={4}
                  value={sourceText}
                  onChange={(e) => {
                    const nextText = e.target.value;
                    setSourceText(nextText);
                    clearDuplicateWarning();
                    if (errors.sourceText) {
                      setErrors((prev) => ({ ...prev, sourceText: undefined }));
                    }
                    if (contentType === "note") {
                      invalidateAiSuggestions(sourceUrl, contentType, nextText);
                    }
                  }}
                  placeholder={isNote ? "Paste or write note content here..." : "Optional text source..."}
                  className={`w-full px-3.5 py-2 rounded-lg border text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-xs ${
                    errors.sourceText
                      ? "border-rose-400 dark:border-rose-600 ring-1 ring-rose-400"
                      : "border-zinc-300 dark:border-zinc-700"
                  }`}
                />
                {errors.sourceText && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                    {errors.sourceText}
                  </p>
                )}
              </div>
            )}

            {/* Optional Source File for 'other' */}
            {isOther && (
              <div>
                <label
                  htmlFor="sourceFile"
                  className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1"
                >
                  Source File <span className="text-xs text-zinc-400 font-normal">(optional)</span>
                </label>
                <input
                  type="file"
                  id="sourceFile"
                  name="sourceFile"
                  ref={sourceFileInputRef}
                  className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-zinc-100 file:text-zinc-800 hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-200 dark:hover:file:bg-zinc-700"
                />
              </div>
            )}

            {/* Optional Preview Image for non-image types */}
            {!isImage && (
              <div className="pt-2">
                <label
                  htmlFor="previewImage"
                  className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1"
                >
                  Preview Image <span className="text-xs text-zinc-400 font-normal">(optional cover image)</span>
                </label>
                <input
                  type="file"
                  id="previewImage"
                  name="previewImage"
                  ref={previewImageInputRef}
                  accept="image/*"
                  className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-zinc-100 file:text-zinc-800 hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-200 dark:hover:file:bg-zinc-700"
                />
              </div>
            )}
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          {/* 3. Metadata Fields with Smart Capture AI */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-1">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Metadata
                  </h2>
                  {isAiAssisted && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                      ✨ AI-assisted
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Review and customize how this item is titled and indexed.
                </p>
              </div>

              {/* Smart Capture Action Buttons (placed side-by-side) */}
              <div className="flex items-center gap-2 shrink-0 flex-nowrap">
                <button
                  type="button"
                  onClick={handleGenerateWithAi}
                  disabled={!isAiAvailable || isAiGenerating}
                  title={
                    isImage && !hasImageFile
                      ? "Select an image file (.png, .jpg, .jpeg, or .webp) for Smart Capture to analyze"
                      : isDocument && !hasDocumentFile
                      ? "Select a document file (.pdf, .docx, .pptx, or .xlsx) for Smart Capture to read"
                      : isVideo && !isValidSourceUrl && !sourceText.trim() && !description.trim()
                      ? "Enter a YouTube video URL for Smart Capture to analyze"
                      : isRepo && !isValidSourceUrl && !sourceText.trim() && !description.trim()
                      ? "Enter a GitHub or GitLab repository URL for Smart Capture to analyze"
                      : isArticleOrUrl && !isValidSourceUrl && !sourceText.trim() && !description.trim()
                      ? "Enter a valid webpage URL (http:// or https://) for Smart Capture to read"
                      : !hasSourceContext
                      ? "Provide source context (image, document file, URL, or notes) first"
                      : isImage && hasImageFile
                      ? "Analyze image directly with Groq Vision"
                      : isDocument && hasDocumentFile
                      ? "Read document and generate metadata with Groq AI"
                      : isVideo && isValidSourceUrl
                      ? "Read YouTube video and generate metadata with Groq AI"
                      : isRepo && isValidSourceUrl
                      ? "Read repository and generate metadata with Groq AI"
                      : isArticleOrUrl && isValidSourceUrl
                      ? "Read webpage and generate metadata with Groq AI"
                      : "Suggest title, description, and tags with Groq AI"
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:hover:bg-violet-900/60 dark:text-violet-300 border border-violet-200 dark:border-violet-800 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-violet-500 whitespace-nowrap"
                >
                  {isAiGenerating ? (
                    <>
                      <svg
                        className="animate-spin h-3.5 w-3.5 text-violet-600 dark:text-violet-400"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <span>
                        {isImage && hasImageFile
                          ? "Analyzing image and generating suggestions..."
                          : isDocument && hasDocumentFile
                          ? "Reading document and generating suggestions..."
                          : isVideo && isValidSourceUrl
                          ? "Reading YouTube video metadata and generating suggestions..."
                          : isRepo && isValidSourceUrl
                          ? "Reading repository and generating metadata..."
                          : isArticleOrUrl && isValidSourceUrl
                          ? "Reading page and generating metadata..."
                          : "Generating..."}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm">✨</span>
                      <span>Generate with AI</span>
                    </>
                  )}
                </button>

                {/* Clear AI Suggestions Button (next to Generate with AI button) */}
                {hasAiSuggestions && (
                  <button
                    type="button"
                    onClick={handleClearAiSuggestions}
                    disabled={isAiGenerating || isPending}
                    title="Clear only the suggestions added by AI"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-zinc-400 whitespace-nowrap"
                  >
                    <span>✕</span>
                    <span>Clear AI Suggestions</span>
                  </button>
                )}
              </div>
            </div>

            {/* Smart Capture feedback messages */}
            {aiFeedback && (
              <div
                role="status"
                className={`p-3 rounded-lg text-xs flex items-center justify-between gap-2 border transition-all ${
                  aiFeedback.type === "success"
                    ? "bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800 text-violet-900 dark:text-violet-200"
                    : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{aiFeedback.type === "success" ? "✨" : "ℹ️"}</span>
                  <p className="font-medium">{aiFeedback.text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAiFeedback(null)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs px-1 font-semibold"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Title */}
            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1"
              >
                Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (errors.title) {
                    setErrors((prev) => ({ ...prev, title: undefined }));
                  }
                  invalidateCandidates();
                }}
                placeholder="Descriptive title for this saved item"
                className={`w-full px-3.5 py-2 rounded-lg border text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  errors.title
                    ? "border-rose-400 dark:border-rose-600 ring-1 ring-rose-400"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              />
              {errors.title && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                  {errors.title}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1"
              >
                Description <span className="text-rose-500">*</span>
              </label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1.5">
                Summary or notes explaining what this item is and why you saved it.
              </p>
              <textarea
                id="description"
                name="description"
                rows={3}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (errors.description) {
                    setErrors((prev) => ({ ...prev, description: undefined }));
                  }
                  invalidateCandidates();
                }}
                placeholder="Explain the key takeaways or context..."
                className={`w-full px-3.5 py-2 rounded-lg border text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  errors.description
                    ? "border-rose-400 dark:border-rose-600 ring-1 ring-rose-400"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              />
              {errors.description && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                  {errors.description}
                </p>
              )}
            </div>

            {/* Interactive Tags Entry */}
            <div>
              <label
                htmlFor="tagInput"
                className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1"
              >
                Tags <span className="text-xs text-zinc-400 font-normal">(press Enter or comma to add)</span>
              </label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                Categorize this item with keywords. Duplicate tags are automatically ignored.
              </p>

              {/* Tag Badges Container + Input */}
              <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500 min-h-[42px] transition-colors">
                {tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80"
                  >
                    <span>#{tag}</span>
                    <button
                      type="button"
                      onClick={() => removeTag(idx)}
                      aria-label={`Remove tag ${tag}`}
                      className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-full w-3.5 h-3.5 inline-flex items-center justify-center font-bold text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  id="tagInput"
                  value={tagInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.includes(",")) {
                      const parts = val.split(",");
                      for (const part of parts) {
                        addTag(part);
                      }
                    } else {
                      setTagInput(val);
                    }
                  }}
                  onKeyDown={handleTagKeyDown}
                  placeholder={tags.length === 0 ? "Type tag & press Enter (e.g. nextjs, sanity)..." : "Add tag..."}
                  className="flex-1 min-w-[140px] bg-transparent text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500 px-1 py-0.5"
                />
              </div>
            </div>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          {/* 4. Smart Connections: Pre-Save Potentially Related Candidates */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Potentially Related
                  </h2>
                  {connectionCandidates.length > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      {connectionCandidates.length} candidate{connectionCandidates.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Based on metadata similarity. Final connections are verified after saving.
                </p>
              </div>

              {/* Find Related Items Button */}
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => runCandidateLookup()}
                  disabled={(!title.trim() && !description.trim()) || isShortlisting || isAiGenerating}
                  title={
                    !title.trim() && !description.trim()
                      ? "Enter a title or description first to find related items"
                      : "Search existing library for related items"
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-zinc-400 whitespace-nowrap"
                >
                  {isShortlisting ? (
                    <>
                      <svg
                        className="animate-spin h-3.5 w-3.5 text-zinc-600 dark:text-zinc-400"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <span>Looking for related items...</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                        />
                      </svg>
                      <span>{connectionCandidates.length > 0 ? "Refresh Related Items" : "Find Related Items"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Feedback / Error message */}
            {candidateFeedback && (
              <div
                role="status"
                className="p-3 rounded-lg text-xs bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <span>ℹ️</span>
                  <p className="font-medium">{candidateFeedback}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCandidateFeedback(null)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs px-1 font-semibold"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Loading indicator (when candidates list is currently empty) */}
            {isShortlisting && connectionCandidates.length === 0 && (
              <div className="p-4 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-white/50 dark:bg-zinc-800/30 flex items-center justify-center gap-2.5 text-xs text-zinc-500 dark:text-zinc-400">
                <svg
                  className="animate-spin h-4 w-4 text-zinc-600 dark:text-zinc-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Looking for related items...</span>
              </div>
            )}

            {/* Empty State */}
            {hasSearchedCandidates && !isShortlisting && connectionCandidates.length === 0 && !candidateFeedback && (
              <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/20 text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                <span className="text-zinc-400">ℹ️</span>
                <span>No closely related saved items found.</span>
              </div>
            )}

            {/* Populated Candidate Cards */}
            {connectionCandidates.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {connectionCandidates.map((cand) => (
                  <div
                    key={cand._id}
                    className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1 leading-snug">
                          {cand.title}
                        </h3>
                        {cand.contentType && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                            {cand.contentType}
                          </span>
                        )}
                      </div>
                      {cand.description && (
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                          {cand.description}
                        </p>
                      )}
                    </div>
                    {cand.tags && cand.tags.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        <span className="truncate">
                          {cand.tags.slice(0, 3).join(" · ")}
                          {cand.tags.length > 3 && ` · +${cand.tags.length - 3}`}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Exact Duplicate Warning */}
          {duplicateWarning && (
            <div
              role="alert"
              className="p-4 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/90 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200"
            >
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0 leading-none">⚠️</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                      Exact duplicate found
                    </span>
                  </div>
                  <p className="text-sm font-medium text-amber-950 dark:text-amber-100 mb-3">
                    This exact item already exists in Echo Shelf.
                  </p>

                  {/* Existing Item Card Snippet */}
                  <div className="p-3.5 rounded-lg border border-amber-200/90 dark:border-amber-800/60 bg-white/90 dark:bg-zinc-900/90 shadow-xs mb-3.5">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1">
                        {duplicateWarning.title}
                      </h4>
                      {duplicateWarning.contentType && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                          {duplicateWarning.contentType}
                        </span>
                      )}
                    </div>
                    {duplicateWarning.description && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-2 leading-relaxed">
                        {duplicateWarning.description}
                      </p>
                    )}
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Saved{" "}
                      {new Date(duplicateWarning.savedAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <a
                      href={`/item/${duplicateWarning._id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-750 transition-colors shadow-xs"
                    >
                      <span>View Existing Item</span>
                      <span aria-hidden="true">↗</span>
                    </a>
                    <button
                      type="button"
                      onClick={handleSaveAnyway}
                      disabled={isPending}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white transition-colors shadow-xs disabled:opacity-50"
                    >
                      {isPending ? "Saving..." : "Save Anyway"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="pt-4 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={isPending || isAiGenerating}
              className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={isPending || isAiGenerating}
              className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-sm shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 dark:focus:ring-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isPending ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-current"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save to Echo Shelf</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
