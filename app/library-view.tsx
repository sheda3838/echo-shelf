"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { urlFor } from "@/sanity/lib/image";

export interface LibraryItem {
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
    };
  };
  connectionCount?: number;
}

const FILTER_TYPES = [
  { label: "All", value: "all" },
  { label: "Notes", value: "note" },
  { label: "Articles", value: "article" },
  { label: "Videos", value: "video" },
  { label: "Repositories", value: "repo" },
  { label: "Documents", value: "document" },
  { label: "Images", value: "image" },
  { label: "URLs", value: "url" },
  { label: "Other", value: "other" },
] as const;

function formatDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(d);
  } catch {
    return dateString;
  }
}

function getContentTypeBadgeColor(type: string): string {
  switch (type.toLowerCase()) {
    case "article":
    case "url":
      return "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800/70";
    case "repo":
      return "bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800/70";
    case "video":
      return "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800/70";
    case "document":
      return "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800/70";
    case "image":
      return "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800/70";
    case "note":
      return "bg-emerald-50 text-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/70";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700";
  }
}

export default function LibraryView({ items }: { items: LibraryItem[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  // Client-side filtering across title, description, and tags
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return items.filter((item) => {
      // Content-type filter
      if (activeFilter !== "all" && item.contentType?.toLowerCase() !== activeFilter) {
        return false;
      }

      // Search keyword filter
      if (!q) return true;

      const titleMatch = item.title?.toLowerCase().includes(q);
      const descMatch = item.description?.toLowerCase().includes(q);
      const tagsMatch = item.tags?.some((t) => t.toLowerCase().includes(q));

      return Boolean(titleMatch || descMatch || tagsMatch);
    });
  }, [items, searchQuery, activeFilter]);

  // Derive counts per content type for pill indicators
  const countsByType = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const item of items) {
      const type = item.contentType?.toLowerCase() || "other";
      counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
  }, [items]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Echo Shelf Library Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xl">📚</span>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Echo Shelf
              </h1>
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Your saved knowledge, echoed back when it matters.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/add"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-semibold shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 dark:focus:ring-white"
            >
              <span>+ Add Item</span>
            </Link>
          </div>
        </header>

        {/* Search & Filter Controls */}
        <div className="space-y-4">
          {/* Search Field */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              id="library-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your saved knowledge by title, description, or tags..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            )}
          </div>

          {/* Content-Type Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {FILTER_TYPES.map((filter) => {
              const isActive = activeFilter === filter.value;
              const count = countsByType[filter.value] || 0;

              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setActiveFilter(filter.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-colors flex items-center gap-1.5 ${
                    isActive
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                      : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <span>{filter.label}</span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isActive
                          ? "bg-zinc-700 text-zinc-200 dark:bg-zinc-200 dark:text-zinc-800"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Library Content Section */}
        {items.length === 0 ? (
          /* Empty Library State (0 items saved in Sanity) */
          <div className="bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl p-12 text-center space-y-4">
            <span className="text-4xl">📭</span>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                Your shelf is empty.
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
                Save your first piece of knowledge to get started with Echo Shelf.
              </p>
            </div>
            <div>
              <Link
                href="/add"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors"
              >
                <span>Add your first item</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          /* Search / Filter Empty State (Items exist, but none match criteria) */
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center space-y-3">
            <span className="text-3xl">🔍</span>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
              No saved items match your search.
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Try adjusting your keywords or clearing the active content filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveFilter("all");
              }}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline pt-1"
            >
              Clear search & filters
            </button>
          </div>
        ) : (
          /* Library Grid Cards */
          <div>
            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-3 px-1">
              <span>
                Showing {filteredItems.length} of {items.length} item{items.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map((item) => {
                const itemImageUrl = item.image?.asset?.url || (item.image ? urlFor(item.image).url() : undefined);
                const formattedDate = formatDate(item.savedAt);
                const badgeStyle = getContentTypeBadgeColor(item.contentType);

                return (
                  <Link
                    key={item._id}
                    href={`/item/${item._id}`}
                    className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5 shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Thumbnail if present */}
                      {itemImageUrl && (
                        <div className="mb-3 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 aspect-video relative flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={itemImageUrl}
                            alt={item.title}
                            className="object-cover w-full h-full group-hover:scale-102 transition-transform duration-200"
                          />
                        </div>
                      )}

                      {/* Header Row: Content Type Badge + Favorite + Date */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${badgeStyle}`}
                        >
                          {item.contentType || "OTHER"}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                          {item.isFavorite && (
                            <span className="text-amber-500" title="Favorite">
                              ★
                            </span>
                          )}
                          <time className="text-[11px] font-mono">{formattedDate}</time>
                        </div>
                      </div>

                      {/* Title */}
                      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-2 leading-snug">
                        {item.title}
                      </h2>

                      {/* Description preview */}
                      {item.description && (
                        <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      )}
                    </div>

                    {/* Footer Row: Tags & Connection info */}
                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2 text-xs">
                      {item.tags && item.tags.length > 0 ? (
                        <div className="flex items-center gap-1 overflow-hidden truncate">
                          {item.tags.slice(0, 3).map((tag, idx) => (
                            <span
                              key={idx}
                              className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono truncate"
                            >
                              #{tag}
                            </span>
                          ))}
                          {item.tags.length > 3 && (
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                              +{item.tags.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-zinc-400 italic">No tags</span>
                      )}

                      {Boolean(item.connectionCount && item.connectionCount > 0) && (
                        <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          🔗 {item.connectionCount}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
