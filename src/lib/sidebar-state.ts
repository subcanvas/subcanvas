// The cookie that remembers whether the sidebar is collapsed. It lives here,
// not in the sidebar component, because the server reads it too, and a server
// component that imports a value from a "use client" file gets a reference,
// not the value.
export const SIDEBAR_COOKIE_NAME = "sidebar_state"
