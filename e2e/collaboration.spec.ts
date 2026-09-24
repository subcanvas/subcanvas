import { expect, test, type Browser, type Page } from "@playwright/test"

import {
  addNode,
  clickNode,
  createProject,
  createWhiteboard,
  expectSaved,
  freshId,
  inspector,
  nodeLabelled,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"
import { expectSavedByNow, inviteAndJoin, othersHere } from "./support/collab"

// Two people on one whiteboard: the owner, and someone they invited who is
// looking at the same sheet from a browser context of their own. Edits go
// over Supabase Realtime and merge with Yjs; presence rides on the same
// channel. Every test builds its own pair, so none shares a document with
// another.

const canvas = (page: Page) => page.getByRole("application")

async function ownerAndEditor(page: Page, browser: Browser) {
  const { slug } = await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  const boardUrl = page.url()

  const editor = await inviteAndJoin(page, browser, slug, "Editor")
  // Inviting took the owner to Settings. Back to the sheet, both of them.
  await page.goto(boardUrl)
  await expect(whiteboardTools(page)).toBeVisible()
  await editor.page.goto(boardUrl)
  await expect(whiteboardTools(editor.page)).toBeVisible()
  return { boardUrl, editor }
}

test("a node added by one person appears for the other, and a title typed by the other comes back", async ({ page, browser }) => {
  const id = freshId()
  const { editor } = await ownerAndEditor(page, browser)
  try {
    const title = `Alpha ${id}`
    await addNode(page, title)
    // No reload: the other page is left exactly as it was.
    await expect(nodeLabelled(editor.page, title)).toBeVisible()

    // The other way round, from the panel: the editor selects the owner's
    // node and renames it.
    await clickNode(editor.page, title)
    await expect(inspector(editor.page)).toBeVisible()
    const renamed = `Beta ${id}`
    await inspector(editor.page).getByLabel("Title").fill(renamed)
    await expect(nodeLabelled(page, renamed)).toBeVisible()
    await expect(nodeLabelled(page, title)).toHaveCount(0)
  } finally {
    await editor.context.close()
  }
})

test("two people adding nodes at the same time both end up with both, now and after a reload", async ({ page, browser }) => {
  const id = freshId()
  const { editor } = await ownerAndEditor(page, browser)
  try {
    const mine = `Owner ${id}`
    const theirs = `Editor ${id}`
    // At once, not one after the other: each page adds while the other's
    // add is on its way.
    await Promise.all([addNode(page, mine), addNode(editor.page, theirs)])

    for (const someone of [page, editor.page]) {
      await expect(nodeLabelled(someone, mine)).toBeVisible()
      await expect(nodeLabelled(someone, theirs)).toBeVisible()
    }

    // Each page saves its own node; the other's arrives already saved by
    // its author. Then the database is all either page has on the way back.
    await expectSavedByNow(page)
    await expectSavedByNow(editor.page)
    for (const someone of [page, editor.page]) {
      await someone.reload()
      await expect(whiteboardTools(someone)).toBeVisible()
      await expect(nodeLabelled(someone, mine)).toBeVisible()
      await expect(nodeLabelled(someone, theirs)).toBeVisible()
    }
  } finally {
    await editor.context.close()
  }
})

test("the other person's avatar and cursor are there while they are on the page, and gone once they leave", async ({ page, browser }) => {
  const { editor } = await ownerAndEditor(page, browser)
  try {
    await expect(othersHere(page, 1)).toBeVisible()
    await expect(othersHere(editor.page, 1)).toBeVisible()
    // The avatar is the first letter of the name, which is the email until
    // a display name is set.
    await expect(othersHere(page, 1)).toHaveText(editor.account.email.charAt(0).toUpperCase())

    // The pointer over the canvas is shared too, labelled with the name.
    const box = await canvas(editor.page).boundingBox()
    if (!box) throw new Error("The editor's canvas has no box to move over")
    await editor.page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 10 })
    await expect(canvas(page).getByText(editor.account.email)).toBeVisible()

    // Closing the page is leaving: the page says goodbye on the way out, so
    // the owner is not left with an avatar until the socket times out.
    await editor.page.close()
    await expect(othersHere(page, 1)).toHaveCount(0)
    // The cursor is slower to go. It is awareness, not presence, and the
    // goodbye for it is a last broadcast from the pagehide handler, which
    // does not get out: measured on 2026-09-23, the avatar is gone within
    // 100 ms of the page closing or navigating away, the cursor after 32 s,
    // when the awareness protocol drops a state nobody has refreshed for
    // thirty seconds. That is what a person sees too, so the wait allows
    // for it; once the goodbye arrives, this can be the default timeout.
    await expect(canvas(page).getByText(editor.account.email)).toHaveCount(0, { timeout: 45_000 })
  } finally {
    await editor.context.close()
  }
})

test("a viewer sees the changes as they come, and has no tools", async ({ page, browser }) => {
  const id = freshId()
  const { slug } = await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  const boardUrl = page.url()

  const viewer = await inviteAndJoin(page, browser, slug, "Viewer")
  try {
    await page.goto(boardUrl)
    await expect(whiteboardTools(page)).toBeVisible()
    await viewer.page.goto(boardUrl)

    // Read-only, and it says so: no tools, no title to edit, the badge
    // instead of "Saved".
    await expect(viewer.page.getByText("View only")).toBeVisible()
    await expect(whiteboardTools(viewer.page)).toHaveCount(0)
    await expect(viewer.page.getByLabel("Document title")).toHaveCount(0)

    const title = `Alpha ${id}`
    await addNode(page, title)
    await expectSaved(page)
    // A viewer holds no Realtime connection. They re-read the document
    // every twenty seconds instead, so this one wait is longer than the
    // suite's default: the change is in the database by now, and the next
    // read brings it.
    await expect(nodeLabelled(viewer.page, title)).toBeVisible({ timeout: 45_000 })

    // Watching, not present: a viewer announces itself to the database with
    // a heartbeat, not to the channel, so there is no avatar for them. The
    // owner's page learns the count when it next reads the database, which
    // a reload makes it do.
    await expect(othersHere(page, 1)).toHaveCount(0)
    await page.reload()
    await expect(whiteboardTools(page)).toBeVisible()
    await expect(page.getByText("1 watching")).toBeVisible()
  } finally {
    await viewer.context.close()
  }
})
