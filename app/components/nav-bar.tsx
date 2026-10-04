"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import {
  LibraryIcon,
  ClustersIcon,
  RediscoverIcon,
  PlusIcon,
  LogoutIcon,
} from "./icons";

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
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-emerald-950/10 dark:border-emerald-500/15 pb-5 mb-8 font-sans">
      <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
        <Link
          href="/"
          className="group flex items-center gap-2.5 text-zinc-900 dark:text-white font-bold text-base sm:text-lg hover:opacity-95 transition-opacity"
        >
          <div className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-emerald-500/20 dark:border-emerald-400/30 shadow-xs group-hover:border-emerald-500/50 transition-colors">
            <Image
              src="/logo.png"
              alt="Echo Shelf Logo"
              width={32}
              height={32}
              priority
              className="object-contain w-full h-full"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="tracking-tight bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-700 dark:from-white dark:via-emerald-100 dark:to-emerald-400 bg-clip-text text-transparent font-extrabold">
              Echo Shelf
            </span>
          </div>
        </Link>

        {/* Primary Navigation Links */}
        <nav className="flex items-center gap-1 sm:gap-1.5" aria-label="Main Navigation">
          <Link
            href="/"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              current === "library"
                ? "bg-emerald-100/70 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200 border border-emerald-300/80 dark:border-emerald-700/60 shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-emerald-900 dark:hover:text-emerald-200 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/40"
            }`}
          >
            <LibraryIcon className="w-3.5 h-3.5 opacity-80" />
            <span>Library</span>
          </Link>
          <Link
            href="/clusters"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              current === "clusters"
                ? "bg-emerald-100/70 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200 border border-emerald-300/80 dark:border-emerald-700/60 shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-emerald-900 dark:hover:text-emerald-200 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/40"
            }`}
          >
            <ClustersIcon className="w-3.5 h-3.5 opacity-80" />
            <span>Clusters</span>
          </Link>
          <Link
            href="/rediscover"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              current === "rediscover"
                ? "bg-emerald-100/70 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200 border border-emerald-300/80 dark:border-emerald-700/60 shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-emerald-900 dark:hover:text-emerald-200 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/40"
            }`}
          >
            <RediscoverIcon className="w-3.5 h-3.5 opacity-80" />
            <span>Rediscover</span>
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
        <Link
          href="/add"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs hover:shadow-emerald-900/20 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <span>Add Item</span>
        </Link>

        {user && (
          <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-emerald-950/10 dark:border-emerald-500/20">
            <div
              className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 font-medium"
              title={user.email}
            >
              <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                {(user.user_metadata?.name?.[0] || user.email?.[0] || "U").toUpperCase()}
              </span>
              <span className="hidden md:inline-block max-w-[130px] truncate text-zinc-700 dark:text-zinc-300">
                {displayName}
              </span>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-emerald-800 dark:text-zinc-400 dark:hover:text-emerald-300 px-2 py-1 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors disabled:opacity-50"
            >
              <LogoutIcon className="w-3 h-3 opacity-70" />
              <span>{isSigningOut ? "Signing out..." : "Sign Out"}</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
