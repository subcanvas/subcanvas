import { PlaygroundDocument } from "@/components/playground/playground-document"
import { parseVia } from "@/lib/navigation"

// /try opens the software example's top whiteboard and /try/productivity
// the course's; /try/<project>/<title>-<code> opens any document in either,
// as a project's addresses do (lib/navigation.ts, lib/playground/examples.ts).
export default async function PlaygroundPage({ params, searchParams }: PageProps<"/try/[[...path]]">) {
  const { path = [] } = await params
  return <PlaygroundDocument path={path} via={parseVia((await searchParams).via)} />
}
