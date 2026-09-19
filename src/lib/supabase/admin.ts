import "server-only"

import { createClient } from "@supabase/supabase-js"

import type { Database } from "./database.types"

// Bypasses row-level security. Only for trusted server code acting for the
// system rather than a person: the Stripe webhook and seat sync.
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set.")
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
