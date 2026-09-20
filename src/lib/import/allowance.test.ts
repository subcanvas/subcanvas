import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

import { NOT_ALLOWED } from "@/lib/documents/operations"
import type { Database } from "@/lib/supabase/database.types"

import { checkImportAllowance } from "./write"

// Just enough of a Supabase client for the three reads the check makes.
function client({
  role,
  visibility = "private",
  paid = false,
  used = 0,
  limit = 100 as number | null,
}: {
  role: string | null
  visibility?: "private" | "public"
  paid?: boolean
  used?: number
  limit?: number | null
}) {
  const rows: Record<string, unknown> = {
    org_members: role ? { role } : null,
    projects: { visibility },
  }
  const query = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      single: async () => ({ data: rows[table] }),
      maybeSingle: async () => ({ data: rows[table] }),
    }
    return chain
  }
  return {
    from: query,
    rpc: async () => ({
      data: [{ paid, locked: false, private_documents: used, private_document_limit: limit }],
    }),
  } as unknown as SupabaseClient<Database>
}

const project = { orgId: "org", projectId: "project" }

describe("the allowance check before an import", () => {
  it("turns away viewers and people who are not members", async () => {
    expect(await checkImportAllowance(client({ role: "viewer" }), "user", project, 1)).toBe(NOT_ALLOWED)
    expect(await checkImportAllowance(client({ role: null }), "user", project, 1)).toBe(NOT_ALLOWED)
  })

  it("lets a free org fill its allowance exactly, and refuses one more with the numbers", async () => {
    expect(await checkImportAllowance(client({ role: "editor", used: 90 }), "user", project, 10)).toEqual({ ok: true })
    expect(await checkImportAllowance(client({ role: "editor", used: 90 }), "user", project, 11)).toEqual({
      error:
        "This import is 11 documents, and the free plan has room for 10 more private ones. Upgrade, make the project public, or import fewer files.",
      limit: true,
    })
  })

  it("does not limit public projects, paid orgs, or servers without a limit", async () => {
    const full = { role: "editor", used: 100 }
    expect(await checkImportAllowance(client({ ...full, visibility: "public" }), "user", project, 500)).toEqual({ ok: true })
    expect(await checkImportAllowance(client({ ...full, paid: true }), "user", project, 500)).toEqual({ ok: true })
    expect(await checkImportAllowance(client({ ...full, limit: null }), "user", project, 500)).toEqual({ ok: true })
  })
})
