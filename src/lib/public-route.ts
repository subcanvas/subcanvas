// /p/<project id>/... is where a public whiteboard's embed picture lives
// (/p/<project id>/d/<document id>/embed.svg), addressed by ids so a README
// never breaks. Public pages used to live there too; those addresses now
// lead to the readable ones (lib/navigation.ts). The database forbids a
// workspace from taking "p" as its short name.
export const PUBLIC_SLUG = "p"

export const publicProjectPath = (projectId: string) => `/${PUBLIC_SLUG}/${projectId}`
