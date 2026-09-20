import "server-only"

import { createClient } from "@supabase/supabase-js"

import type { Database } from "./database.types"

// A client with no session, whoever is asking: row-level security lets it
// read what is in a public project and nothing else. For responses that are
// the same for everyone and may be cached by anyone, such as embeds, where
// reading with a signed-in member's cookies would leak a private diagram
// into a shared cache.
export function createAnonymousClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
