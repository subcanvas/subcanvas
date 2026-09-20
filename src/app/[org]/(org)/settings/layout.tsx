import { billingConfigured } from "@/lib/billing/stripe"
import { getOrgContext } from "@/lib/orgs"

import { BackToSettings, SettingsNav } from "./settings-nav"

// Settings is one place with sections: yours (profile, appearance) and the
// org's (general, members, billing). A wide screen keeps the section list
// beside the page; a narrow one has it as the page at /settings.
export default async function SettingsLayout({ children, params }: LayoutProps<"/[org]/settings">) {
  const { org: slug } = await params
  const { org } = await getOrgContext(slug)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 gap-12 px-6 py-10">
      <SettingsNav org={org} showBilling={billingConfigured()} />
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <BackToSettings slug={org.slug} />
        {children}
      </div>
    </div>
  )
}
