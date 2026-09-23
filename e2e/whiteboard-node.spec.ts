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

test("a node added to a whiteboard is still there after a reload", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  const nodeTitle = `Alpha ${id}`
  await addNode(page, nodeTitle)
  // Yjs keeps the change in the browser first. "Saved" is the badge's word
  // for "Postgres has taken it", so this is the wait that matters.
  await expectSaved(page)

  await page.reload()

  // The canvas is loaded from the database on the way back, not from
  // anything the last page left behind.
  await expect(whiteboardTools(page)).toBeVisible()
  await expect(nodeLabelled(page, nodeTitle)).toBeVisible()
})

test("a second node joins the first, and both come back", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  await addNode(page, `Alpha ${id}`)
  await addNode(page, `Beta ${id}`)
  await expectSaved(page)

  await page.reload()
  await expect(whiteboardTools(page)).toBeVisible()
  await expect(nodeLabelled(page, `Alpha ${id}`)).toBeVisible()
  await expect(nodeLabelled(page, `Beta ${id}`)).toBeVisible()
})
