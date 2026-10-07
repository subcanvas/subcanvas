import { expect, test, type Page } from "@playwright/test"

import { signUpWithOrg } from "./support/app"
import { inviteAndJoin } from "./support/collab"

// Making a project public takes an admin (owners are admins too), when it
// is created as well as later. An editor sees the choice, off, with the
// reason; the database refuses it on every other path (pgTAP, trash.test).

async function newProjectDialog(page: Page) {
  await page.getByRole("main").getByRole("button", { name: "New project", exact: true }).click()
  return page.getByRole("dialog")
}

async function importDialog(page: Page) {
  await page.getByRole("button", { name: "Import from GitHub" }).click()
  return page.getByRole("dialog")
}

test("an owner may create a project public; an editor finds the choice off, with the reason", async ({
  page,
  browser,
}) => {
  const { slug } = await signUpWithOrg(page)

  let dialog = await newProjectDialog(page)
  await expect(dialog.getByRole("radio", { name: /^Public/ })).toBeEnabled()
  await expect(dialog.getByText("You can change who sees it later.")).toBeVisible()
  await page.keyboard.press("Escape")
  // Public by default for whoever may publish: the repository already is.
  dialog = await importDialog(page)
  await expect(dialog.getByRole("checkbox", { name: /Make this project public/ })).toBeChecked()
  await page.keyboard.press("Escape")

  const editor = await inviteAndJoin(page, browser, slug, "Editor")
  try {
    const other = editor.page
    dialog = await newProjectDialog(other)
    await expect(dialog.getByRole("radio", { name: /^Public/ })).toBeDisabled()
    await expect(dialog.getByText("Only an admin can make a project public.")).toBeVisible()
    await expect(dialog.getByText("An admin can change who sees it later.")).toBeVisible()
    await other.keyboard.press("Escape")

    dialog = await importDialog(other)
    const checkbox = dialog.getByRole("checkbox", { name: /Make this project public/ })
    await expect(checkbox).not.toBeChecked()
    await expect(checkbox).toBeDisabled()
    await expect(dialog.getByText("Only an admin can make a project public, so this one will be private.")).toBeVisible()
  } finally {
    await editor.context.close()
  }
})
