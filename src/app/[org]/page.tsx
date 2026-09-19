import { getOrgContext } from "@/lib/orgs"

export default async function OrgPage({ params }: PageProps<"/[org]">) {
  const { org: slug } = await params
  const { org } = await getOrgContext(slug)

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-2 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
      <p className="text-muted-foreground">
        Projects will appear here. They arrive in the next milestone.
      </p>
    </main>
  )
}
