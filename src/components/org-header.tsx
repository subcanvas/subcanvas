"use client"

import { ChevronsUpDown, LogOut, Monitor, Moon, Plus, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogoMark } from "@/components/logo"
import { createClient } from "@/lib/supabase/client"

type Org = { name: string; slug: string }

export function OrgHeader({
  org,
  orgs,
  user,
  showBilling,
}: {
  org: Org
  orgs: Org[]
  // False on a server with no paid plan to offer.
  showBilling: boolean
  user: { email: string; name: string | null; avatarUrl: string | null }
}) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  async function signOut() {
    await createClient().auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <header className="flex h-12 items-center gap-2 border-b bg-sheet px-3">
      <Link
        href={`/${org.slug}`}
        aria-label="Subcanvas"
        className="flex size-8 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LogoMark />
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" className="font-semibold">
              {org.name}
              <ChevronsUpDown className="text-muted-foreground" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Orgs</DropdownMenuLabel>
            {orgs.map((o) => (
              <DropdownMenuItem key={o.slug} render={<Link href={`/${o.slug}`} />}>
                {o.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/onboarding" />}>
            <Plus />
            New org
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <nav className="flex items-center gap-1 text-sm">
        <Link
          href={`/${org.slug}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Projects
        </Link>
        <Link
          href={`/${org.slug}/settings/members`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Members
        </Link>
        {showBilling && (
          <Link
            href={`/${org.slug}/settings/billing`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Billing
          </Link>
        )}
      </nav>

      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Account menu">
                <Avatar className="size-6">
                  {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
                  <AvatarFallback>
                    {(user.name ?? user.email).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Appearance</DropdownMenuLabel>
              {(
                [
                  ["light", "Light", Sun],
                  ["dark", "Dark", Moon],
                  ["system", "Match my device", Monitor],
                ] as const
              ).map(([value, label, Icon]) => (
                <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
                  <Icon />
                  {label}
                  {theme === value && <span className="ml-auto text-xs text-muted-foreground">On</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
