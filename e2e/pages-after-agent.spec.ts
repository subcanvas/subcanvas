import { expect, test } from "@playwright/test"

import { createProject, freshId, signUpWithOrg } from "./support/app"
import { callTool, connectThroughOAuth, OAUTH_SERVER_OFF, oauthServerEnabled } from "./support/mcp"

// A regression that took pages down for everyone until the server was
// restarted. The MCP endpoint renders text on the server with BlockNote,
// which loads Base UI's client hooks into the server. A component that called
// one of those hooks without "use client" (Badge did) then threw from every
// server page that drew it: Settings → General and Members, and every public
// project. Nothing was wrong before the first agent read a list, so the order
// here is the point.
test("pages that draw badges still load after an agent reads a list", async ({ page, baseURL }) => {
  const { account, slug } = await signUpWithOrg(page)
  const projectId = await createProject(page, `Public ${freshId()}`, "public")
  test.skip(!(await oauthServerEnabled(baseURL!)), OAUTH_SERVER_OFF)

  const { client } = await connectThroughOAuth(page, { baseURL: baseURL!, email: account.email, decision: "approve" })
  if (!client) throw new Error("No client after approval")
  const { document_id } = (await callTool(client, "create_document", {
    project_id: projectId,
    type: "text",
    title: "Checklist",
    markdown: "- first\n- second\n- third",
  })) as { document_id: string }
  const read = (await callTool(client, "read_text_document", { document_id })) as { blocks: { markdown: string }[] }
  expect(read.blocks.map((block) => block.markdown)).toEqual(["* first", "* second", "* third"])
  await client.close()

  for (const [path, landmark] of [
    [`/p/${projectId}`, page.getByText("Public project", { exact: true })],
    [`/p/${projectId}/d/${document_id}`, page.getByText("third", { exact: true })],
    [`/${slug}/settings/general`, page.getByRole("heading", { name: "General", level: 1 })],
    [`/${slug}/settings/members`, page.getByRole("heading", { name: "Members", level: 1 })],
  ] as const) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(200)
    await expect(landmark, path).toBeVisible()
  }
})
