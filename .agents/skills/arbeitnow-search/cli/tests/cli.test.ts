import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";
import { normalizeId } from "../src/commands/detail";
import { parseFeed, matchesQuery, matchesLocation, htmlToText, parseJobDetail } from "../src/helpers";

interface SearchOutput {
  meta: { count: number; page: number };
  results: Array<Record<string, unknown>>;
}

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

describe("live search (smoke)", () => {
  test("search returns results with the contract fields", async () => {
    // "manager" is broad enough to match on a single 300-posting feed page.
    const out = parseJSON<SearchOutput>(
      await runCLI(["search", "-q", "manager", "--pages", "1", "--limit", "5"]),
    );
    expect(out.meta.page).toBe(1);
    expect(out.results.length).toBeGreaterThanOrEqual(1);
    for (const r of out.results) {
      for (const k of ["id", "title", "company", "location", "date", "url"]) {
        expect(k in r).toBe(true);
      }
      expect(r.id).toBeTruthy();
      expect(r.title).toBeTruthy();
      expect(String(r.url)).toMatch(/^https:\/\/www\.arbeitnow\.(com|ch)\//);
    }
  });
});

describe("argument errors", () => {
  test("unknown flag exits 1 with JSON error on stderr", async () => {
    const r = await runCLI(["search", "--bogus", "x"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe("");
    expect(parsedStderr(r.stderr).code).toBe("UNKNOWN_FLAG");
  });

  test("detail without id exits 1 with NO_ID", async () => {
    const r = await runCLI(["detail"]);
    expect(r.exitCode).toBe(1);
    expect(parsedStderr(r.stderr).code).toBe("NO_ID");
  });

  for (const [flag, val] of [["jobage", "1.5"], ["page", "0"], ["pages", "11"], ["limit", "abc"]]) {
    test(`--${flag} ${val} exits 1 with BAD_ARG`, async () => {
      const r = await runCLI(["search", `--${flag}`, val]);
      expect(r.exitCode).toBe(1);
      expect(parsedStderr(r.stderr).code).toBe("BAD_ARG");
    });
  }

  test("detail rejects a non-Arbeitnow URL", async () => {
    const r = await runCLI(["detail", "https://evil.example/jobs/companies/x/some-job-123"]);
    expect(r.exitCode).toBe(1);
    expect(parsedStderr(r.stderr).code).toBe("BAD_ID");
  });
});

describe("normalizeId", () => {
  test("bare slug tries every site", () => {
    expect(normalizeId("erp-product-owner-bern-387065")).toEqual({ slug: "erp-product-owner-bern-387065", origin: null });
  });
  test("company URL keeps its own site", () => {
    expect(normalizeId("https://www.arbeitnow.ch/jobs/companies/acme/erp-product-owner-bern-387065")).toEqual({
      slug: "erp-product-owner-bern-387065",
      origin: "https://www.arbeitnow.ch",
    });
    expect(normalizeId("arbeitnow.com/view/foo-bar-1/")?.slug).toBe("foo-bar-1");
    expect(normalizeId("https://www.arbeitnow.com/jobs/companies/acme/foo-bar-1/apply")?.slug).toBe("foo-bar-1");
  });
  test("look-alike and foreign hosts are rejected", () => {
    expect(normalizeId("https://arbeitnow.com.evil.io/view/foo-1")).toBeNull();
    expect(normalizeId("https://arbeitnow.com@evil.io/view/foo-1")).toBeNull();
    expect(normalizeId("https://greenhouse.io/jobs/companies/x/foo-1")).toBeNull();
  });
});

describe("parsing", () => {
  const feed = JSON.stringify({
    data: [
      { slug: "it-asset-manager-munich-1", title: "IT Asset Manager (m/w/d)", company_name: "Acme", location: "München",
        remote: false, url: "https://www.arbeitnow.com/jobs/companies/acme/it-asset-manager-munich-1",
        tags: ["IT"], job_types: [], created_at: 1792047652, description: "<p>Flexera &amp; SAM</p>" },
      { slug: "", title: "broken" },
      null,
      { slug: "no-company-2", title: "Product Owner" },
    ],
    links: { next: null },
  });

  test("parseFeed skips malformed items and fills nulls", () => {
    const { items, hasNext } = parseFeed(feed);
    expect(hasNext).toBe(false);
    expect(items.map((i) => i.id)).toEqual(["it-asset-manager-munich-1", "no-company-2"]);
    expect(items[1].company).toBeNull();
    expect(items[1].date).toBeNull();
    expect(items[1].url).toBe("https://www.arbeitnow.com/view/no-company-2");
  });

  test("matchesQuery is accent-insensitive and description is opt-in", () => {
    const [item] = parseFeed(feed).items;
    expect(matchesQuery(item, "asset manager", false)).toBe(true);
    expect(matchesQuery(item, "flexera", false)).toBe(false);
    expect(matchesQuery(item, "flexera", true)).toBe(true);
  });

  test("matchesLocation accepts English and German city names", () => {
    const [item] = parseFeed(feed).items;
    expect(matchesLocation(item, "Munich")).toBe(true);
    expect(matchesLocation(item, "münchen")).toBe(true);
    expect(matchesLocation(item, "Berlin")).toBe(false);
  });

  test("htmlToText keeps list and paragraph breaks and decodes entities", () => {
    expect(htmlToText("<p>A &amp; B</p><ul><li>one</li><li>two</li></ul><h2>Next</h2><p>x</p>")).toBe(
      "A & B\n\n• one\n• two\n\nNext\nx",
    );
  });

  test("parseJobDetail reads the JSON-LD JobPosting", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@graph": [{ "@type": "JobPosting", title: "T", hiringOrganization: { name: "Co" },
        jobLocation: { address: { addressLocality: "Fürth", addressCountry: "DE" } },
        validThrough: "2000-01-01T00:00:00Z", description: "<p>Hi</p>",
        baseSalary: { currency: "EUR", value: { unitText: "YEAR", minValue: "60000", maxValue: "70000" } } }],
    })}</script>`;
    const job = parseJobDetail(html, "t-1", "https://www.arbeitnow.com/jobs/companies/co/t-1")!;
    expect(job.company).toBe("Co");
    expect(job.location).toBe("Fürth, DE");
    expect(job.isActive).toBe(false);
    expect(job.salary).toBe("60,000–70,000 EUR/year");
    expect(job.applyUrl).toBe("https://www.arbeitnow.com/jobs/companies/co/t-1/apply");
    expect(parseJobDetail("<html></html>", "x", "u")).toBeNull();
  });
});
