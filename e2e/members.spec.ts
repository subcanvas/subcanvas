import { type Browser, expect, test } from "@playwright/test"

import {
  addNode,
  clickNode,
  createProject,
  createWhiteboard,
  expectSaved,
  freshAccount,
  freshId,
  nodeLabelled,
  signUp,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"
import {
  createInviteLink,
  joinThroughInvite,
  memberRow,
  removeMember,
  setMemberRole,
} from "./support/members"

// One person's whole time in someone else's org: invited as a viewer, made
// an editor, and removed. The owner and the member each have a browser
// context of their own, so neither ever holds the other's session.
test("a member invited as a viewer can look, can change things once an editor, and is gone once removed", async ({
  page,
  browser,
  baseURL,
}) => {
  const id = freshId()
  const { slug } = await signUpWithOrg(page)

  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  const nodeTitle = `Alpha ${id}`
  await addNode(page, nodeTitle)
  await expectSaved(page)
  const boardURL = page.url()

  const guest = freshAccount()
  const link = await createInviteLink(page, slug, guest.email, "Viewer")
  const member = await joinThroughInvite(browser, baseURL!, link, guest, slug)
  try {
    // The whiteboard opens for a viewer, and says what it is.
    await member.page.goto(boardURL)
    await expect(nodeLabelled(member.page, nodeTitle)).toBeVisible()
    await expect(member.page.getByText("View only", { exact: true })).toBeVisible()
    await expect(whiteboardTools(member.page)).toHaveCount(0)
    await expect(member.page.getByLabel("Document title")).toHaveCount(0)

    // The keys that change a whiteboard do nothing here: Delete on a
    // selected node, and letters, which are shortcuts in edit mode.
    await clickNode(member.page, nodeTitle)
    await member.page.keyboard.press("Delete")
    await member.page.keyboard.press("Backspace")
    await member.page.keyboard.type("nothing")
    await expect(nodeLabelled(member.page, nodeTitle)).toBeVisible()
    // The panel a selection opens is read-only too: its fields are there
    // to be read, in a fieldset that takes no typing.
    await expect(member.page.getByLabel("Title")).toBeDisabled()
    // And what the server holds is untouched: the owner's badge never left
    // "Saved", and a fresh load from the database still has the node.
    await member.page.reload()
    await expect(nodeLabelled(member.page, nodeTitle)).toBeVisible()

    // Promoted by the owner. A role is read on the server for every page,
    // so the member sees it on their next load.
    await setMemberRole(page, slug, guest.email, "Editor")
    await member.page.reload()
    await expect(whiteboardTools(member.page)).toBeVisible()
    await expect(member.page.getByText("View only", { exact: true })).toHaveCount(0)
    const second = `Beta ${id}`
    await addNode(member.page, second)
    await expectSaved(member.page)

    // Written for real: the owner's own load of the board has it.
    await page.goto(boardURL)
    await expect(nodeLabelled(page, second)).toBeVisible()

    // An editor is not an owner: the plan is shown, never a way to change
    // it. Whether this server has billing set up or not, there is no
    // button, only a sentence saying why.
    await member.page.goto(`/${slug}/settings/billing`)
    await expect(member.page.getByRole("heading", { name: "Billing", exact: true })).toBeVisible()
    await expect(member.page.getByRole("button", { name: /^Upgrade/ })).toHaveCount(0)
    await expect(member.page.getByRole("button", { name: "Manage billing" })).toHaveCount(0)

    // Removed by the owner. The org vanishes for them: RLS hides what they
    // are not in, so it looks like a page that never was.
    await removeMember(page, slug, guest.email)
    await expect(memberRow(page, guest.email)).toHaveCount(0)
    await member.page.goto(`/${slug}`)
    await expect(member.page.getByText("There is no sheet here")).toBeVisible()
  } finally {
    await member.context.close()
  }
})

test("an invite is for one address, and someone else signed in cannot take it", async ({
  page,
  browser,
  baseURL,
}) => {
  const { account, slug } = await signUpWithOrg(page)
  const invited = freshAccount()
  const link = await createInviteLink(page, slug, invited.email, "Editor")

  // Somebody else altogether, with an account of their own.
  const other = await joinAsNobody(browser, baseURL!)
  try {
    await other.page.goto(link)
    await expect(other.page.getByText(`Join E2E ${account.id}`)).toBeVisible()
    await expect(other.page.getByText(`Sign out and sign in as ${invited.email}`)).toBeVisible()
    await expect(other.page.getByRole("button", { name: "Accept invite" })).toHaveCount(0)

    // Not in: the org is not theirs to see.
    await other.page.goto(`/${slug}`)
    await expect(other.page.getByText("There is no sheet here")).toBeVisible()
  } finally {
    await other.context.close()
  }
})

// A fresh account in a context of its own that belongs to no org.
async function joinAsNobody(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await signUp(page)
  return { context, page }
}
