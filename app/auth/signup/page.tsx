"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { WarningIcon, MailIcon, EyeIcon, EyeOffIcon } from "@/app/components/icons";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState<"google" | "github" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirmationRequired, setIsConfirmationRequired] = useState(false);

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setErrorMessage("Please enter your name.");
      return;
    }

    if (!trimmedEmail) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            name: trimmedName,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
        },
      });

      if (error) {
        if (error.message.includes("User already registered") || error.status === 422) {
          setErrorMessage("An account with this email already exists. Try signing in.");
        } else {
          setErrorMessage(error.message || "Failed to create account. Please try again.");
        }
        return;
      }

      // Check whether email confirmation is required by Supabase project
      if (data.user && !data.session) {
        setIsConfirmationRequired(true);
      } else if (data.session) {
        // Confirmation is disabled; user logged in immediately
        router.push("/");
        router.refresh();
      }
    } catch {
      setErrorMessage("A network error occurred. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "github") {
    setErrorMessage(null);
    setIsOAuthLoading(provider);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setErrorMessage(error.message || `Unable to authenticate with ${provider}.`);
        setIsOAuthLoading(null);
      }
    } catch {
      setErrorMessage("Unable to initiate social login. Please try again.");
      setIsOAuthLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950/5 via-zinc-50 to-zinc-50 dark:from-emerald-950/20 dark:via-zinc-950 dark:to-zinc-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link
            href="/"
            className="inline-flex flex-col items-center gap-2 group"
          >
            <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-emerald-500/30 shadow-md group-hover:border-emerald-500/60 transition-colors">
              <Image
                src="/logo.png"
                alt="Echo Shelf"
                width={48}
                height={48}
                priority
                className="object-contain w-full h-full"
              />
            </div>
            <span className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-700 dark:from-white dark:via-emerald-100 dark:to-emerald-400 bg-clip-text text-transparent">
              Echo Shelf
            </span>
          </Link>
          <h1 className="mt-3 text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Create your account
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
            Start building a knowledge shelf that connects ideas over time.
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-emerald-950/10 dark:border-emerald-500/15 rounded-2xl p-6 sm:p-8 shadow-sm">
          {isConfirmationRequired ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-300">
                <MailIcon className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">
                Check your email
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed">
                We sent a confirmation link to <span className="font-semibold text-emerald-800 dark:text-emerald-300">{email}</span>. Please click the link to activate your account.
              </p>
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-semibold bg-emerald-700 hover:bg-emerald-800 text-white transition-colors shadow-xs"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              {errorMessage && (
                <div
                  role="alert"
                  className="mb-5 p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/90 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 text-xs sm:text-sm flex items-start gap-2.5"
                >
                  <WarningIcon className="shrink-0 w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSignUp} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="name"
                    className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
                  >
                    Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ada Lovelace"
                    disabled={isLoading || isOAuthLoading !== null}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600 transition-colors disabled:opacity-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ada@example.com"
                    disabled={isLoading || isOAuthLoading !== null}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600 transition-colors disabled:opacity-50"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="password"
                      className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
                    >
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
                    >
                      {showPassword ? (
                        <>
                          <EyeOffIcon className="w-3 h-3" />
                          <span>Hide</span>
                        </>
                      ) : (
                        <>
                          <EyeIcon className="w-3 h-3" />
                          <span>Show</span>
                        </>
                      )}
                    </button>
                  </div>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={isLoading || isOAuthLoading !== null}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600 transition-colors disabled:opacity-50"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Must be at least 6 characters.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || isOAuthLoading !== null}
                  className="w-full mt-2 py-2.5 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-semibold text-sm shadow-xs hover:shadow-emerald-900/20 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-emerald-100" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <span>Create Account</span>
                  )}
                </button>
              </form>

              {/* Social Login Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white dark:bg-zinc-900 px-3 text-zinc-400 font-medium">
                    OR
                  </span>
                </div>
              </div>

              {/* OAuth Buttons */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => handleOAuth("google")}
                  disabled={isLoading || isOAuthLoading !== null}
                  className="w-full py-2.5 px-4 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-emerald-50/50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 font-medium text-xs sm:text-sm transition-colors flex items-center justify-center gap-2.5 disabled:opacity-50"
                >
                  {isOAuthLoading === "google" ? (
                    <span className="text-xs text-zinc-500">Connecting to Google...</span>
                  ) : (
                    <>
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.87c2.26-2.09 3.67-5.17 3.67-9.15z" />
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3.05c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.27v3.15C3.25 21.31 7.31 24 12 24z" />
                        <path fill="#FBBC05" d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.27C.46 8.23 0 10.06 0 12s.46 3.77 1.27 5.39l4-3.15z" />
                        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.69 1.27 6.61l4 3.15c.95-2.85 3.6-4.96 6.73-4.96z" />
                      </svg>
                      <span>Continue with Google</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleOAuth("github")}
                  disabled={isLoading || isOAuthLoading !== null}
                  className="w-full py-2.5 px-4 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-emerald-50/50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 font-medium text-xs sm:text-sm transition-colors flex items-center justify-center gap-2.5 disabled:opacity-50"
                >
                  {isOAuthLoading === "github" ? (
                    <span className="text-xs text-zinc-500">Connecting to GitHub...</span>
                  ) : (
                    <>
                      <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
                        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                      </svg>
                      <span>Continue with GitHub</span>
                    </>
                  )}
                </button>
              </div>

              {/* Switch to Login Link */}
              <div className="mt-6 text-center text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                Already have an account?{" "}
                <Link
                  href="/auth/login"
                  className="font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 underline underline-offset-2 transition-colors"
                >
                  Sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

