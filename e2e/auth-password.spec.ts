import { expect, test } from "@playwright/test"

import { createOrg, personalSlug, signIn, signOut, signUp } from "./support/app"

test("signs up with a password, changes it, and signs back in with the new one", async ({
  page,
}) => {
  // Every account has a personal workspace, and sign-up lands in it.
  const account = await signUp(page)
  const home = `/${personalSlug(account)}`
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible()
  // A team workspace too, which signing in does not go to.
  await createOrg(page, account.id)

  // /auth/password is where anyone already signed in — by link, by password,
  // or through Google or GitHub — gives the account a password.
  await page.goto("/auth/password")
  const changed = { ...account, password: `changed-${account.id}` }
  await page.getByLabel("New password").fill(changed.password)
  await page.getByRole("button", { name: "Save password" }).click()
  // With nowhere else asked for, it sends you to your own work: the
  // personal workspace.
  await page.waitForURL(home)

  await signOut(page)
  await expect(page.getByLabel("Email")).toBeVisible()

  await signIn(page, changed)
  await page.waitForURL(home)
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible()
})

test("refuses the old password once it has been changed", async ({ page }) => {
  const account = await signUp(page)

  await page.goto("/auth/password")
  await page.getByLabel("New password").fill(`changed-${account.id}`)
  await page.getByRole("button", { name: "Save password" }).click()
  await page.waitForURL(`/${personalSlug(account)}`)
  await signOut(page)

  await page.goto("/login")
  await page.getByLabel("Email").fill(account.email)
  await page.getByLabel("Password").fill(account.password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})
