import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { client } from "@/sanity/lib/client";
import { urlFor } from "@/sanity/lib/image";
import NavBar from "../../components/nav-bar";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface ClusterItem {
  _id: string;
  title: string;
  description?: string;
  contentType?: string;
  tags?: string[];
  savedAt?: string;
  isFavorite?: boolean;
  image?: {
    asset?: {
      _id: string;
      url?: string;
    };
  };
  connectionCount?: number;
}

interface ClusterDetail {
  _id: string;
  title: string;
  slug?: string;
  summary: string;
  tags?: string[];
  generatedAt?: string;
  items: ClusterItem[];
}

import { requireEchoUser, getCurrentEchoUser } from "@/lib/auth/echoUser";

const CLUSTER_DETAIL_QUERY = `*[_type == "knowledgeCluster" && (_id == $id || slug.current == $id) && owner._ref == $ownerId][0] {
  _id,
  title,
  "slug": slug.current,
  summary,
  tags,
  generatedAt,
  items[]-> {
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
        url
      }
    },
    "connectionCount": count(connections)
  }
}`;

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

function getContentTypeBadgeColor(type?: string): string {
  switch (type?.toLowerCase()) {
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

async function getCluster(id: string, ownerId: string): Promise<ClusterDetail | null> {
  if (!id) return null;
  try {
    const cluster = await client
      .withConfig({ useCdn: false })
      .fetch<ClusterDetail | null>(CLUSTER_DETAIL_QUERY, { id, ownerId });
    return cluster;
  } catch (err) {
    console.error("[Cluster Detail Fetch Error]", err);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const echoUser = await getCurrentEchoUser();
  const cluster = echoUser ? await getCluster(id, echoUser.id) : null;
  if (!cluster) {
    return {
      title: "Cluster Not Found — Echo Shelf",
    };
  }
  return {
    title: `${cluster.title} — Knowledge Cluster | Echo Shelf`,
    description: cluster.summary,
  };
}

export default async function ClusterDetailPage({ params }: PageProps) {
  const { id } = await params;
  const echoUser = await requireEchoUser();
  const cluster = await getCluster(id, echoUser.id);

  if (!cluster) {
    notFound();
  }

  const validItems = (cluster.items || []).filter(Boolean);
  const formattedGeneratedDate = formatDate(cluster.generatedAt);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Navigation Bar */}
        <NavBar current="clusters" />

        {/* Back Link & Header */}
        <div className="space-y-4">
          <Link
            href="/clusters"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <span>←</span> Back to Clusters
          </Link>

          {/* Cluster Detail Banner */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xl">✨</span>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  {cluster.title}
                </h1>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {validItems.length} item{validItems.length === 1 ? "" : "s"}
                </span>
              </div>

              {formattedGeneratedDate && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  Generated {formattedGeneratedDate}
                </span>
              )}
            </div>

            {/* Summary */}
            <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-4xl">
              {cluster.summary}
            </p>

            {/* Tags */}
            {cluster.tags && cluster.tags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {cluster.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Saved Items in Cluster */}
        <section className="space-y-4">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Cluster Items ({validItems.length})
            </h2>
          </div>

          {validItems.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {validItems.map((item) => {
                const itemImageUrl =
                  item.image?.asset?.url || (item.image ? urlFor(item.image).url() : undefined);
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
                          {formattedDate && (
                            <time className="text-[11px] font-mono">{formattedDate}</time>
                          )}
                        </div>
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-2 leading-snug">
                        {item.title}
                      </h3>

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
          ) : (
            <div className="p-8 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 text-center">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                No items are currently linked to this cluster.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
