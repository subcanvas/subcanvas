"use client"

import {
  ChevronsUpDown,
  CreditCard,
  KeyRound,
  LayoutGrid,
  LogOut,
  Monitor,
  Moon,
  PanelLeftClose,
  Plus,
  Sun,
  Users,
} from "lucide-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { LogoMark } from "@/components/logo"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { createClient } from "@/lib/supabase/client"

type Org = { name: string; slug: string }

// What is in the sidebar on every page of an org: which org this is at the
// top, the org's pages, and your account at the bottom. Inside a project, the
// project's documents go in the middle.
export function AppSidebar({
  org,
  orgs,
  user,
  showBilling,
  children,
  footer,
}: {
  org: Org
  orgs: Org[]
  user: { email: string; name: string | null; avatarUrl: string | null }
  // False on a server with no paid plan to offer.
  showBilling: boolean
  children?: React.ReactNode
  footer?: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const { toggleSidebar } = useSidebar()

  async function signOut() {
    await createClient().auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const pages = [
    { href: `/${org.slug}`, label: "Projects", icon: LayoutGrid },
    { href: `/${org.slug}/settings/members`, label: "Members", icon: Users },
    ...(showBilling ? [{ href: `/${org.slug}/settings/billing`, label: "Billing", icon: CreditCard }] : []),
  ]

  return (
    <>
      <SidebarHeader className="flex-row items-center gap-1">
        <SidebarMenu className="min-w-0 flex-1">
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton className="font-semibold">
                    <LogoMark />
                    <span className="truncate">{org.name}</span>
                    <ChevronsUpDown className="ml-auto text-graphite" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent align="start" className="min-w-52">
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
          </SidebarMenuItem>
        </SidebarMenu>
        {/* The drawer on a narrow screen has its own close button. */}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-graphite max-md:hidden"
          aria-label="Hide the sidebar"
          title="Hide the sidebar (⌘\)"
          onClick={toggleSidebar}
        >
          <PanelLeftClose />
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <nav aria-label="Org">
            <SidebarMenu>
              {pages.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton isActive={pathname === href} render={<Link href={href} />}>
                    <Icon className="text-graphite" />
                    {label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarGroup>
        {children}
      </SidebarContent>

      <SidebarFooter className="gap-2 border-t border-rule">
        {footer}
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton aria-label="Account menu">
                    <Avatar className="size-5">
                      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
                      <AvatarFallback className="text-[10px]">
                        {(user.name ?? user.email).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{user.name ?? user.email}</span>
                    <ChevronsUpDown className="ml-auto text-graphite" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent side="top" align="start" className="min-w-52">
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
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  )
}
