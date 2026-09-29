/**
 * The launch demo, as code: reelscript (https://github.com/trevin-lee/reelscript)
 * drives a headless Chromium through the real app, frame by frame, and
 * writes an mp4. Re-run it after the interface changes and the video is
 * current again.
 *
 * Render (the pnpm script wraps this, see scripts/demo/reel/README.md):
 *
 *   REELSCRIPT="node ~/Git/reelscript/dist/cli.js" pnpm demo:reel
 *   $REELSCRIPT preview scripts/demo/reel/demo.ts --at 12 --out frame.png
 *
 * Environment, all optional:
 *
 *   DEMO_BASE_URL         The app. Default http://localhost:3420, a dev
 *                         server. https://subcanvas.app for the published cut.
 *   DEMO_SELF_REPOSITORY  The repository whose diagram the video opens on:
 *                         one with .subcanvas files, so it has names and
 *                         arrows. Default subcanvas/subcanvas. fixture/<name>
 *                         reads a copy on disk instead (see the README).
 *   DEMO_INTO             The two boxes the first shot goes into, outermost
 *                         first. Default Application,Core libraries.
 *   DEMO_ARROW            An arrow on the innermost of those sheets, with a
 *                         description. Default "writes documents from the server".
 *   DEMO_ARROW_FILE       The .subcanvas file that declares it, from this
 *                         checkout. Default src/lib/github/.subcanvas.
 *   DEMO_REPOSITORY       Imported on camera: a well-known repository with no
 *                         .subcanvas files, so the video shows what anyone
 *                         gets with no setup. Default react/react.
 *   DEMO_REPOSITORY_BOX   A box on that repository's top sheet. Default Packages.
 *   DEMO_AGENT_PROMPT     What the agent in scene 5 is asked. The default asks
 *                         for the arrow missing from the Core libraries sheet.
 *   DEMO_CLAUDE           The Claude Code CLI the agent runs as. Default claude.
 *                         Its session is recorded once and kept (see
 *                         agent.ts); delete out/agent-<stage>.json to record
 *                         it again.
 *   DEMO_README_URL       A README with the embed in it, shown at the end of
 *                         the embed scene. Default none.
 *   DEMO_EMAIL            The demo account. Created through the sign-up form
 *   DEMO_PASSWORD         the first time, where sign-up needs no confirmation.
 *                         Default reel-demo@subcanvas.test: an account with nothing
 *                         else in it, so the agent finds the project it is
 *                         asked about.
 *   DEMO_ORG_NAME         The org's name. Default Acme. The sidebar is
 *                         collapsed on camera, so it rarely shows.
 *   DEMO_STAGE_ORG        Slug of the org that keeps finished imports of both
 *                         repositories for the scenes that do not import
 *                         (see "Two orgs" below). Default reel-demo.
 *   DEMO_ORG              Reuse this org for the on-camera import instead of
 *                         creating a fresh one.
 *   DEMO_IMPORT_WAIT      Milliseconds of video on "Importing…" before the
 *                         cut to the diagram, which is marked as sped up.
 *                         Default 600.
 *   DEMO_PUBLIC_SITE      What the end card's address bar shows. Default
 *                         https://subcanvas.app.
 *   DEMO_KEEP_PRELUDE     Set to 1 to keep the sign-in prelude in the video.
 *
 * Scenes (the render prints where each starts). The video autoplays muted
 * on Product Hunt, so a caption on the picture says each scene's point, and
 * the narration says the same:
 *
 *   1. A repository with no .subcanvas files imported on camera, so a
 *      repository becomes a diagram in the first five seconds: its main
 *      folders become boxes automatically.
 *   2. One of them opens onto the diagram inside it.
 *   3. Subcanvas's own diagram, whose .subcanvas files name the boxes and
 *      add the arrows.
 *   4. An arrow there, opened into the page that says why it exists.
 *   5. An agent draws one: a recorded Claude Code session over the MCP
 *      server, played back in a terminal beside the sheet while its edit is
 *      made again (see agent.ts).
 *   6. Share and Copy embed; against production, the embed in a README.
 *   7. The end card.
 *
 * Canvas shots are in view mode with the sidebar collapsed, both set in the
 * prelude: no editing tools, and nothing from the demo account on screen.
 *
 * Two orgs: the import in scene 1 is real and lands in a fresh org, but the
 * page it produces has ids nobody knows in advance, and reelscript can only
 * navigate to addresses the script knows. So the other scenes play on
 * imports made ahead of time (once, and kept) in the staging org, whose
 * addresses this script learns before the camera rolls.
 *
 * Prelude: reelscript starts its browser signed out, so the script signs in
 * by typing. Those seconds are cut from the video afterwards with ffmpeg;
 * previews are offset the same way, so `--at 0` is the first shot.
 *
 * Frame: a 1600x900 desktop with no menu bar, scaled to 1920x1080 in the
 * same ffmpeg pass, with the captions laid over it there. Against a dev
 * server the address bar is left blank; against production it shows the
 * real address.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { execFileSync } from "node:child_process"

import { chromium, type Page } from "@playwright/test"
import { createDemo } from "@reelscript/cli"

import { madeBy, mcpClient, recordAgent, replay, undo, type AgentRun, type Made } from "./agent"

// --- Settings -----------------------------------------------------------------

const base = (process.env.DEMO_BASE_URL ?? "http://localhost:3420").replace(/\/$/, "")
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)
const selfRepository = process.env.DEMO_SELF_REPOSITORY ?? "subcanvas/subcanvas"
const into = (process.env.DEMO_INTO ?? "Application,Core libraries").split(",").map((s) => s.trim())
if (into.length !== 2) throw new Error("demo: DEMO_INTO names two boxes, outermost first")
const arrow = process.env.DEMO_ARROW ?? "writes documents from the server"
const arrowFile = process.env.DEMO_ARROW_FILE ?? "src/lib/github/.subcanvas"
const repository = process.env.DEMO_REPOSITORY ?? "react/react"
const repositoryBox = process.env.DEMO_REPOSITORY_BOX ?? "Packages"
const readmeUrl = process.env.DEMO_README_URL
const email = process.env.DEMO_EMAIL ?? "reel-demo@subcanvas.test"
const password = process.env.DEMO_PASSWORD ?? "demo-reel-password"
const orgName = process.env.DEMO_ORG_NAME ?? "Acme"
const stageSlug = process.env.DEMO_STAGE_ORG ?? "reel-demo"
// What the agent in scene 5 is asked, as Claude Code shows it on camera.
const agentPrompt =
  process.env.DEMO_AGENT_PROMPT ??
  "Read src/lib/sync and add the arrow missing from the Core libraries diagram in my subcanvas project. Answer in one short sentence."
const importWait = Number(process.env.DEMO_IMPORT_WAIT ?? 600)
const publicSite = (process.env.DEMO_PUBLIC_SITE ?? "https://subcanvas.app").replace(/\/$/, "")

const nameOf = (repo: string) => repo.split("/").pop()!.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
const docIdOf = (url: string) => url.match(/\/d\/([0-9a-f-]{36})/)![1]
const here = dirname(new URL(import.meta.url).pathname)
const outDir = resolve(here, "..", "out")
const card = (name: string) => new URL(`./cards/${name}.html`, import.meta.url).href

// The first words of the arrow's reason, from its file in this checkout, to
// know its page has opened.
const selfName = nameOf(selfRepository)
const arrowText = readFileSync(resolve(here, "..", "..", "..", arrowFile), "utf8").trimEnd()
const reason = arrowText.match(new RegExp(`label: ${arrow}\\s*\\n\\s*description: (\\S+ \\S+ \\S+ \\S+)`))?.[1]
if (!reason) throw new Error(`demo: ${arrowFile} has no arrow "${arrow}" with a description`)

// --- Selectors ----------------------------------------------------------------
// Roles and labels, the way the e2e helpers name things, never a generated
// class. reelscript hands these to Playwright, so its `:has-text()`,
// `:text-is()` and `>> visible=true` all work.

// A box by its title: "Box: Billing", or "Box: Billing, holds a whiteboard".
const NODE = (title: string) => `.react-flow__node:is([aria-label="Box: ${title}"], [aria-label^="Box: ${title},"])`
// The mark in a box's corner that opens the whiteboard inside it.
const INSIDE = (title: string) => `${NODE(title)} button[aria-label="Open the whiteboard inside"]`
// The canvas of the sheet that has this box on it. The whiteboard is centred
// on it, so its middle is the diagram's, and it exists only once that sheet
// is drawn.
const SHEET = (title: string) => `.react-flow:has(${NODE(title)}) .react-flow__pane`
const PANEL = 'aside[aria-label="Object settings"]'
const EDGE_LABEL = (label: string) => `.react-flow__edgelabel-renderer span:text-is("${label}")`
// The mark beside an arrow's label that opens what the arrow holds.
const EDGE_MARK = (label: string) =>
  `.react-flow__edgelabel-renderer div:has(> span:text-is("${label}")) button[aria-label="Open the document inside"]`
// The reason on its own page: the panel shows the same text, so the page
// is the one without a panel.
const REASON = `main:not(:has(${PANEL})) :text("${reason}")`
const SIGNED_IN = '[aria-label="Account menu"] >> visible=true'

// --- Before the camera rolls --------------------------------------------------
// A real Playwright browser, in real time: the account, the staging org with
// its finished imports (kept between runs), a fresh empty org for the import
// that happens on camera, and warm routes so a dev server does not compile
// in the middle of a scene.

type Stage = { zero: { top: string }; self: { top: string; inside: string; deeper: string } }

async function pressNode(page: Page, title: string) {
  // React Flow hands a press to d3-drag, which needs a real pointer.
  const node = page.locator(NODE(title))
  const box = await node.boundingBox()
  if (!box) throw new Error(`The node "${title}" is not on the whiteboard`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 })
  await page.mouse.down()
  await page.mouse.up()
}

const drawn = (page: Page) => page.locator(".react-flow__pane")

async function importInto(page: Page, slug: string, repo: string): Promise<string> {
  await page.goto(`${base}/${slug}`)
  await page.getByRole("button", { name: "Import from GitHub" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("textbox", { name: "Repository" }).fill(repo)
  await dialog.getByRole("button", { name: "Import", exact: true }).click()
  // A clean import goes straight to the whiteboard; one with notes stops to
  // show them first.
  const opened = dialog.getByRole("button", { name: "Open the diagram" })
  await Promise.race([
    page.waitForURL(/\/d\/[0-9a-f-]{36}/).catch(() => {}),
    opened.waitFor().then(() => opened.click()).catch(() => {}),
  ])
  await page.waitForURL(/\/d\/[0-9a-f-]{36}/)
  await drawn(page).waitFor()
  return page.url()
}

async function openBox(page: Page, title: string): Promise<string> {
  await page.locator(NODE(title)).waitFor()
  await page.waitForTimeout(400)
  const before = page.url()
  await pressNode(page, title)
  await page.keyboard.press("Enter")
  await page.waitForURL((url) => url.href !== before)
  return page.url()
}

async function createOrg(page: Page, slug: string) {
  await page.goto(`${base}/onboarding`)
  await page.getByLabel("Name").fill(orgName)
  await page.getByLabel("Web address").fill(slug)
  await page.getByRole("button", { name: "Create org" }).click()
  await page.waitForURL(`${base}/${slug}`)
}

// Where the agent runs: a copy of this checkout's committed files in a
// folder of its own, named like the repository, with nothing around it (no
// workspace notes above it for the agent to wander into). Its path shows in
// Claude Code's header. A folder already there is replaced only if it is an
// earlier copy.
const AGENT_ROOT = `/tmp/${selfName}`
function agentFolder() {
  if (existsSync(AGENT_ROOT) && !existsSync(resolve(AGENT_ROOT, "scripts", "demo", "reel", "agent.ts")))
    throw new Error(`demo: ${AGENT_ROOT} is there and is not a copy made by the demo; move it`)
  rmSync(AGENT_ROOT, { recursive: true, force: true })
  mkdirSync(AGENT_ROOT, { recursive: true })
  execFileSync("sh", ["-c", `git archive HEAD | tar -x -C "${AGENT_ROOT}"`], { cwd: resolve(here, "..", "..", "..") })
  return AGENT_ROOT
}
// The terminal it is recorded in and played back in, in characters.
const AGENT_COLS = 80
const AGENT_ROWS = 30

// The demo account's access token, from the session cookie the app set at
// sign-in (Supabase keeps it there as base64 JSON, split into chunks when
// long). The MCP server takes an ordinary signed-in token.
async function accessToken(page: Page): Promise<string> {
  const chunks = (await page.context().cookies())
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => Number(a.name.split(".").pop()) - Number(b.name.split(".").pop()))
  const value = chunks.map((cookie) => cookie.value).join("").replace(/^base64-/, "")
  const session = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { access_token?: string }
  if (!session.access_token) throw new Error("demo: no access token in the session cookie")
  return session.access_token
}

async function prepare(): Promise<{ slug: string; stage: Stage; token: string; agent: AgentRun }> {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 768 } })
  page.setDefaultTimeout(120_000)
  try {
    // The account: sign in, or sign up the first time.
    await page.goto(`${base}/login`)
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password").fill(password)
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    const alert = page.getByRole("main").getByRole("alert")
    await Promise.race([
      page.waitForURL((url) => !url.pathname.startsWith("/login")).catch(() => {}),
      alert.waitFor().catch(() => {}),
    ])
    if (await alert.isVisible()) {
      await page.getByRole("button", { name: "Create an account" }).click()
      await page.getByLabel("Email").fill(email)
      await page.getByLabel("Password").fill(password)
      await page.getByRole("button", { name: "Create account", exact: true }).click()
      await Promise.race([
        page.waitForURL(`${base}/onboarding`).catch(() => {}),
        alert.waitFor().catch(() => {}),
      ])
      if (await alert.isVisible())
        throw new Error(`Could not create ${email}: ${await alert.textContent()}`)
    }

    // A dev server draws its route badge in the corner; this hides it for a day.
    if (local) await page.request.post(`${base}/__nextjs_disable_dev_indicator`).catch(() => {})

    // The staging org and its imports, made once and kept. Their addresses
    // are remembered beside the renders and checked before they are trusted.
    const stageFile = resolve(outDir, `stage-${stageSlug}.json`)
    let stage: Stage | null = null
    if (existsSync(stageFile)) {
      // Trusted once its sheet draws. A second import is not a harmless
      // retry: the account would then hold two copies of each project.
      const saved = JSON.parse(readFileSync(stageFile, "utf8")) as Stage
      const response = await page.goto(saved.self.top)
      const shown = await drawn(page).waitFor({ timeout: 30_000 }).then(() => true, () => false)
      if (response?.ok() && shown) stage = saved
    }
    if (!stage) {
      const response = await page.goto(`${base}/${stageSlug}`)
      if (!response?.ok()) await createOrg(page, stageSlug)
      const zeroTop = await importInto(page, stageSlug, repository)
      const selfTop = await importInto(page, stageSlug, selfRepository)
      const selfInside = await openBox(page, into[0])
      const selfDeeper = await openBox(page, into[1])
      stage = { zero: { top: zeroTop }, self: { top: selfTop, inside: selfInside, deeper: selfDeeper } }
      mkdirSync(outDir, { recursive: true })
      writeFileSync(stageFile, JSON.stringify(stage, null, 2) + "\n")
    }
    // Warm every route the camera will visit.
    for (const href of [stage.zero.top, stage.self.top, stage.self.inside, stage.self.deeper]) {
      await page.goto(href)
      await drawn(page).waitFor()
    }

    // The MCP side: the demo account's token, and the Core libraries sheet.
    const token = await accessToken(page)
    const mcp = mcpClient(base, token)
    const coreId = docIdOf(stage.self.deeper)

    // An edit a render replayed and did not get to undo (it stopped halfway).
    const replayedFile = resolve(outDir, "agent-replayed.json")
    if (existsSync(replayedFile)) {
      await undo(mcp, JSON.parse(readFileSync(replayedFile, "utf8")) as Made)
      unlinkSync(replayedFile)
    }

    // Scene 2 opens the arrow's reason straight from the arrow, as a page,
    // rather than in the panel beside the canvas: the arrow's own setting.
    const board = await mcp("read_whiteboard", { whiteboard_id: coreId })
    const edges = (board.data.edges as { id: string; label?: string; open_mode?: string }[] | undefined) ?? []
    const reasonEdge = edges.find((edge) => edge.label === arrow)
    if (!reasonEdge) throw new Error(`demo: no arrow "${arrow}" on the Core libraries sheet`)
    if (reasonEdge.open_mode !== "navigate")
      await mcp("update_edges", { whiteboard_id: coreId, edges: [{ id: reasonEdge.id, open_mode: "navigate" }] })

    // The agent's session, recorded once and kept. Its edit is undone right
    // away, so the sheet is as it was when the camera shows it being drawn
    // on. A kept session is only good for the sheet it drew on, the request
    // it was given, and the terminal size it was laid out for.
    const agentFile = resolve(outDir, `agent-${stageSlug}.json`)
    let agent: AgentRun | null = existsSync(agentFile) ? (JSON.parse(readFileSync(agentFile, "utf8")) as AgentRun) : null
    if (
      agent &&
      (!agent.events ||
        madeBy(agent).whiteboard_id !== coreId ||
        agent.prompt !== agentPrompt ||
        agent.cols !== AGENT_COLS ||
        agent.rows !== AGENT_ROWS)
    )
      agent = null
    if (!agent) {
      process.stderr.write("demo: recording the agent once (Claude Code, a few minutes)\n")
      agent = await recordAgent({
        root: agentFolder(),
        base,
        token,
        prompt: agentPrompt,
        whiteboardId: coreId,
        cols: AGENT_COLS,
        rows: AGENT_ROWS,
      })
      await undo(mcp, madeBy(agent))
      writeFileSync(agentFile, JSON.stringify(agent, null, 2) + "\n")
    }

    // The fresh org the on-camera import lands in. Nothing is deleted, so it
    // gets a name of its own each time.
    const slug = process.env.DEMO_ORG ?? `demo-${nameOf(repository)}-${Math.random().toString(36).slice(2, 8)}`
    if (!process.env.DEMO_ORG) await createOrg(page, slug)
    return { slug, stage, token, agent }
  } catch (error) {
    // What the page looked like when it went wrong, beside the renders.
    mkdirSync(outDir, { recursive: true })
    await page.screenshot({ path: resolve(outDir, "failure.png") }).catch(() => {})
    process.stderr.write(`demo: failed at ${page.url()} (see ${resolve(outDir, "failure.png")})\n`)
    throw error
  } finally {
    await browser.close()
  }
}

process.stderr.write(`demo: preparing ${base} (${selfRepository}, ${repository})\n`)
const { slug, stage, token, agent } = await prepare()
process.stderr.write(`demo: org /${slug}, staging /${stageSlug}\n`)

// --- The address bar ------------------------------------------------------------
// Against production, the real address. Against a dev server, nothing: its
// addresses are not the site's, and a tidied one would be made up. The end
// card, a local file, shows the site.

function address(url: string) {
  if (url.startsWith("file:")) return publicSite
  return local ? "" : url
}

// --- The timeline -------------------------------------------------------------

const demo = createDemo({
  theme: "macos",
  viewport: [1440, 768],
  desktop: [1600, 900],
  menubar: false,
  fps: 60,
  voice: "af_heart",
  pronunciations: { Subcanvas: "Sub canvas", subcanvas: "sub canvas", README: "read me", YAML: "yammel" },
  address,
})

// Every action here has a fixed length (cursor moves are given one), so the
// script can tell where each scene and caption starts and where the prelude
// ends. The estimate is checked against the render at the end.
const beats: [string, number][] = []
const mark = (name: string) => beats.push([name, demo.getTimeline().length])
// What is laid over the video afterwards: captions along the bottom, and
// small notes at the top, each from one point of the timeline to another.
type Overlay = { text: string; kind: "caption" | "note"; from: number; to?: number }
const overlays: Overlay[] = []
function caption(text: string) {
  const at = demo.getTimeline().length
  const open = overlays.findLast((o) => o.kind === "caption")
  if (open && open.to === undefined) open.to = at
  overlays.push({ text, kind: "caption", from: at })
}
function captionEnd() {
  const open = overlays.findLast((o) => o.kind === "caption")
  if (open && open.to === undefined) open.to = demo.getTimeline().length
}
const note = (text: string) => overlays.push({ text, kind: "note", from: demo.getTimeline().length })
const noteEnd = () => (overlays.findLast((o) => o.kind === "note")!.to = demo.getTimeline().length)
// A gallery picture for the listing: `headline` over the frame `after` ms
// past this point, cut from the render with no caption on it.
const stills: { headline: string; at: number; after: number }[] = []
const still = (headline: string, after: number) => stills.push({ headline, at: demo.getTimeline().length, after })
// Each sentence fits the scene it belongs to (sentences queue, so one
// that runs long delays every one after it).
const say = (text: string) => demo.say(text)
type Where = "browser" | "terminal"
const move = (target: string | { x: number; y: number }, duration = 700, window?: Where) =>
  demo.cursor.moveTo(target, { duration, ease: "smooth", ...(window ? { window } : {}) })
// Zooms stay inside the browser window, so the desktop never shows past it.
const zoom = (target: string | { x: number; y: number }, scale: number, duration = 700) =>
  demo.zoom.to(target, { scale, duration, within: "window", window: "browser" })
// The middle of the canvas, under the 45px header, with the sidebar
// collapsed to its 48px rail.
const MIDDLE = { x: 48 + (1440 - 48) / 2, y: 45 + (768 - 45) / 2 }
// Where the cursor rests while there is nothing to point at: low on the
// right, clear of the diagrams; and off the screen entirely.
const REST = { x: 1330, y: 700 }
const OFF = { x: 1700, y: 1000 }
// Opens a page with it drawn on camera, not its loading: `drawn` is
// something that is only there once it is.
async function open(url: string, drawn: string) {
  demo.zoom.out({ duration: 0 })
  await demo.browser.goto(url, { settle: 0 })
  await demo.waitFor(drawn, { settle: 150 })
}
// Clicks through to what the click opens: the next frame is that, drawn.
// It arrives framed as close as the push before the click ended, so the
// cut never jumps outward, then settles to `scale`.
async function clickThrough(target: string, scale: number, at: string | { x: number; y: number } = MIDDLE, landing = 1.6) {
  zoom(at, landing, 0)
  await demo.cursor.click({ duration: 0 })
  await demo.waitFor(target, { settle: 150 })
  zoom(at, scale, 900)
}

// A stretch of the agent's recorded session, [from, to) in its ms, sped up
// to play in `ms` of video. Every chunk is still written, in order; only
// the time between them shrinks.
function paced(events: [number, string][], from: number, to: number, ms: number): [number, string][] {
  const part = events.filter(([at]) => at >= from && at < to)
  if (!part.length) return []
  const speed = Math.max(1, (part.at(-1)![0] - from) / ms)
  return part.map(([at, text]) => [Math.round((at - from) / speed), text])
}

// The prelude, cut from the video: reelscript's browser signs in, puts the
// canvas in view mode and collapses the sidebar (both kept for the rest of
// the session), then opens the empty org the import lands in, so the video
// starts on its Import button.
const IMPORT_BUTTON = 'button:has-text("Import from GitHub")'
await demo.browser.goto(`${base}/login`, { settle: 600 })
await demo.type("#email", email, { wpm: 1200 })
await demo.type("#password", password, { wpm: 1200 })
await demo.press("Enter")
await move(SIGNED_IN, 300) // resolving a target waits, off camera, until it exists
await demo.browser.goto(stage.self.top, { settle: 0 })
await demo.waitFor(SHEET(into[0]))
await move({ x: 420, y: 660 }, 100) // an empty corner of the canvas, to focus it
await demo.cursor.click()
await demo.press("e")
await demo.press("Control+Backslash")
await demo.wait(300)
await move(OFF, 100)
await open(`${base}/${slug}`, IMPORT_BUTTON)
zoom(IMPORT_BUTTON, 1.4, 0) // close enough on the empty org to read it
const preludeActions = demo.getTimeline().length

// The pace: each caption stays up at least a second and a half plus a
// second for every three words, so it can be read with the picture. Zooms
// stop at 1.6x: the pages are captured at 1x, and closer than that the
// text goes soft. A muted viewer sees a repository become a diagram within
// the first five seconds.

// 1. A repository with no .subcanvas files, imported on camera: its main
// folders become boxes on their own.
mark("Import a repository")
caption("Turn a GitHub repo into a diagram you can click into.")
say("Turn a GitHub repo into a diagram you can click into.")
await demo.wait(500)
await move(IMPORT_BUTTON, 900)
await demo.cursor.click()
await demo.wait(200)
zoom('[role="dialog"]', 1.6, 600)
await demo.wait(300)
await demo.type("#import-repository", repository, { wpm: 300 })
await demo.wait(300)
await move('[role="dialog"] button:text-is("Import")', 600)
note("Import sped up")
await demo.cursor.click()
await demo.wait(importWait)
await demo.waitFor(SHEET(repositoryBox), { settle: 150 })
zoom(SHEET(repositoryBox), 1.45, 0)
caption("Its main folders become boxes, automatically.")
say("Its main folders become boxes, automatically.")
await move(REST, 700)
still("Paste a GitHub repo. Its main folders become boxes.", 400)
await demo.wait(500)
noteEnd()
await demo.wait(2300)

// 2. A box opens onto the diagram inside it: the push toward it, a cut at
// the click, and a settle.
mark("Into a box")
caption("Any box opens into the diagram inside it.")
say("Any box opens into the diagram inside it.")
zoom(NODE(repositoryBox), 1.6, 1500)
await move(INSIDE(repositoryBox), 1300)
await demo.wait(300)
await clickThrough(SHEET("React"), 1.2)
await move(REST, 800)
still("Any box opens into the diagram inside it.", 800)
await demo.wait(2200)

// 3. Arrows, on Subcanvas's own diagram, where .subcanvas files name the
// boxes and say what talks to what.
mark("Arrows from .subcanvas files")
caption("Arrows come from a few lines of YAML in each folder.")
say("In Subcanvas's own repo, a few lines of YAML per folder add the arrows.")
await open(stage.self.deeper, EDGE_LABEL(arrow))
zoom(MIDDLE, 1.25, 0)
zoom(MIDDLE, 1.32, 5400) // a slow drift, so the hold is not a still
await move(REST, 900)
await demo.wait(4500)

// 4. An arrow, opened into the page that says why it is there. The arrow
// is set to open as a page (in the preparation), so there is no panel.
mark("An arrow's reason")
caption("An arrow opens into why it is there.")
say("An arrow opens into why it is there.")
await move(EDGE_MARK(arrow), 1100)
await demo.wait(300)
await clickThrough(REASON, 1.45, { x: 720, y: 190 }, 1.45)
zoom(REASON, 1.45, 0)
await move(REST, 700)
still("An arrow opens into why it is there.", 900)
await demo.wait(2700)

// 5. An agent draws one: a Claude Code session, recorded before the camera
// rolled (see agent.ts), played back in a terminal beside the sheet. At the
// moment in it when its arrow appeared on the whiteboard, the same edit is
// made again, and the arrow arrives on the sheet.
mark("An agent draws an arrow")
caption("Or ask Claude Code to draw the arrows. It reads the code.")
say("Or ask Claude Code to draw the arrows. It reads the code.")
const agentArrow = String(
  ((agent.writes.find((write) => write.name === "connect_nodes")?.input.edges as { label?: string }[] | undefined) ?? [])[0]
    ?.label ?? ""
)
if (!agentArrow) throw new Error("demo: the agent's arrow has no label to find it by")
// The terminal at the size the session was laid out for, spaced like a
// terminal app's, so Claude Code's block-drawn logo joins up: 14px
// JetBrains Mono at line height 1 draws 8.4 by 18 pixel cells, inside 12
// and 10 pixels of padding.
const terminalSize = { width: agent.cols * 8.4 + 24, height: agent.rows * 18 + 20 }
await demo.browser.place({ x: 16, y: 44, width: 1600 - 48 - terminalSize.width, height: 768 })
await open(stage.self.deeper, EDGE_LABEL(arrow))
note("Claude Code session and its edit replayed, sped up")
await demo.terminal.open({
  title: `${selfName} — claude`,
  prompt: "",
  fontSize: 14,
  lineHeight: 1,
  cols: agent.cols,
  rows: agent.rows,
  x: 1600 - 16 - terminalSize.width,
  y: 140,
  ...terminalSize,
})
await demo.terminal.print("", { events: paced(agent.events, 0, agent.editAt, 5200), maxGapMs: Infinity })
const replayedFile = resolve(outDir, "agent-replayed.json")
await demo.call(async () => {
  const made = await replay(mcpClient(base, token), agent)
  writeFileSync(replayedFile, JSON.stringify(made) + "\n")
})
say("It found the missing one, and drew it.")
await demo.terminal.print("", { events: paced(agent.events, agent.editAt, Infinity, 1600), maxGapMs: Infinity })
// Closer, on the arrow it drew and its answer together: at 1.3x the view is
// 1231 pixels of the desktop wide, so centred 97 pixels inside the
// terminal it runs from the middle of the sheet to the terminal's right
// edge.
await demo.waitFor(EDGE_LABEL(agentArrow), { settle: 150, window: "browser" })
demo.zoom.to({ x: 97, y: 350 }, { scale: 1.3, duration: 900, window: "terminal" })
await move({ x: 470, y: 700 }, 800, "browser")
noteEnd()
still("Ask Claude Code to draw the missing arrows.", 600)
await demo.wait(2600)

// 6. The embed, for a README. The terminal goes behind the browser's
// rectangle, which comes back to its full size and to the front, hiding it.
// The cursor goes along the header to Share, clear of the mode toggle
// under it, whose tooltip would say "View".
mark("Share, Copy embed")
caption("Put the live diagram in your README. It keeps itself up to date.")
say("Put the live diagram in your README. It keeps itself up to date.")
demo.zoom.out({ duration: 0 })
await demo.terminal.place({ x: 700, y: 140, ...terminalSize })
await demo.browser.place({ x: 80, y: 44, width: 1440, height: 768 })
await open(stage.self.top, SHEET(into[0]))
await move({ x: 1180, y: 22 }, 800)
await move('button:has-text("Share")', 400)
await demo.cursor.click()
await demo.wait(400)
zoom('[data-slot="popover-content"]', 1.6, 600)
await move('button:has-text("Copy embed")', 700)
if (local) {
  // Not clicked against a dev server: the click takes focus from the link,
  // which then shows its start, the dev server's address.
  await demo.wait(3400)
} else {
  await demo.wait(300)
  await demo.cursor.click()
  await demo.wait(3000)
}
if (readmeUrl) {
  // The README on GitHub, with the embed in it.
  const EMBED = 'img[alt$="a Subcanvas diagram"]'
  demo.zoom.out({ duration: 0 })
  await demo.browser.goto(readmeUrl, { settle: 0 })
  await demo.waitFor(EMBED, { timeout: 30_000, settle: 300 })
  // It is below the fold, under the file list: brought to the middle of
  // the window before the first frame of the page is shot.
  await demo.call(({ page }) =>
    page?.locator(EMBED).first().evaluate((image) => image.scrollIntoView({ block: "center", behavior: "instant" }))
  )
  zoom(EMBED, 1.3, 0)
  await demo.wait(3500)
}

// 7. The end card.
mark("End card")
captionEnd()
demo.zoom.out({ duration: 500 })
await move(OFF, 500)
say("Subcanvas dot app. Free to start.")
await demo.browser.goto(card("end"), { settle: 4400 })

// --- Where each scene and caption starts -------------------------------------
// reelscript's own timing rules, for the actions used above.

function lengthOf(action: ReturnType<typeof demo.getTimeline>[number]): number {
  switch (action.kind) {
    case "browser.goto":
      return action.settle ?? 400
    case "cursor.moveTo":
      if (action.duration === undefined) throw new Error("demo: give every cursor move a duration")
      return action.duration
    case "cursor.click":
      return action.duration ?? 180
    case "type":
      return 80 + Array.from(action.text).length * (60000 / ((action.wpm ?? 300) * 5)) + 120
    case "press":
      return 100
    case "wait":
      return action.ms
    case "terminal.open":
      return 300
    case "terminal.print": {
      // Timed chunks end 250 ms after the last. They are paced here
      // (`paced`), so reelscript plays them as they are: no speed-up and no
      // gaps capped. Text is spread over `duration` (default: 150 ms plus 60
      // a line, at most 2.5 s), after 80 ms, and ends 250 ms later.
      if (action.events) {
        if ((action.speed ?? 1) !== 1 || action.maxGapMs !== Infinity)
          throw new Error("demo: pace terminal events with paced(), and play them with maxGapMs: Infinity")
        return (action.events.at(-1)?.[0] ?? 0) + 250
      }
      const lines = (action.text ?? "").split("\n").length
      const total = action.duration ?? Math.min(2500, 150 + 60 * lines)
      return 80 + total + 250
    }
    case "say":
    case "zoom.to":
    case "zoom.out":
    case "waitFor":
    case "window.place":
    case "call":
      return 0
    default:
      throw new Error(`demo: no timing rule for ${action.kind}`)
  }
}
const starts: number[] = []
let at = 0
for (const action of demo.getTimeline()) {
  starts.push(at)
  at += lengthOf(action)
}
starts.push(at)
const preludeMs = starts[preludeActions]
const expectedMs = at + 500 // reelscript's tail
const videoMs = (index: number) => starts[index] - preludeMs

// --- Captions and notes -------------------------------------------------------
// Each is a transparent 1920x1080 picture from cards/caption.html, laid over
// the video by ffmpeg with a short fade.

async function overlayImages(dir: string): Promise<string[]> {
  mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  try {
    const files: string[] = []
    await page.goto(card("caption"))
    await page.evaluate(() => document.fonts.ready)
    for (const [i, { text, kind }] of overlays.entries()) {
      await page.locator("#text").evaluate(
        (element, [value, className]) => {
          element.textContent = value
          element.setAttribute("class", className)
        },
        [text, kind]
      )
      const file = resolve(dir, `overlay-${i}.png`)
      await page.screenshot({ path: file, omitBackground: true })
      files.push(file)
    }
    return files
  } finally {
    await browser.close()
  }
}

// --- Gallery pictures and the thumbnail ---------------------------------------
// The listing's other pictures. Gallery pictures are 1270x760 and cut from
// the render before it is captioned; the thumbnail is the Subcanvas mark,
// whose inner box opens when a visitor hovers over it (a GIF plays only on
// hover), and whose first frame is the mark at rest.

async function listingPictures(raw: string, ffmpeg: string) {
  const work = resolve(outDir, "stills-work")
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1270, height: 760 } })
    await page.goto(card("gallery"))
    for (const [i, { headline, at, after }] of stills.entries()) {
      const frame = resolve(work, `frame-${i + 1}.png`)
      execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", ((starts[at] + after) / 1000).toFixed(3), "-i", raw, "-frames:v", "1", frame])
      await page.evaluate(
        ([text, src]) => {
          document.getElementById("headline")!.textContent = text
          const img = document.getElementById("frame") as HTMLImageElement
          img.src = src
          return img.decode()
        },
        [headline, new URL(`file://${frame}`).href]
      )
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: resolve(outDir, `gallery-${i + 1}.png`) })
    }

    const mark = await browser.newPage({ viewport: { width: 240, height: 240 } })
    await mark.goto(card("thumbnail"))
    // 0.3 s at rest, then 1.3 s of the box opening, at 20 frames a second.
    const moments = [...Array(6).fill(0), ...Array.from({ length: 26 }, (_, n) => (n + 1) / 26)]
    for (const [n, p] of moments.entries()) {
      await mark.evaluate((value) => (window as unknown as { draw: (p: number) => void }).draw(value), p)
      await mark.screenshot({ path: resolve(work, `mark-${String(n).padStart(3, "0")}.png`) })
    }
    execFileSync(ffmpeg, [
      "-y", "-loglevel", "error", "-framerate", "20", "-i", resolve(work, "mark-%03d.png"),
      "-vf", "split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none",
      "-loop", "0", resolve(outDir, "thumbnail.gif"),
    ])
  } finally {
    await browser.close()
    rmSync(work, { recursive: true, force: true })
  }
}

// --- Render, then cut the prelude, scale, and caption --------------------------

const snapshot = process.env.REELSCRIPT_SNAPSHOT_AT
const wanted = process.env.REELSCRIPT_OUT ?? resolve(outDir, "demo.mp4")
mkdirSync(dirname(wanted), { recursive: true })
if (snapshot !== undefined) {
  // A preview at `--at 0` is the first shot, not the sign-in form.
  process.env.REELSCRIPT_SNAPSHOT_AT = String(Number(snapshot) + preludeMs)
  await demo.render(wanted)
} else if (process.env.DEMO_KEEP_PRELUDE === "1" || !/\.mp4$/i.test(wanted)) {
  await demo.render(wanted)
} else {
  const raw = wanted.replace(/\.mp4$/i, ".raw.mp4")
  process.env.REELSCRIPT_OUT = raw
  const result = await demo.render(raw)
  const ffmpeg = process.env.REELSCRIPT_FFMPEG ?? "ffmpeg"
  const overlayDir = resolve(outDir, "overlays")
  rmSync(overlayDir, { recursive: true, force: true })
  const images = await overlayImages(overlayDir)
  const inputs: string[] = []
  const graph: string[] = ["[0:v]scale=1920:1080:flags=lanczos[v0]"]
  overlays.forEach(({ from, to }, i) => {
    const start = videoMs(from) / 1000
    const end = videoMs(to ?? starts.length - 1) / 1000
    const length = end - start
    inputs.push("-loop", "1", "-t", length.toFixed(3), "-i", images[i])
    // The first caption is on screen from the first frame: muted, it is the
    // video's opening line.
    const fadeIn = start === 0 ? "" : "fade=t=in:st=0:d=0.25:alpha=1,"
    graph.push(
      `[${i + 1}:v]format=rgba,${fadeIn}fade=t=out:st=${(length - 0.25).toFixed(3)}:d=0.25:alpha=1,` +
        `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB[o${i}]`,
      `[v${i}][o${i}]overlay=eof_action=pass:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'[v${i + 1}]`
    )
  })
  process.stderr.write(`demo: cutting the ${(preludeMs / 1000).toFixed(2)}s sign-in prelude, captioning\n`)
  execFileSync(
    ffmpeg,
    [
      "-y", "-loglevel", "error",
      // Half a frame in, so the cut cannot land on the prelude's last frame.
      "-ss", ((preludeMs + 8) / 1000).toFixed(3),
      "-i", raw,
      ...inputs,
      "-filter_complex", graph.join(";"),
      "-map", `[v${overlays.length}]`, "-map", "0:a?",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      wanted,
    ],
    { stdio: "inherit" }
  )
  await listingPictures(raw, ffmpeg)
  unlinkSync(raw)
  // The agent's arrow, replayed for the camera, comes off the sheet again.
  if (existsSync(replayedFile)) {
    await undo(mcpClient(base, token), JSON.parse(readFileSync(replayedFile, "utf8")) as Made)
    unlinkSync(replayedFile)
  }
  if (Math.abs(result.durationMs - expectedMs) > 20)
    process.stderr.write(`demo: the render is ${result.durationMs}ms but the script expected ${expectedMs}ms; the times below are off\n`)
  process.stderr.write(`demo: ${wanted} is ${((result.durationMs - preludeMs) / 1000).toFixed(2)}s\n`)
  for (const [name, index] of beats)
    process.stderr.write(`demo:   ${(videoMs(index) / 1000).toFixed(1).padStart(5)}s  ${name}\n`)
  for (const { text, from, to } of overlays)
    process.stderr.write(`demo:   ${(videoMs(from) / 1000).toFixed(1).padStart(5)}s–${(videoMs(to ?? starts.length - 1) / 1000).toFixed(1)}s  “${text}”\n`)
}
