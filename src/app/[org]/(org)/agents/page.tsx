import { headers } from "next/headers"

import { PageHeader } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"
import { claudeCodeCommand, codexCommand, cursorInstallLink, vscodeInstallLink } from "@/lib/mcp/install-links"
import { MCP_PATH } from "@/lib/mcp/origin"
import { originFromHeaders } from "@/lib/origin"
import type { ToolGroup } from "@/lib/mcp/tool"
import { tools } from "@/lib/mcp/tools"
import { getOrgContext } from "@/lib/orgs"

import { CopyField } from "./copy-field"

export const metadata = { title: "Connect an agent" }

const GROUPS: ToolGroup[] = ["Orgs and projects", "Documents", "Text documents", "Whiteboards", "GitHub and embeds"]

// `wide` is for a client whose instructions hold a command too long for half
// the page.
function Client({ name, wide, children }: { name: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={`flex flex-col gap-3 rounded-xl border border-rule bg-sheet p-5 ${wide ? "sm:col-span-2" : ""}`}>
      <h3 className="font-medium">{name}</h3>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-graphite">{children}</div>
    </section>
  )
}

export default async function AgentsPage({ params }: PageProps<"/[org]/agents">) {
  const { org: slug } = await params
  const { org, role } = await getOrgContext(slug)
  const url = `${originFromHeaders(await headers())}${MCP_PATH}`

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <PageHeader
        eyebrow={org.name}
        title="Connect an agent"
        description="Claude, ChatGPT, Cursor, or anything else that speaks the Model Context Protocol can read and edit Subcanvas as you. Add this address, sign in, approve. There is no key to copy."
      />

      <div className="flex flex-col gap-2">
        <h2 className="font-mono text-xs tracking-wide text-graphite uppercase">Server address</h2>
        <CopyField label="the server address" value={url} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Client name="Claude Code" wide>
          <p>Run this, then type <code className="font-mono">/mcp</code> in Claude Code and sign in.</p>
          <CopyField label="the Claude Code command" value={claudeCodeCommand(url)} />
        </Client>
        <Client name="Codex" wide>
          <p>
            Run this: the first part adds the server, the second signs in. The Codex CLI, its IDE
            extension and the ChatGPT desktop app share the result.
          </p>
          <CopyField label="the Codex command" value={codexCommand(url)} />
        </Client>
        <Client name="Cursor">
          <p>Opens Cursor with the server filled in. Choose Install, then sign in when Cursor asks.</p>
          <a href={cursorInstallLink(url)} className={buttonVariants({ className: "self-start" })}>
            Add to Cursor
          </a>
        </Client>
        <Client name="VS Code">
          <p>Opens VS Code with the server filled in. Choose Install, then allow the sign-in.</p>
          <a href={vscodeInstallLink(url)} className={buttonVariants({ className: "self-start" })}>
            Add to VS Code
          </a>
        </Client>
        <Client name="Claude (claude.ai and desktop)">
          <p>
            Open Customize, then Connectors. Click +, choose “Add custom connector”, paste the server
            address, and click Add. On a Team or Enterprise plan an owner adds it first, under
            Organization settings, Connectors.
          </p>
        </Client>
        <Client name="ChatGPT">
          <p>
            Turn on Developer mode in Settings, under Security and login. Then add a new app with +,
            give it a name, choose “Public endpoint”, and paste the server address.
          </p>
        </Client>
        <Client name="Anything else">
          <p>
            Add a remote (streamable HTTP) server with the address above. The client finds the
            sign-in by itself. No API key or header is needed.
          </p>
        </Client>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">What an agent can do here</h2>
          <p className="max-w-xl text-sm leading-relaxed text-graphite">
            Exactly what you can, and no more: it acts with your role in each org
            {role === "viewer" ? ", so in this one it can read but not change anything" : ""}. Its
            edits merge with what people are typing and show up live. Members and billing stay with
            you.
          </p>
        </div>
        {GROUPS.map((group) => (
          <section key={group} className="flex flex-col gap-2">
            <h3 className="font-mono text-xs tracking-wide text-graphite uppercase">{group}</h3>
            <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {tools
                .filter((tool) => tool.group === group)
                .map((tool) => (
                  <li key={tool.name} className="flex items-baseline justify-between gap-3">
                    <span>{tool.title}</span>
                    <code className="shrink-0 font-mono text-xs text-graphite">{tool.name}</code>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}
