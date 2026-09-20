import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

import { tools } from "./tools"

// Parity is tested, not promised (docs/ROADMAP.md, section 2): whatever a
// person can do through a server action, an agent can do through a tool.
// This test finds every exported server action in the app. Each one must be
// covered by a tool (the tool's `covers`) or be listed below with the reason
// it is not. Add a server action and this fails until one of the two is done.

const NOT_EXPOSED: Record<string, string> = {
  // Members and invites. An agent acts as its user, and an agent that can
  // add people to an org, raise their role, or remove them turns one
  // prompt-injected document into an account takeover. It also changes the
  // seats an org is billed for. Planned, behind a consent-screen choice.
  "[org]/(org)/settings/members/actions.changeRole": "changes who has access, and billed seats",
  "[org]/(org)/settings/members/actions.removeMember": "changes who has access, and billed seats",
  "[org]/(org)/settings/members/actions.createInvite": "changes who has access; sends email in the org's name",
  "[org]/(org)/settings/members/actions.revokeInvite": "kept with the rest of invites",
  "invite/[token]/actions.acceptInvite": "joining an org is a person's decision, made from the emailed link",
  // Billing. Paying needs a person and a card. Both actions only return a
  // Stripe link for the owner to open; a tool that reads the plan and
  // returns that link is planned with the members tools.
  "[org]/(org)/settings/billing/actions.startCheckout": "returns a Stripe checkout link; paying needs a person",
  "[org]/(org)/settings/billing/actions.openPortal": "returns a Stripe portal link; paying needs a person",
  // The org itself. Deleting an org cannot be undone and takes every
  // project with it, leaving one changes who has access, and both are the
  // kind of step one prompt-injected document should not be able to take.
  // Renaming is harmless but belongs with them. Planned with the members
  // tools, behind the same consent-screen choice.
  "[org]/(org)/settings/general/actions.deleteOrg": "irreversible, and takes every project with it",
  "[org]/(org)/settings/general/actions.leaveOrg": "changes who has access; a person's decision",
  "[org]/(org)/settings/general/actions.renameOrg": "kept with the rest of org administration",
  // Your own name and picture are how other people recognise you. An agent
  // acts as you; it does not get to change who you appear to be.
  "[org]/(org)/settings/profile/actions.updateDisplayName": "a person's identity is theirs to change",
  "[org]/(org)/settings/profile/actions.updatePicture": "a person's identity is theirs to change",
  "[org]/(org)/settings/profile/actions.adoptProviderPicture": "a person's identity is theirs to change",
  // An agent gets in through an org's member, so it cannot exist before the
  // first org does. Creating further orgs waits for the members tools,
  // since a new org is only useful once people can be invited to it.
  "onboarding/actions.createOrg": "the first org is created by a person during sign-up",
  // The consent screen is where a person lets an agent in. An agent must
  // never be able to answer it.
  "oauth/consent/actions.decideAuthorization": "approving an agent is the one thing an agent must not do",
}

const APP = join(__dirname, "../../app")

function serverActions() {
  const found: string[] = []
  const walk = (folder: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry.name)) {
        const source = readFileSync(path, "utf8")
        if (!/^["']use server["']/.test(source)) continue
        const file = relative(APP, path).replace(/\.tsx?$/, "")
        for (const match of source.matchAll(/^export (?:async )?function (\w+)/gm))
          found.push(`${file}.${match[1]}`)
      }
    }
  }
  walk(APP)
  return found.sort()
}

describe("MCP parity with the web app", () => {
  const actions = serverActions()
  const covered = new Set(tools.flatMap((tool) => tool.covers))

  it("finds the app's server actions", () => {
    expect(actions).toContain("[org]/[project]/tree-actions.createDocument")
    expect(actions.length).toBeGreaterThan(10)
  })

  it("has a tool, or a stated reason, for every server action", () => {
    const unaccounted = actions.filter((action) => !covered.has(action) && !(action in NOT_EXPOSED))
    expect(unaccounted).toEqual([])
  })

  it("does not account for the same action twice", () => {
    expect(Object.keys(NOT_EXPOSED).filter((action) => covered.has(action))).toEqual([])
  })

  it("names only actions that exist", () => {
    const known = new Set(actions)
    expect([...covered, ...Object.keys(NOT_EXPOSED)].filter((action) => !known.has(action))).toEqual([])
  })

  it("gives every tool a unique name and a description worth reading", () => {
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length)
    for (const tool of tools) expect(tool.description.length, tool.name).toBeGreaterThan(60)
  })
})
