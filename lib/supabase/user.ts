import { createClient } from "./server";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

/**
 * Retrieves the currently authenticated Supabase user on the server.
 * Uses supabase.auth.getUser() to authenticate the request with the Supabase Auth server.
 * Returns null if the user is unauthenticated or session is invalid.
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user;
  } catch (err) {
    console.error("[getCurrentUser] Error verifying server session:", err);
    return null;
  }
}

/**
 * Requires an authenticated Supabase user for a server component or action.
 * If no valid user session exists, redirects immediately to /auth/login.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }
  return user;
}
