import { Monitor, Moon, Sun } from "lucide-react"

// The three themes, for the account menu's quick switch and the Appearance
// page. One list, so the two always offer the same choices in the same words.
export const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match my device", icon: Monitor },
] as const

export type ThemeValue = (typeof THEME_OPTIONS)[number]["value"]
