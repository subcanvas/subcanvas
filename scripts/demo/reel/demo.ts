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
 *   DEMO_BASE_URL     The app. Default http://localhost:3420, a dev server
 *                     started with SUBCANVAS_IMPORT_FIXTURES so that the
 *                     repository below is a folder on disk.
 *   DEMO_REPOSITORY   What gets typed into "Import from GitHub".
 *                     Default fixture/orchard; subcanvas/subcanvas on launch day.
 *   DEMO_EMAIL        The demo account. Created through the sign-up form the
 *   DEMO_PASSWORD     first time, where sign-up needs no email confirmation.
 *   DEMO_ORG_NAME     The org's name, shown at the top of the sidebar. Default Orchard.
 *   DEMO_STAGE_ORG    Slug of the org that keeps a finished import of the
 *                     repository for the beats after the first one (see
 *                     "Two orgs" below). Default demo-<repo>.
 *   DEMO_INTO         Titles of the boxes to walk into, outermost first.
 *                     Default Services,Payments.
 *   DEMO_ARROW        Label of the arrow to click. Default gRPC.
 *   DEMO_ARROW_DEPTH  Which sheet the arrow is on: 0 the top one, 1 inside the
 *                     first box of DEMO_INTO. Default 1.
 *   DEMO_IMPORT_WAIT  Milliseconds of video to hold on the dialog while the
 *                     import runs. Default 500; raise it for a real repository.
 *   DEMO_ORG          Reuse this org for the on-camera import instead of
 *                     creating a fresh one. Handy while iterating on previews.
 *   DEMO_KEEP_PRELUDE Set to 1 to keep the sign-in prelude in the video.
 *
 * Beats (times are approximate; the render prints the exact ones):
 *
 *   1. Card: "Your repository is already a diagram."
 *   2. Import: "Import from GitHub", the repository is typed, Import, and the
 *      top whiteboard appears: one box per folder.
 *   3. Card, then inside: click a box, the panel says "A whiteboard. Click to
 *      go inside.", and the sheet inside slides in.
 *   4. Card, then arrows: click the arrow's label and read the document
 *      behind it.
 *   5. Card, then deeper: into the next box, the trail grows, and one click
 *      on the trail brings the top sheet back.
 *   6. Card, then Share: Copy embed, "Copied".
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
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { execFileSync } from "node:child_process"

import { chromium, type Page } from "@playwright/test"
import { createDemo } from "@reelscript/cli"

// --- Settings -----------------------------------------------------------------

const base = (process.env.DEMO_BASE_URL ?? "http://localhost:3420").replace(/\/$/, "")
const repository = process.env.DEMO_REPOSITORY ?? "fixture/orchard"
const email = process.env.DEMO_EMAIL ?? "demo@subcanvas.test"
const password = process.env.DEMO_PASSWORD ?? "demo-reel-password"
const orgName = process.env.DEMO_ORG_NAME ?? "Orchard"
const repoName = repository.split("/").pop()!.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
const stageSlug = process.env.DEMO_STAGE_ORG ?? `demo-${repoName}`
const into = (process.env.DEMO_INTO ?? "Services,Payments").split(",").map((s) => s.trim())
const arrow = process.env.DEMO_ARROW ?? "gRPC"
const arrowDepth = Number(process.env.DEMO_ARROW_DEPTH ?? 1)
const importWait = Number(process.env.DEMO_IMPORT_WAIT ?? 500)

const here = dirname(new URL(import.meta.url).pathname)
const outDir = resolve(here, "..", "out")
const card = (name: string) => new URL(`./cards/${name}.html`, import.meta.url).href

// --- Selectors ----------------------------------------------------------------
// Roles and labels, the way the e2e helpers name things, never a generated
// class. reelscript hands these to Playwright, so its `:has-text()`,
// `:text-is()` and `>> visible=true` all work.

const NODE = (title: string) => `.react-flow__node[aria-label^="Node: ${title},"]`
const PANEL = 'aside[aria-label="Object settings"]'
const DOC = `${PANEL} section[aria-label="Document"]`
const GO_INSIDE = `${DOC} button:has-text("Click to go inside")`
// The trail is in the page twice, once for narrow screens; reelscript takes
// the first match, so the visible one is asked for.
const CRUMB = 'nav[aria-label="breadcrumb"] >> visible=true'
const TOP_CRUMB = 'nav[aria-label="breadcrumb"] ol > li:nth-child(3) a >> visible=true'
// The trail's last step, once it names `title`: a target that is only there
// after the navigation, so a move to it waits off camera for the new sheet.
const CURRENT_CRUMB = (title: string) =>
  `nav[aria-label="breadcrumb"] [aria-current="page"]:text-is("${title}") >> visible=true`
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

const demo = createDemo({
  theme: "macos",
  viewport: [1280, 800],
  fps: 60,
  voice: "af_heart",
  pronunciations: { Subcanvas: "Sub canvas", subcanvas: "sub canvas", README: "read me" },
})

// Every action here has a fixed length (cursor moves are given one), so the
// script can tell where each beat starts and where the prelude ends. The
// estimate is checked against the render at the end.
const beats: [string, number][] = []
const mark = (name: string) => beats.push([name, demo.getTimeline().length])
const move = (target: string | { x: number; y: number }, duration = 700) =>
  demo.cursor.moveTo(target, { duration, ease: "smooth" })
// A card holds for `ms` of video. The cursor is tucked into the corner first.
async function title(name: string, ms: number) {
  await move({ x: 1230, y: 770 }, 400)
  await demo.browser.goto(card(name), { settle: ms })
}

// The prelude, cut from the video: reelscript's browser signs in.
await demo.browser.goto(`${base}/login`, { settle: 600 })
await demo.type("#email", email, { wpm: 1200 })
await demo.type("#password", password, { wpm: 1200 })
await demo.press("Enter")
await move(SIGNED_IN, 300) // resolving a target waits, off camera, until it exists
const preludeActions = demo.getTimeline().length

// 1. Open.
mark("Card: your repository is already a diagram")
demo.say("Subcanvas turns a repository into a diagram you can walk into.")
await title("01-open", 2400)

// 2. Import from GitHub, on camera.
mark("Import from GitHub")
await demo.browser.goto(`${base}/${slug}`, { settle: 500 })
demo.say("Paste a public repository. One box per folder, its README inside.")
await move('button:has-text("Import from GitHub")', 800)
await demo.cursor.click()
await demo.wait(250)
demo.zoom.to('[role="dialog"]', { scale: 1.25 })
await move("#import-repository", 500)
await demo.cursor.click()
await demo.type("#import-repository", repository, { wpm: 420 })
await demo.wait(350)
await move('[role="dialog"] button:text-is("Import")', 500)
await demo.cursor.click()
demo.zoom.out({ duration: 500 })
await demo.wait(importWait)
await move(".react-flow__pane", 300) // waits, off camera, for the whiteboard
await move({ x: 700, y: 640 }, 500) // then off the boxes, so nothing is hovered
demo.zoom.to({ x: 800, y: 370 }, { scale: 1.3 })
await demo.wait(2300)
demo.zoom.out({ duration: 400 })
await demo.wait(450)
mark("Card: one box per folder")
await title("02-folders", 1900)

// 3. Inside a box: a whiteboard.
mark("Card: whiteboards inside boxes")
demo.say("Folders inside folders are whiteboards inside boxes. Click one to go inside.")
await title("03-inside", 1900)
mark("Click a box to go inside")
await demo.browser.goto(stage.top, { settle: 700 })
await move(NODE(into[0]), 800)
await demo.cursor.click()
await demo.wait(300)
demo.zoom.to(GO_INSIDE, { scale: 1.35 })
await move(GO_INSIDE, 600)
await demo.wait(700)
await demo.cursor.click()
demo.zoom.out({ duration: 500 })
// A sheet takes a moment to arrive. Some of that moment is on camera (the
// wait), and a move to a box that is only on the new sheet holds the rest
// off camera; reelscript gives a target about three seconds to appear.
await demo.wait(800)
await move(NODE(into[1] ?? into[0]), 700)
await demo.wait(900)

// 4. Arrows, and the document behind one.
mark("Card: arrows come from .subcanvas files")
demo.say("Arrows come from dot subcanvas files. Click one to read why it is there.")
await title("04-arrows", 2000)
mark("Click the arrow, read the document behind it")
await demo.browser.goto(arrowDepth === 0 ? stage.top : stage.into[arrowDepth - 1], { settle: 700 })
await move(EDGE_LABEL(arrow), 800)
await demo.cursor.click()
await demo.wait(400)
demo.zoom.to(`${DOC} h3`, { scale: 1.5 })
await demo.wait(2700)
demo.zoom.out({ duration: 400 })
await demo.wait(450)

// 5. Deeper, then back out through the trail.
mark("Card: back out through the trail")
demo.say("Go as deep as the code goes. The trail leads back out.")
await title("05-trail", 2000)
mark("Into the next box, then the trail")
await demo.browser.goto(stage.into[0], { settle: 700 })
await move(NODE(into[1] ?? into[0]), 800)
await demo.cursor.click()
await demo.wait(300)
await demo.press("Enter")
await demo.wait(800)
await move(CURRENT_CRUMB(into[1] ?? into[0]), 600) // waits for the deeper sheet
demo.zoom.to(CRUMB, { scale: 1.5 })
await move(TOP_CRUMB, 500)
await demo.wait(1200)
await demo.cursor.click()
demo.zoom.out({ duration: 600 })
await demo.wait(800)
await move(NODE(into[0]), 700) // waits for the top sheet
await demo.wait(700)

// 6. Share: the embed for a README.
mark("Card: the picture stays current")
demo.say("Copy the embed into your README. The picture stays current.")
await title("06-embed", 2000)
mark("Share, Copy embed")
await demo.browser.goto(stage.top, { settle: 700 })
await move('button:has-text("Share")', 800)
await demo.cursor.click()
await demo.wait(350)
demo.zoom.to('[data-slot="popover-content"]', { scale: 1.4 })
await move('button:has-text("Copy embed")', 500)
await demo.wait(300)
await demo.cursor.click()
await demo.wait(1600)
demo.zoom.out({ duration: 400 })
// Long enough to read "Copied" with the whole window back in view; the
// gallery still is cut from here.
await demo.wait(1200)

// 7. Close.
mark("Card: subcanvas.app")
demo.say("Subcanvas dot app.")
await title("07-end", 2600)

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
