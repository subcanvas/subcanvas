// Where the source is: the AGPL asks that people who use the server can
// find it, and the docs a self-hosted server links to live there too.
export const SOURCE_URL = "https://github.com/subcanvas/subcanvas"

export const docsUrl = (file: string, section?: string) =>
  `${SOURCE_URL}/blob/main/docs/${file}${section ? `#${section}` : ""}`
