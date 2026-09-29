import { expect, test } from "@playwright/test"

import { personalSlug, signUpWithOrg } from "./support/app"

// The home page is the landing page for everyone. Someone signed in sees it
// too, with a way to their own work where a visitor has Sign in.

const HEADLINE = "Turn a GitHub repo into a diagram you can click into."

test("a visitor sees the landing page, and its buttons lead to sign-in", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1, name: HEADLINE })).toBeVisible()
  const header = page.getByRole("banner")
  await expect(header.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login")
  await expect(page.getByRole("main").getByRole("link", { name: "Import a repository" }).first()).toHaveAttribute(
    "href",
    "/login"
  )
})

test("someone signed in sees the landing page too, and Your projects leads to their workspace", async ({ page }) => {
  // A team workspace as well, which is not where these lead.
  const { account } = await signUpWithOrg(page)
  const slug = personalSlug(account)

  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1, name: HEADLINE })).toBeVisible()
  const header = page.getByRole("banner")
  await expect(header.getByRole("link", { name: "Sign in" })).toHaveCount(0)
  await header.getByRole("link", { name: "Your projects" }).click()
  await page.waitForURL(`/${slug}`)
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible()

  // The main button goes to the same place, where the import is.
  await page.goto("/")
  await page.getByRole("main").getByRole("link", { name: "Import a repository" }).first().click()
  await page.waitForURL(`/${slug}`)
  await expect(page.getByRole("button", { name: "Import from GitHub" })).toBeVisible()
})
