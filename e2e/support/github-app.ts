import { generateKeyPairSync } from "node:crypto"

// A GitHub App that exists nowhere, for the GitHub import spec's server, so
// it offers Connect GitHub (Settings → GitHub, api/github/*) without asking
// GitHub anything: the specs check what it shows and where it sends people,
// and stop at github.com's door. The key is made for the run and thrown
// away. playwright.config.ts gives these to the server it starts; CI, which
// starts that server itself, loads them with github-app-env.mjs. Only node:
// imports, so Node can run it as it is.

export const GITHUB_APP_SLUG = "subcanvas-e2e"

export function gitHubAppEnvironment(): Record<string, string> {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  })
  return {
    APP_ID_GITHUB: "1",
    APP_CLIENT_ID_GITHUB: "Iv1.e2e",
    APP_SLUG_GITHUB: GITHUB_APP_SLUG,
    APP_CLIENT_SECRET_GITHUB: "e2e",
    APP_PRIVATE_KEY_GITHUB: privateKey,
  }
}
