import { execFileSync } from "node:child_process"

// Some states have no page that leads to them: a week passing, and what
// only the operator does, such as taking a project down. A spec puts the
// database in them the way the operator would, with SQL, run by psql inside
// the local stack's database container (named after the project id in
// supabase/config.toml, the same in CI).
const CONTAINER = process.env.E2E_DB_CONTAINER ?? "supabase_db_subcanvas"

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`

function sql(statement: string) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At", "-c", statement],
    { encoding: "utf8" }
  )
}

// The invite for this address, in every org, as it is a week later.
export function expireInvite(email: string) {
  sql(`update public.org_invites set expires_at = now() - interval '1 minute' where email = ${literal(email.toLowerCase())}`)
}

// What the operator runs to take a project down (docs/OPERATIONS.md).
export function takeDown(projectId: string) {
  sql(`update public.projects set taken_down_at = now() where id = ${literal(projectId)}`)
}

// Many projects at once, named "<prefix> 01" and on, in the workspace with
// this address: more than anyone would make by hand to see a long list.
export function addProjects(slug: string, prefix: string, count: number) {
  sql(
    `insert into public.projects (org_id, name)
     select id, ${literal(prefix)} || ' ' || lpad(n::text, 2, '0') from public.orgs, generate_series(1, ${count}) n
     where slug = ${literal(slug)}`
  )
}

// The steps the account with this address has reached, in the order of the
// list (migration account_steps), as the operator would read them.
export function stepsOf(email: string): string[] {
  return sql(
    `select step from private.account_steps where user_id = (select id from auth.users where email = ${literal(email.toLowerCase())}) order by step`
  )
    .split("\n")
    .filter(Boolean)
}

// The error reports whose message holds `text` (migration error_reports), as
// the operator would read them: one row per distinct error.
export function errorReports(text: string): { source: string; route: string; message: string; count: number }[] {
  const out = sql(
    `select coalesce(json_agg(json_build_object('source', source, 'route', route, 'message', message, 'count', count)), '[]') from private.error_reports where message like ${literal(`%${text}%`)} or name like ${literal(`%${text}%`)}`
  )
  return JSON.parse(out)
}

// The error reports from this route, by count, for errors whose message is
// the same on every run.
export function errorCountAt(route: string, source: "server" | "browser"): number {
  return Number(sql(`select coalesce(sum(count), 0) from private.error_reports where route = ${literal(route)} and source = ${literal(source)}`))
}

// A whiteboard whose saved state cannot be read, as a bug or a bad write
// would leave it: one update of bytes that are not Yjs.
export function corruptDocument(documentId: string) {
  sql(`insert into public.document_updates (document_id, update) values (${literal(documentId)}, '\\xdeadbeefdeadbeef')`)
}
