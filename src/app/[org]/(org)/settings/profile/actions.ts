"use server"

import { revalidatePath } from "next/cache"

import { removeMedia } from "@/lib/documents/media-cleanup"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

import { PICTURE_PROVIDERS, providerPicture, type PictureProvider } from "./identities"

// A person edits only their own profile. RLS enforces that and a trigger
// checks the values, so the checks here only make the errors readable.

export type ActionResult = { error: string } | { ok: true }

type Session = NonNullable<Awaited<ReturnType<typeof session>>>

async function session() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ? { supabase, user } : null
}

const NOT_SIGNED_IN = { error: "Sign in again to do that." }

async function saveProfile(
  { supabase, user }: Session,
  fields: { display_name: string | null } | { avatar_url: string | null }
): Promise<ActionResult> {
  const { error } = await supabase.from("profiles").update(fields).eq("id", user.id)
  if (error) return { error: error.message }

  // The name and picture are in the sidebar of every page.
  revalidatePath("/[org]", "layout")
  return { ok: true }
}

export async function updateDisplayName(name: string): Promise<ActionResult> {
  const current = await session()
  if (!current) return NOT_SIGNED_IN

  const trimmed = name.trim()
  if (trimmed.length > 80) return { error: "A display name is 80 characters at most." }
  // Empty means "show my email instead".
  return saveProfile(current, { display_name: trimmed || null })
}

export async function updatePicture(url: string | null): Promise<ActionResult> {
  const current = await session()
  if (!current) return NOT_SIGNED_IN
  if (url === null) return saveProfile(current, { avatar_url: null })

  const trimmed = url.trim()
  if (!URL.canParse(trimmed) || new URL(trimmed).protocol !== "https:" || trimmed.length > 2048)
    return { error: "Enter the address of a picture, starting with https://." }
  return saveProfile(current, { avatar_url: trimmed })
}

// Takes the picture from the person's own Google or GitHub identity, read
// here rather than sent by the browser.
export async function adoptProviderPicture(provider: PictureProvider): Promise<ActionResult> {
  const current = await session()
  if (!current) return NOT_SIGNED_IN
  if (!PICTURE_PROVIDERS.includes(provider)) return { error: "Unknown provider." }

  const picture = providerPicture(current.user.identities ?? [], provider)
  if (!picture) return { error: "That account has no picture to use." }
  return saveProfile(current, { avatar_url: picture })
}

// An agent the person approved on the consent page, disconnected: its consent
// is withdrawn, its sessions and refresh tokens are gone, and the MCP server
// refuses the token it holds from its next request (lib/mcp/auth.ts). To
// come back it has to be approved again.
export async function revokeAgent(clientId: string): Promise<ActionResult> {
  const current = await session()
  if (!current) return NOT_SIGNED_IN

  const { error } = await current.supabase.auth.oauth.revokeGrant({ clientId })
  if (error) return { error: error.message }
  revalidatePath("/[org]/settings/profile", "page")
  return { ok: true }
}

// Deletes the signed-in person's account, what Terms and Privacy promise:
// their personal workspace and every team workspace nobody else is in, with
// everything in them, then the account itself. Team workspaces other people
// are in stay, with what the person made there.
//
// The database does it in one transaction (public.delete_account), which
// only the server's secret key may call, so that a leaked token is not
// enough; this action is what checks that the person asking is the account
// and meant it. It refuses, with nothing changed, when the person is the
// only owner of a workspace that has other members, or a workspace it would
// delete has a running subscription. `confirmation` is the account's email
// as the person typed it.
//
// Storage keeps its files apart from the rows, so the pictures and videos of
// the deleted workspaces are removed afterwards: if that fails, what is left
// is files nobody can reach (docs/DEPLOYMENT.md lists them), not an account
// that is half there.
export async function deleteAccount(confirmation: string): Promise<ActionResult> {
  const current = await session()
  if (!current) return NOT_SIGNED_IN
  const email = current.user.email ?? ""
  if (!email || confirmation.trim().toLowerCase() !== email.toLowerCase())
    return { error: "That is not your account's email." }
  if (!process.env.SUPABASE_SECRET_KEY) return { error: "This server cannot delete accounts. Ask whoever runs it." }

  const admin = createAdminClient()
  const { data: files, error } = await admin.rpc("delete_account", { p_user_id: current.user.id })
  if (error) {
    // The refusals are written for the person reading them.
    if (error.code === "P0001") return { error: error.message }
    console.error("Deleting an account failed", error)
    return { error: "Your account could not be deleted. Nothing was changed. Try again in a moment." }
  }

  try {
    await removeMedia(admin, files ?? [])
  } catch (failure) {
    console.error("Removing a deleted account's files failed", failure)
  }
  // The account is gone, so Auth has no session to end: this clears the
  // cookies that held it.
  await current.supabase.auth.signOut({ scope: "local" })
  return { ok: true }
}
