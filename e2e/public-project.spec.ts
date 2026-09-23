import { expect, test } from "@playwright/test"

import {
  addNode,
  createProject,
  createWhiteboard,
  expectSaved,
  freshId,
  nodeLabelled,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"

test("a project made public reads back for a visitor with no account", async ({ page, browser }) => {
  const id = freshId()
  await signUpWithOrg(page)

  const projectId = await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  const nodeTitle = `Alpha ${id}`
  await addNode(page, nodeTitle)
  await expectSaved(page)

  // Going public always asks first, because "public" means the internet.
  await page.getByRole("button", { name: "Share" }).click()
  await page.getByRole("button", { name: "Make public" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Make public" }).click()
  await expect(page.getByText("This project is now public.")).toBeVisible()

  // A context of its own: no cookies, no session, nothing carried over.
  const origin = new URL(page.url()).origin
  const visitorContext = await browser.newContext()
  const visitor = await visitorContext.newPage()
  try {
    await visitor.goto(`${origin}/p/${projectId}`)
    await expect(visitor.getByText("Public project")).toBeVisible()
    // Offered a way in, which is how a page knows nobody is signed in.
    await expect(visitor.getByRole("link", { name: "Sign in" })).toBeVisible()

    await visitor.getByRole("link", { name: "Board" }).click()
    await expect(nodeLabelled(visitor, nodeTitle)).toBeVisible()

    // Read-only, and it says so: no tools, and the badge instead of "Saved".
    await expect(visitor.getByText("View only")).toBeVisible()
    await expect(whiteboardTools(visitor)).toHaveCount(0)
    await expect(visitor.getByLabel("Document title")).toHaveCount(0)
  } finally {
    await visitorContext.close()
  }
})

test("a private project is not found by a visitor with no account", async ({ page, browser }) => {
  await signUpWithOrg(page)
  const projectId = await createProject(page, "Proj")

  const origin = new URL(page.url()).origin
  const visitorContext = await browser.newContext()
  try {
    const response = await visitorContext.request.get(`${origin}/p/${projectId}`)
    expect(response.status()).toBe(404)
  } finally {
    await visitorContext.close()
  }
})
