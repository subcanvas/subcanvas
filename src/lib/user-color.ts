// A stable caret color per user, readable on light and dark backgrounds.
const COLORS = [
  "#e5484d", "#f76b15", "#ffb224", "#46a758", "#12a594",
  "#0090ff", "#3e63dd", "#8e4ec6", "#d6409f", "#978365",
]

export function userColor(userId: string) {
  let hash = 0
  for (let i = 0; i < userId.length; i++)
    hash = (hash * 31 + userId.charCodeAt(i)) | 0
  return COLORS[Math.abs(hash) % COLORS.length]
}
