import { expect, test } from "@playwright/test"

import { personalSlug, signUpWithOrg } from "./support/app"
import { billingConfigured } from "./support/billing"
import { oauthServerEnabled } from "./support/mcp"

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

// The page describes this server, whoever runs it. Without Stripe there is
// no plan to sell, and nothing may promise one or a storage allowance the
// page cannot know; without Supabase's OAuth server, agents cannot sign in.
test("the pricing and the agents line say what this server offers", async ({ page, baseURL }) => {
  await page.goto("/")
  const pricing = page.locator("#pricing")
  await expect(pricing.getByRole("heading", { name: "Pricing" })).toBeVisible()
  await expect(pricing.getByRole("heading", { name: "Run it yourself" })).toBeVisible()
  if (billingConfigured) {
    await expect(pricing.getByText("$5", { exact: true })).toBeVisible()
  } else {
    await expect(pricing.getByText("Nothing to pay. This server has no paid plan.")).toBeVisible()
    await expect(pricing.getByText("$5", { exact: true })).toHaveCount(0)
    await expect(page.getByText(/comes later|while Subcanvas is this new|GB of pictures/)).toHaveCount(0)
  }

  const agents = page.getByText(/connect an AI agent/)
  await expect(agents).toHaveCount((await oauthServerEnabled(baseURL!)) ? 1 : 0)
})
