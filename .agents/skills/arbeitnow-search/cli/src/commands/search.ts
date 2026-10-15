import {
  FEED_URL,
  fetchText,
  parseFeed,
  matchesQuery,
  matchesLocation,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage?: number
  remote: boolean
  visa: boolean
  inDescription: boolean
  page: number
  pages: number
  limit?: number
  format: "json" | "table" | "plain"
}

function feedUrl(page: number, visa: boolean): string {
  const params = new URLSearchParams()
  if (visa) params.set("visa_sponsorship", "true")
  params.set("page", String(page))
  return `${FEED_URL}?${params.toString()}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 44).padEnd(44)
    const company = (c.company || "—").slice(0, 24).padEnd(24)
    const loc = ((c.location || "—") + (c.remote ? " (R)" : "")).slice(0, 22).padEnd(22)
    const date = c.date ? c.date.slice(0, 10) : "—"
    return `${title} ${company} ${loc} ${date}  ${c.id}`
  })
  const header =
    "TITLE".padEnd(44) + " " + "COMPANY".padEnd(24) + " " + "LOCATION".padEnd(22) + " DATE        ID"
  return [header, "-".repeat(header.length + 30), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const seen = new Set<string>()
    let matches: JobCard[] = []
    let scanned = 0
    let pagesScanned = 0
    const cutoff = opts.jobage !== undefined ? Date.now() - opts.jobage * 86400_000 : null

    for (let p = opts.page; p < opts.page + opts.pages; p++) {
      // Small pause between feed pages: the API is free and asks not to be abused.
      if (p > opts.page) await new Promise((r) => setTimeout(r, 300))
      const res = await fetchText(feedUrl(p, opts.visa), "application/json")
      if (!res) break
      const { items, hasNext } = parseFeed(res.body)
      pagesScanned++
      for (const item of items) {
        // Feed pages are served from cache snapshots, so the same posting can
        // appear on two consecutive pages - dedupe by slug.
        if (seen.has(item.id)) continue
        seen.add(item.id)
        scanned++
        if (opts.query && !matchesQuery(item, opts.query, opts.inDescription)) continue
        if (opts.location && !matchesLocation(item, opts.location)) continue
        if (opts.remote && item.remote !== true) continue
        if (cutoff !== null && (item.date === null || Date.parse(item.date) < cutoff)) continue
        const { _desc, ...card } = item
        matches.push(card)
      }
      if (!hasNext || items.length === 0) break
    }

    // The feed is only roughly date-ordered across pages; sort newest first.
    matches.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    if (opts.limit !== undefined) matches = matches.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(matches) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        (matches.length === 0
          ? "No results."
          : matches
              .map(
                (c) =>
                  `${c.title}\n  ${c.company || "—"} · ${c.location || "—"}${c.remote ? " · remote" : ""} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
              )
              .join("\n\n")) + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: matches.length, page: opts.page, pagesScanned, scanned }, results: matches },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
