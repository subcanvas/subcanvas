import { expect, test } from "@playwright/test"

import { cardTitled, createProject, freshAccount, freshId, signUp, signUpWithOrg } from "./support/app"
import {
  callTool,
  connectThroughOAuth,
  documentedTools,
  inviteViewer,
  MCP_PATH,
  OAUTH_SERVER_OFF,
  oauthServerEnabled,
  refusedTool,
  RESOURCE_METADATA_PATH,
} from "./support/mcp"

// The MCP server, reached the way an agent reaches it: over HTTP from Node,
// signed in through the real OAuth flow with the browser as the person.
// docs/MCP.md describes the whole thing.

test("refuses a request without a token and says where to sign in", async ({ request, baseURL }) => {
  const url = `${baseURL}${MCP_PATH}`
  const body = { jsonrpc: "2.0", id: 1, method: "tools/list" }
  const headers = { accept: "application/json, text/event-stream" }

  // RFC 9728: the challenge names the resource metadata, and nothing else
  // when there was no token at all.
  const bare = await request.post(url, { data: body, headers })
  expect(bare.status()).toBe(401)
  expect(bare.headers()["www-authenticate"]).toBe(`Bearer resource_metadata="${baseURL}${RESOURCE_METADATA_PATH}"`)

  // A token that is not one is told so, which is what makes a client throw
  // its old token away and sign in again.
  const garbage = await request.post(url, { data: body, headers: { ...headers, authorization: "Bearer not-a-token" } })
  expect(garbage.status()).toBe(401)
  expect(garbage.headers()["www-authenticate"]).toContain('error="invalid_token"')

  // The metadata, at the root and at the endpoint's own path, both name this
  // server and one authorization server.
  for (const path of [RESOURCE_METADATA_PATH, `${RESOURCE_METADATA_PATH}${MCP_PATH}`]) {
    const response = await request.get(path)
    expect(response.ok()).toBe(true)
    const metadata = await response.json()
    expect(metadata.resource).toBe(url)
    expect(metadata.bearer_methods_supported).toContain("header")
    expect(metadata.authorization_servers).toHaveLength(1)
    expect(metadata.authorization_servers[0]).toMatch(/\/auth\/v1$/)
  }
})

test("the consent page asks a signed-out person to sign in and rejects a request it does not know", async ({
  page,
}) => {
  // Not signed in: to the door, and back here afterwards.
  await page.goto("/oauth/consent?authorization_id=nothing")
  await page.waitForURL(/\/login\?next=%2Foauth%2Fconsent%3Fauthorization_id%3Dnothing/)

  // Signed in, but Supabase has no such request.
  await signUp(page)
  await page.goto("/oauth/consent?authorization_id=nothing")
  await expect(cardTitled(page, "This request is no longer valid")).toBeVisible()

  // And nothing to look up at all.
  await page.goto("/oauth/consent")
  await expect(cardTitled(page, "This request is no longer valid")).toBeVisible()
})

test("signs an agent in through the consent page, and it works as that person", async ({ page, baseURL }) => {
  const { account, slug } = await signUpWithOrg(page)
  test.skip(!(await oauthServerEnabled(baseURL!)), OAUTH_SERVER_OFF)

  const { client } = await connectThroughOAuth(page, { baseURL: baseURL!, email: account.email, decision: "approve" })
  if (!client) throw new Error("No client after approval")

  // Every tool the docs promise, and nothing the docs do not know about.
  const { tools } = await client.listTools()
  expect(tools.map((tool) => tool.name).sort()).toEqual(documentedTools().sort())

  // The token is the person's own, so the agent sees their org with their role.
  const { orgs } = (await callTool(client, "list_orgs")) as { orgs: { id: string; slug: string; role: string }[] }
  expect(orgs).toEqual([expect.objectContaining({ slug, role: "owner" })])

  const id = freshId()
  const projectName = `Agent project ${id}`
  const boardName = `Agent board ${id}`
  const { project_id } = (await callTool(client, "create_project", { org_id: orgs[0].id, name: projectName })) as {
    project_id: string
  }
  await callTool(client, "create_document", { project_id, type: "whiteboard", title: boardName })
  await client.close()

  // What the agent made is there for the person, in the browser.
  await page.goto(`/${slug}`)
  await page.getByRole("link", { name: projectName }).click()
  await page.waitForURL(`/${slug}/${project_id}`)
  await expect(page.getByRole("link", { name: boardName, exact: true })).toBeVisible()
})

test("cancelling on the consent page gives the agent no token", async ({ page, baseURL }) => {
  const { account } = await signUpWithOrg(page)
  test.skip(!(await oauthServerEnabled(baseURL!)), OAUTH_SERVER_OFF)

  const { client, provider, params } = await connectThroughOAuth(page, {
    baseURL: baseURL!,
    email: account.email,
    decision: "deny",
  })
  expect(client).toBeNull()
  // The refusal comes back as OAuth says it should: an error, no code.
  expect(params.get("code")).toBeNull()
  expect(params.get("error")).toBe("access_denied")
  expect(provider.tokens()).toBeUndefined()
})

test("a viewer's agent can read and cannot write", async ({ page, browser, baseURL }) => {
  const owner = await signUpWithOrg(page)
  const projectId = await createProject(page, "Owner's project")
  const viewer = freshAccount()
  const invite = await inviteViewer(page, owner.slug, viewer.email)

  // The viewer's own browser, with nothing of the owner's in it.
  const viewerContext = await browser.newContext()
  const viewerPage = await viewerContext.newPage()
  try {
    await signUp(viewerPage, viewer)
    await viewerPage.goto(invite)
    await viewerPage.getByRole("button", { name: "Accept invite" }).click()
    await viewerPage.waitForURL(`/${owner.slug}`)
    test.skip(!(await oauthServerEnabled(baseURL!)), OAUTH_SERVER_OFF)

    const { client } = await connectThroughOAuth(viewerPage, {
      baseURL: baseURL!,
      email: viewer.email,
      decision: "approve",
    })
    if (!client) throw new Error("No client after approval")

    const { orgs } = (await callTool(client, "list_orgs")) as {
      orgs: { id: string; slug: string; role: string; can_edit: boolean }[]
    }
    expect(orgs).toEqual([expect.objectContaining({ slug: owner.slug, role: "viewer", can_edit: false })])

    // Reads work: the viewer can look.
    const { projects } = (await callTool(client, "list_projects", { org_id: orgs[0].id })) as {
      projects: { id: string }[]
    }
    expect(projects.map((project) => project.id)).toContain(projectId)

    // Writes are refused by the database, in the same words the app uses.
    expect(await refusedTool(client, "create_project", { org_id: orgs[0].id, name: "Viewer was here" })).toMatch(
      /permission/i
    )
    expect(await refusedTool(client, "create_document", { project_id: projectId, type: "text" })).toMatch(/permission/i)

    // And nothing appeared.
    const after = (await callTool(client, "list_projects", { org_id: orgs[0].id })) as { projects: { id: string }[] }
    expect(after.projects.map((project) => project.id)).toEqual([projectId])
    await client.close()
  } finally {
    await viewerContext.close()
  }
})
