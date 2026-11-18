# Git Forge competition requirements

Official brief: https://make.fun/bounty/github-core-clone-01

Entry must run as `node main.ts` under Node 22, with no installation, no git binary, and no external network except MAKEFUN_ENV_URL. Bind port 0 and POST the assigned port to `$MAKEFUN_ENV_URL/register`; poll `/done` and exit when done.

One-process server must implement Git smart HTTP upload-pack protocol v2 and receive-pack v0, GitHub REST v3 at /api/v3, GraphQL v4 at /api/graphql, and MCP at /mcp. State exports must be deterministic across replay. Respect source limits.

Current implementation is an incomplete prototype: REST subset, minimal GraphQL and MCP, partial Git smart HTTP (packet framing, base-object PACK v2, ref discovery, initial push/fetch routes) but delta-object support implemented but not end-to-end tested, initial transitive fetch reachability and atomic ref validation, incomplete fetch negotiation, no proper auth identity mapping, no persistence. It is not eligible to win as-is. Implement genuine Git wire protocol and official practice tests before submitting.

Submission needs recorded authentic coding-agent transcripts, minimum 30% authored coverage, >=5 text/thinking assistant turns, >=2 assistant edits to one code file, plus a public repository and OSI license. Never manufacture transcripts. Do not submit without user approval.
