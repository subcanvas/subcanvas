import { Check, KeyRound, Mail, Minus } from "lucide-react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { GitHubIcon, GoogleIcon } from "@/components/provider-icons"
import { buttonVariants } from "@/components/ui/button"
import { legalDetails } from "@/lib/legal"
import { getOrgContext } from "@/lib/orgs"

import { SettingsSection } from "../settings-section"
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
  const [{ data: profile }, { data: hasPassword }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).single(),
    supabase.rpc("has_password"),
  ])

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

  return (
    <main id="main" className="flex w-full max-w-3xl flex-col gap-8">
      <PageHeader
        eyebrow="Your account"
        title="Profile"
        description="Who you are to the people you work with. It is the same in every org you belong to."
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

      <SettingsSection
        id="profile-delete"
        title="Delete your account"
        danger
        description="Deleting your account removes your profile and your membership of every org. It cannot be undone."
      >
        <p className="max-w-xl text-sm leading-relaxed">
          {legal ? (
            <>
              Accounts are deleted by hand, so nothing is lost by accident. Email{" "}
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
          )}{" "}
          If you are the only owner of an org, delete the org or make someone else an owner first.
        </p>
      </SettingsSection>
    </main>
  )
}
