export const ROLES = ["viewer", "editor", "admin", "owner"] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  viewer: "Viewer",
  editor: "Editor",
  admin: "Admin",
  owner: "Owner",
}

export function hasRole(role: Role, min: Role) {
  return ROLES.indexOf(role) >= ROLES.indexOf(min)
}
