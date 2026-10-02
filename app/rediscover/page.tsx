import React from "react";
import type { Metadata } from "next";
import { client } from "@/sanity/lib/client";
import RediscoverView, { type RediscoveryCardData } from "./rediscover-view";

export const metadata: Metadata = {
  title: "Contextual Rediscovery — Echo Shelf",
  description: "See when today's developments connect with knowledge you've saved before.",
};

import { requireEchoUser } from "@/lib/auth/echoUser";

export const dynamic = "force-dynamic";

const REDISCOVERY_QUERY = `*[_type == "rediscoveryResult" && owner._ref == $ownerId] | order(publishedAt desc) {
  _id,
  articleTitle,
  articleDescription,
  articleUrl,
  articleImageUrl,
  articleSource,
  publishedAt,
  relevance,
  connectionType,
  reason,
  discoveredAt,
  savedItem-> {
    _id,
    title,
    contentType,
    tags
  },
  cluster-> {
    _id,
    title,
    "slug": slug.current
  }
}`;

const CLUSTER_COUNT_QUERY = `count(*[_type == "knowledgeCluster" && owner._ref == $ownerId])`;

async function getRediscoveryData(ownerId: string): Promise<{
  results: RediscoveryCardData[];
  clusterCount: number;
}> {
  try {
    const [results, clusterCount] = await Promise.all([
      client
        .withConfig({ useCdn: false })
        .fetch<RediscoveryCardData[]>(REDISCOVERY_QUERY, { ownerId }),
      client
        .withConfig({ useCdn: false })
        .fetch<number>(CLUSTER_COUNT_QUERY, { ownerId }),
    ]);

    return {
      results: results || [],
      clusterCount: clusterCount || 0,
    };
  } catch (err) {
    console.error("[Rediscovery Fetch Error]", err);
    return {
      results: [],
      clusterCount: 0,
    };
  }
}

export default async function RediscoverPage() {
  const echoUser = await requireEchoUser();
  const { results, clusterCount } = await getRediscoveryData(echoUser.id);
  return (
    <RediscoverView
      initialResults={results}
      clusterCount={clusterCount}
    />
  );
}
