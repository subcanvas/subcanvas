import { expect, test } from "@playwright/test"

import { createOrg, personalSlug, signIn, signOut, signUp } from "./support/app"
import { authProviders } from "./support/env"

const PROVIDER_LABELS = { google: "Google", github: "GitHub" }

test("the sign-in card names only the sign-in buttons this server shows", async ({ page }) => {
  await page.goto("/login")
  const card = page.getByRole("main")
  const labels = authProviders.map((provider) => PROVIDER_LABELS[provider])
  for (const label of Object.values(PROVIDER_LABELS))
    await expect(card.getByRole("button", { name: `Continue with ${label}` })).toHaveCount(labels.includes(label) ? 1 : 0)
  await expect(
    card.getByText(
      labels.length
        ? `New here? Continue with ${labels.join(" or ")} and your account is made for you.`
        : "With your email and password, or a sign-in link we email you.",
      { exact: true }
    )
  ).toBeVisible()
})

test("after signing in, an address that leads to another site is not followed", async ({ page, baseURL }) => {
  const account = await signUp(page)
  await signOut(page)

  // A browser reads the backslash as a slash: "//evil.example", another site.
  await page.goto(`/login?next=${encodeURIComponent("/\\evil.example/")}`)
  await page.getByLabel("Email").fill(account.email)
  await page.getByLabel("Password").fill(account.password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  // Where signing in goes when it is not sent elsewhere: the personal workspace.
  await page.waitForURL(`/${personalSlug(account)}`)
  expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin)
})

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
