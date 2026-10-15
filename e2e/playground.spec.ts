import { expect, test, type Page } from "@playwright/test"

import { addNode, breadcrumb, clickNode, inspector, nodeLabelled, whiteboardTools } from "./support/app"
import { openInside } from "./support/canvas"

// The playground (app/try): the real whiteboard and pages with no account,
// kept in the visitor's browser (lib/playground), opening on the example
// the import draws from lib/playground/example-repository.ts.

// Every request the browser makes to Supabase. The playground makes none.
function watchSupabase(page: Page) {
  const calls: string[] = []
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"
  page.on("request", (request) => {
    if (request.url().startsWith(supabase)) calls.push(request.url())
  })
  return calls
}

test("a visitor tries it from the landing page: goes inside a box and reads what another holds", async ({ page }) => {
  const supabase = watchSupabase(page)
  await page.goto("/")
  await page.getByRole("link", { name: "Try it without an account" }).click()
  await page.waitForURL("/try")

  await expect(nodeLabelled(page, "Payments")).toBeVisible()
  await expect(nodeLabelled(page, "Ledger")).toBeVisible()
  // Nothing here keeps pictures or videos.
  await expect(whiteboardTools(page).getByRole("button", { name: "Media" })).toHaveCount(0)

  await openInside(page, "Web app")
  await expect(breadcrumb(page)).toContainText("Web app")
  await expect(nodeLabelled(page, "Checkout")).toBeVisible()

  // A box's README is a page in the panel, there to edit.
  await clickNode(page, "Storefront")
  await expect(inspector(page)).toContainText("Product pages and search.")
  await expect(inspector(page).getByRole("button", { name: "Detach" })).toHaveCount(0)

  // Two levels down, and back out along the trail.
  await openInside(page, "Checkout")
  await expect(nodeLabelled(page, "Pay button")).toBeVisible()
  await breadcrumb(page).getByRole("link", { name: "acme/shop" }).click()
  await expect(nodeLabelled(page, "Web app")).toBeVisible()

  expect(supabase).toEqual([])
})

test("what a visitor adds is still there after a reload, until they start over", async ({ page }) => {
  await page.goto("/try")
  await expect(nodeLabelled(page, "Payments")).toBeVisible()

  await addNode(page, "Search")
  const panel = inspector(page)
  await panel.getByRole("button", { name: "New whiteboard inside" }).click()
  await expect(panel.getByText("A whiteboard. Click to go inside.")).toBeVisible()

  await page.reload()
  await expect(nodeLabelled(page, "Search")).toBeVisible()
  await openInside(page, "Search")
  await expect(page.getByText("Nothing here yet")).toBeVisible()

  await page.getByRole("button", { name: "Start over" }).click()
  await page.getByRole("button", { name: "Delete and start over" }).click()
  await page.waitForURL("/try")
  await expect(nodeLabelled(page, "Payments")).toBeVisible()
  await expect(nodeLabelled(page, "Search")).toHaveCount(0)
})
