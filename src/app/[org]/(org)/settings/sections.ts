import { Building2, CreditCard, FolderGit2, Palette, UserRound, Users, type LucideIcon } from "lucide-react"

export type SettingsSection = { href: string; label: string; detail: string; icon: LucideIcon }
export type SettingsGroup = { label: string; sections: SettingsSection[] }

// Every section of Settings, in order. The list beside each page on a wide
// screen and the list page on a narrow one are both drawn from this.
// Billing and GitHub are left out on a server that has not set them up.
export type SettingsOptions = { billing: boolean; github: boolean }

export function settingsGroups(
  org: { name: string; slug: string },
  { billing, github }: SettingsOptions
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
          detail: "Who is in the workspace and what they can do.",
          icon: Users,
        },
        ...(github
          ? [
              {
                href: `${base}/github`,
                label: "GitHub",
                detail: "The GitHub accounts whose private repositories this workspace can import.",
                icon: FolderGit2,
              },
            ]
          : []),
        ...(billing
          ? [{ href: `${base}/billing`, label: "Billing", detail: "The plan and what it is billed for.", icon: CreditCard }]
          : []),
      ],
    },
  ]
}
