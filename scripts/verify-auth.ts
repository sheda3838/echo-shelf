import fs from "fs";
import path from "path";
import assert from "assert";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createBrowserClient, createServerClient } from "@supabase/ssr";

// Load .env.local
const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const [key, ...rest] = trimmed.split("=");
      const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

async function runAuthTests() {
  console.log("===============================================================");
  console.log("🧪 Running Supabase Auth Phase 1 Verification Suite");
  console.log("===============================================================");

  // 1. Verify Environment Variables
  console.log("\n[Test 1] Environment Variables Verification:");
  assert.ok(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL must be configured in .env.local");
  assert.ok(supabaseKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be configured in .env.local");
  assert.ok(supabaseUrl.startsWith("https://"), "Supabase URL must start with https://");
  console.log(`  ✓ Supabase URL: ${supabaseUrl}`);
  console.log(`  ✓ Supabase Publishable Key: ${supabaseKey.slice(0, 16)}...`);

  // 2. Browser Client SSR Cookie Storage Contract
  console.log("\n[Test 2] Browser Client Initialization (@supabase/ssr):");
  const browserClient = createBrowserClient(supabaseUrl, supabaseKey);
  assert.ok(browserClient.auth, "Browser client must have auth module");
  console.log("  ✓ createBrowserClient initialized successfully.");

  // 3. Server Client SSR Cookie Storage Contract
  console.log("\n[Test 3] Server Client Initialization (@supabase/ssr):");
  const mockCookieStore: Record<string, string> = {};
  const serverClient = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return Object.entries(mockCookieStore).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          mockCookieStore[name] = value;
        });
      },
    },
  });
  assert.ok(serverClient.auth, "Server client must have auth module");
  const { data: initialSessionData } = await serverClient.auth.getSession();
  assert.strictEqual(initialSessionData.session, null, "Initial mock session should be null");
  console.log("  ✓ createServerClient with cookie handlers initialized successfully.");

  // 4. Live Supabase Auth Endpoint Reachability
  console.log("\n[Test 4] Supabase Auth API Reachability:");
  const directClient = createSupabaseJsClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
  const { error: healthError } = await directClient.auth.getSession();
  assert.strictEqual(healthError, null, "Connecting to Supabase auth should not return network error");
  console.log("  ✓ Connected to Supabase Auth API successfully.");

  // 5. OAuth Provider URL Generation
  console.log("\n[Test 5] Google and GitHub OAuth URL Generation:");
  const { data: googleOAuth, error: googleErr } = await directClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "http://localhost:3000/auth/callback",
    },
  });
  assert.strictEqual(googleErr, null, "Google OAuth URL generation must succeed");
  assert.ok(googleOAuth.url.includes("provider=google"), "Google OAuth URL must contain provider=google");
  console.log(`  ✓ Google OAuth URL generated: ${googleOAuth.url.slice(0, 75)}...`);

  const { data: githubOAuth, error: githubErr } = await directClient.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: "http://localhost:3000/auth/callback",
    },
  });
  assert.strictEqual(githubErr, null, "GitHub OAuth URL generation must succeed");
  assert.ok(githubOAuth.url.includes("provider=github"), "GitHub OAuth URL must contain provider=github");
  console.log(`  ✓ GitHub OAuth URL generated: ${githubOAuth.url.slice(0, 75)}...`);

  // 6. Route Protection Logic Simulation
  console.log("\n[Test 6] Route Protection Policy Matrix:");
  const protectedRoutes = ["/", "/add", "/item/123", "/clusters", "/clusters/abc", "/rediscover"];
  const publicRoutes = ["/auth/login", "/auth/signup", "/auth/callback", "/studio"];

  function simulateRouteAccess(pathname: string, isAuthenticated: boolean) {
    const isPublicAuthRoute =
      pathname.startsWith("/auth/login") ||
      pathname.startsWith("/auth/signup") ||
      pathname.startsWith("/auth/callback");
    const isStudioRoute = pathname.startsWith("/studio");

    if (isAuthenticated && (pathname.startsWith("/auth/login") || pathname.startsWith("/auth/signup"))) {
      return { action: "redirect", destination: "/" };
    }

    if (!isAuthenticated && !isPublicAuthRoute && !isStudioRoute) {
      return { action: "redirect", destination: "/auth/login" };
    }

    return { action: "allow" };
  }

  // Unauthenticated tests
  for (const route of protectedRoutes) {
    const res = simulateRouteAccess(route, false);
    assert.strictEqual(res.action, "redirect", `Unauthenticated ${route} must redirect`);
    assert.strictEqual(res.destination, "/auth/login", `Unauthenticated ${route} must redirect to /auth/login`);
  }
  for (const route of publicRoutes) {
    const res = simulateRouteAccess(route, false);
    assert.strictEqual(res.action, "allow", `Unauthenticated ${route} must be allowed`);
  }
  console.log("  ✓ Unauthenticated access rules verified (protected routes redirect to /auth/login).");

  // Authenticated tests
  for (const route of ["/auth/login", "/auth/signup"]) {
    const res = simulateRouteAccess(route, true);
    assert.strictEqual(res.action, "redirect", `Authenticated ${route} must redirect`);
    assert.strictEqual(res.destination, "/", `Authenticated ${route} must redirect to /`);
  }
  for (const route of protectedRoutes) {
    const res = simulateRouteAccess(route, true);
    assert.strictEqual(res.action, "allow", `Authenticated ${route} must be allowed`);
  }
  console.log("  ✓ Authenticated access rules verified (login/signup redirect to /; library and features allowed).");

  console.log("\n🎉 ALL SUPABASE AUTH PHASE 1 UNIT & INTEGRATION TESTS PASSED!");
}

runAuthTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
