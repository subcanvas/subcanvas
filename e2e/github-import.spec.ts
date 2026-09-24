import { expect, test } from "@playwright/test"

import {
  breadcrumb,
  clickNode,
  closePanel,
  inspector,
  nodeDocument,
  nodeLabelled,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"
import { canvas, devBaseURL, treeLink } from "./support/import"

// Against the development server, where "fixture/<name>" imports a folder
// under e2e/fixtures/github instead of asking GitHub (see support/import.ts).
// The repository imported here is `orchard`: a README and a `.subcanvas`
// file at the root, `apps/web`, and `services/payments` connected to
// `services/ledger` by a described arrow. Two folders under payments,
// `refunds` and `webhooks`, are past the automatic depth and are mapped by
// `.subcanvas` files of their own; the launch demo walks into them.
test.use({ baseURL: devBaseURL })

// A development server compiles each page the first time it is asked for,
// and this spec passes through five of them.
test.slow()

test("a repository becomes a diagram: a node per folder, READMEs read-only, arrows from .subcanvas", async ({
  page,
}) => {
  const { slug } = await signUpWithOrg(page)

  // An org with no projects offers the import in the middle of the page.
  await expect(page.getByText("Start with a project")).toBeVisible()
  await page.getByRole("button", { name: "Import from GitHub" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("textbox", { name: "Repository" }).fill("fixture/orchard")
  await dialog.getByRole("button", { name: "Import", exact: true }).click()

  // Nothing in this repository is skipped, so the import goes straight to
  // the top whiteboard rather than stopping to show notes.
  await page.waitForURL(new RegExp(`/${slug}/[0-9a-f-]{36}/d/[0-9a-f-]{36}$`))
  await expect(whiteboardTools(page)).toBeVisible()
  // The root `.subcanvas` names the top whiteboard.
  await expect(breadcrumb(page).getByText("Orchard", { exact: true })).toBeVisible()

  // One node per folder at the top: `apps` and `services`, plus the
  // repository's own README. The folders inside them are not here; they are
  // on the whiteboards inside those nodes.
  await expect(nodeLabelled(page, "Apps")).toBeVisible()
  await expect(nodeLabelled(page, "Services")).toBeVisible()
  await expect(nodeLabelled(page, "README")).toBeVisible()
  await expect(nodeLabelled(page, "Web")).toHaveCount(0)
  await expect(nodeLabelled(page, "Payments")).toHaveCount(0)

  // The README opens in the panel beside its node, read-only: the
  // repository owns it, and the bar above the text says where it is from.
  await clickNode(page, "README")
  const panel = inspector(page)
  await expect(panel).toBeVisible()
  const readme = nodeDocument(page)
  await expect(readme.getByRole("link", { name: "fixture/orchard" })).toBeVisible()
  await expect(readme.getByText("README.md")).toBeVisible()
  await expect(readme.getByRole("link", { name: "Edit on GitHub" })).toBeVisible()
  const words = "A small shop, split into services the way a real one would be."
  await expect(readme.getByText(words)).toBeVisible()

  // Typing into it changes nothing. Letters with no whiteboard shortcut, so
  // that the keys go nowhere else either.
  await readme.getByText(words).click()
  await page.keyboard.type("xyz")
  await expect(readme).not.toContainText("xyz")
  await expect(readme.getByText(words)).toBeVisible()

  // A folder with folders inside it holds a whiteboard of them. The panel
  // is closed first: open, it covers the right of the canvas, where this
  // node is, and the press would land on the panel instead.
  await closePanel(page)
  await clickNode(page, "Services")
  await expect(panel.getByText("A whiteboard. Click to go inside.")).toBeVisible()
  await panel.getByRole("button", { name: "Services" }).click()
  await expect(breadcrumb(page).getByText("Services", { exact: true })).toBeVisible()
  await expect(whiteboardTools(page)).toBeVisible()
  await expect(nodeLabelled(page, "Payments")).toBeVisible()
  await expect(nodeLabelled(page, "Ledger")).toBeVisible()
  await expect(nodeLabelled(page, "Apps")).toHaveCount(0)
  // The nested whiteboard is a document of the project, under the top one.
  await expect(treeLink(page, "Services")).toBeVisible()
  await expect(treeLink(page, "Orchard")).toBeVisible()

  // `services/payments/.subcanvas` connects it to the ledger. The arrow's
  // label is drawn at its middle, so a press there lands on the arrow
  // itself (the label passes pointer events through) and selects it.
  const label = canvas(page).getByText("gRPC", { exact: true })
  await expect(label).toBeVisible()
  const box = await label.boundingBox()
  if (!box) throw new Error("The arrow's label has no box to press")
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(panel).toBeVisible()
  await expect(panel.getByText("Arrow", { exact: true })).toBeVisible()
  await expect(panel.getByLabel("Label")).toHaveValue("gRPC")
  // The description from the file is the document behind the arrow.
  const description = nodeDocument(page)
  await expect(description.getByRole("heading", { name: "Description" })).toBeVisible()
  await expect(description.getByText("Posts a journal entry for every settled charge.")).toBeVisible()
})

test("a repository that does not exist is refused in the dialog, with nothing created", async ({ page }) => {
  const { slug } = await signUpWithOrg(page)

  await page.getByRole("button", { name: "Import from GitHub" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("textbox", { name: "Repository" }).fill("fixture/nowhere")
  await dialog.getByRole("button", { name: "Import", exact: true }).click()

  await expect(dialog.getByRole("alert")).toHaveText("There is no fixture named nowhere.")
  // Still the same page, still nothing in the org.
  expect(new URL(page.url()).pathname).toBe(`/${slug}`)
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(page.getByText("Start with a project")).toBeVisible()
})
