import { describe, expect, it } from "vitest"

import { STORAGE_FULL_MESSAGE } from "./media"
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
      message: "This org has used its storage for pictures and videos (3000 of 3000 bytes).",
    })
    expect(uploadError(full)).toBe(STORAGE_FULL_MESSAGE)
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
