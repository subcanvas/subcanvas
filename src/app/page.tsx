import Link from "next/link"
import { redirect } from "next/navigation"

import { buttonVariants } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: orgs } = await supabase
      .from("orgs")
      .select("slug")
      .order("created_at")
      .limit(1)
    redirect(orgs?.[0] ? `/${orgs[0].slug}` : "/onboarding")
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Graph Notes</h1>
      <p className="max-w-md text-muted-foreground">
        Nested whiteboards and documents for teams.
      </p>
      <Link href="/login" className={buttonVariants()}>
        Sign in
      </Link>
    </main>
  )
}
