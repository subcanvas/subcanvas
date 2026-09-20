import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { DesktopSidebar } from "@/components/desktop-sidebar"
import { MobileTree } from "@/components/tree/mobile-tree"
import { SidebarProvider } from "@/components/ui/sidebar"
import { billingConfigured } from "@/lib/billing/stripe"
import { getOrgContext } from "@/lib/orgs"
import { SIDEBAR_COOKIE_NAME } from "@/lib/sidebar-state"

// The frame around every signed-in page: the sidebar on a wide screen, the
// same sidebar in a drawer on a narrow one, and the page beside it. A project
// passes its documents as `tree` and its own footer rows as `footer`.
export async function AppShell({
  slug,
  title,
  tree,
  footer,
  children,
}: {
  slug: string
  // Shown beside the drawer's button on a narrow screen.
  title?: string
  tree?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  const { supabase, user, org } = await getOrgContext(slug)
  const [{ data: orgs }, { data: profile }] = await Promise.all([
    supabase.from("orgs").select("name, slug").order("created_at"),
    supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).single(),
  ])

  const showBilling = billingConfigured()
  const sidebarUser = {
    email: user.email ?? "",
    name: profile?.display_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
  }
  const contents = (
    <AppSidebar org={org} orgs={orgs ?? []} showBilling={showBilling} user={sidebarUser} footer={footer}>
      {tree}
    </AppSidebar>
  )

  // Collapsing the sidebar is remembered, and read here so the page does not
  // render open and then snap shut.
  const open = (await cookies()).get(SIDEBAR_COOKIE_NAME)?.value !== "false"

  return (
    <SidebarProvider defaultOpen={open} className="min-h-0 flex-1 flex-col md:flex-row">
      <MobileTree label="Menu" title={title ?? org.name} description="Pages, documents, and your account.">
        {contents}
      </MobileTree>
      <DesktopSidebar slug={org.slug} showBilling={showBilling} user={sidebarUser}>
        {contents}
      </DesktopSidebar>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </SidebarProvider>
  )
}
