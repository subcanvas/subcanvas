import { randomUUID } from "node:crypto"

import { expect, type Locator, type Page } from "@playwright/test"

// What every spec needs before it can look at anything: an account, a
// workspace, a project, a whiteboard. Each one is named after a fresh id, so two specs
// running at once — or a run against a database somebody else is using —
// never collide, and nothing has to be cleaned up afterwards.

export function freshId() {
  return randomUUID().replace(/-/g, "").slice(0, 16)
}

export type Account = { id: string; email: string; password: string }

export function freshAccount(): Account {
  const id = freshId()
  // .test is reserved for testing (RFC 2606), so a stray mail goes nowhere.
  return { id, email: `e2e-${id}@example.test`, password: `pw-${id}` }
}

// Every account gets a personal workspace when it is created, named after
// the part of its email before the @, and so is its address.
export const personalSlug = (account: Account) => `e2e-${account.id}`

// Creates the account through the sign-up form and lands in its personal
// workspace, which is where signing in goes.
export async function signUp(page: Page, account = freshAccount()): Promise<Account> {
  await page.goto("/login")
  await page.getByRole("button", { name: "Create an account" }).click()
  await signInForm(page, account, "Create account")
  await page.waitForURL(`/${personalSlug(account)}`)
  return account
}

export async function signIn(page: Page, account: Account) {
  await page.goto("/login")
  await signInForm(page, account, "Sign in")
}

async function signInForm(page: Page, account: Account, submit: string) {
  await page.getByLabel("Email").fill(account.email)
  await page.getByLabel("Password").fill(account.password)
  await page.getByRole("button", { name: submit, exact: true }).click()
  // The form puts what went wrong in an alert of its own. Next's route
  // announcer is an alert too, and lives outside the page's main region.
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0)
}

// The card titles are plain text, not headings, so a page outside the app
// is recognised by the words on its card.
export const cardTitled = (page: Page, title: string) =>
  page.getByRole("main").getByText(title, { exact: true })

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click()
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await page.waitForURL("/login")
}

// The sidebar: a section for each workspace, Personal first and then the
// team workspaces by name, each headed by a button that opens and closes it.
// Beside the heading, + is "New project in <heading>", and the menu with the
// workspace's pages is "<heading> workspace menu".
export const sidebar = (page: Page) => page.getByRole("navigation", { name: "Workspaces" })

export const workspaceSection = (page: Page, heading: string) =>
  sidebar(page).getByRole("button", { name: heading, exact: true })

// Opens a workspace's menu in the sidebar and returns it.
export async function openWorkspaceMenu(page: Page, heading: string) {
  await sidebar(page).getByRole("button", { name: `${heading} workspace menu`, exact: true }).click()
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  return menu
}

// A team workspace, named "E2E <id>", made on the page "New team workspace"
// in the sidebar leads to. Returns its slug, which is the first segment of
// every link to it. (Not `e2e-<id>`: a personal workspace may have that.)
export async function createOrg(page: Page, id = freshId()): Promise<string> {
  const slug = `e2e-${id}-team`
  await page.goto("/onboarding")
  await page.getByLabel("Name").fill(`E2E ${id}`)
  await page.getByLabel("Web address").fill(slug)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await page.waitForURL(`/${slug}`)
  return slug
}

// Signs up and creates a team workspace in one step, which is where most
// specs start: a team workspace can invite people, a personal one cannot.
export async function signUpWithOrg(page: Page) {
  const account = await signUp(page)
  const slug = await createOrg(page, account.id)
  return { account, slug }
}

// Returns the project's id, taken from the address it lands on. Starts from
// the Projects page's own button; the sidebar's + for each workspace is
// "New project in <workspace>".
export async function createProject(
  page: Page,
  name: string,
  visibility: "private" | "public" = "private"
): Promise<string> {
  await page.getByRole("main").getByRole("button", { name: "New project", exact: true }).click()
  await page.getByLabel("Name").fill(name)
  if (visibility === "public")
    await page.getByRole("radio", { name: "Public" }).click()
  await page.getByRole("button", { name: "Create project", exact: true }).click()
  await expect(page.getByText("Open a whiteboard or a page")).toBeVisible()
  const projectId = new URL(page.url()).pathname.split("/")[2]
  expect(projectId).toBeTruthy()
  return projectId
}

// Adds a whiteboard to the project, opens it, and gives it `title`. Creating
// a document navigates to it, so this returns with the canvas on screen.
export async function createWhiteboard(page: Page, title: string) {
  await page.getByRole("button", { name: "Add to project" }).click()
  await page.getByRole("menuitem", { name: "New whiteboard", exact: true }).click()
  await expect(whiteboardTools(page)).toBeVisible()
  await renameOpenDocument(page, title)
}

async function renameOpenDocument(page: Page, title: string) {
  const field = page.getByLabel("Document title")
  await field.fill(title)
  // The title saves on blur; Enter is what the field itself offers.
  await field.press("Enter")
  // The trail is rendered on the server, so the new name showing up there is
  // proof the rename was saved, not just typed.
  await expect(breadcrumb(page).getByText(title, { exact: true })).toBeVisible()
}

export const breadcrumb = (page: Page) => page.getByRole("navigation", { name: "breadcrumb" })

export const whiteboardTools = (page: Page) =>
  page.getByRole("toolbar", { name: "Whiteboard tools" })

// React Flow gives its root the application role, which is the one handle on
// the canvas that is not a style class. The side panel sits outside it, so
// scoping here tells a node's own label apart from the copy of it in the
// panel's header.
const canvas = (page: Page) => page.getByRole("application")

// The side panel that opens when exactly one object is selected.
export const inspector = (page: Page) =>
  page.getByRole("complementary", { name: "Object settings" })

export const nodeLabelled = (page: Page, title: string) =>
  canvas(page).getByText(title, { exact: true })

// The text a node holds, which the panel shows under "Inside".
export const nodeDocument = (page: Page) =>
  inspector(page).getByRole("region", { name: "Document" })

// Closes the object panel, if one is open, by the button it offers for it.
// Adding a node starts from a clean canvas this way, and the panel that
// opens afterwards is the one for the new node. (The tools can be pressed
// with the panel open; toolbar-reachable.spec.ts holds that open.)
export async function closePanel(page: Page) {
  const panel = inspector(page)
  if (await panel.isVisible()) {
    await panel.getByRole("button", { name: "Close panel" }).click()
    await expect(panel).toBeHidden()
  }
}

// Adds a box to the canvas and names it. The toolbar puts the new node in
// the middle of the view and selects it, which opens the panel: no pointer
// goes near the canvas, so React Flow's drag handling is never involved.
export async function addNode(page: Page, title: string) {
  await closePanel(page)
  await whiteboardTools(page).getByRole("button", { name: "Box", exact: true }).click()
  const panel = inspector(page)
  await expect(panel).toBeVisible()
  await panel.getByLabel("Title").fill(title)
  await expect(nodeLabelled(page, title)).toBeVisible()
}

// Selects a node on the canvas by pressing its label with a real pointer.
// React Flow hands the press to d3-drag, which reads `event.view.document`:
// a synthetic event dispatched into the page has no such view and throws, so
// the mouse has to be moved and pressed for real.
export async function clickNode(page: Page, title: string) {
  const node = nodeLabelled(page, title)
  await expect(node).toBeVisible()
  const box = await node.boundingBox()
  if (!box) throw new Error(`The node “${title}” has no box to press`)
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(at.x, at.y, { steps: 8 })
  await page.mouse.down()
  await page.mouse.up()
}

// The sync badge says "Saving…" the moment the document changes and "Saved"
// only once Postgres has taken the update, so watching it through both is a
// real wait for durability and needs no sleep. `scope` picks which document:
// a whiteboard's badge is in its header, a node's text is in the panel.
export async function expectSaved(scope: Page | Locator) {
  await expect(scope.getByText("Saving…", { exact: true })).toBeVisible()
  await expect(scope.getByText("Saved", { exact: true })).toBeVisible()
}
