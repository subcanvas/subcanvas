import { expect, test } from "@playwright/test"

import { addNode, createProject, createWhiteboard, expectSaved, freshId, signUpWithOrg } from "./support/app"
import { takeDown } from "./support/database"
import { abuseContact, emailConfigured } from "./support/email"
import { mailWithSubject } from "./support/mailpit"

// Every public page offers a way to report it. Reports go to the operator,
// by email when the server sends email, and the operator can take a project
// down. That switch (`taken_down_at`) is turned by hand in the database and
// has no page of its own, so a spec turns it the same way
// (support/database.ts) and looks at what the project's members see.

test("a visitor with no account can report a public project, and the operator is emailed", async ({
  page,
  browser,
}) => {
  const id = freshId()
  await signUpWithOrg(page)
  const projectId = await createProject(page, `Proj ${id}`, "public")
  await createWhiteboard(page, "Board")
  await addNode(page, `Alpha ${id}`)
  await expectSaved(page)

  const origin = new URL(page.url()).origin
  const visitorContext = await browser.newContext()
  const visitor = await visitorContext.newPage()
  try {
    await visitor.goto(`${origin}/p/${projectId}`)
    await expect(visitor.getByText("Public project")).toBeVisible()

    await visitor.getByRole("button", { name: "Report" }).click()
    const dialog = visitor.getByRole("dialog")
    await expect(dialog.getByText("Report this project")).toBeVisible()

    // A reason has to say something: fewer than ten characters is refused
    // by the form itself, and nothing is sent.
    await dialog.getByLabel("What is wrong?").pressSequentially("spam")
    await dialog.getByRole("button", { name: "Send report" }).click()
    await expect(dialog).toBeVisible()
    await expect(visitor.getByText("Thanks. The report was sent.")).toHaveCount(0)

    await dialog.getByLabel("What is wrong?").fill(`This is spam, reported by e2e ${id}.`)
    await dialog.getByLabel("Your email (optional, if you want a reply)").fill(`reporter-${id}@example.test`)
    await dialog.getByRole("button", { name: "Send report" }).click()
    await expect(visitor.getByText("Thanks. The report was sent.")).toBeVisible()
    await expect(dialog).toBeHidden()

    // The page is still there for the visitor: a report alone changes
    // nothing about what is public. That is the operator's decision.
    await visitor.reload()
    await expect(visitor.getByText("Public project")).toBeVisible()
    await expect(visitor.getByRole("button", { name: "Report" })).toBeVisible()
  } finally {
    await visitorContext.close()
  }

  // The operator hears of it: the project, the reason, and the reporter,
  // whom a reply goes to.
  if (!emailConfigured || !abuseContact) return
  const email = await mailWithSubject(`Report: Proj ${id}`)
  expect(email.To.map((to) => to.Address)).toEqual([abuseContact])
  expect(email.ReplyTo.map((to) => to.Address)).toEqual([`reporter-${id}@example.test`])
  expect(email.Text).toContain(`This is spam, reported by e2e ${id}.`)
  expect(email.Text).toContain(`/p/${projectId}`)
  expect(email.Text).toContain(`update public.projects set taken_down_at = now() where id = '${projectId}';`)
})

test("a project taken down by the operator tells its members so, and whom to write to", async ({ page, browser }) => {
  const id = freshId()
  const { slug } = await signUpWithOrg(page)
  const projectId = await createProject(page, `Proj ${id}`, "public")
  await createWhiteboard(page, "Board")
  const boardURL = page.url()

  takeDown(projectId)

  // Gone for everyone else.
  const origin = new URL(page.url()).origin
  const visitorContext = await browser.newContext()
  try {
    const response = await visitorContext.request.get(`${origin}/p/${projectId}`)
    expect(response.status()).toBe(404)
  } finally {
    await visitorContext.close()
  }

  // Its own workspace sees it for what it is: not public, whatever its
  // setting.
  await page.goto(`/${slug}`)
  const card = page.getByRole("link").filter({ hasText: `Proj ${id}` })
  await expect(card.getByText("Taken down")).toBeVisible()
  await expect(card.getByText("Public", { exact: true })).toHaveCount(0)

  // Share says what that means, and offers no link that leads nowhere.
  await page.goto(boardURL)
  await page.getByRole("button", { name: "Share" }).click()
  const popover = page.getByRole("dialog")
  await expect(popover.getByText("Taken down", { exact: true })).toBeVisible()
  await expect(popover.getByText("Its public link shows nothing")).toBeVisible()
  await expect(popover.getByLabel("Public link")).toHaveCount(0)
  await expect(popover.getByRole("button", { name: "Copy embed" })).toHaveCount(0)
  if (abuseContact)
    expect(await popover.getByRole("link", { name: abuseContact }).getAttribute("href")).toMatch(
      `mailto:${abuseContact}?subject=`
    )

  // Members still work in it as before.
  await expect(page.getByRole("toolbar", { name: "Whiteboard tools" })).toBeVisible()
})

test("once a project is no longer public, a report is refused and the page is gone", async ({ page, browser }) => {
  const id = freshId()
  await signUpWithOrg(page)
  const projectId = await createProject(page, "Proj", "public")
  await createWhiteboard(page, "Board")
  await addNode(page, `Alpha ${id}`)
  await expectSaved(page)

  const origin = new URL(page.url()).origin
  const visitorContext = await browser.newContext()
  const visitor = await visitorContext.newPage()
  try {
    // The visitor has the page open, with the report form filled in.
    await visitor.goto(`${origin}/p/${projectId}`)
    await expect(visitor.getByText("Public project")).toBeVisible()
    await visitor.getByRole("button", { name: "Report" }).click()
    const dialog = visitor.getByRole("dialog")
    await dialog.getByLabel("What is wrong?").fill(`Reported after it went private, by e2e ${id}.`)

    // Meanwhile the project stops being public. A takedown sets
    // `taken_down_at` instead of the visibility; both are read by the one
    // function that says whether a project is public, which the report
    // checks first.
    await page.getByRole("button", { name: "Share" }).click()
    await page.getByRole("button", { name: "Make private" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Make private" }).click()
    await expect(page.getByText("This project is now private.")).toBeVisible()

    await dialog.getByRole("button", { name: "Send report" }).click()
    await expect(visitor.getByText("The report could not be sent. Try again.")).toBeVisible()
    await expect(dialog).toBeVisible()

    // And the page itself is not found any more, signed in or not.
    const response = await visitorContext.request.get(`${origin}/p/${projectId}`)
    expect(response.status()).toBe(404)
    await visitor.reload()
    await expect(visitor.getByText("Public project")).toHaveCount(0)
    await expect(visitor.getByRole("button", { name: "Report" })).toHaveCount(0)
  } finally {
    await visitorContext.close()
  }
})
