import { expect, type Page, test } from "@playwright/test"

import { freshId, personalSlug, signUp } from "./support/app"

// Personal and team workspaces. Every account gets a personal one when it is
// made, which is its own alone; team workspaces are made from the switcher
// and are where people are invited.

const switcher = (page: Page, name: string) => page.getByRole("button", { name, exact: true })

test("a new account lands in its personal workspace, named after it", async ({ page }) => {
  const account = await signUp(page)
  const slug = personalSlug(account)
  const name = `e2e-${account.id}'s workspace`

  await expect(page).toHaveURL(`/${slug}`)
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible()
  await expect(switcher(page, name)).toBeVisible()

  // The switcher lists it, and offers a team workspace.
  await switcher(page, name).click()
  const menu = page.getByRole("menu")
  await expect(menu.getByText("Workspaces", { exact: true })).toBeVisible()
  await expect(menu.getByRole("menuitem")).toHaveText([name, "New team workspace"])
  await page.keyboard.press("Escape")

  await page.goto(`/${slug}/settings/general`)
  await expect(page.getByText("This is your personal workspace.")).toBeVisible()
})

test("a personal workspace cannot invite anyone, be left, or be deleted", async ({ page }) => {
  const account = await signUp(page)
  const slug = personalSlug(account)

  // Members says it is yours alone, and leads to a team workspace instead.
  await page.goto(`/${slug}/settings/members`)
  await expect(page.getByRole("heading", { name: "Members", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Just you" })).toBeVisible()
  await expect(page.getByText("it is yours alone: nobody else can join it or be invited to it")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Invite someone" })).toHaveCount(0)
  await expect(page.getByLabel("Email")).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Create a team workspace" })).toHaveAttribute(
    "href",
    `/onboarding?from=${slug}`
  )

  // General has no way to leave it or delete it.
  await page.goto(`/${slug}/settings/general`)
  await expect(page.getByRole("heading", { name: "Workspace", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Danger zone" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Leave" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0)
  // It can still be renamed.
  const renamed = `Mine ${freshId()}`
  await page.getByLabel("Name").fill(renamed)
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText("Name saved.")).toBeVisible()
  await expect(switcher(page, renamed)).toBeVisible()
})

test("a team workspace is made from the switcher, and listed after the personal one", async ({ page }) => {
  const account = await signUp(page)
  const personal = `e2e-${account.id}'s workspace`

  await switcher(page, personal).click()
  await page.getByRole("menuitem", { name: "New team workspace" }).click()
  await page.waitForURL(`/onboarding?from=${personalSlug(account)}`)
  await expect(page.getByRole("main").getByText("New team workspace", { exact: true })).toBeVisible()

  // Nobody has to be here: the page leads back where it came from.
  await page.getByRole("link", { name: `Back to ${personal}` }).click()
  await page.waitForURL(`/${personalSlug(account)}`)
  await page.goBack()
  await page.waitForURL(/\/onboarding/)

  const id = freshId()
  const team = `Team ${id}`
  await page.getByLabel("Name").fill(team)
  // The address follows the name until it is edited.
  await expect(page.getByLabel("Web address")).toHaveValue(`team-${id}`)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await page.waitForURL(`/team-${id}`)
  await expect(switcher(page, team)).toBeVisible()

  await switcher(page, team).click()
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText([personal, team, "New team workspace"])
  await page.keyboard.press("Escape")

  // A team workspace is the one people are invited to.
  await page.goto(`/team-${id}/settings/members`)
  await expect(page.getByRole("heading", { name: "Invite someone" })).toBeVisible()
})

test("the new team workspace page can be left by signing out", async ({ page }) => {
  const account = await signUp(page)
  await page.goto("/onboarding")
  await expect(page.getByText(`Signed in as ${account.email}.`)).toBeVisible()
  // With nowhere it came from, back is the personal workspace.
  await expect(page.getByRole("link", { name: "Back to your workspace" })).toBeVisible()

  await page.getByRole("button", { name: "Sign out" }).click()
  await page.waitForURL("/login")
  await page.goto("/onboarding")
  await page.waitForURL(/\/login\?next=%2Fonboarding/)
})
