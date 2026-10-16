import { expect, test } from "@playwright/test"

import { signUpWithOrg } from "./support/app"

// The operator's dashboard (app/admin) is only there for an operator
// (private.operators). Anyone else is told there is nothing here, signed in
// or not, so the page does not even say it exists.

test("the dashboard is not found for a visitor, nor for someone signed in who is not an operator", async ({ page }) => {
  const visitor = await page.goto("/admin")
  expect(visitor?.status()).toBe(404)

  await signUpWithOrg(page)
  const member = await page.goto("/admin")
  expect(member?.status()).toBe(404)
  await expect(page.getByRole("heading", { name: "Sign-ups, last 30 days" })).toHaveCount(0)
})
