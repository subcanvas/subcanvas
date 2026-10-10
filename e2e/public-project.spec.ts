import { expect, test } from "@playwright/test"

import { idsOf } from "./support/admin"
import {
  addNode,
  createProject,
  createWhiteboard,
  documentAddress,
  expectSaved,
  freshId,
  nodeLabelled,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"

test("a project made public reads back for a visitor with no account, at the members' own address", async ({
  page,
  browser,
}) => {
  const id = freshId()
  const { slug } = await signUpWithOrg(page)

  const project = `/${slug}/${await createProject(page, "Proj")}`
  await createWhiteboard(page, "Board")
  const nodeTitle = `Alpha ${id}`
  await addNode(page, nodeTitle)
  await expectSaved(page)

  // Going public always asks first, because "public" means the internet.
  await page.getByRole("button", { name: "Share" }).click()
  await page.getByRole("button", { name: "Make public" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Make public" }).click()
  await expect(page.getByText("This project is now public.")).toBeVisible()

  // The link Share offers is the address on screen: members and visitors
  // share addresses. The project's own link is one button away.
  const board = page.url()
  const { origin } = new URL(board)
  expect(new URL(board).pathname).toMatch(documentAddress)
  await page.getByRole("button", { name: "Share" }).click()
  await expect(page.getByLabel("Link to this whiteboard")).toHaveValue(board)
  await expect(page.getByRole("button", { name: "Copy the project's link" })).toBeVisible()

  // A context of its own: no cookies, no session, nothing carried over.
  const visitorContext = await browser.newContext()
  const visitor = await visitorContext.newPage()
  try {
    await visitor.goto(board)
    await expect(visitor.getByText("Public project")).toBeVisible()
    await expect(nodeLabelled(visitor, nodeTitle)).toBeVisible()
    // Offered a way in, which is how a page knows nobody is signed in.
    await expect(visitor.getByRole("link", { name: "Sign in" })).toBeVisible()

    // The project's own address opens the whiteboard at the top of it.
    await visitor.goto(`${origin}${project}`)
    await visitor.waitForURL(board)
    await expect(nodeLabelled(visitor, nodeTitle)).toBeVisible()

    // Read-only, and it says so: no tools, and the badge instead of "Saved".
    await expect(visitor.getByText("View only")).toBeVisible()
    await expect(whiteboardTools(visitor)).toHaveCount(0)
    await expect(visitor.getByLabel("Document title")).toHaveCount(0)

    // An address from before readable ones still leads there.
    const { projectId, documentId } = await idsOf(board)
    await visitor.goto(`${origin}/p/${projectId}/d/${documentId}`)
    await visitor.waitForURL(board)
    await visitor.goto(`${origin}/p/${projectId}`)
    await visitor.waitForURL(board)
  } finally {
    await visitorContext.close()
  }
})

test("a private project is not found by a visitor with no account, who is asked to sign in", async ({
  page,
  browser,
}) => {
  const { account, slug } = await signUpWithOrg(page)
  const project = `/${slug}/${await createProject(page, "Proj")}`
  const { projectId } = await idsOf(project, account)

  const origin = new URL(page.url()).origin
  const visitorContext = await browser.newContext()
  try {
    // Its address asks for a sign-in, and comes back to it after.
    const response = await visitorContext.request.get(`${origin}${project}`)
    expect(new URL(response.url()).pathname).toBe("/login")
    expect(new URL(response.url()).searchParams.get("next")).toBe(project)
    // Its address from before readable ones says nothing at all.
    expect((await visitorContext.request.get(`${origin}/p/${projectId}`)).status()).toBe(404)
  } finally {
    await visitorContext.close()
  }
})
