import { expect, test, type Page } from "@playwright/test"

import { createProject, createWhiteboard, expectSaved, signUpWithOrg } from "./support/app"
import { nodeNamed } from "./support/canvas"

// A link pasted on a whiteboard becomes a card (lib/links): the page's title
// and site, read once by the server, and a mark that opens the page.

async function pasteText(page: Page, text: string) {
  await page.evaluate((pasted) => {
    const data = new DataTransfer()
    data.setData("text/plain", pasted)
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
  }, text)
}

const card = (page: Page, title: string) => page.getByRole("group", { name: `Link: ${title}`, exact: true })

test("a pasted link becomes a card with the page's title, and opens the page", async ({ page }) => {
  await signUpWithOrg(page)
  await createProject(page, "Proj")
  await createWhiteboard(page, "Board")

  // A page on the open internet: example.com has said the same thing for
  // decades.
  await pasteText(page, "https://example.com/")
  await expect(card(page, "Example Domain")).toBeVisible({ timeout: 20_000 })
  await expect(card(page, "Example Domain").getByRole("link", { name: /^Open Example Domain/ })).toHaveAttribute(
    "href",
    "https://example.com/"
  )

  // An address nobody can reach still gets a card, named after its site.
  await pasteText(page, "https://nothing-here.invalid/some/page")
  await expect(card(page, "nothing-here.invalid")).toBeVisible({ timeout: 20_000 })

  // And one on this server's own network is never fetched: the card has
  // only the address.
  await pasteText(page, "http://169.254.169.254/latest/meta-data/")
  await expect(card(page, "169.254.169.254")).toBeVisible({ timeout: 20_000 })

  // Text that is not just a link is not a card.
  await pasteText(page, "see https://example.com/ for more")
  await expect(page.getByRole("group", { name: /^Link: / })).toHaveCount(3)

  await expectSaved(page)
  await page.reload()
  await expect(card(page, "Example Domain")).toBeVisible()
  await expect(nodeNamed(page, "Example Domain")).toHaveCount(0)
})
