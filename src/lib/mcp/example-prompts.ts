// What to ask an agent connected to Subcanvas: shown on the Connect an agent
// page, and written out word for word in README.md, docs/MCP.md and the
// Claude Code plugin's README (example-prompts.test.ts keeps them in step).
// Each asks only for what the tools can do today.
export const EXAMPLE_PROMPTS: { title: string; prompt: string }[] = [
  {
    title: "Map a repository",
    prompt:
      "Map this repository's services and how they talk to each other as a Subcanvas whiteboard, then put a page behind each arrow saying what crosses it.",
  },
  {
    title: "Explain a pull request",
    prompt:
      "Explain this pull request as a Subcanvas whiteboard: a box for each part it changes, arrows for how the changes depend on each other, and a page inside each box saying what changed and why.",
  },
  {
    title: "Turn a document into a whiteboard",
    prompt:
      "Turn docs/onboarding.md into a nested Subcanvas whiteboard: a box for each section, with its detail on a page or a whiteboard inside the box.",
  },
  {
    title: "Keep a diagram up to date",
    prompt:
      "Keep the Subcanvas diagram of this repository up to date with this branch. Add what the branch adds, fix what it changes, and ask me before you remove anything.",
  },
  {
    title: "Review a diagram against the code",
    prompt:
      "Review the Architecture whiteboard in Subcanvas against the code and fix what is wrong. List anything you would delete and wait for my answer.",
  },
]
