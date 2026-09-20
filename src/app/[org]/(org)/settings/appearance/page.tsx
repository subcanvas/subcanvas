import { PageHeader } from "@/components/page-header"

import { SettingsSection } from "../settings-section"
import { ThemePicker } from "./theme-picker"

export const metadata = { title: "Appearance" }

export default function AppearancePage() {
  return (
    <main id="main" className="flex w-full max-w-3xl flex-col gap-8">
      <PageHeader
        eyebrow="Your account"
        title="Appearance"
        description="How Subcanvas looks on this device. It is remembered in this browser, not in your account."
      />

      <SettingsSection
        id="appearance-theme"
        title="Theme"
        description="The account menu at the bottom of the sidebar switches between the same three."
      >
        <ThemePicker />
      </SettingsSection>
    </main>
  )
}
