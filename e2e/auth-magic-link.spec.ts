import { expect, test } from "@playwright/test"

import { cardTitled, createOrg, freshAccount } from "./support/app"
import { signInLinkFor } from "./support/mailpit"

test("signs in by following the link in the email", async ({ page }) => {
  const account = freshAccount()

  await page.goto("/login")
  await page.getByRole("button", { name: "Email me a sign-in link instead" }).click()
  await page.getByLabel("Email").fill(account.email)
  await page.getByRole("button", { name: "Email me a link" }).click()

  await expect(cardTitled(page, "Check your email")).toBeVisible()
  await expect(page.getByText(account.email)).toBeVisible()

  // The link has to be opened in this browser: the sign-in uses PKCE, and
  // the verifier is a cookie that only this context holds.
  const link = await signInLinkFor(account.email)
  await page.goto(link)

  // The Auth API sends the browser to /auth/callback, which swaps the code
  // for a session and then follows `next`. A brand new account has no org.
  await page.waitForURL("/onboarding")
  await expect(cardTitled(page, "Create your org")).toBeVisible()

  const slug = await createOrg(page, account.id)
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible()

  // Really signed in, not merely past the redirect: the account menu is
  // the signed-in frame, and it knows the address.
  await page.getByRole("button", { name: "Account menu" }).click()
  await expect(page.getByText(account.email)).toBeVisible()
  await page.keyboard.press("Escape")

  // And the session survives a fresh load of a page behind the door.
  await page.goto(`/${slug}/settings/general`)
  await expect(page.getByRole("heading", { name: "General" })).toBeVisible()
})
