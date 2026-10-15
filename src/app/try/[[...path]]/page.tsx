import { PlaygroundDocument } from "@/components/playground/playground-document"
import { parseVia } from "@/lib/navigation"

// /try opens the example's top whiteboard; /try/shop/<title>-<code> opens
// any document in it, as a project's addresses do (lib/navigation.ts).
export default async function PlaygroundPage({ params, searchParams }: PageProps<"/try/[[...path]]">) {
  const { path = [] } = await params
  return <PlaygroundDocument path={path} via={parseVia((await searchParams).via)} />
}
