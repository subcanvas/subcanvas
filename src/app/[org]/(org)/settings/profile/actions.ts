"use server"

import { revalidatePath } from "next/cache"

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
