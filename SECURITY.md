# Security

## Reporting a vulnerability

Email **security@subcanvas.app**. Please do not open a public issue, pull request, or discussion for anything that could put someone's data at risk.

Include what you found, where (a URL, a file and line, or an MCP tool), and the steps to reproduce it. A proof of concept helps; so does saying what an attacker would need (an account, a role in an org, a public project).

You will hear back within three working days. Once it is fixed, the fix ships and you are credited in the release notes, if you want to be.

## Scope

- **subcanvas.app** and everything it serves: the app, the public project pages, embed images, the MCP endpoint at `/mcp`, and the OAuth consent page.
- **This repository's code**, including what a self-hosted copy runs.

A copy of Subcanvas that someone else runs is theirs to secure. If a flaw is in the code, report it here; if it is in how they set it up, tell them.

## What is out of scope

Denial of service by volume, reports from automated scanners without a demonstrated impact, missing headers without an exploit, social engineering, and anything that needs an already compromised device or account.

## Testing

Test against an account and an org of your own. Do not access, change, or delete other people's data, and stop and report as soon as you can show a problem. Good-faith research within these rules will not be pursued.

## How access works

The short version, so you know what should be impossible: row-level security in Postgres decides every read and write, for people, for anonymous visitors of public projects, and for AI agents, which act with their person's own token. The server holds a secret key only for billing and for cleaning up a deleted org's files. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/MCP.md](docs/MCP.md) describe it in full.
