"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface NavBarProps {
  current?: "library" | "clusters" | "rediscover" | "add" | "item";
  initialUser?: User | null;
}

export default function NavBar({ current, initialUser }: NavBarProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(initialUser ?? null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // Fetch initial user if not supplied
    if (!initialUser) {
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          setUser(data.user);
        }
      });
    }

    // Subscribe to auth state changes to stay in sync
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [initialUser]);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      setUser(null);
      router.push("/auth/login");
      router.refresh();
    } catch (err) {
      console.error("[NavBar] Failed to sign out:", err);
    } finally {
      setIsSigningOut(false);
    }
  }

  const displayName =
    user?.user_metadata?.name || user?.email?.split("@")[0] || user?.email || "";

  return (
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5 mb-8 font-sans">
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
          <Link
            href="/rediscover"
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              current === "rediscover"
                ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
            }`}
          >
            Rediscover
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
        <Link
          href="/add"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shadow-xs transition-colors"
        >
          <span>+ Add Item</span>
        </Link>

        {user && (
          <div className="flex items-center gap-2 pl-1 sm:pl-3 border-l border-zinc-200 dark:border-zinc-800">
            <div
              className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 font-medium"
              title={user.email}
            >
              <span className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-700 dark:text-zinc-300 shrink-0">
                {(user.user_metadata?.name?.[0] || user.email?.[0] || "U").toUpperCase()}
              </span>
              <span className="hidden md:inline-block max-w-[130px] truncate">
                {displayName}
              </span>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white px-2 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors disabled:opacity-50"
            >
              {isSigningOut ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
