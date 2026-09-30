import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { client } from "@/sanity/lib/client";
import { urlFor } from "@/sanity/lib/image";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface SavedItemDetail {
  _id: string;
  title: string;
  description: string;
  contentType: string;
  tags?: string[];
  savedAt: string;
  isFavorite?: boolean;
  image?: {
    asset?: {
      _id: string;
      url?: string;
      metadata?: {
        dimensions?: {
          width: number;
          height: number;
          aspectRatio: number;
        };
      };
    };
  };
  source?: {
    url?: string;
    text?: string;
    file?: {
      asset?: {
        _id: string;
        url?: string;
        originalFilename?: string;
        size?: number;
        extension?: string;
        mimeType?: string;
      };
    };
  };
  connections?: Array<{
    strength?: "strong" | "moderate" | "weak";
    relationshipType?: string;
    explanation?: string;
    item?: {
      _id: string;
      title: string;
      contentType?: string;
      tags?: string[];
    };
  }>;
}

const ITEM_QUERY = `*[_type == "savedItem" && _id == $id][0] {
  _id,
  title,
  description,
  contentType,
  tags,
  savedAt,
  isFavorite,
  image {
    asset-> {
      _id,
      url,
      metadata {
        dimensions
      }
    }
  },
  source {
    url,
    text,
    file {
      asset-> {
        _id,
        url,
        originalFilename,
        size,
        extension,
        mimeType
      }
    }
  },
  connections[] {
    strength,
    relationshipType,
    explanation,
    item-> {
      _id,
      title,
      contentType,
      tags
    }
  }
}`;

async function getItem(id: string): Promise<SavedItemDetail | null> {
  if (!id || typeof id !== "string") return null;
  try {
    const item = await client.withConfig({ useCdn: false }).fetch<SavedItemDetail | null>(
      ITEM_QUERY,
      { id }
    );
    return item;
  } catch (err) {
    console.error("[Item Detail Fetch Error]", err);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) {
    return {
      title: "Item Not Found — Echo Shelf",
      description: "The requested saved item could not be found.",
    };
  }
  return {
    title: `${item.title} — Echo Shelf`,
    description: item.description || "Saved knowledge item in Echo Shelf",
  };
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return dateString;
  }
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default async function SavedItemDetailPage({ params }: PageProps) {
  const { id } = await params;
  const item = await getItem(id);

  if (!item) {
    notFound();
  }

  const contentTypeUpper = (item.contentType || "OTHER").toUpperCase();
  const savedDateFormatted = formatDate(item.savedAt);
  const imageUrl = item.image?.asset?.url || (item.image ? urlFor(item.image).url() : undefined);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Navigation */}
        <nav className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <span>←</span> Back to Library
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/add"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
            >
              + Add Item
            </Link>
          </div>
        </nav>

        {/* Knowledge Item Main Card */}
        <article className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
          {/* Header Bar */}
          <div className="p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wider uppercase bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80">
                  {contentTypeUpper}
                </span>
                {item.isFavorite && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                    ★ Favorite
                  </span>
                )}
              </div>
              <time className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                Saved {savedDateFormatted}
              </time>
            </div>

            {/* Title */}
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white leading-tight">
              {item.title}
            </h1>

            {/* Description */}
            <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {item.description}
            </p>

            {/* Tags */}
            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2">
                {item.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/60"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Section: Original Content / Source (Rendered specifically by Content Type) */}
          <div className="border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-6 sm:p-8 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {item.contentType === "note" ? "Original Note" : "Original Content"}
            </h2>

            {/* Note Content */}
            {item.contentType === "note" && (
              <div className="bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 sm:p-5 text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap font-sans">
                {item.source?.text || "No note body recorded."}
              </div>
            )}

            {/* Article / URL Content */}
            {(item.contentType === "article" || item.contentType === "url") && (
              <div className="bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 sm:p-5 space-y-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Original web source:
                </p>
                {item.source?.url ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300 break-all">
                      {item.source.url}
                    </span>
                    <a
                      href={item.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shrink-0 self-start sm:self-center"
                    >
                      <span>Open Original Source</span>
                      <span>↗</span>
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 italic">No source URL saved.</p>
                )}
              </div>
            )}

            {/* Repository Content */}
            {item.contentType === "repo" && (
              <div className="bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 sm:p-5 space-y-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Repository URL:
                </p>
                {item.source?.url ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300 break-all">
                      {item.source.url}
                    </span>
                    <a
                      href={item.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors shrink-0 self-start sm:self-center"
                    >
                      <span>Open Repository</span>
                      <span>↗</span>
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 italic">No repository URL saved.</p>
                )}
              </div>
            )}

            {/* Video Content */}
            {item.contentType === "video" && (
              <div className="bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 sm:p-5 space-y-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Video link:
                </p>
                {item.source?.url ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300 break-all">
                      {item.source.url}
                    </span>
                    <a
                      href={item.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors shrink-0 self-start sm:self-center"
                    >
                      <span>Watch on YouTube</span>
                      <span>↗</span>
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 italic">No video URL saved.</p>
                )}
              </div>
            )}

            {/* Document Content */}
            {item.contentType === "document" && (
              <div className="bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {item.source?.file?.asset?.originalFilename || "Uploaded Document"}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {[
                        item.source?.file?.asset?.extension?.toUpperCase(),
                        formatFileSize(item.source?.file?.asset?.size),
                      ]
                        .filter(Boolean)
                        .join(" • ") || "Document asset"}
                    </p>
                  </div>
                  {item.source?.file?.asset?.url && (
                    <a
                      href={item.source.file.asset.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shrink-0"
                    >
                      <span>Open Document</span>
                      <span>↗</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Image Content */}
            {item.contentType === "image" && (
              <div className="bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 sm:p-5 space-y-3">
                {imageUrl ? (
                  <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700 flex justify-center bg-zinc-100 dark:bg-zinc-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt={item.title || "Saved image"}
                      className="max-h-[500px] w-auto max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 italic">No image file found.</p>
                )}
              </div>
            )}

            {/* Other Content */}
            {item.contentType === "other" && (
              <div className="bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 sm:p-5 space-y-3">
                {item.source?.url && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300 break-all">
                      {item.source.url}
                    </span>
                    <a
                      href={item.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors shrink-0"
                    >
                      <span>Open Link ↗</span>
                    </a>
                  </div>
                )}
                {item.source?.text && (
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                    {item.source.text}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Section: Smart Connections (Placeholder for post-save AI relationships) */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Smart Connections
                </h2>
                {item.connections && item.connections.length > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    {item.connections.length} connection{item.connections.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                Phase 2
              </span>
            </div>

            {item.connections && item.connections.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {item.connections.map((conn, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {conn.item?.title || "Connected Item"}
                      </span>
                      {conn.strength && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60">
                          {conn.strength}
                        </span>
                      )}
                    </div>
                    {conn.relationshipType && (
                      <p className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                        {conn.relationshipType}
                      </p>
                    )}
                    {conn.explanation && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                        {conn.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 text-center space-y-1">
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  No connections generated yet.
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Smart Connections will analyze and link this item with related knowledge in the next phase.
                </p>
              </div>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
