import { expect, test } from "@playwright/test"

import {
  cardTitled,
  firstWorkspaceName,
  firstWorkspaceSlug,
  freshId,
  openWorkspaceMenu,
  sidebar,
  signIn,
  signUp,
  workspaceSection,
} from "./support/app"

// Workspaces: one kind (migration one_kind_of_workspace). Every account
// starts with one, named after it, which is like any other: people can be
// invited to it, and it can be renamed, left or deleted. More are made from
// "New workspace" in the sidebar.

test("a new account lands in the workspace it starts with, named after it", async ({ page }) => {
  const account = await signUp(page)
  const slug = firstWorkspaceSlug(account)
  const name = firstWorkspaceName(account)

  await expect(page).toHaveURL(`/${slug}`)
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible()
  // The sidebar has its section, by its name, open, and offers another.
  await expect(workspaceSection(page, name)).toHaveAttribute("aria-expanded", "true")
  await expect(sidebar(page).getByText("No projects yet")).toBeVisible()
  await expect(sidebar(page).getByRole("link", { name: "New workspace" })).toBeVisible()

  const menu = await openWorkspaceMenu(page, name)
  await expect(menu.getByRole("menuitem", { name: "Projects" })).toHaveAttribute("href", `/${slug}`)
  await page.keyboard.press("Escape")
})

test("the workspace an account starts with is like any other: invite, rename, delete", async ({ page }) => {
  const account = await signUp(page)
  const slug = firstWorkspaceSlug(account)

  // People can be invited to it.
  await page.goto(`/${slug}/settings/members`)
  await expect(page.getByRole("heading", { name: "Invite someone" })).toBeVisible()

  // It can be renamed, and the sidebar follows.
  await page.goto(`/${slug}/settings/general`)
  const renamed = `Mine ${freshId()}`
  await page.getByLabel("Name").fill(renamed)
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText("Name saved.")).toBeVisible()
  await expect(workspaceSection(page, renamed)).toBeVisible()

  // And deleted, by its owner, as any workspace is.
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel(`Type ${renamed} to confirm`).fill(renamed)
  await dialog.getByRole("button", { name: "Delete this workspace" }).click()
  await expect(page.getByText(`${renamed} was deleted.`)).toBeVisible()

  // In no workspace now, they are asked to make one, with nowhere to go back to.
  await page.waitForURL("/onboarding")
  await expect(cardTitled(page, "Create a workspace")).toBeVisible()
  await expect(page.getByRole("link", { name: /^Back to/ })).toHaveCount(0)

  // Signing in again lands there too, until they have one.
  await page.getByRole("button", { name: "Sign out" }).click()
  await page.waitForURL("/login")
  await signIn(page, account)
  await page.waitForURL("/onboarding")

  const id = freshId()
  await page.getByLabel("Name").fill(`Fresh ${id}`)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await page.waitForURL(`/fresh-${id}`)
  await expect(workspaceSection(page, `Fresh ${id}`)).toBeVisible()
})

test("another workspace is made from the sidebar, and the sidebar lists them by name", async ({ page }) => {
  const account = await signUp(page)
  const first = firstWorkspaceName(account)

  await sidebar(page).getByRole("link", { name: "New workspace" }).click()
  await page.waitForURL(`/onboarding?from=${firstWorkspaceSlug(account)}`)
  await expect(cardTitled(page, "New workspace")).toBeVisible()

  // Nobody has to be here: the page leads back where it came from.
  await page.getByRole("link", { name: `Back to ${first}` }).click()
  await page.waitForURL(`/${firstWorkspaceSlug(account)}`)
  await page.goBack()
  await page.waitForURL(/\/onboarding/)

  // "A ..." sorts before "e2e-...'s workspace", so the new one comes first.
  const id = freshId()
  const second = `A team ${id}`
  await page.getByLabel("Name").fill(second)
  // The address follows the name until it is edited.
  await expect(page.getByLabel("Web address")).toHaveValue(`a-team-${id}`)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await page.waitForURL(`/a-team-${id}`)
  const headings = [
    workspaceSection(page, second),
    workspaceSection(page, first),
    sidebar(page).getByRole("link", { name: "New workspace" }),
  ]
  const tops = await Promise.all(headings.map(async (heading) => (await heading.boundingBox())?.y ?? NaN))
  expect(tops).toEqual([...tops].sort((a, b) => a - b))
})

test("the new workspace page can be left by signing out", async ({ page }) => {
  const account = await signUp(page)
  await page.goto("/onboarding")
  await expect(page.getByText(`Signed in as ${account.email}.`)).toBeVisible()
  // With nowhere it came from, back is their workspace.
  await expect(page.getByRole("link", { name: "Back to your workspace" })).toBeVisible()

  await page.getByRole("button", { name: "Sign out" }).click()
  await page.waitForURL("/login")
  await page.goto("/onboarding")
  await page.waitForURL(/\/login\?next=%2Fonboarding/)
})
