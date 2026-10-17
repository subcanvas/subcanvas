import { expect, test, type Page } from "@playwright/test"

import { addNode, breadcrumb, clickNode, closePanel, inspector, nodeLabelled, whiteboardTools } from "./support/app"
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
  await whiteboardTools(page).getByRole("button", { name: "Add", exact: true }).click()
  await expect(page.getByRole("menuitem", { name: "Box", exact: true })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "Picture or video" })).toHaveCount(0)
  await page.keyboard.press("Escape")

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

// The note-taking example (lib/playground/example-course.ts), a project of
// its own beside the software one.
test("a visitor opens the course example: notes in the panel, a box set to pop-up, and a box with a whiteboard inside", async ({ page }) => {
  const supabase = watchSupabase(page)
  await page.goto("/try/productivity")

  await expect(nodeLabelled(page, "The brain")).toBeVisible()
  await expect(nodeLabelled(page, "Exam prep")).toBeVisible()

  // The brain's notes open beside the whiteboard.
  await clickNode(page, "The brain")
  await expect(inspector(page)).toContainText("The four lobes")

  // Exam prep is set to open in a pop-up: the panel shows a card for it.
  // (It sits under the open panel, so the panel is closed first.)
  await closePanel(page)
  await clickNode(page, "Exam prep")
  await inspector(page).getByText("A page. Click to open it in a pop-up.").click()
  await expect(page.getByRole("dialog", { name: "Exam prep" })).toContainText("Practice test on Sunday")
  await page.keyboard.press("Escape")

  // Memory is a whiteboard of its own.
  await openInside(page, "Memory")
  await expect(nodeLabelled(page, "Forgetting curve")).toBeVisible()
  await breadcrumb(page).getByRole("link", { name: "Fall semester" }).click()
  await expect(nodeLabelled(page, "The brain")).toBeVisible()

  // The other example is a link away, and kept apart from this one.
  await page.getByRole("link", { name: "See an example system design" }).click()
  await page.waitForURL("/try")
  await expect(nodeLabelled(page, "Web app")).toBeVisible()
  await expect(nodeLabelled(page, "The brain")).toHaveCount(0)

  expect(supabase).toEqual([])
})
