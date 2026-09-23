import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { expect, test } from "@playwright/test"

// The Terms and the Privacy Policy name whoever runs the server, from the
// environment (src/lib/legal.ts). The server reads .env.local itself; the
// test process does not, so this looks where the server looked. CI exports
// the variables for the server's step only, so here they may be unknown:
// then the two pages still have to agree with each other.
function operatorFromEnv(): string | null {
  if (process.env.LEGAL_OPERATOR) return process.env.LEGAL_OPERATOR
  const file = join(__dirname, "../.env.local")
  if (!existsSync(file)) return null
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((candidate) => candidate.startsWith("LEGAL_OPERATOR="))
  return line?.slice("LEGAL_OPERATOR=".length).trim().replace(/^["']|["']$/g, "") || null
}

const NO_OPERATOR = "The server has no LEGAL_OPERATOR, LEGAL_CONTACT and LEGAL_GOVERNING_LAW, so there are no legal pages to test."

test("the Terms and the Privacy Policy name the operator", async ({ page }) => {
  const terms = await page.goto("/terms")
  test.skip(terms?.status() === 404 && operatorFromEnv() === null, NO_OPERATOR)
  expect(terms?.status()).toBe(200)
  await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible()

  // The sentence that says who "we" is.
  const sentence = await page.getByText("we are referring to").first().textContent()
  const named = /we are referring to (.+?), who operates this service/.exec(sentence ?? "")?.[1]
  expect(named).toBeTruthy()
  const expected = operatorFromEnv()
  if (expected) expect(named).toBe(expected)

  const privacy = await page.goto("/privacy")
  expect(privacy?.status()).toBe(200)
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible()
  await expect(page.getByText(`operated by ${named}`)).toBeVisible()

  // Each links to the other.
  const legalNav = page.getByRole("navigation", { name: "Legal" })
  await expect(legalNav.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms")
  await expect(legalNav.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy")
})

test("the landing page and the sign-in card link to them", async ({ page }) => {
  const terms = await page.goto("/terms")
  test.skip(terms?.status() === 404 && operatorFromEnv() === null, NO_OPERATOR)

  await page.goto("/")
  const footer = page.getByRole("contentinfo")
  await expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms")
  await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy")

  await page.goto("/login")
  await expect(page.getByText("By continuing you agree to the")).toBeVisible()
  await page.getByRole("link", { name: "Privacy Policy" }).click()
  await page.waitForURL("/privacy")
  await page.goBack()
  await page.getByRole("link", { name: "Terms of Service" }).click()
  await page.waitForURL("/terms")
})

test("robots.txt and sitemap.xml list them", async ({ request, baseURL }) => {
  const terms = await request.get("/terms")
  test.skip(terms.status() === 404 && operatorFromEnv() === null, NO_OPERATOR)

  const robots = await (await request.get("/robots.txt")).text()
  expect(robots).toMatch(/^Allow: \/terms$/m)
  expect(robots).toMatch(/^Allow: \/privacy$/m)
  expect(robots).toContain(`Sitemap: ${baseURL}/sitemap.xml`)

  const sitemap = await (await request.get("/sitemap.xml")).text()
  expect(sitemap).toContain(`<loc>${baseURL}/terms</loc>`)
  expect(sitemap).toContain(`<loc>${baseURL}/privacy</loc>`)
})
