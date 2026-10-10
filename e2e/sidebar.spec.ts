import { expect, test } from "@playwright/test"

import {
  createProject,
  createWhiteboard,
  openWorkspaceMenu,
  personalSlug,
  sidebar,
  signUpWithOrg,
  workspaceSection,
} from "./support/app"
import { inviteAndJoin } from "./support/collab"
import { addProjects } from "./support/database"

// The sidebar (R2.4): every workspace the person is in, as a section that
// opens and closes, listing its projects. The project being viewed opens in
// place to show its tree.

test("sections open and close, are remembered, and open again on arriving", async ({ page }) => {
  const { account, slug } = await signUpWithOrg(page)
  const team = `E2E ${account.id}`
  const personal = workspaceSection(page, "Personal")
  const teamSection = workspaceSection(page, team)
  await expect(personal).toHaveAttribute("aria-expanded", "true")
  await expect(teamSection).toHaveAttribute("aria-expanded", "true")

  // Closing a section leaves only its heading.
  await personal.click()
  await expect(personal).toHaveAttribute("aria-expanded", "false")
  await expect(sidebar(page).getByText("No projects yet").filter({ visible: true })).toHaveCount(1)
  // By keyboard too.
  await personal.focus()
  await page.keyboard.press("Enter")
  await expect(personal).toHaveAttribute("aria-expanded", "true")
  await page.keyboard.press("Enter")
  await expect(personal).toHaveAttribute("aria-expanded", "false")

  await page.reload()
  await expect(personal).toHaveAttribute("aria-expanded", "false")
  await expect(teamSection).toHaveAttribute("aria-expanded", "true")

  // The section of the workspace being looked at can be closed too, and it
  // opens again on arriving in it, while the other stays as it was left.
  await teamSection.click()
  await expect(teamSection).toHaveAttribute("aria-expanded", "false")
  await page.goto(`/${personalSlug(account)}`)
  await expect(personal).toHaveAttribute("aria-expanded", "true")
  await expect(teamSection).toHaveAttribute("aria-expanded", "false")
  await page.goto(`/${slug}`)
  await expect(teamSection).toHaveAttribute("aria-expanded", "true")
})

test("a section's menu has the workspace's pages", async ({ page }) => {
  const { account, slug } = await signUpWithOrg(page)
  const menu = await openWorkspaceMenu(page, `E2E ${account.id}`)
  await expect(menu.getByRole("menuitem", { name: "Projects" })).toHaveAttribute("href", `/${slug}`)
  await expect(menu.getByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", `/${slug}/settings/general`)
  await menu.getByRole("menuitem", { name: "Members" }).click()
  await page.waitForURL(`/${slug}/settings/members`)
  await expect(page.getByRole("heading", { name: "Members", exact: true })).toBeVisible()
})

test("a section's + makes a project in that workspace, from anywhere, and it opens there", async ({ page }) => {
  const { account, slug } = await signUpWithOrg(page)
  const team = `E2E ${account.id}`
  await page.goto(`/${personalSlug(account)}`)

  await sidebar(page).getByRole("button", { name: `New project in ${team}` }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Name").fill("From the sidebar")
  await dialog.getByRole("button", { name: "Create project" }).click()
  await page.waitForURL(new RegExp(`^[^?]*/${slug}/from-the-sidebar$`))

  // It is the open project, in its section, with its tree and its buttons.
  const row = sidebar(page).getByRole("link", { name: "From the sidebar", exact: true })
  await expect(row).toHaveAttribute("aria-current", "page")
  await expect(sidebar(page).getByRole("button", { name: "Add to project" })).toBeVisible()
  await expect(sidebar(page).getByRole("button", { name: "Project menu" })).toBeVisible()
  await expect(sidebar(page).getByText("No whiteboards or pages yet.", { exact: false })).toBeVisible()
})

test("the open project shows its tree; the others are links that open theirs", async ({ page }) => {
  const { slug } = await signUpWithOrg(page)
  await createProject(page, "Alpha")
  await createWhiteboard(page, "Alpha board")
  await page.goto(`/${slug}`)
  const beta = await createProject(page, "Beta")
  await page.goto(`/${slug}`)
  await page.getByRole("main").getByRole("link", { name: /^Alpha/ }).click()
  await expect(sidebar(page).getByRole("link", { name: "Alpha board", exact: true })).toBeVisible()
  // Only the open project has a tree, and buttons.
  await expect(sidebar(page).getByRole("button", { name: "Add to project" })).toHaveCount(1)

  await sidebar(page).getByRole("link", { name: "Beta", exact: true }).click()
  await page.waitForURL(`/${slug}/${beta}`)
  await expect(sidebar(page).getByRole("link", { name: "Alpha board", exact: true })).toHaveCount(0)
  await expect(sidebar(page).getByRole("link", { name: "Alpha", exact: true })).toBeVisible()
  await expect(sidebar(page).getByText("No whiteboards or pages yet.", { exact: false })).toBeVisible()
})

test("a viewer has no + in a workspace they cannot add to", async ({ page, browser }) => {
  const { account, slug } = await signUpWithOrg(page)
  const viewer = await inviteAndJoin(page, browser, slug, "Viewer")
  try {
    const team = `E2E ${account.id}`
    await expect(workspaceSection(viewer.page, team)).toBeVisible()
    await expect(sidebar(viewer.page).getByRole("button", { name: `New project in ${team}` })).toHaveCount(0)
    await expect(sidebar(viewer.page).getByRole("button", { name: "New project in Personal" })).toHaveCount(1)
    await expect(sidebar(viewer.page).getByRole("button", { name: `${team} workspace menu` })).toHaveCount(1)
  } finally {
    await viewer.context.close()
  }
})

test("a section lists twenty projects, then Show all; the open one is listed wherever it is", async ({ page }) => {
  const { account, slug } = await signUpWithOrg(page)
  const team = `E2E ${account.id}`
  addProjects(slug, "Bulk", 25)
  await page.reload()

  const listed = sidebar(page).getByRole("link", { name: /^Bulk \d+$/ })
  await expect(listed).toHaveCount(20)
  await expect(listed.first()).toHaveText("Bulk 01")
  await expect(listed.last()).toHaveText("Bulk 20")
  const showAll = sidebar(page).getByRole("link", { name: `Show all projects in ${team}` })
  await expect(showAll).toHaveAttribute("href", `/${slug}`)

  // One past the twentieth, opened from the Projects page.
  await page.getByRole("main").getByRole("link", { name: /^Bulk 25/ }).click()
  await expect(sidebar(page).getByRole("link", { name: "Bulk 25", exact: true })).toHaveAttribute("aria-current", "page")
  await expect(listed).toHaveCount(21)
})
