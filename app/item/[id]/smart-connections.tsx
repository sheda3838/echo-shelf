"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateItemConnectionsAction } from "./connection-actions";
import {
  SparklesIcon,
  ExternalLinkIcon,
  ConnectionIcon,
  InfoIcon,
  CheckIcon,
  WarningIcon,
  getContentTypeBadgeColor,
} from "@/app/components/icons";

export interface ConnectedItem {
  _id: string;
  title: string;
  contentType?: string;
  tags?: string[];
}

export interface ConnectionRecord {
  _key?: string;
  strength?: "strong" | "moderate" | "weak";
  relationshipType?: string;
  explanation?: string;
  item?: ConnectedItem;
}

interface SmartConnectionsProps {
  itemId: string;
  initialConnections: ConnectionRecord[];
}

function getStrengthBadge(strength?: string) {
  switch (strength?.toLowerCase()) {
    case "strong":
      return {
        label: "STRONG CONNECTION",
        classes:
          "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
      };
    case "moderate":
      return {
        label: "MODERATE CONNECTION",
        classes:
          "bg-teal-50 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300 border-teal-200 dark:border-teal-800",
      };
    case "weak":
      return {
        label: "WEAK CONNECTION",
        classes:
          "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
      };
    default:
      return {
        label: `${(strength || "RELATED").toUpperCase()} CONNECTION`,
        classes:
          "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
      };
  }
}

function formatRelationshipLabel(value?: string): string {
  if (!value) return "Related concept";
  const knownLabels: Record<string, string> = {
    prerequisite: "Foundational concept",
    extends: "Builds on this",
    complementary: "Complements this",
    "conceptual-overlap": "Shares core concepts",
    "practical-application": "Practical application",
    "related-concept": "Related concept",
    contrast: "Different perspective",
    "alternative-approach": "Alternative approach",
    "implementation-detail": "Implementation detail",
  };

  const normalized = value.toLowerCase().trim().replace(/_/g, "-");

  return (
    knownLabels[normalized] ??
    value
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

export default function SmartConnections({
  itemId,
  initialConnections,
}: SmartConnectionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "success" | "info" | "error";
    message: string;
  } | null>(null);

  const hasConnections = initialConnections && initialConnections.length > 0;

  async function handleGenerateOrRefresh() {
    if (isPending) return;
    setFeedback(null);

    startTransition(async () => {
      const res = await generateItemConnectionsAction(itemId);

      if (res.status === "no_candidates") {
        setFeedback({
          type: "info",
          message: res.message || "No related saved items were found yet.",
        });
      } else if (res.status === "no_meaningful_connections") {
        setFeedback({
          type: "info",
          message: res.message || "No meaningful Smart Connections were found.",
        });
        router.refresh();
      } else if (res.status === "success") {
        setFeedback({
          type: "success",
          message: res.message || "Smart Connections updated.",
        });
        router.refresh();
      } else {
        setFeedback({
          type: "error",
          message: res.message || "Could not generate connections right now. Please try again.",
        });
      }
    });
  }

  return (
    <section className="border-t border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Smart Connections
            </h2>
            {hasConnections && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {initialConnections.length} connection{initialConnections.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          {hasConnections && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {initialConnections.length} meaningful connection
              {initialConnections.length > 1 ? "s" : ""} found.
            </p>
          )}
        </div>

        {/* Trigger Button */}
        <div>
          <button
            type="button"
            onClick={handleGenerateOrRefresh}
            disabled={isPending}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors ${
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
                <span>Finding meaningful connections...</span>
              </>
            ) : hasConnections ? (
              <>
                <SparklesIcon className="w-3.5 h-3.5" />
                <span>Refresh Connections</span>
              </>
            ) : (
              <>
                <SparklesIcon className="w-3.5 h-3.5" />
                <span>Generate Connections</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs font-medium border flex items-center justify-between gap-2 ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80"
              : feedback.type === "info"
              ? "bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-800/80"
              : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800/80"
          }`}
        >
          <div className="flex items-center gap-1.5">
            {feedback.type === "success" ? (
              <CheckIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : feedback.type === "info" ? (
              <InfoIcon className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
            ) : (
              <WarningIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
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

      {/* Compact Relationship Blocks (No heavy standalone cards, separated by subtle divider lines) */}
      {hasConnections ? (
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {initialConnections.map((conn, idx) => {
            const connectedItem = conn.item;
            const strengthBadge = getStrengthBadge(conn.strength);
            const contentTypeBadgeClass = getContentTypeBadgeColor(
              connectedItem?.contentType
            );

            return (
              <div
                key={conn._key || idx}
                className={`space-y-3 ${idx === 0 ? "pb-6" : "py-6"}`}
              >
                {/* Top Row: Connected Item Content Type + Connection Strength */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${contentTypeBadgeClass}`}
                  >
                    {(connectedItem?.contentType || "note").toUpperCase()}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${strengthBadge.classes}`}
                  >
                    {strengthBadge.label}
                  </span>
                </div>

                {/* Connected Item Title */}
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
                  {connectedItem?._id ? (
                    <a
                      href={`/item/${connectedItem._id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors inline-block"
                    >
                      {connectedItem.title}
                    </a>
                  ) : (
                    connectedItem?.title || "Connected Knowledge Item"
                  )}
                </h3>

                {/* Why this is connected Explanation */}
                {conn.explanation && (
                  <div className="space-y-1">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Why this is connected
                    </h4>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                      {conn.explanation}
                    </p>
                  </div>
                )}

                {/* Human-readable Relationship Label */}
                {conn.relationshipType && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="text-zinc-400 dark:text-zinc-500 font-medium">
                      Relationship:
                    </span>{" "}
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {formatRelationshipLabel(conn.relationshipType)}
                    </span>
                  </p>
                )}

                {/* Action Link: View Connected Item (Opens in new tab) */}
                {connectedItem?._id && (
                  <div className="pt-1">
                    <a
                      href={`/item/${connectedItem._id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                    >
                      <span>View Connected Item</span>
                      <ExternalLinkIcon className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-8 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 text-center space-y-3">
          <div className="w-10 h-10 mx-auto rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-300">
            <ConnectionIcon className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            No connections generated yet.
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-md mx-auto leading-relaxed">
            Click &quot;Generate Connections&quot; to analyze and link this item with related knowledge in your library.
          </p>
        </div>
      )}
    </section>
  );
}
