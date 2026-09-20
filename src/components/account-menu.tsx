"use client"

import { CreditCard, KeyRound, LayoutGrid, LogOut, Monitor, Moon, Sun, Users } from "lucide-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"

// What the open sidebar and its collapsed rail both show: the org's pages
// and the account menu. One definition, so the two cannot drift apart.

export type SidebarUser = { email: string; name: string | null; avatarUrl: string | null }

export function orgPages(slug: string, showBilling: boolean) {
  return [
    { href: `/${slug}`, label: "Projects", icon: LayoutGrid },
    { href: `/${slug}/settings/members`, label: "Members", icon: Users },
    ...(showBilling ? [{ href: `/${slug}/settings/billing`, label: "Billing", icon: CreditCard }] : []),
  ]
}

export function UserAvatar({ user, className }: { user: SidebarUser; className?: string }) {
  return (
    <Avatar className={className}>
      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
      <AvatarFallback className="text-[10px]">{(user.name ?? user.email).charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}

// `trigger` is the button that opens it; the menu goes to its `side`.
export function AccountMenu({
  user,
  trigger,
  side,
}: {
  user: SidebarUser
  trigger: React.ReactElement
  side: "top" | "right"
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()

  async function signOut() {
    await createClient().auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent side={side} align={side === "top" ? "start" : "end"} className="min-w-52">
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
        <DropdownMenuItem render={<Link href={`/auth/password?next=${encodeURIComponent(pathname)}`} />}>
          <KeyRound />
          Set a password
        </DropdownMenuItem>
        <DropdownMenuItem onClick={signOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
