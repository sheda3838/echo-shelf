import React from "react";
import type { Metadata } from "next";
import { client } from "@/sanity/lib/client";
import LibraryView, { type LibraryItem } from "./library-view";

export const metadata: Metadata = {
  title: "Echo Shelf — Personal Knowledge Library",
  description: "Your saved knowledge, echoed back when it matters.",
};

const LIBRARY_QUERY = `*[_type == "savedItem" && !(_id in path("drafts.**"))] | order(savedAt desc) {
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
}`;

async function getLibraryItems(): Promise<LibraryItem[]> {
  try {
    const items = await client.withConfig({ useCdn: false }).fetch<LibraryItem[]>(LIBRARY_QUERY);
    return items || [];
  } catch (err) {
    console.error("[Library Fetch Error]", err);
    return [];
  }
}

export default async function LibraryPage() {
  const items = await getLibraryItems();

  return <LibraryView items={items} />;
}
