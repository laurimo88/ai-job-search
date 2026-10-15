# arbeitnow-cli

CLI for searching jobs on **Arbeitnow** (arbeitnow.com), a Germany-focused job board
with English- and German-language postings.

**Data source**: Arbeitnow's free public job-board API (`/api/job-board-api`) for search,
and the JSON-LD `JobPosting` block on public job pages for detail.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> The API is free and public — "please do not abuse". Each search fetches at most
> `--pages` feed pages (default 3, max 10).

## Installation

```bash
cd .agents/skills/arbeitnow-search/cli
bun install   # optional — only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Filter the newest feed pages by keyword / location / remote / visa / age |
| `detail` | Fetch full detail for one posting (slug or arbeitnow.com/.ch URL) |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
bun run src/cli.ts search -q "product owner" --format table
bun run src/cli.ts search -l "Nürnberg" --jobage 7 --format table
bun run src/cli.ts search -q "flexera" --in-description --pages 6 --format table
bun run src/cli.ts detail erp-product-owner-bern-387065 --format plain
```

The API has no server-side keyword search, so filtering is client-side over the
scanned pages. See `../SKILL.md` for the full flag reference and `../url-reference.md`
for endpoint details.

## Development

```bash
bun run typecheck
bun run test      # unit tests + one live smoke search (1 feed page)
```
