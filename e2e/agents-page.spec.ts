import { expect, test } from "@playwright/test"

import { openWorkspaceMenu, signUpWithOrg } from "./support/app"
import { documentedTools, MCP_PATH, OAUTH_SERVER_OFF, oauthServerEnabled, readClipboard } from "./support/mcp"

// The page that gets an agent connected: the address, and the shortest way
// into each client, all built from the address the page was served on.

test("shows the server address and a way in for every client", async ({ page, baseURL }) => {
  test.skip(!(await oauthServerEnabled(baseURL!)), OAUTH_SERVER_OFF)
  const { account, slug } = await signUpWithOrg(page)
  // From the workspace's menu in the sidebar.
  const menu = await openWorkspaceMenu(page, `E2E ${account.id}`)
  await menu.getByRole("menuitem", { name: "Connect an agent" }).click()
  await page.waitForURL(`/${slug}/agents`)
  await expect(page.getByRole("heading", { name: "Connect an agent" })).toBeVisible()

  const url = `${baseURL}${MCP_PATH}`
  // Exact: the address is also inside every command below it.
  await expect(page.getByText(url, { exact: true })).toBeVisible()

  // The copy button really copies the address.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL })
  await page.getByRole("button", { name: "Copy the server address" }).click()
  await expect(page.getByRole("button", { name: "Copy the server address" })).toHaveText(/Copied/)
  expect(await readClipboard(page)).toBe(url)

  // Claude Code: the plugin first, from this repository's marketplace. Its
  // server is subcanvas.app's, which this server is not, so the page says to
  // add this one as well.
  await expect(
    page.getByText("claude plugin marketplace add subcanvas/subcanvas && claude plugin install subcanvas@subcanvas", {
      exact: true,
    })
  ).toBeVisible()
  await expect(page.getByText(/The plugin connects to subcanvas\.app\. To connect to this server/)).toBeVisible()

  // The two command-line clients: one command each, naming the server.
  await expect(page.getByText(`claude mcp add --transport http subcanvas ${url}`, { exact: true })).toBeVisible()
  await expect(
    page.getByText(`codex mcp add subcanvas --url ${url} && codex mcp login subcanvas`, { exact: true })
  ).toBeVisible()

  // Cursor's deep link carries the server's mcp.json entry, base64-encoded.
  const cursor = new URL((await page.getByRole("link", { name: "Add to Cursor" }).getAttribute("href")) ?? "")
  expect(cursor.protocol).toBe("cursor:")
  expect(cursor.host).toBe("anysphere.cursor-deeplink")
  expect(cursor.pathname).toBe("/mcp/install")
  expect(cursor.searchParams.get("name")).toBe("subcanvas")
  expect(JSON.parse(atob(cursor.searchParams.get("config") ?? ""))).toEqual({ url })

  // VS Code's carries the entry as URL-encoded JSON after the question mark.
  const vscode = new URL((await page.getByRole("link", { name: "Add to VS Code" }).getAttribute("href")) ?? "")
  expect(vscode.protocol).toBe("vscode:")
  expect(vscode.pathname).toBe("mcp/install")
  expect(JSON.parse(decodeURIComponent(vscode.search.slice(1)))).toEqual({ name: "subcanvas", type: "http", url })

  // The clients without a link get their steps, and the address is what
  // they paste.
  for (const client of ["Claude (claude.ai and desktop)", "ChatGPT", "Anything else"])
    await expect(page.getByRole("heading", { name: client })).toBeVisible()
})

test("suggests what to ask, ready to copy", async ({ page, baseURL }) => {
  test.skip(!(await oauthServerEnabled(baseURL!)), OAUTH_SERVER_OFF)
  const { slug } = await signUpWithOrg(page)
  await page.goto(`/${slug}/agents`)
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "What to ask your agent" }) })
  await expect(section.getByRole("listitem")).toHaveCount(5)

  // A prompt is copied as it reads, in full.
  const first = section.getByRole("listitem").first()
  await expect(first.getByRole("heading", { name: "Map a repository" })).toBeVisible()
  const prompt = await first.locator("p").textContent()
  expect(prompt).toMatch(/^Map this repository's services .+ saying what crosses it\.$/)
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL })
  await first.getByRole("button", { name: "Copy the prompt: Map a repository" }).click()
  await expect(first.getByRole("button", { name: "Copy the prompt: Map a repository" })).toHaveText(/Copied/)
  expect(await readClipboard(page)).toBe(prompt)
})

test("lists every documented tool", async ({ page, baseURL }) => {
  test.skip(!(await oauthServerEnabled(baseURL!)), OAUTH_SERVER_OFF)
  const { slug } = await signUpWithOrg(page)
  await page.goto(`/${slug}/agents`)
  await expect(page.getByRole("heading", { name: "What an agent can do here" })).toBeVisible()

  // The same table as docs/MCP.md, and nothing more: the names on the page
  // are the ones an agent will be shown.
  const shown = await page.locator("main li code").allTextContents()
  expect(shown.sort()).toEqual(documentedTools().sort())
})

// A server whose Supabase project has no OAuth server cannot sign an agent
// in, so it does not offer to connect one, and a saved link says why.
test("on a server where agents cannot sign in, nothing offers to connect one", async ({ page, baseURL }) => {
  test.skip(await oauthServerEnabled(baseURL!), "The OAuth server is on here; this is about a server without it.")
  const { account, slug } = await signUpWithOrg(page)
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible()
  const menu = await openWorkspaceMenu(page, `E2E ${account.id}`)
  await expect(menu.getByRole("menuitem", { name: "Members" })).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "Connect an agent" })).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("link", { name: "Connect an agent" })).toHaveCount(0)

  await page.goto(`/${slug}/agents`)
  await expect(page.getByText(/Agents cannot sign in to this server/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Copy the server address" })).toHaveCount(0)
})
