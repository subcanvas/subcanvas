import { expect, test } from "@playwright/test"

import { addNode, createProject, createWhiteboard, expectSaved, freshId, signUpWithOrg } from "./support/app"

// A whiteboard in a public project is also a picture, for a README: one
// address that stays current, answered without a session.

// "Copy embed" writes to the clipboard, and the test reads it back.
test.use({ permissions: ["clipboard-read", "clipboard-write"] })

// The whiteboard's id, from the address of the page it is open on.
const openDocumentId = (page: import("@playwright/test").Page) => new URL(page.url()).pathname.split("/d/")[1]

test("a public whiteboard is served as an SVG with its nodes, an ETag, and headers that keep it inert", async ({
  page,
  browser,
}) => {
  const id = freshId()
  await signUpWithOrg(page)
  const projectId = await createProject(page, "Proj", "public")
  await createWhiteboard(page, "Board")
  // One short word each: the picture wraps a title at spaces and cuts a
  // long line short, and the titles have to be found whole in it.
  const alpha = `Alpha${id.slice(0, 6)}`
  const beta = `Beta${id.slice(0, 6)}`
  await addNode(page, alpha)
  await addNode(page, beta)
  // "Saved" is the badge's word for "Postgres has taken it", which is what
  // the picture is drawn from.
  await expectSaved(page)
  const docId = openDocumentId(page)

  // Asked with no cookies, as GitHub's image proxy would.
  const origin = new URL(page.url()).origin
  const visitor = await browser.newContext()
  try {
    const address = `${origin}/p/${projectId}/d/${docId}/embed.svg`
    const response = await visitor.request.get(address)
    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toContain("image/svg+xml")
    // Nothing in the picture may run or load anything, and no other site
    // may frame it. The policy is the one next.config.ts restates for this
    // route, with the frame rule added to the route's own.
    expect(response.headers()["content-security-policy"]).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"
    )
    expect(response.headers()["x-content-type-options"]).toBe("nosniff")
    // Public pages are reachable by link only, and a picture cannot say so
    // in its own markup.
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow")
    expect(response.headers()["cache-control"]).toContain("max-age=300")

    const svg = await response.text()
    expect(svg).toContain("<svg")
    expect(svg).toContain(alpha)
    expect(svg).toContain(beta)

    // The tag is what a cache asks with, and an unchanged picture is not
    // sent twice.
    const etag = response.headers()["etag"]
    expect(etag).toMatch(/^"[A-Za-z0-9_-]+"$/)
    const again = await visitor.request.get(address, { headers: { "If-None-Match": etag } })
    expect(again.status()).toBe(304)

    // The dark theme is a picture of its own, for the <picture> element.
    const dark = await visitor.request.get(`${address}?theme=dark`)
    expect(dark.status()).toBe(200)
    expect(dark.headers()["etag"]).not.toBe(etag)
  } finally {
    await visitor.close()
  }
})

test("Share offers an embed snippet for a public whiteboard, and copies a <picture>", async ({ page }) => {
  await signUpWithOrg(page)
  const projectId = await createProject(page, "Proj", "public")
  await createWhiteboard(page, "Board")
  const docId = openDocumentId(page)

  await page.getByRole("button", { name: "Share" }).click()
  await expect(page.getByText("Public project", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Copy embed" }).click()
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible()

  const origin = new URL(page.url()).origin
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  // HTML rather than Markdown, because GitHub allows <picture> in a README
  // and that is what lets the diagram follow the reader's theme.
  expect(copied).toContain("<picture>")
  expect(copied).toContain(`<a href="${origin}/p/${projectId}/d/${docId}">`)
  expect(copied).toContain(`srcset="${origin}/p/${projectId}/d/${docId}/embed.svg?theme=dark"`)
  expect(copied).toContain(`src="${origin}/p/${projectId}/d/${docId}/embed.svg"`)
  expect(copied).toContain('alt="Board, a Subcanvas diagram"')
})

test("a private project's embed is not found, and is still a picture that says so", async ({ page, browser }) => {
  await signUpWithOrg(page)
  const projectId = await createProject(page, "Proj")
  await createWhiteboard(page, "Board")
  const docId = openDocumentId(page)

  // Private, so the Share popover offers no embed either.
  await page.getByRole("button", { name: "Share" }).click()
  await expect(page.getByText("Private project", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Copy embed" })).toHaveCount(0)

  const origin = new URL(page.url()).origin
  const visitor = await browser.newContext()
  try {
    const response = await visitor.request.get(`${origin}/p/${projectId}/d/${docId}/embed.svg`)
    expect(response.status()).toBe(404)
    // A broken image where a sentence can say why would help nobody.
    expect(response.headers()["content-type"]).toContain("image/svg+xml")
    expect(await response.text()).toContain("This diagram is private or does not exist")
  } finally {
    await visitor.close()
  }
})
