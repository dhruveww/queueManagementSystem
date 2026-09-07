import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** Server client bound to the staff session cookie. RLS applies. */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component render — middleware refreshes instead.
          }
        },
      },
    },
  );
}
