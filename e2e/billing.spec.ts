import { expect } from "@playwright/test"

import { createProject, freshAccount, signUpWithOrg } from "./support/app"
import {
  billingConfigured,
  expectTeamPlan,
  payAtCheckout,
  stripeSubscriptionFor,
  test,
} from "./support/billing"
import { createInviteLink, joinThroughInvite } from "./support/members"

// Billing, paid for at Stripe's real (sandbox) checkout. These need what the
// server needs to sell a plan — STRIPE_SECRET_KEY, STRIPE_PRICE_ID,
// STRIPE_WEBHOOK_SECRET and SUPABASE_SECRET_KEY, all in .env.local locally —
// plus the Stripe CLI on the PATH to relay the webhook (see support/billing.ts).
// Without a key they skip, so a checkout without a sandbox still passes.
//
// For CI to run them, the e2e job needs: sandbox values in repository secrets
// (say STRIPE_SECRET_KEY_SANDBOX, STRIPE_PRICE_ID_SANDBOX,
// STRIPE_WEBHOOK_SECRET_SANDBOX, and the local stack's SUPABASE_SECRET_KEY
// from `supabase status`) exported under their plain names both to the
// `pnpm start` step and to the `pnpm test:e2e` step, and the Stripe CLI
// installed on the runner (stripe/stripe-cli-action, or the apt package).
// STRIPE_WEBHOOK_SECRET must be the secret `stripe listen --print-secret`
// prints for that key: the CLI's secret is fixed per account and key.
test.skip(!billingConfigured, "STRIPE_SECRET_KEY is not set, so this server sells no plan")

// Stripe's hosted page is not ours: it loads slowly, and the webhook that
// flips the org comes back on its own time.
test.setTimeout(180_000)

const billing = (slug: string) => `/${slug}/settings/billing`

test("an owner upgrades at checkout and comes back on the Team plan, limits lifted", async ({
  page,
}) => {
  const { account, slug } = await signUpWithOrg(page)
  // Something to count: one private document.
  await createProject(page, "Proj")

  await page.goto(billing(slug))
  await expect(page.getByText("Free plan", { exact: true })).toBeVisible()
  // The price is per editor, and a fresh org has one: its owner.
  await page.getByRole("button", { name: "Upgrade for $5 a month", exact: true }).click()

  await payAtCheckout(page)
  await expect(page).toHaveURL(`${billing(slug)}?checkout=success`)
  await expectTeamPlan(page)

  // A paid org has a period end and a way to manage it, and no ceiling on
  // what the free plan counts: locally the page read "0 of 100" and
  // "1 of 3" before, and CI's fresh stack sets no limits at all, so what is
  // asserted is what holds either way.
  await expect(page.getByText("Unlimited private documents and editors.")).toBeVisible()
  await expect(page.getByText(/\b\d+ of \d+\b/)).toHaveCount(0)
  await expect(page.getByText("Renews", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Manage billing" })).toBeVisible()
  await expect(page.getByRole("button", { name: /^Upgrade/ })).toHaveCount(0)

  // Stripe agrees, and was sold one seat: the owner.
  await expect
    .poll(() => stripeSubscriptionFor(account.email), { timeout: 30_000 })
    .toEqual({ status: "active", seats: 1 })
})

test("an editor sees the plan but is told only an owner can change it", async ({
  page,
  browser,
  baseURL,
}) => {
  const { slug } = await signUpWithOrg(page)
  const guest = freshAccount()
  const link = await createInviteLink(page, slug, guest.email, "Editor")
  const member = await joinThroughInvite(browser, baseURL!, link, guest, slug)
  try {
    await member.page.goto(billing(slug))
    await expect(member.page.getByText("Free plan", { exact: true })).toBeVisible()
    await expect(member.page.getByText("Only an owner can change the plan.")).toBeVisible()
    await expect(member.page.getByRole("button", { name: /^Upgrade/ })).toHaveCount(0)
    await expect(member.page.getByRole("button", { name: "Manage billing" })).toHaveCount(0)
  } finally {
    await member.context.close()
  }

  // The owner, on the same page, is offered the upgrade.
  await page.goto(billing(slug))
  await expect(page.getByRole("button", { name: /^Upgrade for \$\d+ a month$/ })).toBeVisible()
})

test("the seats follow the editors: one more joins, Stripe bills for two", async ({
  page,
  browser,
  baseURL,
}) => {
  const { account, slug } = await signUpWithOrg(page)

  await page.goto(billing(slug))
  await page.getByRole("button", { name: "Upgrade for $5 a month", exact: true }).click()
  await payAtCheckout(page)
  await expectTeamPlan(page)
  await expect
    .poll(() => stripeSubscriptionFor(account.email), { timeout: 30_000 })
    .toEqual({ status: "active", seats: 1 })

  // An editor is a seat; accepting the invite is what tells Stripe.
  const guest = freshAccount()
  const link = await createInviteLink(page, slug, guest.email, "Editor")
  const member = await joinThroughInvite(browser, baseURL!, link, guest, slug)
  await member.context.close()

  await page.goto(billing(slug))
  await expect(page.getByText("2 (owners, admins, and editors; viewers are free)")).toBeVisible()
  await expect
    .poll(() => stripeSubscriptionFor(account.email), { timeout: 30_000 })
    .toEqual({ status: "active", seats: 2 })
})
