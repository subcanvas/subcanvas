import { join } from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { createProject, createWhiteboard, expectSaved, freshId, inspector, signUpWithOrg, whiteboardTools } from "./support/app"
import { inviteAndJoin } from "./support/collab"
import { FIXTURES } from "./support/import"

// A project's own menu, beside its name in the sidebar: editors rename it,
// admins delete it. Deleting takes the name typed, as deleting an org does,
// and takes everything in the project with it, pictures and videos included.

const projectMenu = (page: Page) => page.getByRole("button", { name: "Project menu" })

test("a project is renamed from its menu, and the new name is what the org's list shows", async ({ page }) => {
  const id = freshId()
  const { slug } = await signUpWithOrg(page)
  await createProject(page, `Old ${id}`)

  await projectMenu(page).click()
  await page.getByRole("menuitem", { name: "Rename project" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Name").fill(`New ${id}`)
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(`New ${id}`, { exact: true }).filter({ visible: true }).first()).toBeVisible()

  await page.goto(`/${slug}`)
  await expect(page.getByRole("link", { name: new RegExp(`New ${id}`) })).toBeVisible()
  await expect(page.getByText(`Old ${id}`)).toHaveCount(0)
})

test("deleting a project takes its name typed, and then it is gone with its documents and pictures", async ({
  page,
}) => {
  const id = freshId()
  const { slug } = await signUpWithOrg(page)
  const name = `Doomed ${id}`
  await createProject(page, name)
  await createWhiteboard(page, "Board")

  // A picture on its whiteboard, so there is a file for the delete to remove.
  const chooser = page.waitForEvent("filechooser")
  await whiteboardTools(page).getByRole("button", { name: "Media", exact: true }).click()
  await (await chooser).setFiles(join(FIXTURES, "cobalt.png"))
  const panel = inspector(page)
  await expect(panel).toBeVisible()
  await expect(panel.getByRole("progressbar", { name: "Uploading picture" })).toHaveCount(0)
  await expectSaved(page)
  const file = await panel.getByRole("link", { name: "Open the file" }).getAttribute("href")
  expect(file).toMatch(/^\/api\/media\//)
  expect((await page.request.get(file!, { maxRedirects: 0 })).status()).toBe(302)
  const board = page.url()

  await projectMenu(page).click()
  await page.getByRole("menuitem", { name: "Delete project" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: `Delete ${name}?` })).toBeVisible()
  const confirmation = dialog.getByLabel(`Type ${name} to confirm`)
  const button = dialog.getByRole("button", { name: "Delete this project" })
  await expect(button).toBeDisabled()
  // Capital letters count.
  await confirmation.fill(name.toLowerCase())
  await expect(button).toBeDisabled()
  await confirmation.fill(name)
  await button.click()

  await page.waitForURL(`/${slug}`)
  await expect(page.getByText(`${name} was deleted.`)).toBeVisible()
  await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0)

  // Its whiteboard went with it, and so did the picture's file.
  await page.goto(board)
  await expect(page.getByRole("heading", { name: "There is nothing here" })).toBeVisible()
  expect((await page.request.get(file!, { maxRedirects: 0 })).status()).toBe(404)
})

test("an editor can rename a project and has no way to delete it", async ({ page, browser }) => {
  const { slug } = await signUpWithOrg(page)
  const projectId = await createProject(page, "Shared")
  const editor = await inviteAndJoin(page, browser, slug, "Editor")
  try {
    await editor.page.goto(`/${slug}/${projectId}`)
    await projectMenu(editor.page).click()
    await expect(editor.page.getByRole("menuitem", { name: "Rename project" })).toBeVisible()
    await expect(editor.page.getByRole("menuitem", { name: "Delete project" })).toHaveCount(0)
  } finally {
    await editor.context.close()
  }
})
