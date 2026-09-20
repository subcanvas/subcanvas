import type { UserIdentity } from "@supabase/supabase-js"

// The sign-in providers that can carry a profile picture.
export const PICTURE_PROVIDERS = ["google", "github"] as const
export type PictureProvider = (typeof PICTURE_PROVIDERS)[number]

export const PROVIDER_LABELS: Record<PictureProvider, string> = { google: "Google", github: "GitHub" }

// The picture a connected Google or GitHub account has, if it is one a
// profile may use. Google calls it `picture`, GitHub `avatar_url`.
export function providerPicture(identities: UserIdentity[], provider: PictureProvider) {
  const data = identities.find((identity) => identity.provider === provider)?.identity_data
  const picture = data?.avatar_url ?? data?.picture
  return typeof picture === "string" && picture.startsWith("https://") ? picture : null
}
