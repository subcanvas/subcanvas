"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export type FormState = { error: string } | null

export async function createProject(
  slug: string,
  orgId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim()
  if (!name) return { error: "Enter a project name." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ org_id: orgId, name, created_by: user?.id })
    .select("id")
    .single()

  if (error)
    return {
      error:
        error.code === "42501"
          ? "You do not have permission to create projects."
          : error.message,
    }

  redirect(`/${slug}/${project.id}`)
}
