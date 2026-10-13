// Where a signed-in person's own work is: the workspace they joined first,
// for most the one made when they signed up (src/app/auth/home/route.ts
// finds it), or the page that makes one when they have none. The home page
// is the landing page for everyone, signed in or not, so signing in,
// leaving a workspace and deleting one come here instead.
export const WORKSPACE_HOME = "/auth/home"
