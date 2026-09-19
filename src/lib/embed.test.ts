import { expect, it } from "vitest"

import { embedSnippet } from "./embed"

const ids = { origin: "https://subcanvas.app", projectId: "PROJECT", docId: "DOC" }

it("links a themed picture to the public page", () => {
  expect(embedSnippet({ ...ids, title: "System design" })).toBe(
    [
      `<a href="https://subcanvas.app/p/PROJECT/d/DOC">`,
      `  <picture>`,
      `    <source media="(prefers-color-scheme: dark)" srcset="https://subcanvas.app/p/PROJECT/d/DOC/embed.svg?theme=dark">`,
      `    <img alt="System design, a Subcanvas diagram" src="https://subcanvas.app/p/PROJECT/d/DOC/embed.svg">`,
      `  </picture>`,
      `</a>`,
    ].join("\n")
  )
})

it("keeps a title from closing the attribute it sits in", () => {
  const snippet = embedSnippet({ ...ids, title: `"><script>alert(1)</script> & co` })
  expect(snippet).toContain(`alt="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; co, a Subcanvas diagram"`)
  expect(snippet).not.toContain("<script>")
})
