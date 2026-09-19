"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export type CreateOrgState = { error: string } | null

export async function createOrg(
  _prev: CreateOrgState,
  formData: FormData
): Promise<CreateOrgState> {
  const name = String(formData.get("name") ?? "").trim()
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase()

  if (!name) return { error: "Enter a name for your org." }

  const supabase = await createClient()
  const { data: org, error } = await supabase.rpc("create_org", {
    p_name: name,
    p_slug: slug,
  })

  if (error) {
    if (error.code === "23505") return { error: "That URL is taken. Try another." }
    if (error.code === "23514")
      return {
        error:
          "That URL is reserved or invalid. Use up to 40 lowercase letters, numbers, and hyphens.",
      }
    return { error: error.message }
  }

  redirect(`/${org.slug}`)
}
