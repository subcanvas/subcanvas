// Prints the GitHub App of github-app.ts as shell exports, for CI to load
// before it starts the GitHub import spec's server:
//   eval "$(node e2e/support/github-app-env.mjs)"
// The key goes on one line, with \n for its line breaks, which the app reads
// (gitHubAppConfig in src/lib/github/app.ts).
import { gitHubAppEnvironment } from "./github-app.ts"

for (const [name, value] of Object.entries(gitHubAppEnvironment()))
  console.log(`export ${name}='${value.replace(/\n/g, "\\n")}'`)
