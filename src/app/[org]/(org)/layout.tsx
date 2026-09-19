import { AppShell } from "@/components/app-shell"

// The org's own pages: its projects and its settings.
export default async function OrgPagesLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ org: string }>
}) {
  const { org: slug } = await params
  return <AppShell slug={slug}>{children}</AppShell>
}
