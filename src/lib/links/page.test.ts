import { describe, expect, it } from "vitest"

import { decodeEntities, readPage, youtubeId } from "./page"

describe("readPage", () => {
  it("prefers the Open Graph tags, in either attribute order", () => {
    const html = `<html><head>
      <title>Fallback</title>
      <meta content="The real title" property="og:title">
      <meta property='og:description' content='Two &amp; three'>
      <meta property="og:site_name" content="Example">
      <meta property="og:image" content="/cover.png">
    </head><body><meta property="og:title" content="Not this"></body></html>`
    expect(readPage(html, "https://www.example.com/post/1")).toEqual({
      title: "The real title",
      description: "Two & three",
      site: "Example",
      image: "https://www.example.com/cover.png",
    })
  })

  it("falls back to the title tag, the description, and the address", () => {
    const html = `<head><title> A   page </title><meta name="description" content="About it."></head>`
    expect(readPage(html, "https://www.example.com/")).toEqual({
      title: "A page",
      description: "About it.",
      site: "example.com",
      image: null,
    })
  })

  it("names a page with nothing to say after its site", () => {
    expect(readPage("", "https://docs.example.org/x")).toMatchObject({ title: "docs.example.org", site: "docs.example.org" })
  })

  it("keeps only web addresses for the picture", () => {
    expect(readPage(`<meta property="og:image" content="javascript:alert(1)">`, "https://a.test/").image).toBeNull()
  })

  it("cuts a very long title", () => {
    const title = readPage(`<title>${"word ".repeat(100)}</title>`, "https://a.test/").title
    expect(title.length).toBeLessThanOrEqual(200)
    expect(title.endsWith("…")).toBe(true)
  })
})

it("decodes the entities a page writes", () => {
  expect(decodeEntities("Tom &amp; Jerry &#8212; &#x2014; &quot;hi&quot; &bogus;")).toBe('Tom & Jerry — — "hi" &bogus;')
})

it("finds the video in every kind of YouTube address", () => {
  for (const address of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://www.youtube.com/live/dQw4w9WgXcQ",
  ])
    expect(youtubeId(address), address).toBe("dQw4w9WgXcQ")
  for (const address of ["https://www.youtube.com/@channel", "https://vimeo.com/123", "https://youtu.be/short", "nonsense"])
    expect(youtubeId(address), address).toBeNull()
})
