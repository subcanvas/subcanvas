import { expect, test } from "@playwright/test"

import { addNode, createProject, createWhiteboard, expectSaved, freshId, signUpWithOrg } from "./support/app"

// Every public page offers a way to report it. Reports go to the operator,
// who can take a project down; that switch (`taken_down_at`) is turned by
// hand in the database and has no page of its own, so what a test can
// reach is the report itself and the state a project is in once it is no
// longer public, which is the same check a takedown flips.

test("a visitor with no account can report a public project", async ({ page, browser }) => {
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
