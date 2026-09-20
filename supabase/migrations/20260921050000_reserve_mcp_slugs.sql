-- Org slugs are top-level URL segments. The MCP server adds two routes an
-- org could otherwise take and then never be opened at: /mcp, the endpoint
-- itself, and /oauth, where a person approves an MCP client (/oauth/consent).
-- Dropped first, so running this twice is harmless.
alter table public.orgs drop constraint if exists orgs_slug_not_an_mcp_route;
alter table public.orgs
  add constraint orgs_slug_not_an_mcp_route
  check (slug not in ('mcp', 'oauth'));
