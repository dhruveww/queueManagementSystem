"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client — carries the staff session, subject to RLS. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
