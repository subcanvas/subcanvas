import { courseSeed } from "@/lib/playground/example-course"

// The note-taking playground's starting project (/try/productivity): a
// course (lib/playground/example-course.ts). Made once when the app is
// built, and the same for every visitor, like the software example's
// (../route.ts).
export const dynamic = "force-static"

export async function GET() {
  return Response.json(await courseSeed())
}
