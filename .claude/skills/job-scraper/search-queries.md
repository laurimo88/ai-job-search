# Search Queries for Job Scraper

<!-- Configured by /setup for Laura Moreno (Fürth, Germany). Re-run `/setup --section search` to update. -->

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `.agents/skills/*/SKILL.md` and runs its CLI first. Shipped country-agnostic CLIs include `linkedin-search` and `freehire-search`; Danish demos and any skill you add with `/add-portal` are included the same way. You do **not** need a matching `site:` line below for those CLIs to run.

The `site:` query templates in this file are the **WebSearch fallback** — for portals without a CLI, company career pages, or when a CLI fails.

**Language scope:** write every query category in every language listed in your CLAUDE.md Languages table (typically 1-2, sometimes more). A posting requiring a language you have *not* declared, as a job condition, is excluded before scoring; a posting requiring a *higher level* than you declared in a language you *do* work in is flagged for your own judgment, not excluded — see `04-job-evaluation.md`'s Language Gate, the single source of truth for this rule. Translate each category's keywords rather than machine-translating word-for-word (e.g. "Frontend Developer" -> "Desarrollador Frontend", not a literal word-for-word translation) if you work in more than one language.

## Search Sites

Primary (German market; `arbeitnow-search` CLI installed - add more with `/add-portal`, e.g. StepStone):
- **stepstone.de** - largest general job board in Germany
- **arbeitnow.com** - English-friendly German board, also visa-sponsored and remote roles; primary path is the `arbeitnow-search` CLI (it only scans the newest ~900 postings, so the `site:` lines below also reach older ones)
- **linkedin.com/jobs** - filter: Germany / Nürnberg, Erlangen, Fürth, München; also covered by `linkedin-search` CLI
- **de.indeed.com** - broad aggregator
- **xing.com/jobs** - German professional network
- **join.com / startup boards (e.g. berlinstartupjobs.com, wellfound.com)** - small startups (candidate preference)

Secondary (company career pages via Google):
- Direct Google searches with `site:` filters for target companies, Flexera / ServiceNow / Snow (Flexera) SAM partners

Danish portal demos stay **disabled** (candidate is in Germany).

## Query Categories

Queries run in **English and German** (German declared at B1 - German-language postings that require fluent German are FLAGGED, not excluded; candidate applies to German-speaking roles and notes she is improving her German). Spanish is native but rarely a job language in this market; add Spanish queries only for Spanish/LatAm-facing roles.

Location terms: `Nürnberg`, `Erlangen`, `Fürth`, `München`, `Bayern`, `Remote Deutschland`.

### Priority 1: Software Asset & License Management (SAM / ITAM)

Strongest, most desired direction. Title variants: Software Asset Manager, SAM Manager, ITAM Manager, IT License Manager, License Compliance Manager, Lizenzmanager, Software Asset Management Specialist.

```
site:stepstone.de "Software Asset Manager" OR "Lizenzmanager" Nürnberg OR Erlangen OR München
site:stepstone.de "IT Asset Management" Bayern
site:linkedin.com/jobs "Software Asset Management" Germany
site:linkedin.com/jobs "License Manager" OR "Lizenzmanagement" Nürnberg
site:de.indeed.com "Flexera" Bayern
site:arbeitnow.com "Software Asset" OR "License Manager" OR "Lizenzmanager"
site:arbeitnow.com "Flexera" OR "ITAM" OR "Lizenzmanagement"
"Flexera" "SAM" job Germany remote
```

### Priority 2: Vendor, Provider & Supplier Management

Domain expertise. Title variants: IT Vendor Manager, Provider Manager, Supplier Manager, IT Sourcing Manager, Lieferantenmanager IT, Dienstleistersteuerung.

```
site:stepstone.de "IT Vendor Manager" OR "Provider Manager" Bayern
site:stepstone.de "Lieferantenmanagement IT" OR "Dienstleistersteuerung" Nürnberg OR München
site:linkedin.com/jobs "Vendor Management" IT Germany
site:linkedin.com/jobs "Supplier Manager" software Erlangen OR Nürnberg
site:arbeitnow.com "Vendor Manager" OR "Supplier Manager" OR "Lieferantenmanager" IT
```

### Priority 3: Product Owner & IT / Digital Project Management

Title variants: Product Owner, IT Project Manager, Digital Project Manager, Technical Project Manager, IT-Projektleiter, Projektmanager Digitalisierung. Include small startups.

```
site:stepstone.de "Product Owner" Nürnberg OR Erlangen OR Fürth
site:stepstone.de "IT-Projektleiter" OR "IT Project Manager" Nürnberg
site:linkedin.com/jobs "Product Owner" startup Germany
site:linkedin.com/jobs "Digital Project Manager" München OR Nürnberg
site:join.com "Product Owner" OR "Project Manager" Nürnberg OR München OR remote
site:arbeitnow.com "Product Owner" Nürnberg OR Erlangen OR München OR remote
site:arbeitnow.com "IT Project Manager" OR "IT-Projektleiter" Bayern
```

### Priority 4: Adjacent - FinOps, IT Procurement, IT Governance, SAM Consulting

Wider net. Title variants: FinOps Analyst/Manager, Cloud Cost Manager, IT Procurement Manager, Software Category Manager, Einkäufer IT / Software, IT Governance & Compliance Manager, SAM Consultant.

```
site:linkedin.com/jobs "FinOps" Germany
site:stepstone.de "Category Manager Software" OR "Einkäufer IT" Bayern
site:stepstone.de "IT Governance" OR "IT Compliance Manager" Nürnberg OR München
site:linkedin.com/jobs "SAM Consultant" OR "ServiceNow SAM" Germany
site:arbeitnow.com "FinOps" OR "IT Procurement" OR "Einkäufer IT"
```

## Key Skill Terms

Flexera, SAM, ITAM, license management / Lizenzmanagement, vendor management, Product Owner, PSPO, license compliance, ASPICE, CapEx/OpEx.

## Location Filter

Candidate has no commute constraints (on-site, hybrid and remote all acceptable).
- **Ideal:** Fürth, Nürnberg, Erlangen (Nuremberg metro)
- **Acceptable:** Bavaria within ~1.5 h by train (München, Bamberg, Würzburg, Ingolstadt, Regensburg, Roth); fully remote within Germany
- **Borderline:** Hybrid roles elsewhere in Germany (check on-site frequency)
- **Too far:** On-site roles outside Germany requiring relocation (confirm with candidate)

## Language Filter

Your working languages and levels are in CLAUDE.md's Languages table. When filtering scraped results, apply `04-job-evaluation.md`'s Language Gate: a posting requiring a language you haven't declared at all is excluded; a posting requiring a higher level than you declared in a language you do work in is not excluded, flag it clearly instead (see `job-scraper/SKILL.md`'s Step 3 "Quick Fit Assessment" for how the flag surfaces in `/scrape` output). Postings simply *written* in a language you don't work in, that don't require it on the job, are fine.

## Date Filter

Only include jobs posted within the last 14 days, or with an application deadline that has not yet passed. If a posting date cannot be determined, include it but flag as "date unknown".

## Adapting Queries

If the user specifies a focus area, select queries from the matching category and also generate 2-3 custom queries for that focus. For example:
- "/scrape [focus_area]" -> relevant category queries + custom focus-specific queries
