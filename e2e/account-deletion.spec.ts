import { join } from "node:path"

import { expect, type Page, test } from "@playwright/test"

import { adminClient, NO_ADMIN, workspaceId } from "./support/admin"
import {
  type Account,
  createOrg,
  createProject,
  createWhiteboard,
  expectSaved,
  freshAccount,
  freshId,
  inspector,
  personalSlug,
  signUp,
  whiteboardTools,
} from "./support/app"
import { FIXTURES } from "./support/import"
import { createInviteLink, joinThroughInvite, memberRow, setMemberRole } from "./support/members"

// Deleting an account from Settings → Profile does what the Terms and the
// Privacy Policy say: the personal workspace and every team workspace
// nobody else is in go, with everything in them and their files; a team
// workspace other people are in stays theirs. Some things refuse it, by name.

const deleteSection = (page: Page) => page.getByRole("region", { name: "Delete your account" })

async function openDeleteDialog(page: Page, account: Account) {
  await deleteSection(page).getByRole("button", { name: "Delete account" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "Delete your account?" })).toBeVisible()
  await dialog.getByLabel(`Type ${account.email} to confirm`).fill(account.email)
  return dialog
}

// A picture on a new whiteboard, and the signed address Storage serves it
// at, which works for as long as the file exists, whoever asks.
async function addPicture(page: Page) {
  await createWhiteboard(page, "Board")
  const chooser = page.waitForEvent("filechooser")
  await whiteboardTools(page).getByRole("button", { name: "Media", exact: true }).click()
  await (await chooser).setFiles(join(FIXTURES, "cobalt.png"))
  const panel = inspector(page)
  await expect(panel).toBeVisible()
  await expect(panel.getByRole("progressbar", { name: "Uploading picture" })).toHaveCount(0)
  await expectSaved(page)
  const file = await panel.getByRole("link", { name: "Open the file" }).getAttribute("href")
  const signed = (await page.request.get(file!, { maxRedirects: 0 })).headers().location
  expect(signed).toBeTruthy()
  expect((await page.request.get(signed)).status()).toBe(200)
  return signed
}

test("deleting an account deletes its workspaces and files, and a shared workspace stays with its other member", async ({
  page,
  browser,
  baseURL,
}) => {
  const account = await signUp(page)
  const personal = personalSlug(account)

  // In the personal workspace: a public project, so anyone can tell whether
  // it still exists, with a picture on its whiteboard.
  await page.goto(`/${personal}`)
  const own = await createProject(page, "Own project", "public")
  const picture = await addPicture(page)

  // A team workspace nobody else is in, with a public project too.
  const soloId = freshId()
  const solo = await createOrg(page, soloId)
  const soloProject = await createProject(page, "Solo project", "public")

  // A team workspace shared with a partner, who is made an owner too.
  const sharedId = freshId()
  const shared = await createOrg(page, sharedId)
  await createProject(page, `Shared project ${sharedId}`)
  const partner = freshAccount()
  const link = await createInviteLink(page, shared, partner.email, "Editor")
  const member = await joinThroughInvite(browser, baseURL!, link, partner, shared)
  try {
    await setMemberRole(page, shared, partner.email, "Owner")

    // Profile says what will go and what will stay before anything does.
    await page.goto(`/${personal}/settings/profile`)
    const section = deleteSection(page)
    await expect(section.getByText(`e2e-${account.id}'s workspace, E2E ${soloId}`, { exact: true })).toBeVisible()
    await expect(section.getByText(`E2E ${sharedId}`, { exact: true })).toBeVisible()

    await deleteSection(page).getByRole("button", { name: "Delete account" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText(/and 1 team workspace nobody else is in/)).toBeVisible()
    await expect(dialog.getByText(/You leave 1 team workspace; what you made there stays with it/)).toBeVisible()
    const confirm = dialog.getByRole("button", { name: "Delete my account" })
    const field = dialog.getByLabel(`Type ${account.email} to confirm`)
    await expect(confirm).toBeDisabled()
    await field.fill(`not-${account.email}`)
    await expect(confirm).toBeDisabled()
    await field.fill(account.email)
    await confirm.click()

    // Signed out, on the landing page.
    await expect(page.getByText("Your account was deleted.")).toBeVisible()
    await page.waitForURL("/")
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible()

    // Its workspaces are gone, with their projects and the picture's file:
    // what was public now asks a visitor to sign in, like anything private.
    for (const project of [`/${personal}/${own}`, `/${solo}/${soloProject}`])
      expect(new URL((await page.request.get(project)).url()).pathname).toBe("/login")
    expect((await page.request.get(picture)).ok()).toBe(false)

    // And the account itself: its password no longer signs anyone in.
    await page.goto("/login")
    await page.getByLabel("Email").fill(account.email)
    await page.getByLabel("Password").fill(account.password)
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible()

    // The shared workspace is its partner's, with what the account made there.
    await member.page.goto(`/${shared}`)
    await expect(
      member.page.getByRole("main").getByRole("link", { name: new RegExp(`Shared project ${sharedId}`) })
    ).toBeVisible()
    await member.page.goto(`/${shared}/settings/members`)
    await expect(memberRow(member.page, partner.email)).toBeVisible()
    await expect(memberRow(member.page, account.email)).toHaveCount(0)
  } finally {
    await member.context.close()
  }
})

test("the only owner of a workspace with other members is refused, by name", async ({ page, browser, baseURL }) => {
  const account = await signUp(page)
  const id = freshId()
  const shared = await createOrg(page, id)
  const partner = freshAccount()
  const member = await joinThroughInvite(
    browser,
    baseURL!,
    await createInviteLink(page, shared, partner.email, "Editor"),
    partner,
    shared
  )
  try {
    const profile = `/${personalSlug(account)}/settings/profile`
    await page.goto(profile)
    const section = deleteSection(page)
    await expect(section).toContainText(
      `You are the only owner of E2E ${id}, which has other members. Make one of them an owner, or delete the workspace.`
    )
    await expect(section.getByRole("link", { name: `E2E ${id}` })).toHaveAttribute("href", `/${shared}/settings/members`)
    await expect(section.getByRole("button", { name: "Delete account" })).toHaveCount(0)

    // With a second owner there is nothing in the way.
    await setMemberRole(page, shared, partner.email, "Owner")
    await page.goto(profile)
    const dialog = await openDeleteDialog(page, account)

    // Taken back while the dialog is open: the database refuses, and says why.
    const other = await page.context().newPage()
    await setMemberRole(other, shared, partner.email, "Editor")
    await other.close()
    await dialog.getByRole("button", { name: "Delete my account" }).click()
    await expect(dialog.getByRole("alert")).toHaveText(
      `You are the only owner of E2E ${id}, which has other members. Make one of them an owner in its Members settings, or delete the workspace.`
    )

    // Nothing was deleted.
    await page.goto(profile)
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible()
  } finally {
    await member.context.close()
  }
})

test("a workspace with a running subscription is refused, by name, until it is cancelled", async ({ page }) => {
  const admin = adminClient()
  test.skip(!admin, NO_ADMIN)
  const account = await signUp(page)
  const slug = personalSlug(account)
  const name = `e2e-${account.id}'s workspace`
  const org = await workspaceId(account, slug)

  const profile = `/${slug}/settings/profile`
  await page.goto(profile)
  const dialog = await openDeleteDialog(page, account)

  // A subscription starts while the dialog is open, written the way the
  // Stripe webhook writes one.
  const { error } = await admin!
    .from("subscriptions")
    .insert({ org_id: org, stripe_customer_id: `cus_e2e_${account.id}`, status: "active" })
  expect(error).toBeNull()
  await dialog.getByRole("button", { name: "Delete my account" }).click()
  await expect(dialog.getByRole("alert")).toHaveText(
    `${name} has a subscription. Cancel it in its Billing settings, then delete your account.`
  )

  // Profile says so before anyone tries.
  await page.goto(profile)
  const section = deleteSection(page)
  await expect(section).toContainText(`${name} has a subscription. Cancel it in its Billing settings first.`)
  await expect(section.getByRole("link", { name })).toHaveAttribute("href", `/${slug}/settings/billing`)
  await expect(section.getByRole("button", { name: "Delete account" })).toHaveCount(0)

  // Cancelled, it charges nothing more, and the account can go.
  await admin!.from("subscriptions").update({ cancel_at_period_end: true }).eq("org_id", org)
  await page.reload()
  await expect(deleteSection(page).getByRole("button", { name: "Delete account" })).toBeVisible()
})
