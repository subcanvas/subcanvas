import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { createAnonymousClient } from "@/lib/supabase/anonymous"
import type { Database } from "@/lib/supabase/database.types"

// Who is calling the MCP server. Supabase Auth is the OAuth 2.1
// authorization server (docs/MCP.md), and the access tokens it issues to an
// MCP client are ordinary user JWTs. So the caller is a person, and
// everything they do goes through a Supabase client that carries their
// token: row-level security decides what it may read and write, exactly as
// it does for their browser. There is no secret key here.

export type Caller = {
  userId: string
  token: string
  // The OAuth client the token was issued to. Absent on a token from an
  // ordinary sign-in, which has the same rights and is accepted too.
  clientId: string | null
  expiresAt: number | undefined
}

const issuer = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/auth/v1`

// One client checks every token, so the project's signing keys are fetched
// once per server instance and not once per request. It holds no session.
let verifier: ReturnType<typeof createAnonymousClient> | undefined

// Where Supabase Auth publishes its OAuth metadata (RFC 8414).
export const authorizationServer = issuer

export function bearerToken(request: Request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")
  return match ? match[1] : null
}

// Verifies a token and returns the caller, or null for anything that is not
// a current token of a signed-in person from this deployment's Supabase
// project. The signature is checked against the project's published keys;
// a project still on a shared signing secret is asked instead, since this
// server does not hold that secret.
export async function identify(token: string): Promise<Caller | null> {
  verifier ??= createAnonymousClient()
  const { data, error } = await verifier.auth.getClaims(token)
  if (error || !data) return null

  const { claims } = data
  // An anonymous key is a JWT too, with role "anon" and no subject.
  if (claims.role !== "authenticated" || !claims.sub) return null
  // Supabase Auth does not bind a token to one resource (RFC 8707), so the
  // audience cannot name this server. What can be checked is that the token
  // was issued by this project, for its signed-in users.
  if (claims.iss !== issuer()) return null
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!audience.includes("authenticated")) return null

  return {
    userId: claims.sub,
    token,
    clientId: typeof claims.client_id === "string" ? claims.client_id : null,
    expiresAt: claims.exp,
  }
}

// A client that sends the caller's token with every request and keeps no
// session of its own.
export function createUserClient(token: string): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      accessToken: async () => token,
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}
