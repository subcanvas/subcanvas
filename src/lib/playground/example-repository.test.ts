import { describe, expect, it } from "vitest"

import { drawRepository } from "@/lib/github/import-repository"
import { createMemoryProvider } from "@/lib/github/memory-provider"

import { EXAMPLE_FILES, EXAMPLE_REPOSITORY } from "./example-repository"

describe("the playground's example", () => {
  it("is drawn by the import as the landing page's shop, with nothing to warn about", async () => {
    const drawn = await drawRepository(createMemoryProvider(EXAMPLE_REPOSITORY, EXAMPLE_FILES), EXAMPLE_REPOSITORY, {
      orgId: "o",
      projectId: "p",
      userId: "u",
    })
    expect(drawn.warnings).toEqual([])

    const top = drawn.rows.find((row) => row.id === drawn.topDocumentId)!
    expect(top.title).toBe("acme/shop")
    const inside = (parent: string) =>
      drawn.rows.filter((row) => row.parent_document_id === parent && row.kind === "standard").map((row) => row.title)
    // Payments holds its README; the other three hold whiteboards.
    expect(inside(top.id!)).toEqual(expect.arrayContaining(["Payments", "API", "Ledger", "Web app"]))
    const web = drawn.rows.find((row) => row.title === "Web app")!
    expect(inside(web.id!)).toEqual(expect.arrayContaining(["Storefront", "Checkout", "Sign-in"]))
    const checkout = drawn.rows.find((row) => row.title === "Checkout")!
    expect(inside(checkout.id!)).toEqual(expect.arrayContaining(["Cart", "Shipping address", "Pay button"]))
  })
})
