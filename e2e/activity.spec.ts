import { expect, test } from "@playwright/test"

import { createProject, freshAccount, signUp } from "./support/app"
import { stepsOf } from "./support/database"
import { cronSecret, emailConfigured, operatorContact } from "./support/email"
import { mailContaining, mailWithSubject } from "./support/mailpit"

// The step record and the operator's email (lib/activity.ts). Nothing of it
// is on a page: the steps are rows only the operator reads, so a spec reads
// them as the operator would (support/database.ts), and the email in Mailpit.

const today = () => new Date().toISOString().slice(0, 10)

test("a new account is announced to the operator, and its first steps are recorded", async ({ page }) => {
  const account = await signUp(page)
  await expect.poll(() => stepsOf(account.email)).toContain("signed_up")

  // The dialog has no trip to the server of its own, so it makes one.
  await page.getByRole("button", { name: "Import from GitHub" }).first().click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect.poll(() => stepsOf(account.email)).toContain("opened_github_import")

  await createProject(page, "First project")
  await expect.poll(() => stepsOf(account.email)).toEqual(["signed_up", "opened_github_import", "created_project"])

  if (!emailConfigured || !operatorContact) return
  const email = await mailWithSubject(`New account: ${account.email}`)
  expect(email.To.map((to) => to.Address)).toEqual([operatorContact])
  expect(email.Text).toContain(`Who: ${account.email}`)
  expect(email.Text).toContain("How: Email")
  expect(email.Text).toMatch(/When: .+ UTC/)
  expect(`${email.Text}${email.HTML}`).not.toMatch(/https?:\/\//)
})

test("the daily summary refuses anyone without the secret", async ({ request }) => {
  const anonymous = await request.get("/api/cron/daily-summary")
  expect(anonymous.status()).toBe(cronSecret ? 401 : 503)

  const guessed = await request.get("/api/cron/daily-summary", { headers: { Authorization: "Bearer guessed" } })
  expect(guessed.status()).toBe(cronSecret ? 401 : 503)
})

test("the daily summary, called with the secret, emails the operator the day's new accounts and their steps", async ({
  page,
  request,
}) => {
  test.skip(!cronSecret, "CRON_SECRET is not set for the server under test")
  test.skip(!emailConfigured || !operatorContact, "the server under test sends no email to an operator")

  const account = await signUp(page, freshAccount())
  await createProject(page, "Summarized")

  const day = today()
  const response = await request.get(`/api/cron/daily-summary?day=${day}`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  })
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ sent: true, day })

  const heading = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`))
  const summary = await mailContaining(`Subcanvas, ${heading}: `, account.email)
  expect(summary.To.map((to) => to.Address)).toEqual([operatorContact])
  const entry = summary.Text.slice(summary.Text.indexOf(account.email)).split("\n\n")[0]
  expect(entry).toMatch(/\(Email, .+\)/)
  expect(entry).toContain("Signed up")
  expect(entry).toContain("Created a project")
  expect(summary.Text).toMatch(/Accounts in all: \d+/)
  // And what went wrong that day, from our own error reports, or that nothing did.
  expect(summary.Text).toMatch(/Errors that day: (none|\d+ times?)/)
})
