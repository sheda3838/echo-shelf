import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Sanitizes the `next` redirect parameter to prevent open redirect vulnerabilities.
 * Only relative paths starting with a single '/' are permitted.
 */
function sanitizeNextPath(rawNext: string | null): string {
  if (!rawNext) return "/";
  const trimmed = rawNext.trim();
  // Must start with '/' and not start with '//' (protocol-relative) or contain backslashes
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\")) {
    return trimmed;
  }
  return "/";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { searchParams, origin } = url;

  const code = searchParams.get("code");
  const flowId = searchParams.get("sb_flow_id");
  const errorParam = searchParams.get("error");
  const errorCode = searchParams.get("error_code");
  const errorDescription = searchParams.get("error_description");
  const rawNext = searchParams.get("next");

  const targetNext = sanitizeNextPath(rawNext);

  // Temporary development-only diagnostic logging
  // Strictly logs presence metadata; NEVER logs tokens, secrets, or full codes.
  if (process.env.NODE_ENV === "development") {
    console.log("[Auth Callback Debug]", {
      pathname: url.pathname,
      hasCode: Boolean(code),
      hasError: Boolean(errorParam),
      errorCode: errorCode ?? null,
      errorDescription: errorDescription ?? null,
      hasNext: Boolean(rawNext),
      targetNext,
    });
  }

  // 1. Handle explicit Supabase error query parameters cleanly
  if (errorParam || errorCode || errorDescription) {
    let userMessage = errorDescription || errorParam || "Authentication error occurred.";
    if (errorCode === "otp_expired") {
      userMessage =
        "This email verification link has expired or has already been used. Please sign in or request a new confirmation email.";
    }
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(userMessage)}`);
  }

  // 2. Handle PKCE code exchange (standard email confirmation & Google/GitHub OAuth)
  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined
    );

    if (!exchangeError) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${targetNext}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${targetNext}`);
      } else {
        return NextResponse.redirect(`${origin}${targetNext}`);
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.warn("[Auth Callback] exchangeCodeForSession failed:", exchangeError.message);
    }

    // Check if session was already established or is already active
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      return NextResponse.redirect(`${origin}${targetNext}`);
    }

    // Inspect if error is due to missing PKCE verifier cookie.
    // In email confirmation, Supabase's /auth/v1/verify marks the user's email as confirmed
    // BEFORE redirecting here. If the user clicked the link in an email client or another
    // browser, the original PKCE code verifier cookie may not be present in this browser.
    const isVerifierMissing =
      exchangeError.code === "pkce_code_verifier_not_found" ||
      exchangeError.name === "AuthPKCECodeVerifierMissingError" ||
      exchangeError.message?.toLowerCase().includes("code verifier");

    if (isVerifierMissing) {
      return NextResponse.redirect(`${origin}/auth/login?verified=true`);
    }

    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(exchangeError.message || "auth_callback_failed")}`
    );
  }

  // 3. Fallback when neither code nor error is present (e.g. direct visit or bookmark)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return NextResponse.redirect(`${origin}${targetNext}`);
  }

  return NextResponse.redirect(`${origin}/auth/login`);
}
