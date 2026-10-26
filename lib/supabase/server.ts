import "server-only";

import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

export async function createSupabaseServerClient() {
  const { userId, orgId, getToken } = await auth();
  if (!userId) throw new Error("A signed in user is required to create a Supabase client.");
  if (!orgId) throw new Error("The Clerk session has no active organization claim.");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = publishableKey || anonKey;
  if (!url) throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL");
  if (!key) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    );
  }

  const token = await getToken();
  if (!token) throw new Error("Clerk did not provide a session token for Supabase.");

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    accessToken: async () => token,
  });
}
