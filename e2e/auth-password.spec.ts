import { expect, test } from "@playwright/test"

import { cardTitled, createOrg, signIn, signOut, signUp } from "./support/app"

test("signs up with a password, changes it, and signs back in with the new one", async ({
  page,
}) => {
  const account = await signUp(page)

  // Nobody's first account has an org, so sign-up lands on onboarding.
  await expect(cardTitled(page, "Create your org")).toBeVisible()
  const slug = await createOrg(page, account.id)
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible()

  // /auth/password is where anyone already signed in — by link, by password,
  // or through Google or GitHub — gives the account a password.
  await page.goto("/auth/password")
  const changed = { ...account, password: `changed-${account.id}` }
  await page.getByLabel("New password").fill(changed.password)
  await page.getByRole("button", { name: "Save password" }).click()
  // It sends you back where you were: the home page, which knows the org.
  await page.waitForURL(`/${slug}`)

  await signOut(page)
  await expect(page.getByLabel("Email")).toBeVisible()

  await signIn(page, changed)
  await page.waitForURL(`/${slug}`)
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible()
})

test("refuses the old password once it has been changed", async ({ page }) => {
  const account = await signUp(page)
  const slug = await createOrg(page, account.id)

  await page.goto("/auth/password")
  await page.getByLabel("New password").fill(`changed-${account.id}`)
  await page.getByRole("button", { name: "Save password" }).click()
  await page.waitForURL(`/${slug}`)
  await signOut(page)

  await page.goto("/login")
  await page.getByLabel("Email").fill(account.email)
  await page.getByLabel("Password").fill(account.password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})
