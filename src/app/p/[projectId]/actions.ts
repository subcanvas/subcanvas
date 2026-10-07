"use server"

import { headers } from "next/headers"
import { after } from "next/server"

import { sendEmail } from "@/lib/email"
import { abuseReportEmail } from "@/lib/email-messages"
import { abuseContact } from "@/lib/legal"
import { originFromHeaders } from "@/lib/origin"
import { publicProjectPath } from "@/lib/public-route"
import { createAnonymousClient } from "@/lib/supabase/anonymous"
import { createClient } from "@/lib/supabase/server"

// A report about a public project (R6.7), from anyone reading it. It is
// stored first, by report_abuse, which checks that the project is public and
// drops reports past a flood guard. Then the operator is emailed, after the
// response, so the reporter is not kept waiting on the mail server.

export type ReportResult = { error: string } | { ok: true }

const PROCEDURES = "https://github.com/subcanvas/subcanvas/blob/main/docs/OPERATIONS.md"
// No spaces, commas or angle brackets: it becomes the email's Reply-To.
const EMAIL = /^[^\s@,<>"]+@[^\s@,<>"]+\.[^\s@,<>"]+$/

export async function reportAbuse(
  projectId: string,
  documentId: string | null,
  reason: string,
  email: string
): Promise<ReportResult> {
  const reporterEmail = email.trim() || null
  if (reporterEmail && !EMAIL.test(reporterEmail))
    return { error: "Enter a valid email address, or leave it empty." }

  const supabase = await createClient()
  const { data: reportId, error } = await supabase.rpc("report_abuse", {
    p_project_id: projectId,
    // The generated types mark this required; the column is nullable.
    p_document_id: documentId as string,
    p_reason: reason,
    p_reporter_email: reporterEmail ?? undefined,
  })
  if (error) return { error: "The report could not be sent. Try again." }

  const to = abuseContact()
  if (reportId && to) {
    const origin = originFromHeaders(await headers())
    after(() => notifyOperator({ to, origin, reportId, projectId, documentId, reason, reporterEmail }))
  }
  return { ok: true }
}

async function notifyOperator(report: {
  to: string
  origin: string
  reportId: string
  projectId: string
  documentId: string | null
  reason: string
  reporterEmail: string | null
}) {
  // Read as anyone would: the project was public a moment ago, and what the
  // email names is what the reporter saw.
  const anonymous = createAnonymousClient()
  const [{ data: project }, { data: document }] = await Promise.all([
    anonymous.from("projects").select("name").eq("id", report.projectId).maybeSingle(),
    report.documentId
      ? anonymous
          .from("documents")
          .select("title, type")
          .eq("id", report.documentId)
          .eq("project_id", report.projectId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const projectLink = `${report.origin}${publicProjectPath(report.projectId)}`

  const result = await sendEmail({
    to: report.to,
    ...(report.reporterEmail ? { replyTo: report.reporterEmail } : {}),
    ...abuseReportEmail({
      reportId: report.reportId,
      projectId: report.projectId,
      projectName: project?.name ?? "A project that is no longer public",
      projectLink,
      document: document
        ? { title: document.title, link: `${projectLink}/d/${report.documentId}`, type: document.type }
        : null,
      reason: report.reason.trim(),
      reporterEmail: report.reporterEmail,
      procedures: PROCEDURES,
    }),
  })
  if (result === "failed") console.error(`Report ${report.reportId} is stored, but its email to ${report.to} did not go.`)
}
