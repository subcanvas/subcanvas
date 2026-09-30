import { expect, type Page, test } from "@playwright/test"

import { cardTitled, freshAccount, signUpWithOrg } from "./support/app"
import { expireInvite } from "./support/database"
import { emailConfigured } from "./support/email"
import { inviteLinkIn, mailTo } from "./support/mailpit"
import { invite, inviteRow, joinThroughInvite, memberRow, removeMember } from "./support/members"

// Invites by email, end to end: the server sends the invite to Mailpit, the
// invited person follows the link in it, and the admin can invite them
// again after they leave and renew an invite that expired. Without SMTP_HOST
// the server sends no email and these skip; members.spec.ts covers invites
// passed on by hand.
test.skip(!emailConfigured, "The server sends no email: SMTP_HOST is not set.")

async function accept(page: Page, link: string, slug: string) {
  await page.goto(link)
  await page.getByRole("button", { name: "Accept invite" }).click()
  await page.waitForURL(`/${slug}`)
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible()
}

test("an invite arrives by email, and its link lets the invited person join", async ({ page, browser, baseURL }) => {
  const { account, slug } = await signUpWithOrg(page)
  const guest = freshAccount()

  await invite(page, slug, guest.email, "Editor")
  await expect(page.getByText(`Invite emailed to ${guest.email}.`)).toBeVisible()

  // Who sent it, to what, with what role, the link, and until when.
  const email = await mailTo(guest.email)
  expect(email.Subject).toBe(`${account.email} invited you to E2E ${account.id} on Subcanvas`)
  expect(email.Text).toContain(`join the E2E ${account.id} workspace on Subcanvas as an editor`)
  expect(email.Text).toMatch(/It works once, until \w+ \d+, \d{4} at .+ UTC\./)
  expect(email.HTML).toContain("Accept the invite")
  const link = inviteLinkIn(email)
  expect(new URL(link).origin).toBe(new URL(baseURL!).origin)

  const member = await joinThroughInvite(browser, baseURL!, link, guest, slug)
  try {
    // The admin sees a member now, and no invite left over.
    await page.reload()
    await expect(memberRow(page, guest.email)).toHaveCount(1)
    await expect(inviteRow(page, guest.email)).toHaveCount(0)
  } finally {
    await member.context.close()
  }
})

test("someone removed can be invited again, and join again", async ({ page, browser, baseURL }) => {
  const { slug } = await signUpWithOrg(page)
  const guest = freshAccount()

  await invite(page, slug, guest.email, "Viewer")
  const first = inviteLinkIn(await mailTo(guest.email))
  const member = await joinThroughInvite(browser, baseURL!, first, guest, slug)
  try {
    await removeMember(page, slug, guest.email)
    await member.page.goto(`/${slug}`)
    await expect(member.page.getByText("There is nothing here")).toBeVisible()

    // Invited again: this used to be refused, because the accepted invite
    // was still there. A new invite, a new email, and a new link.
    await invite(page, slug, guest.email, "Editor")
    await expect(page.getByText(`Invite emailed to ${guest.email}.`)).toBeVisible()
    const second = inviteLinkIn(await mailTo(guest.email, 2))
    expect(second).not.toBe(first)

    // The old link is spent; the new one works.
    await member.page.goto(first)
    await expect(cardTitled(member.page, "This invite is no longer valid")).toBeVisible()
    await accept(member.page, second, slug)
  } finally {
    await member.context.close()
  }
})

test("an expired invite says so, and sending it again brings its link back", async ({ page, browser, baseURL }) => {
  const { account, slug } = await signUpWithOrg(page)
  const guest = freshAccount()

  await invite(page, slug, guest.email, "Editor")
  const link = inviteLinkIn(await mailTo(guest.email))

  // A week later.
  expireInvite(guest.email)

  // The invited person is told it expired and whom to ask, not that it is
  // broken.
  const context = await browser.newContext({ baseURL })
  const guestPage = await context.newPage()
  try {
    await guestPage.goto(link)
    await expect(cardTitled(guestPage, "This invite has expired")).toBeVisible()
    await expect(guestPage.getByText(`Ask ${account.email} or another admin to send it again.`)).toBeVisible()

    // The admin sees it expired, and is offered no dead link to copy.
    await page.reload()
    const row = inviteRow(page, guest.email)
    await expect(row.getByText("Expired")).toBeVisible()
    await expect(row.getByRole("button", { name: "Copy link" })).toHaveCount(0)
    await row.getByRole("button", { name: "Send again" }).click()
    await expect(page.getByText(`Invite sent again to ${guest.email}, for 7 more days.`)).toBeVisible()
    await expect(row.getByText("Expired")).toHaveCount(0)
    await expect(row.getByRole("button", { name: "Copy link" })).toBeVisible()

    // A second email, with the same link, which works again.
    expect(inviteLinkIn(await mailTo(guest.email, 2))).toBe(link)
    await guestPage.goto(link)
    await expect(cardTitled(guestPage, `Join E2E ${account.id}`)).toBeVisible()
  } finally {
    await context.close()
  }

  const member = await joinThroughInvite(browser, baseURL!, link, guest, slug)
  await member.context.close()
})
