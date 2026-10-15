// Data source: Arbeitnow's free public job-board API (JSON feed) plus the public
// job pages for detail. No authentication required.
//
// The API is a plain feed: 300 postings per page, no keyword/location filter
// (unknown params such as ?search= or ?remote= are silently ignored), so search
// filtering happens client-side over a small number of feed pages. The only
// server-side filter is visa_sponsorship=true. Detail pages carry a schema.org
// JobPosting block in JSON-LD, which we parse instead of the visual markup.

export const BASE_URL = "https://www.arbeitnow.com"
export const FEED_URL = `${BASE_URL}/api/job-board-api`
/**
 * Sites that serve /view/<slug> (301 to /jobs/companies/<company>/<slug>).
 * Swiss postings exist only on arbeitnow.ch; .com answers 410 for them.
 */
export const VIEW_ORIGINS = [BASE_URL, "https://www.arbeitnow.ch"]

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; arbeitnow-cli/1.0)"

export interface FetchResult {
  body: string
  url: string
}

/**
 * Fetch with exponential backoff + jitter on 429/5xx. Returns null on a 404 or
 * 410 (Arbeitnow answers 410 Gone for expired postings) rather than throwing.
 */
export async function fetchText(url: string, accept: string): Promise<FetchResult | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en-US,en;q=0.9,de;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404 || response.status === 410) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return { body: await response.text(), url: response.url || url }
  }
  throw new Error("Request failed after max retries")
}

// ---------------------------------------------------------------------------
// Feed (search)

export interface FeedItem {
  slug?: unknown
  company_name?: unknown
  title?: unknown
  description?: unknown
  remote?: unknown
  url?: unknown
  tags?: unknown
  job_types?: unknown
  location?: unknown
  created_at?: unknown
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  remote: boolean | null
  tags: string[]
  jobTypes: string[]
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []

/**
 * Parse one feed page. Each item is normalised independently so one malformed
 * entry cannot break the rest; items without a slug or title are skipped.
 */
export function parseFeed(json: string): { items: Array<JobCard & { _desc: string }>; hasNext: boolean } {
  let data: { data?: unknown; links?: { next?: unknown } }
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error("Arbeitnow API returned a non-JSON response")
  }
  const raw = Array.isArray(data.data) ? (data.data as FeedItem[]) : []
  const items: Array<JobCard & { _desc: string }> = []
  for (const r of raw) {
    if (!r || typeof r !== "object") continue
    const id = str(r.slug)
    const title = str(r.title)
    if (!id || !title) continue
    const ts = typeof r.created_at === "number" ? r.created_at : null
    items.push({
      id,
      title,
      company: str(r.company_name),
      location: str(r.location),
      date: ts !== null ? new Date(ts * 1000).toISOString() : null,
      url: str(r.url) ?? `${BASE_URL}/view/${id}`,
      remote: typeof r.remote === "boolean" ? r.remote : null,
      tags: strList(r.tags),
      jobTypes: strList(r.job_types),
      _desc: typeof r.description === "string" ? r.description : "",
    })
  }
  return { items, hasNext: typeof data.links?.next === "string" }
}

/** Lowercase and strip diacritics so "Munchen" matches "München". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/**
 * Every whitespace-separated query term must appear in the title, company, or
 * tags (description is opt-in via `inDescription`, since boilerplate there
 * produces many false positives).
 */
export function matchesQuery(card: JobCard & { _desc: string }, query: string, inDescription: boolean): boolean {
  const terms = fold(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  let hay = fold([card.title, card.company ?? "", ...card.tags].join(" "))
  if (inDescription) hay += " " + fold(stripTags(card._desc))
  return terms.every((t) => hay.includes(t))
}

// Feed locations mix English and German city names ("Munich" vs "München"),
// so a location filter matches either spelling. Keys and values are folded.
const CITY_ALIASES: string[][] = [
  ["munchen", "munich"],
  ["nurnberg", "nuremberg"],
  ["koln", "cologne"],
  ["frankfurt", "frankfurt am main"],
  ["hannover", "hanover"],
  ["dusseldorf", "duesseldorf"],
  ["wien", "vienna"],
  ["zurich", "zuerich"],
  ["genf", "geneva", "geneve"],
]

export function matchesLocation(card: JobCard, location: string): boolean {
  if (card.location === null) return false
  const loc = fold(card.location)
  const want = fold(location.trim())
  const variants = CITY_ALIASES.find((group) => group.includes(want)) ?? [want]
  return variants.some((v) => loc.includes(v))
}

// ---------------------------------------------------------------------------
// Detail

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  validThrough: string | null
  salary: string | null
  applyUrl: string | null
  isActive: boolean
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    // &amp; last so "&amp;lt;" decodes to "&lt;", not "<".
    .replace(/&amp;/g, "&")
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

/** HTML description -> readable text with paragraph and list breaks preserved. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<h\d[^>]*>/gi, "\n\n")
    .replace(/<\/(p|ul|ol|div)>/gi, "\n\n")
    .replace(/<\/h\d>/gi, "\n")
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ""))
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function formatSalary(s: any): string | null {
  if (!s || typeof s !== "object") return null
  const v = s.value ?? {}
  const min = Number(v.minValue)
  const max = Number(v.maxValue)
  const cur = typeof s.currency === "string" ? s.currency : ""
  const unit = typeof v.unitText === "string" ? `/${v.unitText.toLowerCase()}` : ""
  const fmt = (n: number) => Math.round(n).toLocaleString("en-US")
  if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > 0) {
    return `${fmt(min)}–${fmt(max)} ${cur}${unit}`.trim()
  }
  const one = Number.isFinite(min) && min > 0 ? min : Number.isFinite(max) && max > 0 ? max : null
  return one !== null ? `${fmt(one)} ${cur}${unit}`.trim() : null
}

/** Find the JobPosting object among the page's JSON-LD blocks. */
export function extractJobPosting(html: string): any | null {
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    let parsed: any
    try {
      parsed = JSON.parse(m[1])
    } catch {
      continue
    }
    const nodes: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed]
    const job = nodes.find((n) => n && n["@type"] === "JobPosting")
    if (job) return job
  }
  return null
}

export function parseJobDetail(html: string, id: string, pageUrl: string): JobDetail | null {
  const job = extractJobPosting(html)
  if (!job) return null

  const addr = job.jobLocation?.address ?? {}
  const locParts = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
    .filter((p: unknown): p is string => typeof p === "string" && p.trim() !== "")
  const remote = job.jobLocationType === "TELECOMMUTE" ? true : null

  const validThrough = str(job.validThrough)
  const expired = validThrough !== null && Date.parse(validThrough) < Date.now()

  const url = pageUrl.split("?")[0]
  const description = typeof job.description === "string" ? htmlToText(job.description) || null : null
  const employmentType = Array.isArray(job.employmentType)
    ? job.employmentType.join(", ") || null
    : str(job.employmentType)

  return {
    id,
    title: typeof job.title === "string" ? decodeHtmlEntities(job.title).trim() : "(untitled)",
    company: str(job.hiringOrganization?.name),
    location: locParts.length ? locParts.join(", ") : null,
    date: str(job.datePosted),
    url,
    remote,
    tags: [],
    jobTypes: [],
    description,
    employmentType,
    validThrough,
    salary: formatSalary(job.baseSalary),
    applyUrl: /\/jobs\/companies\//.test(url) ? `${url.replace(/\/$/, "")}/apply` : null,
    isActive: !expired,
  }
}
