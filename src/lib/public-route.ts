// Public pages live at /p/<project id>/... The app's links are built as
// /<org slug>/<project id>/..., so a public page passes this in place of the
// org slug and every link lands on the public route. The database forbids an
// org from taking it as a slug.
export const PUBLIC_SLUG = "p"

export const publicProjectPath = (projectId: string) => `/${PUBLIC_SLUG}/${projectId}`
