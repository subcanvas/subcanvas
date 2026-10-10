import { expect, test } from "@playwright/test"

import { createProject, createWhiteboard, freshId, personalSlug, signUp } from "./support/app"
import { corruptDocument, errorCountAt, errorReports } from "./support/database"
import { adminClient, idsOf, NO_ADMIN } from "./support/admin"

// Error reports, kept in our own database (lib/errors). A spec makes errors
// happen, in the browser and on the server, and reads the rows as the
// operator would (support/database.ts). Without the secret key the server
// only logs them, and the specs that read rows skip; the key is found as the
// server's is (support/admin.ts).

const stored = adminClient() !== null

// Letters only: digits and hex are taken out of a message before it is
// stored, so this one stays the same on every report and differs between
// runs.
const word = () => freshId().replace(/\d/g, (digit) => "ghijklmnop"[Number(digit)])

test("an error thrown in the browser is one row, counted each time it happens again", async ({ page }) => {
  test.skip(!stored, NO_ADMIN)
  const account = await signUp(page)
  const marker = word()
  const throwIt = () =>
    page.evaluate((text) => {
      setTimeout(() => {
        throw new Error(`E2E failure ${text}`)
      })
    }, marker)

  await throwIt()
  await expect.poll(() => errorReports(marker)).toEqual([
    { source: "browser", route: "/[org]", message: `E2E failure ${marker}`, count: 1 },
  ])

  // A tab reports an error once; a new page load is a new tab's worth.
  await throwIt()
  await page.reload()
  await throwIt()
  await expect.poll(() => errorReports(marker)[0]?.count).toBe(2)
  expect(errorReports(marker)).toHaveLength(1)
  expect(JSON.stringify(errorReports(marker))).not.toContain(personalSlug(account))
})

test("a failure on the server is one row, counted each time it happens again", async ({ page }) => {
  test.skip(!stored, NO_ADMIN)
  const account = await signUp(page)
  await createProject(page, "Broken")
  await createWhiteboard(page, "Unreadable")
  const { documentId } = await idsOf(page.url(), account)
  if (!documentId) throw new Error("No whiteboard open")
  corruptDocument(documentId)

  const route = "/api/documents/[docId]/svg"
  const before = errorCountAt(route, "server")
  expect((await page.request.get(`/api/documents/${documentId}/svg`)).status()).toBe(500)
  await expect.poll(() => errorCountAt(route, "server")).toBe(before + 1)
  expect((await page.request.get(`/api/documents/${documentId}/svg`)).status()).toBe(500)
  await expect.poll(() => errorCountAt(route, "server")).toBe(before + 2)
})

test("the error route takes reports only from this site, and only small ones", async ({ request, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const report = { name: "Error", message: `E2E refused ${word()}`, stack: null, route: "/" }

  const elsewhere = await request.post("/api/errors", { headers: { origin: "https://evil.example" }, data: JSON.stringify(report) })
  expect(elsewhere.status()).toBe(403)

  const huge = await request.post("/api/errors", {
    headers: { origin },
    data: JSON.stringify({ ...report, stack: "x".repeat(20_000) }),
  })
  expect(huge.status()).toBe(413)

  const garbled = await request.post("/api/errors", { headers: { origin }, data: "not a report" })
  expect(garbled.status()).toBe(400)

  if (stored) expect(errorReports(report.message)).toEqual([])
})
