import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function createSupabaseClient() {
  const SUPABASE_URL =
    (typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_URL : undefined) ||
    process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY =
    (typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_ANON_KEY : undefined) ||
    process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL / VITE_SUPABASE_URL"] : []),
      ...(!SUPABASE_ANON_KEY ? ["SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY"] : []),
    ];
    throw new Error(
      `Missing Supabase env variable(s): ${missing.join(", ")}. Check your .env file.`,
    );
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
