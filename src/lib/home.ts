// Where a signed-in person's own work is: their first org, or onboarding
// when they have none (src/app/auth/home/route.ts works out which). The home
// page is the landing page for everyone, signed in or not, so sign-in,
// leaving an org and deleting one come here instead.
export const WORKSPACE_HOME = "/auth/home"
