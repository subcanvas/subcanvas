// Codes the database raises when a free org is at a plan limit.
export const PRIVATE_DOCUMENT_LIMIT_CODE = "GN001"
export const EDITOR_LIMIT_CODE = "GN002"

export const PRIVATE_DOCUMENT_LIMIT_MESSAGE =
  "This org has reached the free plan's limit for private documents. Upgrade, make the project public, or move documents to the trash."

export const EDITOR_LIMIT_MESSAGE =
  "The free plan's editor limit is reached. Upgrade, or add this person as a viewer. Viewers are unlimited."

export function limitMessage(code: string | undefined) {
  if (code === PRIVATE_DOCUMENT_LIMIT_CODE) return PRIVATE_DOCUMENT_LIMIT_MESSAGE
  if (code === EDITOR_LIMIT_CODE) return EDITOR_LIMIT_MESSAGE
  return null
}
