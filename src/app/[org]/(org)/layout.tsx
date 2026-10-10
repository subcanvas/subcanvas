import { AppShell } from "@/components/app-shell"
import { getOrgContext } from "@/lib/orgs"

// The org's own pages: its projects and its settings. For its members only:
// anyone else is sent to sign in, or told there is nothing here.
export default async function OrgPagesLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  await getOrgContext(slug)
  return <AppShell slug={slug}>{children}</AppShell>
}
