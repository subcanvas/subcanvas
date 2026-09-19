import { OrgHeader } from "@/components/org-header"
import { getOrgContext } from "@/lib/orgs"

export default async function OrgLayout({
  children,
  params,
}: LayoutProps<"/[org]">) {
  const { org: slug } = await params
  const { supabase, user, org } = await getOrgContext(slug)

  const [{ data: orgs }, { data: profile }] = await Promise.all([
    supabase.from("orgs").select("name, slug").order("created_at"),
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .single(),
  ])

  return (
    <>
      <OrgHeader
        org={org}
        orgs={orgs ?? []}
        user={{
          email: user.email ?? "",
          name: profile?.display_name ?? null,
          avatarUrl: profile?.avatar_url ?? null,
        }}
      />
      <div className="flex flex-1 flex-col">{children}</div>
    </>
  )
}
