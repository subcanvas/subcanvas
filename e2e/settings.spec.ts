import { expect, test } from "@playwright/test"

import { createOrg, freshId, signIn, signOut, signUpWithOrg } from "./support/app"
import { signInLinkFor } from "./support/mailpit"

// Settings and the account: what a person changes about themselves and
// their org, and the ways in and out.

const accountMenu = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Account menu" })

test("Profile: a display name replaces the email in the sidebar", async ({ page }) => {
  const { account, slug } = await signUpWithOrg(page)
  // With no name, the sidebar falls back to the address. Contains, not
  // equals: the button's text starts with the avatar's initial.
  await expect(accountMenu(page)).toContainText(account.email)

  await page.goto(`/${slug}/settings/profile`)
  const name = `Person ${freshId()}`
  const field = page.getByLabel("Display name")
  await expect(field).toHaveAttribute("placeholder", account.email)
  await field.fill(name)
  await page.getByRole("button", { name: "Save", exact: true }).first().click()
  await expect(page.getByText("Name saved.")).toBeVisible()

  // The action revalidates the org layout, so the sidebar changes in place.
  await expect(accountMenu(page)).toContainText(name)
  await expect(accountMenu(page)).not.toContainText(account.email)
  // And it is saved, not just shown: a fresh load has it too.
  await page.goto(`/${slug}`)
  await expect(accountMenu(page)).toContainText(name)
  await page.goto(`/${slug}/settings/profile`)
  await expect(page.getByLabel("Display name")).toHaveValue(name)
})

test("Appearance: the theme is kept in this browser across loads", async ({ page }) => {
  const { slug } = await signUpWithOrg(page)
  const html = page.locator("html")

  await page.goto(`/${slug}/settings/appearance`)
  const theme = page.getByRole("radiogroup", { name: "Theme" })
  await theme.getByRole("radio", { name: "Dark" }).click()
  await expect(theme.getByRole("radio", { name: "Dark" })).toBeChecked()
  // next-themes writes the theme as a class on <html>, which the tokens key off.
  await expect(html).toHaveClass(/\bdark\b/)

  await page.reload()
  await expect(html).toHaveClass(/\bdark\b/)
  await expect(theme.getByRole("radio", { name: "Dark" })).toBeChecked()

  // The account menu offers the same switch, and the page reflects it.
  await accountMenu(page).click()
  await page.getByRole("menuitem", { name: "Light" }).click()
  await expect(html).toHaveClass(/\blight\b/)
  await expect(html).not.toHaveClass(/\bdark\b/)
  await expect(theme.getByRole("radio", { name: "Light" })).toBeChecked()

  await page.reload()
  await expect(html).toHaveClass(/\blight\b/)
  await expect(theme.getByRole("radio", { name: "Light" })).toBeChecked()
})

test("General: renaming the org renames it in the sidebar", async ({ page }) => {
  const { slug } = await signUpWithOrg(page)
  await page.goto(`/${slug}/settings/general`)

  const name = `Renamed ${freshId()}`
  await page.getByLabel("Name").fill(name)
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText("Name saved.")).toBeVisible()

  // The org switcher at the top of the sidebar, and the page's own eyebrow.
  await expect(page.getByRole("button", { name })).toBeVisible()
  await page.goto(`/${slug}`)
  await expect(page.getByRole("button", { name })).toBeVisible()
  // The address is fixed, whatever the name.
  await expect(page).toHaveURL(`/${slug}`)
})

test("General: deleting an org asks for its name and then it is gone", async ({ page }) => {
  const { slug: home } = await signUpWithOrg(page)
  // A second org to throw away, so the first is still there to land on.
  const doomed = freshId()
  const slug = await createOrg(page, doomed)
  const orgName = `E2E ${doomed}`

  await page.goto(`/${slug}/settings/general`)
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: `Delete ${orgName}?` })).toBeVisible()
  const confirm = dialog.getByRole("button", { name: "Delete this org" })
  // Nothing typed, or not quite the name: no way through.
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(`Type ${orgName} to confirm`).fill(orgName.toLowerCase())
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(`Type ${orgName} to confirm`).fill(orgName)
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await expect(page.getByText(`${orgName} was deleted.`)).toBeVisible()
  // Home is the first org that is left.
  await page.waitForURL(`/${home}`)
  // The deleted org is not found, for its former owner too.
  const gone = await page.goto(`/${slug}`)
  expect(gone?.status()).toBe(404)
})

test("Profile: changing the password from the profile page", async ({ page }) => {
  const { account, slug } = await signUpWithOrg(page)
  await page.goto(`/${slug}/settings/profile`)
  await expect(page.getByText("Set", { exact: true })).toBeVisible()
  await page.getByRole("link", { name: "Change password" }).click()
  await page.waitForURL(/\/auth\/password/)

  const changed = { ...account, password: `changed-${account.id}` }
  await page.getByLabel("New password").fill(changed.password)
  await page.getByRole("button", { name: "Save password" }).click()
  // Back where the link was.
  await page.waitForURL(`/${slug}/settings/profile`)

  await signOut(page)
  await signIn(page, changed)
  await page.waitForURL(`/${slug}`)
})

test("resets a forgotten password through the link in the email", async ({ page }) => {
  const { account, slug } = await signUpWithOrg(page)
  await signOut(page)

  await page.getByRole("button", { name: "Forgot your password?" }).click()
  await page.getByLabel("Email").fill(account.email)
  await page.getByRole("button", { name: "Send reset link" }).click()
  await expect(page.getByText("Check your email")).toBeVisible()

  // The link has to be opened in this browser: the flow uses PKCE, and the
  // verifier is a cookie only this context holds.
  await page.goto(await signInLinkFor(account.email))
  await page.waitForURL(/\/auth\/password/)
  await expect(page.getByText(`For ${account.email}.`)).toBeVisible()

  const reset = { ...account, password: `reset-${account.id}` }
  await page.getByLabel("New password").fill(reset.password)
  await page.getByRole("button", { name: "Save password" }).click()
  await page.waitForURL(`/${slug}`)

  await signOut(page)
  await signIn(page, reset)
  await page.waitForURL(`/${slug}`)
})

test("the account menu names the person, leads to the profile, and signs out", async ({ page }) => {
  const { account, slug } = await signUpWithOrg(page)

  await accountMenu(page).click()
  const menu = page.getByRole("menu")
  await expect(menu.getByText(account.email)).toBeVisible()
  for (const item of ["Light", "Dark", "Match my device", "Your profile", "Sign out"])
    await expect(menu.getByRole("menuitem", { name: item })).toBeVisible()
  await menu.getByRole("menuitem", { name: "Your profile" }).click()
  await page.waitForURL(`/${slug}/settings/profile`)
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible()

  await signOut(page)
  // The session is over: the org is behind the door again.
  await page.goto(`/${slug}`)
  await page.waitForURL(/\/login/)
})
