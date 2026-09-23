import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

import { test as base, expect, type Page } from "@playwright/test"
import Stripe from "stripe"

// Paying for real, against Stripe's sandbox. The server needs the STRIPE_*
// variables to offer a plan at all, and the org only flips to paid when
// Stripe's webhook reaches it: on a laptop nothing on the internet can, so
// the Stripe CLI relays the events (`stripe listen`). A worker that runs a
// billing spec starts one relay and stops it when it is done.
//
// The tests read STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET from the
// environment, or from .env.local when the environment has neither, which
// is where `next start` reads them from too, so the relay signs with the
// secret the server checks against. Without a key the specs skip.

const ROOT = path.resolve(__dirname, "../..")

// The variables `next start` loads, for a run started from a plain shell.
function dotEnvLocal(): Record<string, string> {
  let text: string
  try {
    text = readFileSync(path.join(ROOT, ".env.local"), "utf8")
  } catch {
    return {}
  }
  const values: Record<string, string> = {}
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2")
  }
  return values
}

const fromFile = dotEnvLocal()
const setting = (name: string) => process.env[name] || fromFile[name] || ""

export const stripeSecretKey = setting("STRIPE_SECRET_KEY")
export const billingConfigured = Boolean(stripeSecretKey)

// Starts `stripe listen` relaying the sandbox's events to this server's
// webhook, and resolves once the CLI says it is ready. The CLI prints the
// secret it signs with; that must be the one the server checks, or every
// event is refused as forged, so it is compared and the mismatch named.
async function relayStripeEvents(baseURL: string): Promise<() => Promise<void>> {
  const child = spawn(
    "stripe",
    [
      "listen",
      "--forward-to",
      new URL("/api/stripe/webhook", baseURL).toString(),
      "--api-key",
      stripeSecretKey,
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  )

  let output = ""
  const ready = new Promise<string>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      output += chunk.toString()
      const match = output.match(/Ready![\s\S]*?(whsec_[A-Za-z0-9]+)/)
      if (match) resolve(match[1])
    }
    child.stdout.on("data", onData)
    child.stderr.on("data", onData)
    child.on("error", (error) => reject(new Error(`Could not start the Stripe CLI: ${error.message}`)))
    child.on("exit", (code) => reject(new Error(`stripe listen exited with ${code}:\n${output}`)))
  })

  const secret = await ready
  const expected = setting("STRIPE_WEBHOOK_SECRET")
  if (secret !== expected) {
    child.kill()
    throw new Error(
      "The Stripe CLI signs with a different secret than STRIPE_WEBHOOK_SECRET: the server would refuse every event. Set STRIPE_WEBHOOK_SECRET to what `stripe listen --print-secret` prints."
    )
  }

  return async () => {
    if (child.exitCode !== null) return
    const gone = new Promise<void>((resolve) => child.once("exit", () => resolve()))
    child.kill()
    await gone
  }
}

// `test` for the billing specs: the relay runs for the life of the worker.
export const test = base.extend<object, { stripeRelay: void }>({
  stripeRelay: [
    // `provide`, not Playwright's usual `use`: that name reads as a React
    // hook to the linter.
    async ({}, provide, workerInfo) => {
      if (!billingConfigured) return provide()
      const stop = await relayStripeEvents(workerInfo.project.use.baseURL!)
      try {
        await provide()
      } finally {
        await stop()
      }
    },
    { scope: "worker", auto: true },
  ],
})

// Pays on Stripe's hosted checkout page with the test card and waits for
// the return to the app. The page is Stripe's, not ours, so the handles are
// the ids its form uses; only what checkout shows for a card in the US is
// filled, and the fields it hides for this account are left alone.
export async function payAtCheckout(page: Page) {
  await page.waitForURL(/checkout\.stripe\.com/)

  // Stripe offers other ways to pay first (Link, wallets). The card option
  // is the accordion's title radio, which sits under its own label.
  await page.locator("#payment-method-accordion-item-title-card").check({ force: true })
  const stripePass = page.locator("#enableStripePass")
  if (await stripePass.isVisible()) await stripePass.uncheck()

  await page.locator("#cardNumber").fill("4242424242424242")
  await page.locator("#cardExpiry").fill("12/34")
  await page.locator("#cardCvc").fill("123")
  await page.locator("#billingName").fill("E2E Test")
  await page.locator("#billingCountry").selectOption("US")
  const postal = page.locator("#billingPostalCode")
  if (await postal.isVisible()) await postal.fill("94107")

  await page.getByRole("button", { name: /Subscribe/ }).click()
  await page.waitForURL(/\/settings\/billing\?checkout=success$/, { timeout: 60_000 })
}

// Reloads the billing page until the webhook has flipped the org, which
// happens a few seconds after checkout and outside the browser's view.
export async function expectTeamPlan(page: Page) {
  await expect(async () => {
    await page.reload()
    await expect(page.getByText("Team plan", { exact: true })).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 45_000 })
}

// What Stripe holds for the org whose owner has this address: the customer
// is created with the owner's email when checkout starts, and each spec's
// owner is a fresh address, so this finds exactly one.
export async function stripeSubscriptionFor(email: string) {
  const stripe = new Stripe(stripeSecretKey)
  const { data: customers } = await stripe.customers.list({ email, limit: 1 })
  if (!customers.length) return null
  const { data: subscriptions } = await stripe.subscriptions.list({
    customer: customers[0].id,
    status: "all",
    limit: 1,
  })
  const subscription = subscriptions[0]
  if (!subscription) return null
  return { status: subscription.status, seats: subscription.items.data[0]?.quantity ?? 0 }
}
