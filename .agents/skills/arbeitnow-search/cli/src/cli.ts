#!/usr/bin/env bun
// Self-contained CLI for searching jobs on Arbeitnow (arbeitnow.com), a
// Germany-focused job board, via its free public job-board API. No external
// CLI framework, so it runs anywhere `bun` is available with zero install.
//
// The API's terms: "free public API for jobs, please do not abuse". Keep
// volume low - search scans at most a few feed pages per call.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

// Switches that never take a value, so `--remote -q x` and `--remote foo`
// cannot swallow the next token as the switch's value.
const BOOLEAN_FLAGS = new Set(["remote", "visa", "in-description", "help", "h"])

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (BOOLEAN_FLAGS.has(key) || next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `arbeitnow-cli — search jobs on Arbeitnow (Germany; English- and German-language postings)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <slug|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords; every word must appear in the title, company, or tags
                          (case- and accent-insensitive). Recommended.
  --location, -l <text>   City/region substring, e.g. "Berlin", "München", "Nürnberg".
  --remote                Only postings flagged remote.
  --visa                  Only postings offering visa sponsorship (server-side filter).
  --in-description        Also match --query words against the full description.
  --jobage <days>         Posted within N days.
  --page <n>              1-indexed feed page to start from (300 postings/page). Default 1.
  --pages <n>             Feed pages to scan, 1-10. Default 3 (~900 newest postings).
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "product owner" --format table
  bun run src/cli.ts search -q "IT asset" -l "München" --jobage 14 --format table
  bun run src/cli.ts search -q "license" --in-description --remote --format table
  bun run src/cli.ts detail erp-product-owner-berlin-123456 --format plain

Free public API — please keep volume low.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set([
    "query", "location", "remote", "visa", "in-description", "jobage", "page", "pages", "limit", "format", "help", "h",
  ]),
  detail: new Set(["format", "help", "h"]),
}

function err(error: string, code: string): number {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
  return 1
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  // Reject unknown flags instead of silently discarding them: a discarded
  // filter changes what the search returns with no error.
  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      return err(
        `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns; see --help for the supported flags`,
        "UNKNOWN_FLAG",
      )
    }
  }

  const fmt = flags.format === undefined ? "json" : flags.format

  if (cmd === "search") {
    if (fmt !== "json" && fmt !== "table" && fmt !== "plain") {
      return err(`--format must be json, table, or plain, got "${fmt}"`, "BAD_ARG")
    }
    if ((flags._ as string[]).length > 1) {
      return err(
        `unexpected argument "${(flags._ as string[])[1]}" - pass keywords with --query/-q`,
        "BAD_ARG",
      )
    }

    const intFlag = (name: string, min: number, max = Infinity): number | null | undefined => {
      const raw = flags[name]
      if (raw === undefined) return undefined
      // Number(), not parseInt(): parseInt truncates "1.5" to 1 silently.
      const val = typeof raw === "string" ? Number(raw.trim()) : NaN
      if (!Number.isInteger(val) || val < min || val > max) {
        const range = max === Infinity ? `at least ${min}` : `between ${min} and ${max}`
        err(`--${name} must be a whole number ${range}, got "${raw}"`, "BAD_ARG")
        return null
      }
      return val
    }

    const jobage = intFlag("jobage", 1)
    const page = intFlag("page", 1)
    const pages = intFlag("pages", 1, 10)
    const limit = intFlag("limit", 1)
    if (jobage === null || page === null || pages === null || limit === null) return 1

    for (const name of ["query", "location"]) {
      if (flags[name] !== undefined && typeof flags[name] !== "string") {
        return err(`--${name} requires a value`, "BAD_ARG")
      }
    }

    const opts: SearchOpts = {
      query: flags.query as string | undefined,
      location: flags.location as string | undefined,
      jobage,
      remote: flags.remote === true,
      visa: flags.visa === true,
      inDescription: flags["in-description"] === true,
      page: page ?? 1,
      pages: pages ?? 3,
      limit,
      format: fmt,
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) return err("detail requires a <slug|url>", "NO_ID")
    if (fmt !== "json" && fmt !== "plain") {
      return err(`--format must be json or plain, got "${fmt}"`, "BAD_ARG")
    }
    const opts: DetailOpts = { id, format: fmt }
    return runDetail(opts)
  }

  return err(`Unknown command "${cmd}"`, "BAD_CMD")
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
