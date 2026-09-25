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
 *   DEMO_BASE_URL     The app. Default http://localhost:3420, a dev server.
 *   DEMO_REPOSITORY   What gets typed into "Import from GitHub". Default
 *                     subcanvas/subcanvas, read from GitHub like any import.
 *                     fixture/<name> reads a folder on disk instead, from a dev
 *                     server started with SUBCANVAS_IMPORT_FIXTURES (see the
 *                     README beside this file).
 *   DEMO_EMAIL        The demo account. Created through the sign-up form the
 *   DEMO_PASSWORD     first time, where sign-up needs no email confirmation.
 *   DEMO_ORG_NAME     The org's name, shown at the top of the sidebar. Default Subcanvas.
 *   DEMO_STAGE_ORG    Slug of the org that keeps a finished import of the
 *                     repository for the beats after the first one (see
 *                     "Two orgs" below). Default demo-<repo>.
 *   DEMO_INTO         Titles of the two boxes to walk into, outermost first.
 *                     Default Application,Core libraries.
 *   DEMO_ARROW        Label of the arrow to click. Default "Auth, data, Realtime".
 *   DEMO_ARROW_DEPTH  Which sheet the arrow is on: 0 the top one, 1 inside the
 *                     first box of DEMO_INTO. Default 0.
 *   DEMO_IMPORT_WAIT  Milliseconds of video to hold on the dialog while the
 *                     import runs. Default 600. Past that, the camera waits off
 *                     screen, up to three seconds, for the whiteboard.
 *   DEMO_ORG          Reuse this org for the on-camera import instead of
 *                     creating a fresh one. Handy while iterating on previews.
 *   DEMO_PUBLIC_SITE  What the address pill shows in place of the dev server.
 *                     Default https://subcanvas.app.
 *   DEMO_KEEP_PRELUDE Set to 1 to keep the sign-in prelude in the video.
 *
 * Beats (times are approximate; the render prints the exact ones). The video
 * autoplays muted on Product Hunt, so the cards carry the story on their own,
 * and the diagram is on screen by about five seconds:
 *
 *   1. Card: "Paste a GitHub repository. Get its system diagram."
 *   2. Import: "Import from GitHub", the repository is typed, Import, and the
 *      top whiteboard appears: one box per folder.
 *   3. Card, then inside: the mark on a box opens it, and the sheet inside
 *      slides in.
 *   4. Card, then deeper: into the next box, the trail grows, and one click
 *      on the trail brings the top sheet back.
 *   5. Card, then arrows: in view mode, click the arrow's label and read the
 *      document behind it.
 *   6. Card, then Share: the popover close up, the pointer on Copy embed.
 *   7. Card: subcanvas.app.
 *
 * Two orgs: the import in beat 2 is real and lands in a fresh org, but the
 * page it produces has ids nobody knows in advance, and reelscript can only
 * navigate to addresses the script knows. So the beats after it play on a
 * second, identical import that was made ahead of time (once, and kept) in
 * the staging org, whose addresses this script learns before the camera
 * rolls. The two look the same on screen.
 *
 * Prelude: reelscript starts its browser signed out, so the script signs in
 * by typing. Those seconds are cut from the video afterwards with ffmpeg;
 * previews are offset the same way, so `--at 0` is the first card.
 *
 * Frame: a 1600x900 desktop, 16:9 so that YouTube and Product Hunt show it
 * without bars, scaled to 1920x1080 in the same ffmpeg pass so YouTube
 * offers it in 1080p. The window is as large as the desktop allows, which
 * keeps the interface as large as it can be in a small player.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { execFileSync } from "node:child_process"

import { chromium, type Page } from "@playwright/test"
import { createDemo } from "@reelscript/cli"

// --- Settings -----------------------------------------------------------------

const base = (process.env.DEMO_BASE_URL ?? "http://localhost:3420").replace(/\/$/, "")
const repository = process.env.DEMO_REPOSITORY ?? "subcanvas/subcanvas"
const email = process.env.DEMO_EMAIL ?? "demo@subcanvas.test"
const password = process.env.DEMO_PASSWORD ?? "demo-reel-password"
const orgName = process.env.DEMO_ORG_NAME ?? "Subcanvas"
const repoName = repository.split("/").pop()!.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
const stageSlug = process.env.DEMO_STAGE_ORG ?? `demo-${repoName}`
const into = (process.env.DEMO_INTO ?? "Application,Core libraries").split(",").map((s) => s.trim())
if (into.length !== 2) throw new Error("demo: DEMO_INTO names two boxes, outermost first")
const arrow = process.env.DEMO_ARROW ?? "Auth, data, Realtime"
const arrowDepth = Number(process.env.DEMO_ARROW_DEPTH ?? 0)
const importWait = Number(process.env.DEMO_IMPORT_WAIT ?? 600)

const here = dirname(new URL(import.meta.url).pathname)
const outDir = resolve(here, "..", "out")
const card = (name: string) => new URL(`./cards/${name}.html`, import.meta.url).href

// --- Selectors ----------------------------------------------------------------
// Roles and labels, the way the e2e helpers name things, never a generated
// class. reelscript hands these to Playwright, so its `:has-text()`,
// `:text-is()` and `>> visible=true` all work.

const NODE = (title: string) => `.react-flow__node[aria-label^="Node: ${title},"]`
// The mark in a box's corner that opens the whiteboard inside it: one click,
// and no panel opening beside the canvas first.
const INSIDE = (title: string) => `${NODE(title)} button[aria-label="Open the whiteboard inside"]`
// The canvas of the sheet that has this box on it. The whiteboard is centred
// on it, so its middle is the diagram's; and it is only on the page once
// that sheet is drawn, so a zoom to it waits, off camera, until then.
const SHEET = (title: string) => `.react-flow:has(${NODE(title)}) .react-flow__pane`
const PANEL = 'aside[aria-label="Object settings"]'
const DOC = `${PANEL} section[aria-label="Document"]`
const VIEW_MODE = '[aria-label="View mode"]'
// The trail is in the page twice, once for narrow screens; reelscript takes
// the first match, so the visible one is asked for.
const TOP_CRUMB = 'nav[aria-label="breadcrumb"] ol > li:nth-child(3) a >> visible=true'
// The whole trail, once it ends at `title`: only there after the navigation,
// so a zoom to it waits off camera for the new sheet.
const TRAIL_TO = (title: string) =>
  `nav[aria-label="breadcrumb"]:has([aria-current="page"]:text-is("${title}")) >> visible=true`
const EDGE_LABEL = (label: string) => `.react-flow__edgelabel-renderer span:text-is("${label}")`
const SIGNED_IN = '[aria-label="Account menu"] >> visible=true'

// --- Before the camera rolls --------------------------------------------------
// A real Playwright browser, in real time: the account, the staging org
// with its finished import (kept between runs), a fresh empty org for the
// import that happens on camera, and warm routes so the dev server does not
// compile in the middle of a beat.

type Stage = { top: string; into: string[] }

async function pressNode(page: Page, title: string) {
  // React Flow hands a press to d3-drag, which needs a real pointer.
  const node = page.getByRole("application").getByText(title, { exact: true })
  const box = await node.boundingBox()
  if (!box) throw new Error(`The node "${title}" is not on the whiteboard`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 })
  await page.mouse.down()
  await page.mouse.up()
}

async function importInto(page: Page, slug: string): Promise<Stage> {
  await page.goto(`${base}/${slug}`)
  await page.getByRole("button", { name: "Import from GitHub" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("textbox", { name: "Repository" }).fill(repository)
  await dialog.getByRole("button", { name: "Import", exact: true }).click()
  // A clean import goes straight to the whiteboard; one with notes stops to
  // show them first.
  const opened = dialog.getByRole("button", { name: "Open the whiteboard" })
  await Promise.race([
    page.waitForURL(/\/d\/[0-9a-f-]{36}/).catch(() => {}),
    opened.waitFor().then(() => opened.click()).catch(() => {}),
  ])
  await page.waitForURL(/\/d\/[0-9a-f-]{36}/)
  await page.getByRole("toolbar", { name: "Whiteboard tools" }).waitFor()
  const top = page.url()
  const hrefs: string[] = []
  for (const title of into) {
    await page.getByRole("toolbar", { name: "Whiteboard tools" }).waitFor()
    await page.waitForTimeout(400)
    const before = page.url()
    await pressNode(page, title)
    await page.keyboard.press("Enter")
    await page.waitForURL((url) => url.href !== before)
    hrefs.push(page.url())
  }
  return { top, into: hrefs }
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
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
    await page.request.post(`${base}/__nextjs_disable_dev_indicator`).catch(() => {})

    // The staging org and its import, made once and kept. Its addresses are
    // remembered beside the renders and checked before they are trusted.
    const stageFile = resolve(outDir, `stage-${stageSlug}.json`)
    let stage: Stage | null = null
    if (existsSync(stageFile)) {
      const saved = JSON.parse(readFileSync(stageFile, "utf8")) as Stage
      const response = await page.goto(saved.top)
      if (response?.ok() && (await page.getByRole("toolbar", { name: "Whiteboard tools" }).isVisible()))
        stage = saved
    }
    if (!stage) {
      const response = await page.goto(`${base}/${stageSlug}`)
      if (!response?.ok()) await createOrg(page, stageSlug)
      stage = await importInto(page, stageSlug)
      mkdirSync(outDir, { recursive: true })
      writeFileSync(stageFile, JSON.stringify(stage, null, 2) + "\n")
    }
    // Warm every route the camera will visit.
    for (const href of [stage.top, ...stage.into]) {
      await page.goto(href)
      await page.getByRole("toolbar", { name: "Whiteboard tools" }).waitFor()
    }

    // The fresh org the on-camera import lands in. Nothing is deleted, so it
    // gets a name of its own each time.
    const slug = process.env.DEMO_ORG ?? `demo-${repoName}-${Math.random().toString(36).slice(2, 8)}`
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

process.stderr.write(`demo: preparing ${base} (${repository})\n`)
const { slug, stage } = await prepare()
process.stderr.write(`demo: org /${slug}, staging /${stageSlug}\n`)

// --- The timeline -------------------------------------------------------------

// The address pill shows the public site, and the sheets by name rather
// than by id: the top sheet at /orchard, the ones walked into at
// /orchard/services and /orchard/services/payments. The dev server, the org
// slugs and the document ids never appear.
const publicSite = (process.env.DEMO_PUBLIC_SITE ?? "https://subcanvas.app").replace(/\/$/, "")
const docIdOf = (url: string) => url.match(/\/d\/([0-9a-f-]{36})/)?.[1]
const sheetPaths = new Map<string, string>([[docIdOf(stage.top)!, `/${repoName}`]])
into.forEach((_, i) => {
  const steps = into.slice(0, i + 1).map((title) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-"))
  sheetPaths.set(docIdOf(stage.into[i])!, `/${repoName}/${steps.join("/")}`)
})
function address(url: string) {
  if (!url.startsWith(base)) return url
  const id = docIdOf(url)
  return `${publicSite}${(id && sheetPaths.get(id)) ?? `/${repoName}`}`
}

const demo = createDemo({
  theme: "macos",
  viewport: [1440, 740],
  desktop: [1600, 900],
  fps: 60,
  voice: "af_heart",
  pronunciations: { Subcanvas: "Sub canvas", subcanvas: "sub canvas", README: "read me" },
  address,
})

// Every action here has a fixed length (cursor moves are given one), so the
// script can tell where each beat starts and where the prelude ends. The
// estimate is checked against the render at the end.
const beats: [string, number][] = []
const mark = (name: string) => beats.push([name, demo.getTimeline().length])
const move = (target: string | { x: number; y: number }, duration = 700) =>
  demo.cursor.moveTo(target, { duration, ease: "smooth" })
// Where the cursor rests while there is nothing to point at: low on the
// right, clear of every diagram and of the panel's text.
const REST = { x: 1330, y: 640 }
// A card holds for `ms` of video. The cursor is tucked into the corner first.
const CORNER = { x: 1400, y: 710 }
async function title(name: string, ms: number) {
  await move(CORNER, 400)
  await demo.browser.goto(card(name), { settle: ms })
}
// Opens a sheet. The page's clock only moves while frames are filmed, so a
// page cannot finish drawing off camera: some of the blank sheet is on
// camera, and a zoom to the sheet's canvas then waits, off camera, for
// whatever is left (see SHEET).
async function open(url: string, box: string) {
  await demo.browser.goto(url, { settle: 400 })
  demo.zoom.to(SHEET(box), { scale: 1, duration: 1 })
}
// The canvas on screen now. A sheet opened from it has its canvas in the
// same place, so the camera can frame the next sheet while it loads.
const CANVAS = ".react-flow__pane"
// The middle of that canvas, right of the 256px sidebar and under the 45px
// header, for when there is no canvas on the page yet to aim at.
const CANVAS_MIDDLE = { x: 256 + (1440 - 256) / 2, y: 45 + (740 - 45) / 2 }

// The prelude, cut from the video: reelscript's browser signs in.
await demo.browser.goto(`${base}/login`, { settle: 600 })
await demo.type("#email", email, { wpm: 1200 })
await demo.type("#password", password, { wpm: 1200 })
await demo.press("Enter")
await move(SIGNED_IN, 300) // resolving a target waits, off camera, until it exists
await move(CORNER, 300) // so the video opens on the first card, cursor already tucked away
const preludeActions = demo.getTimeline().length

// 1. Open.
mark("Card: paste a repository, get its diagram")
demo.say("Paste a GitHub repository, and Subcanvas draws its system diagram.")
await demo.browser.goto(card("01-open"), { settle: 2100 })

// 2. Import from GitHub, on camera. The repository's name is typed close up,
// and the diagram it becomes is on screen about five seconds in.
mark("Import from GitHub")
await demo.browser.goto(`${base}/${slug}`, { settle: 200 })
await move('button:has-text("Import from GitHub")', 550)
await demo.cursor.click()
await demo.wait(100)
demo.zoom.to('[role="dialog"]', { scale: 1.6, duration: 450 })
await demo.wait(150)
await demo.type("#import-repository", repository, { wpm: 700 })
await demo.wait(200)
await move('[role="dialog"] button:text-is("Import")', 400)
await demo.cursor.click()
await demo.wait(importWait)
// From the dialog straight to where the diagram is drawn, then hold there
// (off camera, if it is not drawn yet).
demo.zoom.to(CANVAS_MIDDLE, { scale: 1.3, duration: 700 })
await move(REST, 700)
demo.zoom.to(SHEET(into[0]), { scale: 1.3, duration: 1 })
demo.say("One box for each folder, with its README inside.")
await demo.wait(2800)
// Out to the whole window for a moment: the address, the project in the
// sidebar. The first gallery still is cut here.
demo.zoom.out({ duration: 450 })
await demo.wait(900)

// 3. Inside a box: the diagram of what is in that folder.
mark("Card: every folder is a box, and every box opens")
demo.say("Every folder is a box, and every box opens into the diagram of what is inside it.")
await title("02-folders", 2400)
mark("Open a box")
await open(stage.top, into[0])
await move(NODE(into[0]), 750)
demo.zoom.to(NODE(into[0]), { scale: 1.7, duration: 600 })
await move(INSIDE(into[0]), 450)
await demo.wait(350)
// Out to where the sheet inside will be while it loads, then hold until it
// has slid in. The zoom is aimed before the click, while this canvas is
// still on the page; it starts with the click either way.
demo.zoom.to(CANVAS, { scale: 1.15, duration: 700 })
await demo.cursor.click()
await move(REST, 700)
demo.zoom.to(SHEET(into[1]), { scale: 1.15, duration: 1 })
await demo.wait(2000)
demo.zoom.out({ duration: 400 })
await demo.wait(800)

// 4. Deeper, then back out through the trail.
mark("Card: back out through the trail")
demo.say("Go as deep as the code goes. The trail leads back out.")
await title("03-trail", 2000)
mark("Into the next box, then the trail")
await open(stage.into[0], into[1])
await move(NODE(into[1]), 750)
demo.zoom.to(NODE(into[1]), { scale: 1.7, duration: 600 })
await move(INSIDE(into[1]), 450)
await demo.wait(300)
demo.zoom.to(TOP_CRUMB, { scale: 1.8, duration: 700 }) // the trail, while the deeper sheet loads
await demo.cursor.click()
await demo.wait(600)
demo.zoom.to(TRAIL_TO(into[1]), { scale: 1.8, duration: 400 }) // waits for it
await demo.wait(400)
await move(TOP_CRUMB, 550)
await demo.wait(900)
await demo.cursor.click()
demo.zoom.out({ duration: 600 })
await move(REST, 600)
demo.zoom.to(SHEET(into[0]), { scale: 1, duration: 1 }) // waits for the top sheet
await demo.wait(900)

// 5. Arrows, and the document behind one, read in view mode, where the
// panel has room for it.
mark("Card: arrows come from .subcanvas files")
demo.say("Arrows come from small dot subcanvas files in the repository. Each one can say why it is there.")
await title("04-arrows", 2400)
mark("View mode, then the arrow's document")
const arrowSheet = arrowDepth === 0 ? stage.top : stage.into[arrowDepth - 1]
await open(arrowSheet, arrowDepth === 0 ? into[0] : into[1])
await move(VIEW_MODE, 800)
await demo.cursor.click()
await demo.wait(350)
await move(EDGE_LABEL(arrow), 700)
await demo.cursor.click()
await demo.wait(400)
demo.zoom.to(`${DOC} h3`, { scale: 1.6, duration: 600 })
await move({ x: 400, y: 650 }, 500) // out of the shot, left of the panel
await demo.wait(3400)
demo.zoom.out({ duration: 450 })
await demo.wait(400)

// 6. Share: the embed for a README.
mark("Card: the embed is the live diagram")
demo.say("Put the embed in your README. It is the live diagram, so it stays current.")
await title("05-embed", 2400)
mark("Share, Copy embed")
await open(stage.top, into[0])
await move('button:has-text("Share")', 800)
await demo.cursor.click()
await demo.wait(300)
// Close up on the popover, with the pointer on Copy embed. It is not
// clicked: the click moves focus off the link, which then shows its start,
// the dev server's local address. Focused, it shows the end of the link.
demo.zoom.to('[data-slot="popover-content"]', { scale: 1.6, duration: 500 })
await move('button:has-text("Copy embed")', 600)
await demo.wait(1700)
demo.zoom.out({ duration: 400 }) // while the cursor is tucked away for the last card

// 7. Close.
mark("Card: subcanvas.app")
demo.say("Subcanvas dot app.")
await title("06-end", 3000)

// --- Where each beat starts ---------------------------------------------------
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
    case "say":
    case "zoom.to":
    case "zoom.out":
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
const preludeMs = starts[preludeActions]
const expectedMs = at + 500 // reelscript's tail

// --- Render, then cut the prelude ----------------------------------------------

const snapshot = process.env.REELSCRIPT_SNAPSHOT_AT
const wanted = process.env.REELSCRIPT_OUT ?? resolve(outDir, "demo.mp4")
mkdirSync(dirname(wanted), { recursive: true })
if (snapshot !== undefined) {
  // A preview at `--at 0` is the first card, not the sign-in form.
  process.env.REELSCRIPT_SNAPSHOT_AT = String(Number(snapshot) + preludeMs)
  await demo.render(wanted)
} else if (process.env.DEMO_KEEP_PRELUDE === "1" || !/\.mp4$/i.test(wanted)) {
  await demo.render(wanted)
} else {
  const raw = wanted.replace(/\.mp4$/i, ".raw.mp4")
  process.env.REELSCRIPT_OUT = raw
  const result = await demo.render(raw)
  const ffmpeg = process.env.REELSCRIPT_FFMPEG ?? "ffmpeg"
  process.stderr.write(`demo: cutting the ${(preludeMs / 1000).toFixed(2)}s sign-in prelude\n`)
  execFileSync(
    ffmpeg,
    [
      "-y", "-loglevel", "error",
      "-ss", (preludeMs / 1000).toFixed(3),
      "-i", raw,
      "-vf", "scale=1920:1080:flags=lanczos",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      wanted,
    ],
    { stdio: "inherit" }
  )
  unlinkSync(raw)
  if (Math.abs(result.durationMs - expectedMs) > 20)
    process.stderr.write(`demo: the render is ${result.durationMs}ms but the script expected ${expectedMs}ms; the beat times below are off\n`)
  process.stderr.write(`demo: ${wanted} is ${((result.durationMs - preludeMs) / 1000).toFixed(2)}s\n`)
  for (const [name, index] of beats)
    process.stderr.write(`demo:   ${((starts[index] - preludeMs) / 1000).toFixed(1).padStart(5)}s  ${name}\n`)
}
