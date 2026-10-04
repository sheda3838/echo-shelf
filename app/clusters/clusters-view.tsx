"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NavBar from "../components/nav-bar";
import { generateKnowledgeClustersAction } from "./cluster-actions";
import {
  ClustersIcon,
  SparklesIcon,
  CheckIcon,
  InfoIcon,
  WarningIcon,
} from "../components/icons";

export interface ClusterPreviewItem {
  _id: string;
  title: string;
  contentType?: string;
}

export interface KnowledgeClusterRecord {
  _id: string;
  title: string;
  slug?: string;
  summary: string;
  tags?: string[];
  generatedAt: string;
  itemCount: number;
  previewItems: ClusterPreviewItem[];
}

interface ClustersViewProps {
  initialClusters: KnowledgeClusterRecord[];
}

export default function ClustersView({ initialClusters }: ClustersViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "success" | "info" | "error";
    message: string;
  } | null>(null);

  const hasClusters = initialClusters && initialClusters.length > 0;

  async function handleGenerateOrRefresh() {
    if (isPending) return;
    setFeedback(null);

    startTransition(async () => {
      const res = await generateKnowledgeClustersAction();

      if (res.status === "too_few_items") {
        setFeedback({
          type: "info",
          message: res.message || "Add a few more items before generating knowledge clusters.",
        });
      } else if (res.status === "no_meaningful_clusters") {
        setFeedback({
          type: "info",
          message:
            res.message ||
            "No meaningful clusters could be identified yet. Add more varied saved knowledge and try again later.",
        });
        router.refresh();
      } else if (res.status === "success") {
        setFeedback({
          type: "success",
          message: res.message || `Generated ${res.clusterCount || 0} knowledge clusters.`,
        });
        router.refresh();
      } else {
        setFeedback({
          type: "error",
          message: res.message || "Could not generate clusters right now. Please try again.",
        });
      }
    });
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Navigation Bar */}
        <NavBar current="clusters" />

        {/* Knowledge Clusters Header */}
        <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 border border-emerald-300/60 dark:border-emerald-700/60 flex items-center justify-center text-emerald-800 dark:text-emerald-300">
                <ClustersIcon className="w-4 h-4" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Knowledge Clusters
              </h1>
              {hasClusters && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {initialClusters.length} cluster{initialClusters.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Discover themes across your saved knowledge.
            </p>
          </div>

          {/* Action Button: Generate / Refresh Clusters */}
          <div>
            <button
              type="button"
              onClick={handleGenerateOrRefresh}
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
                  <span>Organizing your knowledge...</span>
                </>
              ) : hasClusters ? (
                <>
                  <SparklesIcon className="w-3.5 h-3.5" />
                  <span>Refresh Clusters</span>
                </>
              ) : (
                <>
                  <SparklesIcon className="w-3.5 h-3.5" />
                  <span>Generate Clusters</span>
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

        {/* Content: Clusters Grid or Empty State */}
        {hasClusters ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {initialClusters.map((cluster) => {
              const clusterTarget = cluster._id;

              return (
                <div
                  key={cluster._id}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="space-y-4">
                    {/* Header: Title & Item Count */}
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
                        {cluster.title}
                      </h2>
                      <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                        {cluster.itemCount} item{cluster.itemCount === 1 ? "" : "s"}
                      </span>
                    </div>

                    {/* Summary */}
                    <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-3">
                      {cluster.summary}
                    </p>

                    {/* 3-4 Preview Item Titles */}
                    {cluster.previewItems && cluster.previewItems.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                          Included Items
                        </span>
                        <ul className="space-y-1">
                          {cluster.previewItems.slice(0, 4).map((pi) => (
                            <li
                              key={pi._id}
                              className="text-xs text-zinc-700 dark:text-zinc-300 truncate flex items-center gap-1.5"
                            >
                              <span className="text-zinc-400 text-[10px]">•</span>
                              <span className="truncate">{pi.title}</span>
                            </li>
                          ))}
                          {cluster.itemCount > 4 && (
                            <li className="text-[11px] text-zinc-400 dark:text-zinc-500 italic pl-3">
                              +{cluster.itemCount - 4} more
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Action Link: View Cluster → */}
                  <div className="pt-5 mt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
                    {cluster.tags && cluster.tags.length > 0 ? (
                      <div className="flex items-center gap-1 overflow-hidden truncate max-w-[65%]">
                        {cluster.tags.slice(0, 2).map((tag, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span />
                    )}

                    <Link
                      href={`/clusters/${clusterTarget}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                    >
                      <span>View Cluster</span>
                      <span>→</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty State */
          <div className="p-10 rounded-2xl border border-dashed border-emerald-950/15 dark:border-emerald-500/20 bg-white dark:bg-zinc-900/50 text-center space-y-3 py-16">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shadow-xs">
              <ClustersIcon className="w-7 h-7" />
            </div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
              No knowledge clusters yet.
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
              Generate clusters to discover themes across your saved items.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleGenerateOrRefresh}
                disabled={isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs focus:ring-2 focus:ring-emerald-500 transition-all"
              >
                <SparklesIcon className="w-3.5 h-3.5" />
                <span>Generate Clusters</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
