import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS — only ever import this from server-side
 * code that has already decided the caller is allowed to do what it's doing.
 *
 * The guest join/status flow runs entirely through this client because guests
 * are anonymous: they never get a Supabase session, so their phone numbers are
 * never reachable from a browser.
 */
export function createAdminSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
