// The playground's examples (app/try). Each is a project of its own in the
// visitor's browser, kept apart from the other, with its own addresses:
// /try/<project>/<title>-<code>, the way a real project's are. /try alone
// opens the software example, which links already out there point to.
export type PlaygroundExample = {
  key: "shop" | "productivity"
  // The address segment after /try, and the project's name in the trail.
  project: string
  name: string
  // Where its first visit copies the example from.
  seed: string
  // The prefix of its IndexedDB databases (lib/playground/local-store.ts).
  storage: string
  // Its top whiteboard's address.
  home: string
  // What the header says it is.
  about: string
}

export const EXAMPLES: Record<PlaygroundExample["key"], PlaygroundExample> = {
  shop: {
    key: "shop",
    project: "shop",
    name: "shop",
    seed: "/api/playground/seed",
    // Unchanged from when there was one example, so earlier visits keep
    // what they made.
    storage: "subcanvas-playground",
    home: "/try",
    about: "an example system design",
  },
  productivity: {
    key: "productivity",
    project: "productivity",
    name: "Fall semester",
    seed: "/api/playground/seed/productivity",
    storage: "subcanvas-playground-productivity",
    home: "/try/productivity",
    about: "an example course",
  },
}

// Which example an address under /try belongs to.
export function exampleAt(pathname: string): PlaygroundExample {
  return pathname.split("/")[2] === EXAMPLES.productivity.project ? EXAMPLES.productivity : EXAMPLES.shop
}
