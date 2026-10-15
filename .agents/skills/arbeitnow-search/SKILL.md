---
name: arbeitnow-search
version: 1.0.0
description: >
  Search live job listings on Arbeitnow (arbeitnow.com), a Germany-focused job
  board with English- and German-language postings (also some Swiss, Austrian,
  Dutch and French jobs), via its free public API. Use for jobs in Germany,
  English-speaking jobs in Germany, visa-sponsored jobs, or remote jobs in
  Germany/DACH, and to read a specific Arbeitnow posting. Trigger phrases: find
  jobs in Germany, jobs in Berlin / Munich / Nuremberg / Erlangen, English jobs
  in Germany, visa sponsorship jobs, Arbeitnow; German: Jobsuche, Stellensuche,
  Stellenangebote, offene Stellen, Jobs in Deutschland, Stellenanzeige.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/arbeitnow-search/cli/src/cli.ts *)
---

# Arbeitnow Search Skill

Search live job listings from **Arbeitnow**, a job board for Germany (plus some
CH/AT/NL/FR postings) that is popular for English-language and visa-sponsored
roles. Uses Arbeitnow's **free public job-board API** — no authentication, no API
key, and **zero runtime dependencies** (runs with just `bun`).

> **Fair use.** The API's own terms: it is free and public, "please do not abuse".
> `robots.txt` allows all paths. Each search fetches at most a few feed pages
> (default 3); don't loop it as a crawler.

## How search works (read this)

The API is a **feed, not a search engine**: it returns the newest postings, 300 per
page, and ignores keyword/location parameters. This CLI fetches `--pages` feed pages
(default 3 ≈ the ~900 newest postings, roughly the last 3–5 days) and filters them
**client-side**. Consequences:

- Coverage is "recent postings", not the whole board. Widen with `--pages` (max 10).
- `--query` matches every word against **title, company and tags** (case- and
  accent-insensitive). Add `--in-description` to also search the full description —
  useful for niche terms like `Flexera`, `SAM`, `Lizenz`, which rarely appear in titles.
- Postings are in English and German — try both terms (`"license manager"` and
  `"lizenz"`, `"product owner"` works in both).

## Commands

### Search job listings

```bash
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q <text>` — keywords; every word must match. Recommended.
- `--location <text>` / `-l <text>` — city/region substring. English and German names
  of major cities both work (`Munich`/`München`, `Nuremberg`/`Nürnberg`, `Cologne`/`Köln`).
- `--remote` — only postings flagged remote.
- `--visa` — only postings offering visa sponsorship (the one server-side filter).
- `--in-description` — also match `--query` words in the full description.
- `--jobage <days>` — posted within N days.
- `--page <n>` — 1-indexed feed page to start from (300 postings/page). Default 1.
- `--pages <n>` — feed pages to scan, 1–10. Default 3.
- `--limit <n>` / `-n <n>` — cap results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts detail <slug|url> [--format json|plain]
```

`slug` is the `id` from search results (e.g. `erp-product-owner-bern-387065`). A full
`arbeitnow.com` or `arbeitnow.ch` job URL also works. Returns the full description,
employment type, posted date, valid-through date, listed salary range, and apply link.

## Usage examples

```bash
# Product Owner roles, newest ~900 postings
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts search -q "product owner" --format table

# Anything in Nuremberg / Erlangen
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts search -l "Nürnberg" --format table
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts search -l "Erlangen" --format table

# Licensing / SAM terms anywhere in the posting, last 7 days, deeper scan
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts search -q "lizenz" --in-description --jobage 7 --pages 6 --format table
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts search -q "flexera" --in-description --pages 6 --format table

# Remote project-management roles in Munich
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts search -q "project manager" -l "Munich" --remote --format table

# Full details for one posting
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts detail erp-product-owner-bern-387065 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing `id`s to `detail` |
| `table` | Quick human-readable scanning (`(R)` marks remote) |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON: `{ "meta": { "count", "page", "pagesScanned", "scanned" }, "results": [...] }`;
each result has `id`, `title`, `company`, `location`, `date`, `url`, `remote`, `tags`,
`jobTypes` (missing values are `null`).

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- **Not Germany-only:** the feed also carries Swiss (`arbeitnow.ch`), Austrian, Dutch and
  French postings. Use `--location` to narrow.
- **Swiss postings** live only on `arbeitnow.ch`; `detail` with a bare slug tries
  `.com` then `.ch` automatically.
- **Dates:** search `date` is the feed's `created_at` (when the posting was last
  (re)listed); `detail` shows the JSON-LD `datePosted`, which can be much older for
  re-listed jobs.
- **Data quirks:** structured location regions are sometimes wrong (e.g. "Bern,
  BERLIN, CH"), and listed salary ranges can be very wide — treat them as indicative.
- Expired postings return HTTP 410 → `NOT_FOUND`.
- Retries 429/5xx with exponential backoff; 300 ms pause between feed pages.
