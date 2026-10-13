import { expect, test } from "@playwright/test"

import { breadcrumb, createProject, createWhiteboard, sidebar, signUpWithOrg } from "./support/app"
import { treeLink } from "./support/import"

// The icon in front of a project's or a document's name (lib/item-icon.ts):
// chosen from the title of a page or from the sidebar's menus, and shown
// wherever the name is.

test("a document gets an emoji from its title, and it shows in the sidebar and the trail", async ({ page }) => {
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  // Without one, the title offers to add one.
  await page.getByRole("button", { name: "Add icon" }).click()
  const picker = page.getByRole("dialog", { name: "Icon for Board" })
  await picker.getByRole("searchbox", { name: "Search emoji" }).fill("rocket")
  await picker.getByRole("button", { name: /^rocket/ }).click()
  await expect(picker).toBeHidden()

  await expect(page.getByRole("button", { name: "Change icon" })).toContainText("🚀")
  // The sidebar's row and the trail are drawn on the server: there after the refresh.
  await expect(treeLink(page, "Board")).toContainText("🚀")
  await expect(breadcrumb(page)).toContainText("🚀")

  // And after a reload, from the database.
  await page.reload()
  await expect(treeLink(page, "Board")).toContainText("🚀")

  // Taken off again.
  await page.getByRole("button", { name: "Change icon" }).click()
  await page.getByRole("dialog", { name: "Icon for Board" }).getByRole("button", { name: "Remove" }).click()
  await expect(page.getByRole("button", { name: "Add icon" })).toBeAttached()
  await expect(treeLink(page, "Board")).not.toContainText("🚀")
})

test("a project gets a colored icon from its menu, shown on its row and its card", async ({ page }) => {
  const { slug } = await signUpWithOrg(page)
  await createProject(page, "Data")

  await sidebar(page).getByRole("button", { name: "Project menu" }).click()
  await page.getByRole("menuitem", { name: "Add icon…" }).click()
  const dialog = page.getByRole("dialog", { name: "Icon for Data" })
  await dialog.getByRole("button", { name: "Icon", exact: true }).click()
  await dialog.getByRole("radio", { name: "Green" }).click()
  await dialog.getByRole("button", { name: "Database", exact: true }).click()
  await expect(dialog).toBeHidden()

  // The row in the sidebar wears it, in the green pencil's readable shade.
  const row = sidebar(page).getByRole("link", { name: "Data", exact: true })
  const mark = row.locator("svg").first()
  await expect(mark).toBeVisible()
  await expect(row.locator("span[aria-hidden]").first()).toHaveAttribute("style", /--pencil-green-text/)

  // So does its card on the Projects page.
  await page.goto(`/${slug}`)
  const card = page.getByRole("main").getByRole("link", { name: /Data/ })
  await expect(card.locator("h2 svg")).toBeVisible()

  // The menu now offers to change it.
  await sidebar(page).getByRole("link", { name: "Data", exact: true }).click()
  await sidebar(page).getByRole("button", { name: "Project menu" }).click()
  await expect(page.getByRole("menuitem", { name: "Change icon…" })).toBeVisible()
})
