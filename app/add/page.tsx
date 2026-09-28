"use client";

import React, { useState, useRef, useTransition } from "react";
import Link from "next/link";
import { saveItemAction, type ContentType } from "./actions";

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

export default function AddItemPage() {
  const [contentType, setContentType] = useState<ContentType>("article");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  
  // Interactive tags state
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  
  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sourceFileInputRef = useRef<HTMLInputElement>(null);
  const previewImageInputRef = useRef<HTMLInputElement>(null);

  // Helper to add a tag with trimming & case-insensitive deduplication
  function addTag(tagText: string) {
    const trimmed = tagText.trim();
    if (!trimmed) return;

    // Check for case-insensitive duplicate
    const exists = tags.some((t) => t.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput("");
  }

  // Remove a specific tag by index
  function removeTag(indexToRemove: number) {
    setTags((prev) => prev.filter((_, idx) => idx !== indexToRemove));
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
    setTitle("");
    setDescription("");
    setSourceUrl("");
    setSourceText("");
    setTags([]);
    setTagInput("");
    setErrors({});
    if (sourceFileInputRef.current) sourceFileInputRef.current.value = "";
    if (previewImageInputRef.current) previewImageInputRef.current.value = "";
  }

  // Prevent unexpected form submissions when pressing Enter in ordinary single-line inputs
  function handleFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
        const res = await saveItemAction(formData);
        if (res.success) {
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
  const isImage = contentType === "image";
  const isDocument = contentType === "document";
  const isNote = contentType === "note";
  const isOther = contentType === "other";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Navigation & Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Link
              href="/"
              className="text-xs uppercase tracking-wider font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors"
            >
              ← Back to Home
            </Link>
            <Link
              href="/studio"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              Open Sanity Studio ↗
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
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
                setContentType(e.target.value as ContentType);
                setErrors((prev) => ({
                  ...prev,
                  sourceUrl: undefined,
                  sourceFile: undefined,
                  sourceText: undefined,
                }));
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
                  onChange={(e) => setSourceUrl(e.target.value)}
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

            {/* File Upload for Image (Photos, screenshots, diagrams, illustrations) */}
            {isImage && (
              <div>
                <label
                  htmlFor="sourceFile"
                  className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1"
                >
                  Upload Image <span className="text-rose-500">*</span>
                </label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                  Photos, screenshots, diagrams, illustrations. PNG, JPG, WEBP, GIF, SVG. Stored in Sanity Assets.
                </p>
                <input
                  type="file"
                  id="sourceFile"
                  name="sourceFile"
                  ref={sourceFileInputRef}
                  accept="image/*"
                  className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-zinc-100 file:text-zinc-800 hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-200 dark:hover:file:bg-zinc-700"
                />
                {errors.sourceFile && (
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                    {errors.sourceFile}
                  </p>
                )}
              </div>
            )}

            {/* File Upload for Document (PDFs, documents, presentations, spreadsheets) */}
            {isDocument && (
              <div>
                <label
                  htmlFor="sourceFile"
                  className="block text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1"
                >
                  Upload Document or PDF <span className="text-rose-500">*</span>
                </label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                  PDFs, documents, presentations, spreadsheets. Stored in Sanity File Assets.
                </p>
                <input
                  type="file"
                  id="sourceFile"
                  name="sourceFile"
                  ref={sourceFileInputRef}
                  accept=".pdf,.doc,.docx,.txt,.rtf,.epub,.xls,.xlsx,.ppt,.pptx"
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
                  onChange={(e) => setSourceText(e.target.value)}
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

          {/* 3. Metadata Fields */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Metadata
            </h2>

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
                onChange={(e) => setTitle(e.target.value)}
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
                onChange={(e) => setDescription(e.target.value)}
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

          {/* Form Actions */}
          <div className="pt-4 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={isPending}
              className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={isPending}
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
