import { VIEW_ORIGINS, fetchText, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

// Swiss postings live only on arbeitnow.ch (arbeitnow.com answers 410 for them).
const ARBEITNOW_HOST = /^(?:www\.)?arbeitnow\.(com|ch)$/i
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i

export interface JobRef {
  slug: string
  /** Origin to look the slug up on; null = try every Arbeitnow site in turn. */
  origin: string | null
}

/**
 * Accept a bare slug (the `id` from search results) or an arbeitnow.com/.ch
 * job URL (`/jobs/companies/<company>/<slug>` or `/view/<slug>`), with or
 * without scheme. URLs on any other host are rejected - an employer's own
 * apply link must not resolve to whatever Arbeitnow posting shares its last
 * path segment.
 */
export function normalizeId(input: string): JobRef | null {
  const trimmed = input.trim()
  if (SLUG.test(trimmed)) return { slug: trimmed, origin: null }

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  const host = parsed.hostname.match(ARBEITNOW_HOST)
  if (!host) return null
  const m =
    parsed.pathname.match(/^\/jobs\/companies\/[^/]+\/([^/]+?)(?:\/apply)?\/?$/) ??
    parsed.pathname.match(/^\/view\/([^/]+?)\/?$/)
  return m && SLUG.test(m[1]) ? { slug: m[1], origin: `https://www.arbeitnow.${host[1].toLowerCase()}` } : null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const ref = normalizeId(opts.id)
  if (!ref) {
    writeError(`Could not parse an Arbeitnow job slug from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    // /view/<slug> 301-redirects to the canonical /jobs/companies/... page.
    let res = null
    for (const origin of ref.origin ? [ref.origin] : VIEW_ORIGINS) {
      res = await fetchText(`${origin}/view/${ref.slug}`, "text/html,application/xhtml+xml")
      if (res) break
    }
    if (!res) {
      writeError("Job not found (removed or expired)", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(res.body, ref.slug, res.url)
    if (!job) {
      writeError("Job page has no JobPosting data (markup changed or not a job page)", "PARSE_FAILED")
      return 1
    }

    if (opts.format === "plain") {
      const block = (lines: (string | null)[]) => lines.filter((l): l is string => !!l).join("\n")
      const sections = [
        block([job.title, `${job.company || "—"} · ${job.location || "—"}`]),
        block([
          job.date ? `Posted: ${job.date}` : null,
          job.employmentType ? `Employment: ${job.employmentType}` : null,
          job.salary ? `Salary (as listed): ${job.salary}` : null,
          job.validThrough ? `Valid through: ${job.validThrough}` : null,
          `Status: ${job.isActive ? "ACTIVE" : "CLOSED / EXPIRED"}`,
        ]),
        job.description || "(no description)",
        block([`URL: ${job.url}`, job.applyUrl ? `Apply: ${job.applyUrl}` : null]),
      ]
      process.stdout.write(sections.join("\n\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
