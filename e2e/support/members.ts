import { type Browser, type BrowserContext, expect, type Locator, type Page } from "@playwright/test"

import { type Account, signUp } from "./app"

// Getting a second person into an org. Invites are links, not emails: an
// admin makes one for an address, copies the link, and passes it on. The
// invited person signs up with that address and follows the link.

export type RoleLabel = "Viewer" | "Editor" | "Admin" | "Owner"

// Makes an invite for `email` on Settings → Members and returns the link
// the page offers for it.
export async function createInviteLink(
  page: Page,
  slug: string,
  email: string,
  role: Exclude<RoleLabel, "Owner">
): Promise<string> {
  await page.goto(`/${slug}/settings/members`)
  await expect(page.getByRole("heading", { name: "Members", exact: true })).toBeVisible()

  // Scoped to the invite section: every member's row has a Role select of
  // its own, and the section is a plain <section> with a heading, which is
  // not a landmark, so the heading is what finds it.
  const form = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Invite someone" }) })
  await form.getByLabel("Email").fill(email)
  await pickOption(page, form.getByRole("combobox", { name: "Role" }), role)
  await form.getByRole("button", { name: "Invite", exact: true }).click()

  // The invite's row is rendered on the server, so its arrival is proof the
  // invite was written, not just submitted.
  const row = page.getByRole("row").filter({ hasText: email })
  await expect(row).toBeVisible()

  // The only way the page gives out the link is the clipboard. Chromium
  // refuses to read it without the permission, and grants nothing on its own
  // in a test, so it is granted here for this page's origin.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  })
  await row.getByRole("button", { name: "Copy link" }).click()
  await expect(page.getByText("Invite link copied.")).toBeVisible()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toMatch(/\/invite\/[0-9a-f-]{36}$/)
  return link
}

export type Member = { context: BrowserContext; page: Page; account: Account }

// A fresh person in a browser context of their own — no cookies shared with
// the inviter — who signs up as `account` and accepts the invite at `link`.
// Accepting sends them to the org's home page. Close the context when done.
export async function joinThroughInvite(
  browser: Browser,
  baseURL: string,
  link: string,
  account: Account,
  slug: string
): Promise<Member> {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  try {
    // The invite is for one address, and the account has to be that one.
    await signUp(page, account)
    await page.goto(link)
    await page.getByRole("button", { name: "Accept invite" }).click()
    await page.waitForURL(`/${slug}`)
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible()
  } catch (error) {
    await context.close()
    throw error
  }
  return { context, page, account }
}

// The row on Settings → Members for the person with this address. The page
// prints the address, or the display name over it; a fresh account has no
// name, so the address is what shows.
export const memberRow = (page: Page, email: string) =>
  page.getByRole("row").filter({ hasText: email })

// Changes someone's role from Settings → Members. The role shown in the row
// comes back from the server after the change, so its new value is proof
// the change was written.
export async function setMemberRole(page: Page, slug: string, email: string, role: RoleLabel) {
  await page.goto(`/${slug}/settings/members`)
  const row = memberRow(page, email)
  const select = row.getByRole("combobox", { name: "Role" })
  await pickOption(page, select, role)
  // Contains, not equals: the trigger's text has its chevron in it too.
  await expect(select).toContainText(role)
}

// Removes someone from the org from Settings → Members.
export async function removeMember(page: Page, slug: string, email: string) {
  await page.goto(`/${slug}/settings/members`)
  const row = memberRow(page, email)
  await row.getByRole("button", { name: "Remove" }).click()
  await expect(row).toHaveCount(0)
}

// The role selects are listboxes that open on a press, with their options
// outside the row they belong to.
async function pickOption(page: Page, select: Locator, label: string) {
  await select.click()
  await page.getByRole("option", { name: label, exact: true }).click()
}
