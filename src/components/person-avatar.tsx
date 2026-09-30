"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

// A person as the people they work with see them: their picture, or
// the first letter of their name on their own color when they have none or
// it does not load. Props go to the avatar itself, so it can be a tooltip's
// trigger.
export function PersonAvatar({
  name,
  picture,
  color,
  ...props
}: React.ComponentProps<typeof Avatar> & {
  name: string
  picture: string | null | undefined
  color: string
}) {
  return (
    <Avatar {...props}>
      {picture && <AvatarImage src={picture} alt="" />}
      <AvatarFallback className="font-medium text-white" style={{ backgroundColor: color }}>
        {name.charAt(0).toUpperCase() || "?"}
      </AvatarFallback>
    </Avatar>
  )
}
