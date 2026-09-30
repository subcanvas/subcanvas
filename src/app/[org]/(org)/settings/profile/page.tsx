import { Check, KeyRound, Mail, Minus } from "lucide-react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { GitHubIcon, GoogleIcon } from "@/components/provider-icons"
import { buttonVariants } from "@/components/ui/button"
import { legalDetails } from "@/lib/legal"
import { getOrgContext } from "@/lib/orgs"

import { SettingsSection } from "../settings-section"
import { ConnectedAgents } from "./connected-agents"
import { DeleteAccount } from "./delete-account"
import { PICTURE_PROVIDERS, PROVIDER_LABELS, providerPicture } from "./identities"
import { DisplayNameForm, PictureForm } from "./profile-forms"

export const metadata = { title: "Profile" }

const PROVIDER_ICONS = { google: GoogleIcon, github: GitHubIcon }

function Method({
  icon: Icon,
  label,
  detail,
  on,
  action,
}: {
  icon: (props: { className?: string }) => React.ReactNode
  label: string
  detail: string
  on: boolean
  action?: React.ReactNode
}) {
  const State = on ? Check : Minus
  return (
    <li className="flex items-center gap-3 py-3">
      <Icon className="size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{label}</span>
        <span className="flex items-start gap-1 text-sm text-graphite">
          <State className="mt-[3px] size-3.5 shrink-0" aria-hidden />
          {detail}
        </span>
      </div>
      {action}
    </li>
  )
}

export default async function ProfilePage({ params }: PageProps<"/[org]/settings/profile">) {
  const { org: slug } = await params
  const { supabase, user } = await getOrgContext(slug)
  const [{ data: profile }, { data: hasPassword }, grants, { data: plan }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).single(),
    supabase.rpc("has_password"),
    supabase.auth.oauth.listGrants(),
    // What deleting the account would do to each workspace, from the same
    // rule the deletion itself follows.
    supabase.rpc("account_deletion_plan"),
  ])
  // Absent where agents cannot sign in: a server without Supabase's OAuth
  // server switched on answers with an error, and there is nothing to list.
  const approved = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" })
  const agents = grants.error
    ? null
    : (grants.data ?? []).map((grant) => ({
        clientId: grant.client.id,
        name: grant.client.name || "An unnamed agent",
        approved: approved.format(new Date(grant.granted_at)),
      }))

  const email = user.email ?? ""
  const identities = user.identities ?? []
  // A provider is listed when this server offers it or the account already has it.
  const offered = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "").split(",").map((p) => p.trim())
  const providers = PICTURE_PROVIDERS.map((provider) => ({
    provider,
    connected: identities.some((identity) => identity.provider === provider),
    picture: providerPicture(identities, provider),
  })).filter(({ provider, connected }) => connected || offered.includes(provider))

  const legal = legalDetails()
  // Deleting needs the server's secret key (the action says why). A server
  // without one leaves it to whoever runs it.
  const selfService = Boolean(process.env.SUPABASE_SECRET_KEY)
  const workspaces = plan ?? []
  const deleted = workspaces.filter((workspace) => workspace.outcome === "delete")
  const left = workspaces.filter((workspace) => workspace.outcome === "leave")
  const blockers = workspaces.filter((workspace) => workspace.outcome === "only_owner" || workspace.outcome === "subscribed")
  const teams = deleted.filter((workspace) => !workspace.personal).length
  const summary = [
    `This deletes your account and your personal workspace${
      teams === 0 ? "" : teams === 1 ? ", and 1 team workspace nobody else is in" : `, and ${teams} team workspaces nobody else is in`
    }, with every project, whiteboard, document, picture and video in them.`,
    left.length === 1
      ? "You leave 1 team workspace; what you made there stays with it."
      : left.length > 1
        ? `You leave ${left.length} team workspaces; what you made there stays with them.`
        : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <main id="main" className="flex w-full max-w-3xl flex-col gap-8">
      <PageHeader
        eyebrow="Your account"
        title="Profile"
        description="Who you are to the people you work with. It is the same in every workspace you belong to."
      />

      <SettingsSection
        id="profile-name"
        title="Name"
        description="Shown next to your cursor, on your avatar, and in member lists."
      >
        <DisplayNameForm initial={profile?.display_name ?? ""} email={email} />
      </SettingsSection>

      <SettingsSection id="profile-picture" title="Picture">
        <PictureForm
          initial={profile?.avatar_url ?? null}
          fallback={(profile?.display_name ?? email).charAt(0).toUpperCase()}
          providers={providers.flatMap(({ provider, picture }) => (picture ? [{ provider, picture }] : []))}
        />
      </SettingsSection>

      <SettingsSection
        id="profile-sign-in"
        title="Signing in"
        description={
          <>
            Your account is <span className="font-medium text-ink">{email}</span>. The email cannot be changed here.
          </>
        }
      >
        <ul className="-my-3 divide-y divide-rule">
          <Method icon={Mail} label="Email link" detail="A sign-in link sent to your email always works." on />
          <Method
            icon={KeyRound}
            label="Password"
            detail={hasPassword ? "Set" : "Not set"}
            on={Boolean(hasPassword)}
            action={
              <Link
                href={`/auth/password?next=${encodeURIComponent(`/${slug}/settings/profile`)}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {hasPassword ? "Change password" : "Set a password"}
              </Link>
            }
          />
          {providers.map(({ provider, connected }) => (
            <Method
              key={provider}
              icon={PROVIDER_ICONS[provider]}
              label={PROVIDER_LABELS[provider]}
              detail={connected ? "Connected" : "Not connected"}
              on={connected}
            />
          ))}
        </ul>
      </SettingsSection>

      {agents && (
        <SettingsSection
          id="profile-agents"
          title="Connected agents"
          description="Agents you let in on the consent page. Each one acts as you, with your role in every workspace. Revoke one and it is refused from its next request; to come back, it has to be approved again."
        >
          <ConnectedAgents agents={agents} connectHref={`/${slug}/agents`} />
        </SettingsSection>
      )}

      <SettingsSection
        id="profile-delete"
        title="Delete your account"
        danger
        description="Deletes your account, your personal workspace, and every team workspace nobody else is in, with everything in them. Team workspaces other people are in stay theirs, with what you made there. It cannot be undone."
      >
        {!selfService ? (
          <p className="max-w-xl text-sm leading-relaxed">
            {legal ? (
              <>
                Email{" "}
                <a
                  className="font-medium underline underline-offset-4"
                  href={`mailto:${legal.contact}?subject=${encodeURIComponent("Delete my Subcanvas account")}`}
                >
                  {legal.contact}
                </a>{" "}
                from {email} and ask.
              </>
            ) : (
              "Ask whoever runs this server to delete it for you."
            )}
          </p>
        ) : blockers.length ? (
          <div className="flex flex-col gap-3 text-sm leading-relaxed">
            <ul className="flex max-w-xl flex-col gap-2">
              {blockers.map((workspace) => (
                <li key={workspace.org_id}>
                  {workspace.outcome === "only_owner" ? (
                    <>
                      You are the only owner of{" "}
                      <Link href={`/${workspace.org_slug}/settings/members`} className="font-medium underline underline-offset-4">
                        {workspace.org_name}
                      </Link>
                      , which has other members. Make one of them an owner, or delete the workspace.
                    </>
                  ) : (
                    <>
                      <Link href={`/${workspace.org_slug}/settings/billing`} className="font-medium underline underline-offset-4">
                        {workspace.org_name}
                      </Link>{" "}
                      has a subscription. Cancel it in its Billing settings first.
                    </>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-graphite">Then you can delete your account here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <dl className="flex max-w-md flex-col gap-3 text-sm leading-relaxed">
              <div className="flex flex-col gap-0.5">
                <dt className="text-graphite">Deleted, with everything in them</dt>
                <dd>{deleted.map((workspace) => workspace.org_name).join(", ")}</dd>
              </div>
              {left.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-graphite">Left, and kept by the people still in them</dt>
                  <dd>{left.map((workspace) => workspace.org_name).join(", ")}</dd>
                </div>
              )}
            </dl>
            <DeleteAccount email={email} summary={summary} />
          </div>
        )}
      </SettingsSection>
    </main>
  )
}
