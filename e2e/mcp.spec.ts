import { expect, test } from "@playwright/test"

import { idsOf } from "./support/admin"

import {
  cardTitled,
  createProject,
  documentAddress,
  freshAccount,
  freshId,
  personalSlug,
  signIn,
  signOut,
  signUp,
  signUpWithOrg,
} from "./support/app"
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
import { takeDown } from "./support/database"

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

  // The token is the person's own, so the agent sees their workspaces with
  // their role: the personal one first, then the team one.
  const { workspaces } = (await callTool(client, "list_workspaces")) as {
    workspaces: { id: string; slug: string; role: string; personal: boolean }[]
  }
  expect(workspaces).toEqual([
    expect.objectContaining({ personal: true, role: "owner" }),
    expect.objectContaining({ slug, personal: false, role: "owner" }),
  ])

  const id = freshId()
  const projectName = `Agent project ${id}`
  const boardName = `Agent board ${id}`
  const { project_id } = (await callTool(client, "create_project", { workspace_id: workspaces[1].id, name: projectName })) as {
    project_id: string
  }
  const { document_id: board, url: boardUrl } = (await callTool(client, "create_document", {
    project_id,
    type: "whiteboard",
    title: boardName,
  })) as { document_id: string; url: string }

  // The address it hands back is the readable one a person sees, and an
  // address a person pastes back leads to the ids again.
  expect(new URL(boardUrl).pathname).toMatch(documentAddress)
  expect(await callTool(client, "open_address", { address: boardUrl })).toEqual(
    expect.objectContaining({ project_id, document_id: board, title: boardName, type: "whiteboard" })
  )
  expect(await callTool(client, "open_address", { address: new URL(boardUrl).pathname.split("/").slice(0, 3).join("/") })).toEqual(
    expect.objectContaining({ project_id, project_name: projectName })
  )
  expect(await refusedTool(client, "open_address", { address: `/${slug}/no-such-project` })).toMatch(/Nothing at that address/)

  // A node deleted by an agent takes what it held to the trash, as on the canvas.
  const inside = `Inside ${id}`
  const { node_ids } = (await callTool(client, "add_nodes", { whiteboard_id: board, nodes: [{ title: inside }] })) as {
    node_ids: string[]
  }
  const { document_id: held } = (await callTool(client, "attach_document", {
    whiteboard_id: board,
    object_id: node_ids[0],
    type: "whiteboard",
  })) as { document_id: string }
  const deleted = (await callTool(client, "delete_nodes", { whiteboard_id: board, node_ids })) as {
    trashed_document_ids: string[]
  }
  expect(deleted.trashed_document_ids).toEqual([held])

  // A project the operator took down reads as taken down, as it does in the
  // app, and has no embed to hand out.
  const { project_id: shown } = (await callTool(client, "create_project", {
    workspace_id: workspaces[1].id,
    name: `Shown ${id}`,
    visibility: "public",
  })) as { project_id: string }
  const { document_id: shownBoard } = (await callTool(client, "create_document", {
    project_id: shown,
    type: "whiteboard",
    title: `Shown board ${id}`,
  })) as { document_id: string }
  takeDown(shown)
  const listed = (await callTool(client, "list_projects", { workspace_id: workspaces[1].id })) as {
    projects: { id: string; visibility: string; taken_down: boolean }[]
  }
  expect(listed.projects.find((project) => project.id === shown)).toEqual(
    expect.objectContaining({ visibility: "public", taken_down: true })
  )
  expect(await refusedTool(client, "get_embed_snippet", { whiteboard_id: shownBoard })).toMatch(/taken down/)
  await client.close()

  // What the agent made is there for the person, in the browser.
  await page.goto(`/${slug}`)
  await page.getByRole("main").getByRole("link", { name: projectName }).click()
  // A project's address opens its first whiteboard.
  await page.waitForURL(new RegExp(`/${slug}/[a-z0-9-]+/[a-z0-9-]*[0-9a-f]{8,32}$`))
  await expect(page.getByRole("link", { name: boardName, exact: true })).toBeVisible()
  await page.goto(`/${slug}/${project_id}/trash`)
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: inside })).toContainText("Whiteboard")
})

test("an approved agent is listed in Profile, and once revoked its token is refused at once", async ({
  page,
  request,
  baseURL,
}) => {
  const { account, slug } = await signUpWithOrg(page)
  test.skip(!(await oauthServerEnabled(baseURL!)), OAUTH_SERVER_OFF)

  const { client, provider } = await connectThroughOAuth(page, { baseURL: baseURL!, email: account.email, decision: "approve" })
  if (!client) throw new Error("No client after approval")
  await callTool(client, "list_workspaces")
  const token = provider.tokens()?.access_token
  if (!token) throw new Error("The client holds no token")

  await page.goto(`/${slug}/settings/profile`)
  const section = page.getByRole("region", { name: "Connected agents" })
  await expect(section.getByText("E2E agent", { exact: true })).toBeVisible()
  await section.getByRole("button", { name: "Revoke E2E agent" }).click()
  await expect(page.getByText("E2E agent is disconnected.")).toBeVisible()
  await expect(section.getByText("No agents are connected.")).toBeVisible()

  // The access token it holds has not run out, and is refused all the same:
  // the server asks Supabase Auth about an agent's session on every call.
  const refused = await request.post(`${baseURL}${MCP_PATH}`, {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  })
  expect(refused.status()).toBe(401)
  // And its refresh token is gone, so the client cannot get another.
  await expect(client.callTool({ name: "list_workspaces", arguments: {} })).rejects.toThrow()
  await client.close().catch(() => {})
})

test("signed in as the wrong account, the consent page signs out, and connecting again works as the right one", async ({
  page,
  baseURL,
}) => {
  test.skip(!(await oauthServerEnabled(baseURL!)), OAUTH_SERVER_OFF)
  const right = await signUp(page)
  await signOut(page)
  const wrong = await signUp(page)

  // Not you? A request belongs to the account that opened it, so signing
  // out refuses it, and the app is told no.
  const refused = await connectThroughOAuth(page, { baseURL: baseURL!, email: wrong.email, decision: "sign-out" })
  expect(refused.client).toBeNull()
  expect(refused.params.get("error")).toBe("access_denied")
  // The browser went back to the app with the refusal, signed out here.
  await page.waitForURL(/\/callback\?error=access_denied/)
  await page.goto("/login")
  await expect(page.getByLabel("Email")).toBeVisible()

  // Connecting again from the app asks again, and the right account says yes.
  await signIn(page, right)
  await page.waitForURL(`/${personalSlug(right)}`)
  const { client } = await connectThroughOAuth(page, { baseURL: baseURL!, email: right.email, decision: "approve" })
  if (!client) throw new Error("No client after approval")

  // The agent is the account that approved it.
  const { workspaces } = (await callTool(client, "list_workspaces")) as { workspaces: { slug: string }[] }
  expect(workspaces.map((workspace) => workspace.slug)).toEqual([personalSlug(right)])
  await client.close()
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
  const { projectId } = await idsOf(`/${owner.slug}/${await createProject(page, "Owner's project")}`, owner.account)
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

    const { workspaces } = (await callTool(client, "list_workspaces")) as {
      workspaces: { id: string; slug: string; role: string; can_edit: boolean; personal: boolean }[]
    }
    expect(workspaces).toEqual([
      expect.objectContaining({ personal: true }),
      expect.objectContaining({ slug: owner.slug, role: "viewer", can_edit: false }),
    ])
    const team = workspaces[1].id

    // Reads work: the viewer can look.
    const { projects } = (await callTool(client, "list_projects", { workspace_id: team })) as {
      projects: { id: string }[]
    }
    expect(projects.map((project) => project.id)).toContain(projectId)

    // Writes are refused by the database, in the same words the app uses.
    expect(await refusedTool(client, "create_project", { workspace_id: team, name: "Viewer was here" })).toMatch(
      /permission/i
    )
    expect(await refusedTool(client, "create_document", { project_id: projectId, type: "text" })).toMatch(/permission/i)

    // And nothing appeared.
    const after = (await callTool(client, "list_projects", { workspace_id: team })) as { projects: { id: string }[] }
    expect(after.projects.map((project) => project.id)).toEqual([projectId])
    await client.close()
  } finally {
    await viewerContext.close()
  }
})
