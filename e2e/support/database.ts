import { execFileSync } from "node:child_process"

// Some states have no page that leads to them: a week passing, and what
// only the operator does, such as taking a project down. A spec puts the
// database in them the way the operator would, with SQL, run by psql inside
// the local stack's database container (named after the project id in
// supabase/config.toml, the same in CI).
const CONTAINER = process.env.E2E_DB_CONTAINER ?? "supabase_db_subcanvas"

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`

function sql(statement: string) {
  execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-c", statement],
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
