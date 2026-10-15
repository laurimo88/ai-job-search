# Arbeitnow — URL & Data Reference

Investigated 2026-10-15. Update this file when the portal changes.

## Access

- `robots.txt`: `User-agent: * / Disallow:` (everything allowed; only `/*?__hstc` disallowed).
- API terms (from the response `meta.terms`): free public API, "please do not abuse",
  linking back appreciated, use implies agreement with arbeitnow.com's ToS.
- No login or API key. Honest UA `Mozilla/5.0 (compatible; arbeitnow-cli/1.0)` is accepted.
- API docs: https://www.arbeitnow.com/blog/job-board-api

## Search — job-board API (JSON feed)

```
GET https://www.arbeitnow.com/api/job-board-api?page=<n>[&visa_sponsorship=true]
```

| Parameter | Effect |
|-----------|--------|
| `page` | 1-indexed page, 300 items/page (later pages may hold fewer, e.g. 235–250) |
| `visa_sponsorship` | `true` filters to visa-sponsored postings (only documented filter) |
| `search`, `remote`, … | **Ignored** — tested 2026-10-15, returns the unfiltered feed |

Ordering is roughly newest-first by `created_at`, but **not strictly across pages**
(page 6 contained newer items than page 3), and pages are cached snapshots, so the same
slug can appear on two pages. The CLI dedupes by slug, filters client-side, then sorts.
Page 1 covered ~1.5 days; page 10 still had data (≈ 1 week back).

Response:

```json
{
  "data": [ {
    "slug": "erp-product-owner-bern-387065",
    "company_name": "SwissPeak Partners GmbH",
    "title": "ERP Product Owner",
    "description": "<p>…HTML…</p>",
    "remote": false,
    "url": "https://www.arbeitnow.ch/jobs/companies/swisspeak-partners-gmbh/erp-product-owner-bern-387065",
    "tags": ["…"],
    "job_types": ["Experienced", "fulltime permanent"],
    "location": "Bern, Berne, Switzerland",
    "created_at": 1792047652
  } ],
  "links": { "first": "…?page=1", "last": null, "prev": null, "next": "…?page=2" },
  "meta": { "current_page": 1, "per_page": 300, "from": 1, "to": 300, "terms": "…", "info": "…" }
}
```

Mapping: `id` ← `slug`, `company` ← `company_name`, `date` ← `created_at` (unix seconds → ISO),
`url` ← `url`. `location` is free text in mixed languages ("Munich", "München", "Berlin, Germany").
`job_types` mixes German and English values.

## Detail — public job page

```
GET https://www.arbeitnow.com/view/<slug>   → 301 → /jobs/companies/<company-slug>/<slug>
GET https://www.arbeitnow.ch/view/<slug>    (Swiss postings; .com answers 410 for these)
```

- `404`/`410` → missing or expired posting.
- Apply link: `<canonical url>/apply`.
- Parse the `<script type="application/ld+json">` block: an `@graph` array containing a
  `JobPosting` node (plus `BreadcrumbList`, `WebSite`). Fields used:

| JSON-LD path | Output field |
|--------------|--------------|
| `title` | `title` |
| `hiringOrganization.name` | `company` |
| `jobLocation.address.addressLocality / addressRegion / addressCountry` | `location` |
| `datePosted` | `date` |
| `validThrough` | `validThrough` (past → `isActive: false`) |
| `employmentType` | `employmentType` (`FULL_TIME`, `CONTRACTOR`, `TEMPORARY`, …) |
| `baseSalary.currency`, `.value.minValue/.maxValue/.unitText` | `salary` |
| `description` (HTML) | `description` (text, list/paragraph breaks kept) |
| `jobLocationType == "TELECOMMUTE"` | `remote` (else `null`) |
