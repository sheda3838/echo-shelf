import React from "react";
import type { Metadata } from "next";
import { client } from "@/sanity/lib/client";
import { requireEchoUser } from "@/lib/auth/echoUser";
import ClustersView, { type KnowledgeClusterRecord } from "./clusters-view";

export const metadata: Metadata = {
  title: "Knowledge Clusters — Echo Shelf",
  description: "Thematic clusters discovered across your saved personal knowledge.",
};

export const dynamic = "force-dynamic";

const CLUSTERS_QUERY = `*[_type == "knowledgeCluster" && owner._ref == $ownerId] | order(generatedAt desc) {
  _id,
  title,
  "slug": slug.current,
  summary,
  tags,
  generatedAt,
  "itemCount": count(items),
  "previewItems": items[0...4]-> {
    _id,
    title,
    contentType
  }
}`;

async function getClusters(ownerId: string): Promise<KnowledgeClusterRecord[]> {
  try {
    const data = await client
      .withConfig({ useCdn: false })
      .fetch<KnowledgeClusterRecord[]>(CLUSTERS_QUERY, { ownerId });
    return data || [];
  } catch (err) {
    console.error("[Clusters Fetch Error]", err);
    return [];
  }
}

export default async function ClustersPage() {
  const echoUser = await requireEchoUser();
  const clusters = await getClusters(echoUser.id);
  return <ClustersView initialClusters={clusters} />;
}
