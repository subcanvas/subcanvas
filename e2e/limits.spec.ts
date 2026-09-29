import { expect, test, type Page } from "@playwright/test"

import { createProject, signUpWithOrg } from "./support/app"
import { inviteAndJoin } from "./support/collab"
import { bringIn, chooseFiles, runImport } from "./support/import"

// A refusal at a plan limit reads the same wherever it happens: what the
// limit is, then what this person can do about the plan. The owner is
// offered the upgrade; anyone else is told to ask an owner.
//
// This needs a server that counts private documents and sells a plan (the
// local stack with the README's limits, and the Stripe variables). CI's
// fresh stack sets no limits, and there it skips.

const notes = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    name: `note-${index}.md`,
    mimeType: "text/markdown",
    buffer: Buffer.from(`# Note ${index}\n`),
  }))

// The sidebar of a private project shows the count against the limit.
async function privateLimit(page: Page) {
  const meter = page.getByRole("link", { name: /^Private documents \d+\/\d+$/ })
  if (!(await meter.isVisible())) return null
  return Number((await meter.textContent())!.match(/\/(\d+)/)![1])
}

async function tryImport(page: Page, count: number) {
  await bringIn(page, "Import files…")
  await chooseFiles(page, "files", notes(count))
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: `Import ${count} documents`, exact: true }).click()
  return dialog
}

test("at the free plan's limit the owner is offered the upgrade, and an editor is told to ask an owner", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000)
  const { slug } = await signUpWithOrg(page)
  const projectId = await createProject(page, "Private")
  const limit = await privateLimit(page)
  test.skip(limit === null, "This server does not count private documents, or sells no plan.")

  // In a dialog: the refusal stays in view, with the upgrade beside it.
  const dialog = await tryImport(page, limit! + 1)
  await expect(dialog.getByRole("alert")).toContainText(`the free plan has room for ${limit} more private ones`)
  await expect(dialog.getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", `/${slug}/settings/billing`)
  await expect(dialog.getByText("Ask an owner")).toHaveCount(0)
  await page.keyboard.press("Escape")

  // In a toast: a public project over the limit cannot be made private.
  await page.goto(`/${slug}`)
  await createProject(page, "Public", "public")
  await bringIn(page, "Import files…")
  await chooseFiles(page, "files", notes(limit! + 1))
  await runImport(page, limit! + 1)
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Share" }).click()
  await page.getByRole("button", { name: "Make private" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Make private" }).click()
  const toast = page.getByRole("listitem").filter({ hasText: `past the free plan's ${limit} private documents` })
  await expect(toast).toBeVisible()
  await expect(toast.getByRole("button", { name: "Upgrade" })).toBeVisible()

  // An editor meets the same refusal, and is told who can lift it.
  const editor = await inviteAndJoin(page, browser, slug, "Editor")
  try {
    await editor.page.goto(`/${slug}/${projectId}`)
    const refused = await tryImport(editor.page, limit! + 1)
    await expect(refused.getByRole("alert")).toContainText("Ask an owner of this workspace to upgrade it to Pro.")
    await expect(refused.getByRole("link", { name: "Upgrade" })).toHaveCount(0)
  } finally {
    await editor.context.close()
  }
})
