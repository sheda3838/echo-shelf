import React from "react";
import Link from "next/link";

interface NavBarProps {
  current?: "library" | "clusters" | "add" | "item";
}

export default function NavBar({ current }: NavBarProps) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5 mb-8">
      <div className="flex items-center gap-5 sm:gap-6 flex-wrap">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-zinc-900 dark:text-white font-bold text-lg hover:opacity-90 transition-opacity"
        >
          <span className="text-xl">📚</span>
          <span>Echo Shelf</span>
        </Link>

        {/* Primary Navigation Links */}
        <nav className="flex items-center gap-1 sm:gap-1.5">
          <Link
            href="/"
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              current === "library"
                ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
            }`}
          >
            Library
          </Link>
          <Link
            href="/clusters"
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              current === "clusters"
                ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
            }`}
          >
            Clusters
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/add"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shadow-xs transition-colors"
        >
          <span>+ Add Item</span>
        </Link>
      </div>
    </header>
  );
}
