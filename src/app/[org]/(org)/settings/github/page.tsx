import { ExternalLink } from "lucide-react"
import { notFound } from "next/navigation"

import { PageHeader } from "@/components/page-header"
import { GitHubIcon } from "@/components/provider-icons"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { gitHubAppConfig, installationSettingsUrl } from "@/lib/github/app"
import { readConnections } from "@/lib/github/installations"
import { getOrgContext } from "@/lib/orgs"
import { hasRole } from "@/lib/roles"

import { SettingsSection } from "../settings-section"
import { DisconnectGitHub } from "./disconnect"

export const metadata = { title: "GitHub" }

// What api/github/callback came back to say.
function outcomeMessage(outcome: string | undefined, account: string | undefined) {
  switch (outcome) {
    case "connected":
      return `Connected ${account ?? "GitHub"}. Its repositories are now offered in Import from GitHub.`
    case "requested":
      return "GitHub sent your request to install the app to the organization's owners. Once one of them approves it, connect again here."
    case "denied":
      return "GitHub did not confirm that you can see that installation, so it was not connected."
    case "expired":
      return "That took too long, or did not start from this page. Connect again from here."
    case "not-admin":
      return "Only an admin or owner of this workspace can connect GitHub."
    case "failed":
      return "Connecting GitHub did not work. Try again in a moment."
    default:
      return null
  }
}

// Connect GitHub: the GitHub accounts and organizations this workspace may
// import private repositories from (lib/github/installations.ts). Every
// member sees which; admins connect and disconnect them.
export default async function GitHubPage({ params, searchParams }: PageProps<"/[org]/settings/github">) {
  const { org: slug } = await params
  const query = await searchParams
  if (!gitHubAppConfig()) notFound()
  const { supabase, org, role } = await getOrgContext(slug)
  const isAdmin = hasRole(role, "admin")
  const connections = await readConnections(supabase, org.id)
  const message = outcomeMessage(
    typeof query.github === "string" ? query.github : undefined,
    typeof query.account === "string" ? query.account : undefined
  )

  return (
    <main id="main" className="flex w-full max-w-3xl flex-col gap-8">
      <PageHeader
        eyebrow={org.name}
        title="GitHub"
        description="Connect a GitHub account or organization to import its private repositories."
      />

      {message && (
        <p role="status" className="rounded-md border border-rule bg-muted/50 p-3 text-sm">
          {message}
        </p>
      )}

      <SettingsSection
        id="github-connections"
        title="Connected accounts"
        description="Subcanvas reads only the repositories you choose on GitHub, read-only, to draw them. Editors of this workspace can import them, and a private repository always becomes a private project."
      >
        <div className="flex flex-col gap-4">
          {connections.length ? (
            <ul className="divide-y divide-rule">
              {connections.map((connection) => (
                <li
                  key={connection.installationId}
                  className="flex flex-col gap-3 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <GitHubIcon className="size-5 shrink-0" aria-hidden />
                    <div className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{connection.login}</span>
                        <Badge variant="outline">
                          {connection.type === "Organization" ? "Organization" : "Personal account"}
                        </Badge>
                      </span>
                      <span className="text-sm text-graphite">
                        Connected {new Date(connection.connectedAt).toLocaleDateString("en-US", { dateStyle: "long" })}
                      </span>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex shrink-0 items-center gap-2">
                      <a
                        href={installationSettingsUrl(connection, connection.installationId)}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Choose repositories
                        <ExternalLink className="size-3.5" aria-hidden />
                        <span className="sr-only">(opens GitHub in a new tab)</span>
                      </a>
                      <DisconnectGitHub
                        slug={org.slug}
                        orgId={org.id}
                        installationId={connection.installationId}
                        login={connection.login}
                        settingsUrl={installationSettingsUrl(connection, connection.installationId)}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-graphite">No GitHub accounts are connected to this workspace.</p>
          )}

          {isAdmin ? (
            <div>
              {/* A route, not a page: it sends the browser on to GitHub. */}
              <a href={`/api/github/connect?workspace=${encodeURIComponent(org.slug)}`} className={buttonVariants()}>
                <GitHubIcon className="size-4" aria-hidden />
                {connections.length ? "Connect another account" : "Connect GitHub"}
              </a>
            </div>
          ) : (
            <p className="text-sm text-graphite">An admin or owner of this workspace can connect GitHub.</p>
          )}
        </div>
      </SettingsSection>
    </main>
  )
}
