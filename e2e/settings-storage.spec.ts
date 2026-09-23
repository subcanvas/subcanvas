import { expect, test } from "@playwright/test"

import { signUpWithOrg } from "./support/app"

// The storage meter watches a cap. A server that sets none — which is what
// `private.config` holds until somebody fills it in — has nothing to watch,
// so the whole section stays away rather than showing an empty bar or an
// unbounded number.
test("Settings → General leaves out the storage meter when no cap is set", async ({ page }) => {
  const { slug } = await signUpWithOrg(page)
  await page.goto(`/${slug}/settings/general`)

  // The page is the one we mean, and it rendered all the way through.
  await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Org", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Your role", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Danger zone", exact: true })).toBeVisible()

  await expect(page.getByRole("heading", { name: "Storage", exact: true })).toHaveCount(0)
  await expect(page.getByRole("meter", { name: "Storage for pictures and videos" })).toHaveCount(0)
  await expect(page.getByText("of storage for pictures and videos")).toHaveCount(0)
})
