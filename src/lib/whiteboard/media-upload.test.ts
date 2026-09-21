import { describe, expect, it } from "vitest"

import { uploadError } from "./media-upload"

// What Storage answers, as XMLHttpRequest sees it.
const answer = (status: number, body: object | string) => ({
  status,
  responseText: typeof body === "string" ? body : JSON.stringify(body),
})

describe("uploadError", () => {
  it("tells a full org apart from a refusal by row-level security", () => {
    const full = answer(400, {
      statusCode: "403",
      error: "Unauthorized",
      message: "The free plan includes 1 GB of storage for pictures and videos, and this file does not fit in what is left. Upgrading raises it.",
    })
    expect(uploadError(full)).toBe(
      "The free plan includes 1 GB of storage for pictures and videos, and this file does not fit in what is left. Upgrading raises it. Settings, under General, shows how much it keeps."
    )
    expect(uploadError(answer(400, { statusCode: "403", message: "new row violates row-level security policy" }))).toBe(
      "You cannot add files to this whiteboard."
    )
  })

  it("reads the status from the body or the status line", () => {
    expect(uploadError(answer(400, { statusCode: "413", message: "Payload too large" }))).toMatch(/larger/)
    expect(uploadError(answer(415, "Unsupported"))).toMatch(/kind of file/)
    expect(uploadError(answer(500, "oops"))).toBe("The upload failed. Try again.")
  })
})
