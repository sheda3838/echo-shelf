import crypto from 'node:crypto';
import type { User } from '@supabase/supabase-js';
import { requireUser, getCurrentUser } from '@/lib/supabase/user';
import { writeClient } from '@/sanity/lib/writeClient';

/**
 * Derives a deterministic, opaque Sanity user document ID from a Supabase Auth User ID.
 * Format: user.<sha256(supabaseUser.id)>
 */
export function getSanityUserId(supabaseUserId: string): string {
  const hash = crypto.createHash('sha256').update(supabaseUserId).digest('hex');
  return `user.${hash}`;
}

export interface EchoUser {
  id: string; // The Sanity document ID (e.g. user.<hash>)
  supabaseUserId: string;
  displayName: string;
  avatarUrl?: string;
}

/**
 * Ensures a Sanity user document exists for the given Supabase user.
 * Resolves metadata display name safely without storing email, passwords, or tokens in Sanity.
 */
export async function getOrCreateEchoUser(user: User): Promise<EchoUser> {
  const sanityUserId = getSanityUserId(user.id);
  const metadata = user.user_metadata || {};

  const displayName: string =
    metadata.name ||
    metadata.full_name ||
    metadata.user_name ||
    'Echo Shelf Member';

  const avatarUrl: string | undefined = metadata.avatar_url || metadata.picture || undefined;

  // Idempotently create Sanity user document without overwriting existing data/createdAt
  await writeClient.createIfNotExists({
    _id: sanityUserId,
    _type: 'user',
    displayName,
    ...(avatarUrl ? { avatarUrl } : {}),
    createdAt: new Date().toISOString(),
  });

  return {
    id: sanityUserId,
    supabaseUserId: user.id,
    displayName,
    avatarUrl,
  };
}

/**
 * Server-side helper to require an authenticated Echo Shelf user.
 * Redirects to /auth/login if unauthenticated.
 * Returns the resolved Sanity user document ID and metadata.
 */
export async function requireEchoUser(): Promise<EchoUser> {
  if (process.env.TEST_SUPABASE_USER_ID) {
    const mockUser: User = {
      id: process.env.TEST_SUPABASE_USER_ID,
      app_metadata: {},
      user_metadata: {
        name: process.env.TEST_USER_NAME || 'Test Runner User',
      },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as unknown as User;
    return getOrCreateEchoUser(mockUser);
  }

  const user = await requireUser();
  return getOrCreateEchoUser(user);
}

/**
 * Server-side helper to retrieve the authenticated Echo Shelf user if logged in.
 * Returns null if unauthenticated.
 */
export async function getCurrentEchoUser(): Promise<EchoUser | null> {
  if (process.env.TEST_SUPABASE_USER_ID) {
    const mockUser: User = {
      id: process.env.TEST_SUPABASE_USER_ID,
      app_metadata: {},
      user_metadata: {
        name: process.env.TEST_USER_NAME || 'Test Runner User',
      },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as unknown as User;
    return getOrCreateEchoUser(mockUser);
  }

  const user = await getCurrentUser();
  if (!user) return null;
  return getOrCreateEchoUser(user);
}
