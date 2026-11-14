"use client";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

type TokenGetter = () => Promise<string | null>;
const clients = new WeakMap<TokenGetter, SupabaseClient>();

export function createAuthenticatedBrowserClient(getToken: TokenGetter): SupabaseClient {
  const cached = clients.get(getToken);
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    accessToken: async () => {
      const token = await getToken();
      if (!token) throw new Error("The active Clerk session has no Supabase access token.");
      return token;
    },
  });
  clients.set(getToken, client);
  return client;
}
