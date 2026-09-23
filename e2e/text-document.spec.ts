import { expect, test } from "@playwright/test"

import { createProject, expectSaved, freshId, signUpWithOrg } from "./support/app"
import {
  createTextDocument,
  documentText,
  expectSavedByNow,
  inviteAndJoin,
  othersHere,
  pageEditor,
} from "./support/collab"

// A text document on a page of its own, made from the project tree: not
// the description a node holds, but a sheet of text in the project.

// BlockNote gives a bulleted list no list role: each item is a block with
// its content type on it, and the bullet is drawn by CSS. The attribute is
// the one handle there is.
const bullets = (editor: ReturnType<typeof pageEditor>) =>
  editor.locator('[data-content-type="bulletListItem"]')

test("a text document made from the tree keeps its heading and list through a reload", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createTextDocument(page, `Notes ${id}`)

  const editor = pageEditor(page)
  await editor.click()
  // Markdown as you type: "# " makes a heading and "- " a bulleted list;
  // Enter in a list starts the next item.
  await page.keyboard.type(`# Heading ${id}`)
  await page.keyboard.press("Enter")
  await page.keyboard.type(`- First ${id}`)
  await page.keyboard.press("Enter")
  await page.keyboard.type(`Second ${id}`)

  await expect(editor.getByRole("heading", { name: `Heading ${id}` })).toBeVisible()
  await expect(bullets(editor)).toHaveText([`First ${id}`, `Second ${id}`])
  await expectSaved(page)

  await page.reload()
  await expect(pageEditor(page)).toBeVisible()
  await expect(pageEditor(page).getByRole("heading", { name: `Heading ${id}` })).toBeVisible()
  await expect(bullets(pageEditor(page))).toHaveText([`First ${id}`, `Second ${id}`])
})

test("two people typing in the same text document end up with the same text", async ({ page, browser }) => {
  const id = freshId()
  const { slug } = await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createTextDocument(page, `Notes ${id}`)
  const docUrl = page.url()

  const editor = await inviteAndJoin(page, browser, slug, "Editor")
  try {
    // Inviting took the owner to Settings. Back to the page, both of them,
    // and each has seen the other before anyone types: keystrokes are only
    // broadcast to people known to be there.
    await page.goto(docUrl)
    await expect(pageEditor(page)).toBeVisible()
    await editor.page.goto(docUrl)
    await expect(pageEditor(editor.page)).toBeVisible()
    await expect(othersHere(page, 1)).toBeVisible()
    await expect(othersHere(editor.page, 1)).toBeVisible()

    // The owner writes the first line. The other person waits for it: a
    // fresh document holds no block until the first keystroke, and two
    // people making that first keystroke at once would each write a first
    // block of their own.
    const alpha = `Alpha ${id}`
    await pageEditor(page).click()
    await page.keyboard.type(alpha)
    await expect(pageEditor(editor.page)).toContainText(alpha)

    // The other person puts a line of their own under it.
    const beta = `Beta ${id}`
    await pageEditor(editor.page).getByText(alpha).click()
    await editor.page.keyboard.press("End")
    await editor.page.keyboard.press("Enter")
    await editor.page.keyboard.type(beta)
    await expect(pageEditor(page)).toContainText(beta)

    // Now both at once, each at the end of their own line.
    const alphaMore = `${alpha} again ${id}`
    const betaMore = `${beta} too ${id}`
    await Promise.all([
      page.keyboard.type(` again ${id}`),
      editor.page.keyboard.type(` too ${id}`),
    ])
    for (const someone of [page, editor.page]) {
      await expect(pageEditor(someone)).toContainText(alphaMore)
      await expect(pageEditor(someone)).toContainText(betaMore)
    }
    // The same text, word for word, on both sides. Both have everything by
    // now, so the owner's reads as the answer for the other's to reach.
    const mine = await documentText(pageEditor(page))
    await expect.poll(() => documentText(pageEditor(editor.page))).toBe(mine)

    // And in the database: each page saved its own typing.
    await expectSavedByNow(page)
    await expectSavedByNow(editor.page)
    for (const someone of [page, editor.page]) {
      await someone.reload()
      await expect(pageEditor(someone)).toBeVisible()
      await expect(pageEditor(someone)).toContainText(alphaMore)
      await expect(pageEditor(someone)).toContainText(betaMore)
    }
  } finally {
    await editor.context.close()
  }
})
