import { expect, test } from "@playwright/test"

import {
  addNode,
  createProject,
  createWhiteboard,
  freshId,
  inspector,
  nodeLabelled,
  signUpWithOrg,
  whiteboardTools,
} from "./support/app"

// The trail of sheets used to float over the whole whiteboard area, panel
// included, while the tools are centred on the canvas alone. Opening the
// panel moved the tools left, under the trail, and the trail took the press:
// with the panel open and an ordinary-length name, Node, Text, Group, Media,
// Undo and Redo could not be pressed at all.
test("the tools can be pressed while the object panel is open", async ({ page }) => {
  const id = freshId()
  await signUpWithOrg(page)

  // Long names, because the trail grows with them and that is what used to
  // reach across the canvas.
  await createProject(page, `Quarterly planning and roadmap ${id}`)
  await createWhiteboard(page, `Architecture of everything ${id}`)

  await addNode(page, `First ${id}`)
  await expect(inspector(page)).toBeVisible()

  // No closing the panel first: this is the press that used to be swallowed.
  await whiteboardTools(page).getByRole("button", { name: "Node", exact: true }).click()

  const second = `Second ${id}`
  await inspector(page).getByLabel("Title").fill(second)
  await expect(nodeLabelled(page, second)).toBeVisible()
})
