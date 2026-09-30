import { Building2, CreditCard, Palette, UserRound, Users, type LucideIcon } from "lucide-react"

export type SettingsSection = { href: string; label: string; detail: string; icon: LucideIcon }
export type SettingsGroup = { label: string; sections: SettingsSection[] }

// Every section of Settings, in order. The list beside each page on a wide
// screen and the list page on a narrow one are both drawn from this.
export function settingsGroups(
  org: { name: string; slug: string; personal: boolean },
  showBilling: boolean
): SettingsGroup[] {
  const base = `/${org.slug}/settings`
  return [
    {
      label: "Your account",
      sections: [
        { href: `${base}/profile`, label: "Profile", detail: "Your name, picture, and how you sign in.", icon: UserRound },
        { href: `${base}/appearance`, label: "Appearance", detail: "Light, dark, or whatever your device uses.", icon: Palette },
      ],
    },
    {
      label: org.name,
      sections: [
        { href: `${base}/general`, label: "General", detail: "The workspace's name and address, and your role in it.", icon: Building2 },
        {
          href: `${base}/members`,
          label: "Members",
          detail: org.personal ? "Just you. Team workspaces are for working with others." : "Who is in the workspace and what they can do.",
          icon: Users,
        },
        ...(showBilling
          ? [{ href: `${base}/billing`, label: "Billing", detail: "The plan and what it is billed for.", icon: CreditCard }]
          : []),
      ],
    },
  ]
}
