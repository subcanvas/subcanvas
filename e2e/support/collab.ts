import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test"

import { type Account, breadcrumb, freshAccount, signUp } from "./app"

// Two or three people in the same document: an owner, and whoever they
// invite. Everyone but the owner lives in a browser context of their own, so
// nothing — no cookie, no session, no clipboard — is shared with the owner's.

export type InviteRole = "Viewer" | "Editor" | "Admin"

// Creates an invite for `email` from Settings → Members and returns its
// link. The page copies the link to the clipboard and nowhere else, which is
// how a person would pass it on too, so the context needs leave to read the
// clipboard back.
export async function inviteLink(page: Page, slug: string, email: string, role: InviteRole) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto(`/${slug}/settings/members`)
  await page.getByLabel("Email").fill(email)
  await page.getByRole("combobox", { name: "Role" }).click()
  await page.getByRole("option", { name: role }).click()
  await page.getByRole("button", { name: "Invite" }).click()
  // The pending invites are rendered on the server, so the row showing up
  // is proof the invite exists. (The toast is not: a second invite in the
  // same test would find the first one's toast still on screen.)
  const row = page.getByRole("row").filter({ hasText: email })
  await expect(row).toBeVisible()

  // Empty the clipboard first, so what is read back is this copy and not
  // the link of an earlier invite.
  await page.evaluate(() => navigator.clipboard.writeText(""))
  await row.getByRole("button", { name: "Copy link" }).click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()), { message: "no invite link on the clipboard" })
    .toContain("/invite/")
  return page.evaluate(() => navigator.clipboard.readText())
}

// A new person, in a context of their own, accepting the invite: they sign
// up, open the link, and land on the org. Closing the context is the
// caller's job; a `finally` is the place for it.
export async function joinByInvite(
  browser: Browser,
  invite: { link: string; slug: string },
  account: Account = freshAccount()
): Promise<{ context: BrowserContext; page: Page; account: Account }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signUp(page, account)
  await page.goto(invite.link)
  await page.getByRole("button", { name: "Accept invite" }).click()
  await page.waitForURL(`/${invite.slug}`)
  return { context, page, account }
}

// Invites a fresh account in `role` and has it accept, in one step.
export async function inviteAndJoin(page: Page, browser: Browser, slug: string, role: InviteRole) {
  const account = freshAccount()
  const link = await inviteLink(page, slug, account.email, role)
  return joinByInvite(browser, { link, slug }, account)
}

// Waits for the badge to say "Saved" on a page that has made a change of
// its own. Unlike expectSaved this does not insist on seeing "Saving…"
// first: the badge went there the moment the change was made, before the
// caller's other waits, and may be back already. It is still a real wait,
// because "Saved" only returns once Postgres has taken the update.
export async function expectSavedByNow(page: Page) {
  await expect(page.getByText("Saved", { exact: true })).toBeVisible()
}

// The avatars of the other people in the document, by the group's own
// count. Presence comes over Realtime, so it is only ever editors.
export const othersHere = (page: Page, count: number) =>
  page.getByLabel(`${count} other ${count === 1 ? "person" : "people"} here`)

// Presses an empty spot on the canvas with a real pointer, which clears the
// selection and takes the focus out of the object panel's fields. Keys typed
// in a field belong to the field: the whiteboard only hears them once the
// focus has left it. A real pointer for the same reason as clickNode: React
// Flow's drag handling reads the event's view.
export async function clickCanvas(page: Page) {
  const canvas = page.getByRole("application")
  const box = await canvas.boundingBox()
  if (!box) throw new Error("The canvas has no box to press")
  // Well to the right of the middle: the toolbar is at the top, the hint
  // bar at the bottom, the zoom controls bottom-left, and whatever the
  // toolbar added sits in the centre.
  const at = { x: box.x + box.width * 0.85, y: box.y + box.height * 0.5 }
  await page.mouse.move(at.x, at.y, { steps: 8 })
  await page.mouse.down()
  await page.mouse.up()
}

// The text of a full-page document. BlockNote's editor is a contenteditable
// with the textbox role, which the page's title field has too: the editable
// content is what tells them apart.
export const pageEditor = (page: Page) =>
  page.getByRole("main").getByRole("textbox").and(page.locator("[contenteditable=true]"))

// The words of a document, and nothing else. What is not editable inside
// the editor is not the document's: the other person's caret carries their
// name, and the trailing block is an invitation to type.
export function documentText(editor: Locator) {
  return editor.evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement
    for (const widget of copy.querySelectorAll("[contenteditable=false]")) widget.remove()
    return copy.textContent ?? ""
  })
}

// Adds a text document to the project from the tree, which opens it, and
// gives it `title`. Returns with the editor on screen.
export async function createTextDocument(page: Page, title: string) {
  await page.getByRole("button", { name: "Add to project" }).click()
  await page.getByRole("menuitem", { name: "New text document", exact: true }).click()
  await expect(pageEditor(page)).toBeVisible()
  const field = page.getByLabel("Document title")
  await field.fill(title)
  // The title saves on blur; Enter is what the field itself offers. The
  // trail is rendered on the server, so the name showing up there means the
  // rename was saved, not just typed.
  await field.press("Enter")
  await expect(breadcrumb(page).getByText(title, { exact: true })).toBeVisible()
}
