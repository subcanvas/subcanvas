// Who runs this deployment, for the Terms and the Privacy Policy. These come
// from the environment because the documents name a person: a self-hosted
// server must not show subcanvas.app's operator as its own. With any of them
// unset, the two pages do not exist and nothing links to them.
export type LegalDetails = {
  // The person or company users make the agreement with.
  operator: string
  // Where legal notices and privacy requests go.
  contact: string
  // The US state whose law governs, e.g. "California".
  governingLaw: string
}

export function legalDetails(): LegalDetails | null {
  const operator = process.env.LEGAL_OPERATOR
  const contact = process.env.LEGAL_CONTACT
  const governingLaw = process.env.LEGAL_GOVERNING_LAW
  return operator && contact && governingLaw ? { operator, contact, governingLaw } : null
}

// Shown on both documents. Change it whenever their meaning changes.
export const LEGAL_EFFECTIVE = "September 19, 2026"
