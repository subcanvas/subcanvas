import { defineConfig, devices } from "@playwright/test"

import { devBaseURL, DEV_PORT, GITHUB_FIXTURES } from "./e2e/support/import"

// End-to-end tests: a real browser, a real production build, and the real
// local stack (`supabase start`). They are deliberately apart from the unit
// tests (`pnpm test`), which must stay fast and need neither.
//
// Every spec makes its own account, org and project, so the specs share no
// state, can run in any order, and are safe against a database somebody
// else is also using. Nothing is ever deleted.

// Not 3000: a dev server is usually already there.
const PORT = Number(process.env.E2E_PORT ?? 3310)
// localhost, not 127.0.0.1: `next start` builds absolute redirects — the one
// /auth/callback sends after a sign-in link, for instance — from its own
// origin, which is always `http://localhost:<port>` whatever Host it was
// asked with. Visiting under the other name loses the session cookie on that
// redirect. Behind a proxy that sets x-forwarded-host, as in production,
// Next uses that instead.
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

// True when the whole suite runs, or the arguments name github-import.
function githubSpecSelected() {
  const filters = process.argv.slice(2).filter((arg) => !arg.startsWith("-"))
  return filters.length === 0 || filters.some((arg) => arg.includes("github-import"))
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // A spec signs up, creates an org and a project, and waits for Yjs to
  // reach Postgres and come back. A minute and a half is room for all of it
  // on a loaded CI runner, without letting a hung test sit until the job
  // times out.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  // One retry in CI, none locally: locally a flake should be seen, not
  // papered over.
  retries: process.env.CI ? 1 : 0,
  // Two everywhere, not more: the local Auth server opens a fresh database
  // connection for every identity check, and three workers' worth of page
  // loads ran it out of source ports ("cannot assign requested address",
  // answered as 500), which the app can only read as "signed out". Two
  // workers stay under it, and the whole suite still runs in about three
  // minutes.
  workers: 2,
  // The list as it goes, and the HTML report to open afterwards. CI keeps
  // the report as an artifact when something failed.
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // The whiteboard's toolbar, its side panel and the project tree are
        // all hidden on a narrow screen. Give the canvas a desk to sit on.
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  // The second server is only for github-import.spec.ts. When the command
  // line names specs and that is not one of them, it is left out: a
  // development server refuses to start beside `pnpm dev` in the same
  // checkout, and a run of one spec should not need it anyway.
  webServer: [
    {
      // The same build and the same runtime flag as production, which is what
      // the smoke job in CI serves too. CI starts its own server first and
      // this reuses it; locally it builds and serves on demand.
      command: `pnpm build && NODE_OPTIONS=--no-experimental-require-module pnpm start --port ${PORT}`,
      url: baseURL,
      reuseExistingServer: true,
      timeout: 300_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    ...(githubSpecSelected() ? [{
      // A development server, for github-import.spec.ts alone: the fixture
      // repositories it imports are reachable only there (see
      // e2e/support/import.ts). The URL is the sign-in page, so the first
      // page every spec opens is compiled before any test starts.
      command: `SUBCANVAS_IMPORT_FIXTURES=${GITHUB_FIXTURES} pnpm dev --port ${DEV_PORT}`,
      url: `${devBaseURL}/login`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "pipe" as const,
      stderr: "pipe" as const,
    }] : []),
  ],
})
