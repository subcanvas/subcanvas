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
 *   DEMO_REPOSITORY       Imported on camera: a well-known repository with no
 *                         .subcanvas files, so the video shows what anyone
 *                         gets. Default facebook/react.
 *   DEMO_DIVE             The box opened in the first shot, on that
 *                         repository's top sheet. Default Packages.
 *   DEMO_DIVE_BOX         A box on the sheet inside it. Default React.
 *   DEMO_SELF_REPOSITORY  The repository whose .subcanvas file is shown.
 *                         Default subcanvas/subcanvas. fixture/<name> reads a
 *                         copy on disk instead (see the README).
 *   DEMO_SELF_FILE        That file, read from this checkout. Default
 *                         src/.subcanvas.
 *   DEMO_ARROW            The arrow it declares. Default "Auth, data, Realtime".
 *   DEMO_README_URL       A README with the embed in it, shown at the end of
 *                         the embed scene. Default none.
 *   DEMO_EMAIL            The demo account. Created through the sign-up form
 *   DEMO_PASSWORD         the first time, where sign-up needs no confirmation.
 *   DEMO_ORG_NAME         The org's name in the sidebar. Default Acme.
 *   DEMO_STAGE_ORG        Slug of the org that keeps finished imports of both
 *                         repositories for the scenes that do not import
 *                         (see "Two orgs" below). Default demo-stage.
 *   DEMO_ORG              Reuse this org for the on-camera import instead of
 *                         creating a fresh one.
 *   DEMO_IMPORT_WAIT      Milliseconds of video on "Importing…" before the
 *                         cut to the diagram. Default 800. The rest of the
 *                         import happens off camera.
 *   DEMO_PUBLIC_SITE      For a local render, what the address pill shows in
 *                         place of the dev server. Default https://subcanvas.app.
 *   DEMO_KEEP_PRELUDE     Set to 1 to keep the sign-in prelude in the video.
 *
 * Scenes (the render prints where each starts). The video autoplays muted
 * on Product Hunt, so a caption over the picture says each scene's point,
 * and the narration says the same:
 *
 *   1. React's diagram. A box opens into the diagram inside it.
 *   2. The import that made it: the repository is typed, Import, the diagram.
 *   3. This repository's .subcanvas file in a terminal, beside the arrow it
 *      draws; then that arrow's reason, opened as a page.
 *   4. Share, Copy embed, and the embed in a README when DEMO_README_URL is set.
 *   5. The end card.
 *
 * Two orgs: the import in scene 2 is real and lands in a fresh org, but the
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
 * same ffmpeg pass, with the captions laid over it there.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { execFileSync } from "node:child_process"

import { chromium, type Page } from "@playwright/test"
import { createDemo } from "@reelscript/cli"

// --- Settings -----------------------------------------------------------------

const base = (process.env.DEMO_BASE_URL ?? "http://localhost:3420").replace(/\/$/, "")
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)
const repository = process.env.DEMO_REPOSITORY ?? "facebook/react"
const dive = process.env.DEMO_DIVE ?? "Packages"
const diveBox = process.env.DEMO_DIVE_BOX ?? "React"
const selfRepository = process.env.DEMO_SELF_REPOSITORY ?? "subcanvas/subcanvas"
const selfFile = process.env.DEMO_SELF_FILE ?? "src/.subcanvas"
const arrow = process.env.DEMO_ARROW ?? "Auth, data, Realtime"
const readmeUrl = process.env.DEMO_README_URL
const email = process.env.DEMO_EMAIL ?? "demo@subcanvas.test"
const password = process.env.DEMO_PASSWORD ?? "demo-reel-password"
const orgName = process.env.DEMO_ORG_NAME ?? "Acme"
const stageSlug = process.env.DEMO_STAGE_ORG ?? "demo-stage"
const importWait = Number(process.env.DEMO_IMPORT_WAIT ?? 800)
const publicSite = (process.env.DEMO_PUBLIC_SITE ?? "https://subcanvas.app").replace(/\/$/, "")

const nameOf = (repo: string) => repo.split("/").pop()!.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
const here = dirname(new URL(import.meta.url).pathname)
const outDir = resolve(here, "..", "out")
const card = (name: string) => new URL(`./cards/${name}.html`, import.meta.url).href

// The file the terminal shows, as it is in this checkout, and the first
// words of the arrow's reason in it, to know its page has opened.
const selfName = nameOf(selfRepository)
const selfText = readFileSync(resolve(here, "..", "..", "..", selfFile), "utf8").trimEnd()
const reason = selfText.match(new RegExp(`label: ${arrow}\\s*\\n\\s*description: (\\S+ \\S+ \\S+ \\S+)`))?.[1]
if (!reason) throw new Error(`demo: ${selfFile} has no arrow "${arrow}" with a description`)

// --- Selectors ----------------------------------------------------------------
// Roles and labels, the way the e2e helpers name things, never a generated
// class. reelscript hands these to Playwright, so its `:has-text()`,
// `:text-is()` and `>> visible=true` all work.

const NODE = (title: string) => `.react-flow__node[aria-label^="Node: ${title},"]`
// The mark in a box's corner that opens the whiteboard inside it.
const INSIDE = (title: string) => `${NODE(title)} button[aria-label="Open the whiteboard inside"]`
// The canvas of the sheet that has this box on it. The whiteboard is centred
// on it, so its middle is the diagram's, and it exists only once that sheet
// is drawn.
const SHEET = (title: string) => `.react-flow:has(${NODE(title)}) .react-flow__pane`
const PANEL = 'aside[aria-label="Object settings"]'
const OPEN_DOCUMENT = `${PANEL} section[aria-label="Document"] :is(button, a):has-text("Open")`
const EDGE_LABEL = (label: string) => `.react-flow__edgelabel-renderer span:text-is("${label}")`
const REASON = `:text("${reason}")`
const SIGNED_IN = '[aria-label="Account menu"] >> visible=true'

// --- Before the camera rolls --------------------------------------------------
// A real Playwright browser, in real time: the account, the staging org with
// its finished imports (kept between runs), a fresh empty org for the import
// that happens on camera, and warm routes so a dev server does not compile
// in the middle of a scene.

type Stage = { zero: { top: string; dive: string }; self: { top: string } }

async function pressNode(page: Page, title: string) {
  // React Flow hands a press to d3-drag, which needs a real pointer.
  const node = page.locator(NODE(title))
  const box = await node.boundingBox()
  if (!box) throw new Error(`The node "${title}" is not on the whiteboard`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 })
  await page.mouse.down()
  await page.mouse.up()
}

const tools = (page: Page) => page.getByRole("toolbar", { name: "Whiteboard tools" })

async function importInto(page: Page, slug: string, repo: string): Promise<string> {
  await page.goto(`${base}/${slug}`)
  await page.getByRole("button", { name: "Import from GitHub" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("textbox", { name: "Repository" }).fill(repo)
  await dialog.getByRole("button", { name: "Import", exact: true }).click()
  // A clean import goes straight to the whiteboard; one with notes stops to
  // show them first.
  const opened = dialog.getByRole("button", { name: "Open the whiteboard" })
  await Promise.race([
    page.waitForURL(/\/d\/[0-9a-f-]{36}/).catch(() => {}),
    opened.waitFor().then(() => opened.click()).catch(() => {}),
  ])
  await page.waitForURL(/\/d\/[0-9a-f-]{36}/)
  await tools(page).waitFor()
  return page.url()
}

async function openBox(page: Page, title: string): Promise<string> {
  await tools(page).waitFor()
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
  await page.getByLabel("URL").fill(slug)
  await page.getByRole("button", { name: "Create org" }).click()
  await page.waitForURL(`${base}/${slug}`)
}

async function prepare(): Promise<{ slug: string; stage: Stage }> {
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
      const saved = JSON.parse(readFileSync(stageFile, "utf8")) as Stage
      const response = await page.goto(saved.self.top)
      if (response?.ok() && (await tools(page).isVisible())) stage = saved
    }
    if (!stage) {
      const response = await page.goto(`${base}/${stageSlug}`)
      if (!response?.ok()) await createOrg(page, stageSlug)
      const zeroTop = await importInto(page, stageSlug, repository)
      const zeroDive = await openBox(page, dive)
      const selfTop = await importInto(page, stageSlug, selfRepository)
      stage = { zero: { top: zeroTop, dive: zeroDive }, self: { top: selfTop } }
      mkdirSync(outDir, { recursive: true })
      writeFileSync(stageFile, JSON.stringify(stage, null, 2) + "\n")
    }
    // Warm every route the camera will visit.
    for (const href of [stage.zero.top, stage.zero.dive, stage.self.top]) {
      await page.goto(href)
      await tools(page).waitFor()
    }

    // The fresh org the on-camera import lands in. Nothing is deleted, so it
    // gets a name of its own each time.
    const slug = process.env.DEMO_ORG ?? `demo-${nameOf(repository)}-${Math.random().toString(36).slice(2, 8)}`
    if (!process.env.DEMO_ORG) await createOrg(page, slug)
    return { slug, stage }
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

process.stderr.write(`demo: preparing ${base} (${repository}, ${selfRepository})\n`)
const { slug, stage } = await prepare()
process.stderr.write(`demo: org /${slug}, staging /${stageSlug}\n`)

// --- The address pill ---------------------------------------------------------
// Against production it shows the real address. Against a dev server it
// shows the public site instead, with each sheet by name rather than by
// id, so no dev server, org slug or document id appears.

const docId = (url: string) => url.match(/\/d\/([0-9a-f-]{36})/)?.[1]
const projectId = (url: string) => url.match(/\/([0-9a-f-]{36})\/d\//)?.[1]
const zeroName = nameOf(repository)
const sheets = new Map<string, string>([
  [docId(stage.zero.top)!, `/${zeroName}`],
  [docId(stage.zero.dive)!, `/${zeroName}/${nameOf(dive)}`],
  [docId(stage.self.top)!, `/${selfName}`],
])
const projects = new Map<string, string>([
  [projectId(stage.zero.top)!, zeroName],
  [projectId(stage.self.top)!, selfName],
])
function address(url: string) {
  if (!local || !url.startsWith(base)) return url
  const id = docId(url)
  if (id && sheets.has(id)) return `${publicSite}${sheets.get(id)}`
  const project = projectId(url)
  return `${publicSite}/${(project && projects.get(project)) ?? zeroName}`
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
const captions: { text: string; from: number; to?: number }[] = []
function caption(text: string) {
  const at = demo.getTimeline().length
  const open = captions.at(-1)
  if (open && open.to === undefined) open.to = at
  captions.push({ text, from: at })
}
// A gallery picture for the listing: `headline` over the frame `after` ms
// past this point, cut from the render with no caption on it.
const stills: { headline: string; at: number; after: number }[] = []
const still = (headline: string, after: number) => stills.push({ headline, at: demo.getTimeline().length, after })
function captionEnd() {
  const open = captions.at(-1)
  if (open && open.to === undefined) open.to = demo.getTimeline().length
}
// Narration a little quicker than the voice's default, so each sentence
// fits the scene it belongs to (sentences queue; one that runs long delays
// every one after it).
const QUICK = { speed: 1.1 }
type Where = "browser" | "terminal"
const move = (target: string | { x: number; y: number }, duration = 700, window?: Where) =>
  demo.cursor.moveTo(target, { duration, ease: "smooth", ...(window ? { window } : {}) })
// Zooms stay inside the browser window, so the desktop never shows past it.
const zoom = (target: string | { x: number; y: number }, scale: number, duration = 700) =>
  demo.zoom.to(target, { scale, duration, within: "window", window: "browser" })
// Where the cursor rests while there is nothing to point at: low on the
// right, clear of the diagrams; and off the screen entirely.
const REST = { x: 1330, y: 690 }
const OFF = { x: 1700, y: 1000 }
// Opens a sheet with its drawing on camera, not its loading.
async function open(url: string, box: string) {
  demo.zoom.out({ duration: 1 })
  await demo.browser.goto(url, { settle: 0 })
  await demo.waitFor(SHEET(box))
}

// The prelude, cut from the video: reelscript's browser signs in, then
// opens the first sheet, so the video starts on it, drawn.
await demo.browser.goto(`${base}/login`, { settle: 600 })
await demo.type("#email", email, { wpm: 1200 })
await demo.type("#password", password, { wpm: 1200 })
await demo.press("Enter")
await move(SIGNED_IN, 300) // resolving a target waits, off camera, until it exists
await move(OFF, 100)
await open(stage.zero.top, dive)
zoom(SHEET(dive), 1.6, 1)
const preludeActions = demo.getTimeline().length

// 1. React's diagram, and a box opening into the diagram inside it.
mark("React's diagram; a box opens")
caption("Any public GitHub repository, as a diagram.")
demo.say("Any public GitHub repository, as a diagram.", QUICK)
await demo.wait(1500)
await move(INSIDE(dive), 1000)
zoom(NODE(dive), 1.8, 600)
await demo.wait(500)
// The next sheet's framing is aimed while this canvas is still here to aim
// at; it starts with the click.
zoom(".react-flow__pane", 1.25, 800)
await demo.cursor.click()
caption("Boxes open into the diagrams inside them.")
demo.say("Boxes open into the diagrams inside them.", QUICK)
await demo.waitFor(SHEET(diveBox)) // the sheet inside, drawn, before the next frame
await move(REST, 700)
still("Any public GitHub repository, as a diagram you can walk into.", 900)
await demo.wait(2400)

// 2. The import that made it, on camera.
mark("Import from GitHub")
caption("Paste a public repo. Folders with READMEs become boxes.")
demo.say("Paste a public repository, and its folders become boxes.", QUICK)
demo.zoom.out({ duration: 1 })
await demo.browser.goto(`${base}/${slug}`, { settle: 150 })
await move('button:has-text("Import from GitHub")', 500)
await demo.cursor.click()
await demo.wait(100)
zoom('[role="dialog"]', 1.6, 450)
await demo.wait(200)
await demo.type("#import-repository", repository, { wpm: 500 })
await demo.wait(250)
still("Paste a public repository. Folders with READMEs become boxes.", 0)
await move('[role="dialog"] button:text-is("Import")', 400)
await demo.cursor.click()
await demo.wait(importWait)
// The rest of the import off camera, then the diagram it drew.
await demo.waitFor(SHEET(dive))
zoom(SHEET(dive), 1.35, 1)
await move(REST, 500)
await demo.wait(1900)

// 3. Names and arrows come from .subcanvas files. The terminal shows this
// repository's, beside the arrow it draws; then the arrow's reason.
mark(".subcanvas file and the arrow it draws")
caption("Names and arrows: a few lines of YAML in the repo.")
demo.say("Name the boxes and draw arrows with a few lines of YAML in the repo.", QUICK)
await open(stage.self.top, "Application")
// Inside the browser window, over its sidebar, so that when the browser is
// clicked it comes to the front and hides the terminal entirely.
await demo.terminal.open({ title: selfName, prompt: `${selfName} % `, fontSize: 15, x: 92, y: 250, width: 520, height: 520 })
zoom({ x: 535, y: 440 }, 1.3, 700)
await demo.terminal.run(`cat ${selfFile}`, { output: selfText, wpm: 450, duration: 700 })
await move(EDGE_LABEL(arrow), 800, "browser")
still("Name the boxes and draw the arrows with a few lines of YAML in the repo.", 900)
await demo.wait(1900)
caption("Each arrow can say why it is there.")
demo.say("Each arrow can say why it is there.", QUICK)
demo.zoom.out({ duration: 500 })
await demo.cursor.click()
await move(OPEN_DOCUMENT, 600, "browser")
await demo.wait(200)
await demo.cursor.click()
await demo.waitFor(REASON)
zoom(REASON, 1.45, 700)
await move(REST, 600)
still("Every arrow can say why it is there.", 800)
await demo.wait(2400)

// 4. The embed, for a README.
mark("Share, Copy embed")
caption("Embed it in your README. It redraws when the diagram changes.")
demo.say("Put it in your README, where it redraws as the diagram changes.", QUICK)
await open(stage.self.top, "Application")
await move('button:has-text("Share")', 700)
await demo.cursor.click()
await demo.wait(300)
zoom('[data-slot="popover-content"]', 1.6, 500)
await move('button:has-text("Copy embed")', 500)
if (local) {
  // Not clicked against a dev server: the click takes focus from the link,
  // which then shows its start, the dev server's address.
  await demo.wait(2800)
} else {
  await demo.wait(200)
  await demo.cursor.click()
  await demo.wait(2500)
}
if (readmeUrl) {
  // The README on GitHub, with the embed in it.
  const EMBED = 'img[alt$="a Subcanvas diagram"]'
  demo.zoom.out({ duration: 1 })
  await demo.browser.goto(readmeUrl, { settle: 0 })
  await demo.waitFor(EMBED, { timeout: 30_000 })
  zoom(EMBED, 1.3, 1)
  await demo.wait(2500)
}

// 5. The end card.
mark("End card")
captionEnd()
demo.zoom.out({ duration: 400 })
await move(OFF, 400)
demo.say("Paste a public repository at subcanvas dot app.", QUICK)
await demo.browser.goto(card("end"), { settle: 3200 })

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
      return 180
    case "type":
      return 80 + Array.from(action.text).length * (60000 / ((action.wpm ?? 300) * 5)) + 120
    case "press":
      return 100
    case "wait":
      return action.ms
    case "terminal.open":
      return 300
    case "terminal.run": {
      if (action.output === undefined || action.duration === undefined)
        throw new Error("demo: give every terminal.run its output and a duration")
      return 510 + Array.from(action.command).length * (60000 / ((action.wpm ?? 300) * 5)) + action.duration
    }
    case "say":
    case "zoom.to":
    case "zoom.out":
    case "waitFor":
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

// --- Captions -----------------------------------------------------------------
// Each is a transparent 1920x1080 picture from cards/caption.html, laid over
// the video by ffmpeg with a short fade.

async function captionImages(dir: string): Promise<string[]> {
  mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  try {
    const files: string[] = []
    await page.goto(card("caption"))
    await page.evaluate(() => document.fonts.ready)
    for (const [i, { text }] of captions.entries()) {
      await page.locator("#text").evaluate((element, value) => (element.textContent = value), text)
      const file = resolve(dir, `caption-${i}.png`)
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
    // 0.7 s at rest, then 1.3 s of the box opening, at 20 frames a second.
    const moments = [...Array(14).fill(0), ...Array.from({ length: 26 }, (_, n) => (n + 1) / 26)]
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
  const captionDir = resolve(outDir, "captions")
  rmSync(captionDir, { recursive: true, force: true })
  const images = await captionImages(captionDir)
  const inputs: string[] = []
  const graph: string[] = ["[0:v]scale=1920:1080:flags=lanczos[v0]"]
  captions.forEach(({ from, to }, i) => {
    const start = videoMs(from) / 1000
    const end = videoMs(to ?? starts.length - 1) / 1000
    const length = end - start
    inputs.push("-loop", "1", "-t", length.toFixed(3), "-i", images[i])
    // The first is on screen from the first frame: muted, it is the video's opening line.
    const fadeIn = i === 0 ? "" : "fade=t=in:st=0:d=0.25:alpha=1,"
    graph.push(
      `[${i + 1}:v]format=rgba,${fadeIn}fade=t=out:st=${(length - 0.25).toFixed(3)}:d=0.25:alpha=1,` +
        `setpts=PTS-STARTPTS+${start.toFixed(3)}/TB[c${i}]`,
      `[v${i}][c${i}]overlay=eof_action=pass:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'[v${i + 1}]`
    )
  })
  process.stderr.write(`demo: cutting the ${(preludeMs / 1000).toFixed(2)}s sign-in prelude, captioning\n`)
  execFileSync(
    ffmpeg,
    [
      "-y", "-loglevel", "error",
      "-ss", (preludeMs / 1000).toFixed(3),
      "-i", raw,
      ...inputs,
      "-filter_complex", graph.join(";"),
      "-map", `[v${captions.length}]`, "-map", "0:a?",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      wanted,
    ],
    { stdio: "inherit" }
  )
  await listingPictures(raw, ffmpeg)
  unlinkSync(raw)
  if (Math.abs(result.durationMs - expectedMs) > 20)
    process.stderr.write(`demo: the render is ${result.durationMs}ms but the script expected ${expectedMs}ms; the times below are off\n`)
  process.stderr.write(`demo: ${wanted} is ${((result.durationMs - preludeMs) / 1000).toFixed(2)}s\n`)
  for (const [name, index] of beats)
    process.stderr.write(`demo:   ${(videoMs(index) / 1000).toFixed(1).padStart(5)}s  ${name}\n`)
  for (const { text, from, to } of captions)
    process.stderr.write(`demo:   ${(videoMs(from) / 1000).toFixed(1).padStart(5)}s–${(videoMs(to ?? starts.length - 1) / 1000).toFixed(1)}s  “${text}”\n`)
}
