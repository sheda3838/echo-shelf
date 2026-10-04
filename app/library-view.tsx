"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { urlFor } from "@/sanity/lib/image";
import NavBar from "./components/nav-bar";
import {
  SearchIcon,
  EmptyShelfIcon,
  StarIcon,
  ConnectionIcon,
  ContentTypeIcon,
  getContentTypeBadgeColor,
} from "./components/icons";

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
        {/* Primary Navigation & Title */}
        <div>
          <NavBar current="library" />
          <p className="-mt-4 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Your saved knowledge, echoed back when it matters.
          </p>
        </div>

        {/* Search & Filter Controls */}
        <div className="space-y-4">
          {/* Search Field */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-emerald-700/60 dark:text-emerald-400/60">
              <SearchIcon className="h-4 w-4" />
            </div>
            <input
              type="text"
              id="library-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your saved knowledge by title, description, or tags..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600 shadow-xs transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            )}
          </div>

          {/* Content-Type Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none" role="toolbar" aria-label="Content type filters">
            {FILTER_TYPES.map((filter) => {
              const isActive = activeFilter === filter.value;
              const count = countsByType[filter.value] || 0;

              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setActiveFilter(filter.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all flex items-center gap-1.5 ${
                    isActive
                      ? "bg-emerald-800 text-white dark:bg-emerald-600 dark:text-white shadow-xs font-semibold"
                      : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/40 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-300 dark:hover:border-emerald-800/60"
                  }`}
                >
                  <span>{filter.label}</span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isActive
                          ? "bg-emerald-950/40 text-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-100"
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
          <div className="bg-white dark:bg-zinc-900 border border-dashed border-emerald-950/15 dark:border-emerald-500/20 rounded-2xl p-12 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shadow-xs">
              <EmptyShelfIcon className="w-7 h-7" />
            </div>
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white text-xs font-semibold shadow-xs hover:shadow-emerald-900/20 transition-all"
              >
                <span>Add your first item</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          /* Search / Filter Empty State (Items exist, but none match criteria) */
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-300">
              <SearchIcon className="w-5 h-5" />
            </div>
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
              className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline pt-1"
            >
              Clear search & filters
            </button>
          </div>
        ) : (
          /* Library Grid Cards */
          <div>
            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-4 px-1">
              <span>
                Showing <strong className="text-zinc-700 dark:text-zinc-300 font-semibold">{filteredItems.length}</strong> of {items.length} item{items.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredItems.map((item) => {
                const itemImageUrl = item.image?.asset?.url || (item.image ? urlFor(item.image).url() : undefined);
                const formattedDate = formatDate(item.savedAt);
                const badgeStyle = getContentTypeBadgeColor(item.contentType);

                return (
                  <Link
                    key={item._id}
                    href={`/item/${item._id}`}
                    className="group echo-card-hover bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800/90 rounded-2xl overflow-hidden shadow-xs hover:border-emerald-500/40 flex flex-col justify-between"
                  >
                    <div>
                      {/* Fixed Aspect Ratio Media Area: Standardized 16/9 across ALL cards */}
                      <div className="aspect-[16/9] w-full overflow-hidden relative border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-100 dark:bg-zinc-950">
                        {itemImageUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={itemImageUrl}
                            alt={item.title}
                            className="object-cover w-full h-full group-hover:scale-[1.02] transition-transform duration-300"
                          />
                        ) : (
                          /* Designed Echo Shelf visual placeholder based on content type */
                          <div className="w-full h-full bg-gradient-to-br from-[#06241b] via-[#093528] to-[#041a13] flex items-center justify-center relative select-none">
                            {/* Ambient geometric grid lines */}
                            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#34d399_1px,transparent_1px)] [background-size:14px_14px]" />
                            <div className="relative z-10 w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-500/25 flex items-center justify-center text-emerald-400 group-hover:text-emerald-300 group-hover:border-emerald-400/50 group-hover:scale-105 transition-all shadow-inner">
                              <ContentTypeIcon contentType={item.contentType} className="w-6 h-6" />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Card Content */}
                      <div className="p-4 sm:p-5">
                        {/* Header Row: Content Type Badge + Favorite + Date */}
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${badgeStyle}`}
                          >
                            {item.contentType || "OTHER"}
                          </span>
                          <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                            {item.isFavorite && (
                              <StarIcon filled className="w-3.5 h-3.5 text-amber-500" title="Favorite" />
                            )}
                            <time className="text-[11px] font-mono">{formattedDate}</time>
                          </div>
                        </div>

                        {/* Title */}
                        <h2 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors line-clamp-2 leading-snug">
                          {item.title}
                        </h2>

                        {/* Description preview */}
                        {item.description ? (
                          <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                        ) : (
                          <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-600 italic">
                            No summary provided
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Footer Row: Tags & Connection info */}
                    <div className="px-4 sm:px-5 pb-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2 text-xs mt-auto">
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
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0">
                              +{item.tags.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-zinc-400 italic">No tags</span>
                      )}

                      {Boolean(item.connectionCount && item.connectionCount > 0) && (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60">
                          <ConnectionIcon className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>{item.connectionCount}</span>
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

