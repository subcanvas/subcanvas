"use client"

import { Bot, LayoutGrid, LogOut, Settings, UserRound } from "lucide-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { useRouter } from "next/navigation"

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
import { THEME_OPTIONS } from "@/components/theme-options"
import { createClient } from "@/lib/supabase/client"

// What the open sidebar and its collapsed rail both show: the org's pages
// and the account menu. One definition, so the two cannot drift apart.

export type SidebarUser = { email: string; name: string | null; avatarUrl: string | null }

// Members, billing, and the rest are sections of Settings, so this list does
// not grow with them. `nested` marks a page that is current on every page
// below it too.
export function orgPages(slug: string) {
  return [
    { href: `/${slug}`, label: "Projects", icon: LayoutGrid, nested: false },
    // Connecting an AI agent over MCP: one click from anywhere, because the
    // fewer steps it takes, the more people do it.
    { href: `/${slug}/agents`, label: "Connect an agent", icon: Bot, nested: false },
    { href: `/${slug}/settings`, label: "Settings", icon: Settings, nested: true },
  ]
}

export function isCurrentPage(pathname: string, page: { href: string; nested: boolean }) {
  return pathname === page.href || (page.nested && pathname.startsWith(`${page.href}/`))
}

export function UserAvatar({ user, className }: { user: SidebarUser; className?: string }) {
  return (
    <Avatar className={className}>
      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
      <AvatarFallback className="text-[10px]">{(user.name ?? user.email).charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}

// `trigger` is the button that opens it; the menu goes to its `side`. The
// profile lives in the settings of the org being looked at, hence `slug`.
export function AccountMenu({
  slug,
  user,
  trigger,
  side,
}: {
  slug: string
  user: SidebarUser
  trigger: React.ReactElement
  side: "top" | "right"
}) {
  const router = useRouter()
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
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
              <Icon />
              {label}
              {theme === value && <span className="ml-auto text-xs text-muted-foreground">On</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={`/${slug}/settings/profile`} />}>
          <UserRound />
          Your profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={signOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
