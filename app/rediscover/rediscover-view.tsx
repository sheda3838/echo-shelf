"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NavBar from "../components/nav-bar";
import { triggerRediscoveryAction } from "./rediscover-actions";
import {
  RediscoverIcon,
  ClustersIcon,
  SparklesIcon,
  RadarIcon,
  ExternalLinkIcon,
  CheckIcon,
  InfoIcon,
  WarningIcon,
} from "../components/icons";

export interface RediscoverySavedItemRef {
  _id: string;
  title: string;
  contentType?: string;
  tags?: string[];
}

export interface RediscoveryClusterRef {
  _id: string;
  title: string;
  slug?: string;
}

export interface RediscoveryCardData {
  _id: string;
  articleTitle: string;
  articleDescription?: string;
  articleUrl: string;
  articleImageUrl?: string;
  articleSource?: string;
  publishedAt: string;
  relevance: "strong" | "moderate";
  connectionType: string;
  reason: string;
  discoveredAt: string;
  savedItem?: RediscoverySavedItemRef;
  cluster?: RediscoveryClusterRef;
}

interface RediscoverViewProps {
  initialResults: RediscoveryCardData[];
  clusterCount: number;
}

function formatDate(dateString?: string): string {
  if (!dateString) return "";
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

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return "";
  try {
    const d = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    return formatDate(dateString);
  } catch {
    return dateString;
  }
}

function formatConnectionTypeLabel(type?: string): string {
  if (!type) return "Related development";
  return type
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function RediscoverView({
  initialResults,
  clusterCount,
}: RediscoverViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "success" | "info" | "error";
    message: string;
  } | null>(null);

  const hasResults = initialResults && initialResults.length > 0;
  const hasClusters = clusterCount > 0;

  async function handleCheckNews() {
    if (isPending) return;
    setFeedback(null);

    startTransition(async () => {
      const res = await triggerRediscoveryAction();

      if (res.status === "no_clusters") {
        setFeedback({
          type: "info",
          message: res.message,
        });
      } else if (res.status === "no_news" || res.status === "no_meaningful_matches") {
        setFeedback({
          type: "info",
          message: res.message,
        });
        router.refresh();
      } else if (res.status === "success") {
        setFeedback({
          type: "success",
          message: res.message,
        });
        router.refresh();
      } else {
        setFeedback({
          type: "error",
          message: res.message || "Could not check current news right now.",
        });
      }
    });
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Navigation Bar */}
        <NavBar current="rediscover" />

        {/* Header Section */}
        <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 border border-emerald-300/60 dark:border-emerald-700/60 flex items-center justify-center text-emerald-800 dark:text-emerald-300">
                <RediscoverIcon className="w-4 h-4" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Rediscover
              </h1>
              {hasResults && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {initialResults.length} relevant connection
                  {initialResults.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              See when today&apos;s developments connect with knowledge you&apos;ve saved before.
            </p>
          </div>

          {/* Trigger Button: Check What's Relevant Now / Check Again */}
          <div>
            <button
              type="button"
              onClick={handleCheckNews}
              disabled={isPending}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-colors ${
                isPending
                  ? "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              }`}
            >
              {isPending ? (
                <>
                  <svg
                    className="animate-spin h-3.5 w-3.5 text-white/80"
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
                  <span>Checking what&apos;s happening around your knowledge...</span>
                </>
              ) : hasResults ? (
                <>
                  <RadarIcon className="w-3.5 h-3.5" />
                  <span>Check Again</span>
                </>
              ) : (
                <>
                  <RadarIcon className="w-3.5 h-3.5" />
                  <span>Check What&apos;s Relevant Now</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-4 rounded-xl text-xs font-medium border flex items-center justify-between gap-3 ${
              feedback.type === "success"
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                : feedback.type === "info"
                ? "bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-800"
                : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === "success" ? (
                <CheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : feedback.type === "info" ? (
                <InfoIcon className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
              ) : (
                <WarningIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* State 1: No clusters yet */}
        {!hasClusters && !hasResults ? (
          <div className="p-10 rounded-2xl border border-dashed border-emerald-950/15 dark:border-emerald-500/20 bg-white dark:bg-zinc-900/50 text-center space-y-3 py-14">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shadow-xs">
              <ClustersIcon className="w-7 h-7" />
            </div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
              Generate Knowledge Clusters first so Echo Shelf knows which topics to monitor.
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
              Knowledge Clusters group your saved items into themes that power contextual discovery against current news.
            </p>
            <div className="pt-2">
              <Link
                href="/clusters"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs focus:ring-2 focus:ring-emerald-500 transition-all"
              >
                <span>Go to Clusters</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        ) : hasResults ? (
          /* State 2: Results Display */
          <div className="space-y-6">
            {initialResults.map((item) => {
              const relativeTime = formatRelativeTime(item.publishedAt);
              const connectionLabel = formatConnectionTypeLabel(item.connectionType);

              return (
                <article
                  key={item._id}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-7 shadow-xs space-y-5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                >
                  {/* Top Bar: RELEVANT NOW Badge + Connection Type Badge */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      RELEVANT NOW
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800/80">
                        {item.relevance.toUpperCase()} MATCH
                      </span>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                        {connectionLabel}
                      </span>
                    </div>
                  </div>

                  {/* News Section */}
                  <div className="flex flex-col sm:flex-row gap-4 items-start">
                    {/* Optional News Preview Image */}
                    {item.articleImageUrl && (
                      <div className="w-full sm:w-40 sm:h-28 shrink-0 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800 relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.articleImageUrl}
                          alt={item.articleTitle}
                          className="object-cover w-full h-full"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      </div>
                    )}

                    <div className="space-y-1.5 flex-1 min-w-0">
                      <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white leading-snug">
                        <a
                          href={item.articleUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        >
                          {item.articleTitle}
                        </a>
                      </h2>

                      <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                        <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                          {item.articleSource || "News Source"}
                        </span>
                        {relativeTime && (
                          <>
                            <span>•</span>
                            <time dateTime={item.publishedAt}>{relativeTime}</time>
                          </>
                        )}
                      </div>

                      {item.articleDescription && (
                        <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed pt-1 line-clamp-2">
                          {item.articleDescription}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Why This Matters to Your Shelf Section (Primary emphasis) */}
                  <div className="rounded-xl p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-500/20 dark:border-emerald-500/30 space-y-1.5">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
                      <SparklesIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Why this matters to your shelf</span>
                    </h3>
                    <p className="text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
                      {item.reason}
                    </p>
                  </div>

                  {/* From Your Shelf Section */}
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-zinc-100 dark:border-zinc-800/80">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        From your shelf
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.savedItem ? (
                          <a
                            href={`/item/${item.savedItem._id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          >
                            {item.savedItem.title}
                          </a>
                        ) : (
                          <span className="text-xs text-zinc-400">Saved Item</span>
                        )}

                        {item.cluster && (
                          <>
                            <span className="text-zinc-300 dark:text-zinc-700">•</span>
                            <Link
                              href={`/clusters/${item.cluster._id}`}
                              className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                            >
                              Cluster: {item.cluster.title}
                            </Link>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Action Links */}
                    <div className="flex items-center gap-3 shrink-0 pt-1 sm:pt-0">
                      <a
                        href={item.articleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                      >
                        <span>Read Article</span>
                        <ExternalLinkIcon className="w-3.5 h-3.5" />
                      </a>
                      {item.savedItem && (
                        <a
                          href={`/item/${item.savedItem._id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                        >
                          <span>View Saved Item</span>
                          <ExternalLinkIcon className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          /* State 3: Initial Empty State before any check */
          <div className="p-10 rounded-2xl border border-dashed border-emerald-950/15 dark:border-emerald-500/20 bg-white dark:bg-zinc-900/50 text-center space-y-3 py-16">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shadow-xs">
              <RadarIcon className="w-7 h-7" />
            </div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
              Nothing has been checked yet.
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
              See whether current developments connect with something already on your shelf.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleCheckNews}
                disabled={isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs focus:ring-2 focus:ring-emerald-500 transition-all"
              >
                <RadarIcon className="w-3.5 h-3.5" />
                <span>Check What&apos;s Relevant Now</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
