#!/usr/bin/env node
// fetch-oil-bulletin.mjs — the fetch+extract step eu-weekly-oil-bulletin.mjs's own header named as a
// "named, separate follow-up": downloads the live EU Weekly Oil Bulletin workbook, extracts the EU
// -average row(s) from its "Prices wo taxes" sheet, and prints the normalized CSV
// (week_ending;product;price_eur) that eu-weekly-oil-bulletin.mjs --input consumes. Built 2026-08-30
// against the structure verified live on a GitHub runner (see below) — this script itself was NOT
// exercised against the live URL in the sandbox that authored it: outbound access to
// energy.ec.europa.eu is blocked by this sandbox's egress policy (same org-policy denial noted in
// eurostat-nrg-pc-205-producer.mjs and bls-oews-producer.mjs's own headers). It runs where the other
// producers already do — a GitHub Actions runner (.github/workflows/producers.yml) — which is the
// environment that actually performed the verification reads cited below.
//
// REVISION HISTORY, STATED PLAINLY. The first live producers run against the real file (producers run
// #7, 2026-08-30) exited 2 — OilBulletinStructureError, by design, fail-closed — because the EU-average
// block was keyed on the display string "EU - European Union", and that string is not a header anywhere
// in the real workbook (it turned out to be a legend-row label near the bottom of the sheet, not
// column-aligned with anything a header scan would see). A third inspection pass (browser fetch,
// 2026-08-30, 4,455,028 bytes — the same file the CI runner downloaded) read the raw sheet2.xml
// cell-by-cell and found the real key: row 1 carries a MACHINE identifier per column
// ("EU_price_wo_tax_{product}", "EUR_price_wo_tax_{product}", "{CC}_price_wo_tax_{product}", plus
// repeating "CTR" marker columns), not a merged block-name cell. oil-bulletin-workbook.mjs's own header
// carries the full structural citation and the fix; this script did not need a code change, only this
// note, since it never assumed the block shape itself — it just calls resolveHeaderBlocks and reports
// whatever headerResolution says.
//
// WRITES NOTHING. This script has no kill switch of its own and needs no DB credentials — it fetches,
// parses, prints a report to stderr, and prints CSV to stdout (or --out). The write gates (--apply +
// MARKET_PRODUCER_EU_OIL_BULLETIN_ENABLED) stay entirely inside eu-weekly-oil-bulletin.mjs, unchanged.
// Compose the two:
//   node scripts/producers/market/fetch-oil-bulletin.mjs \
//     | node scripts/producers/market/eu-weekly-oil-bulletin.mjs --apply
//
// VERIFIED PRIMARY-SOURCE EVIDENCE (three independent inspection passes of the live file, 2026-08-30 —
// two GitHub-runner reads plus the browser fetch that found the real row-1 shape, see above):
//   * The bulletin page (BULLETIN_PAGE_URL below) carries a link whose filename contains
//     "Prices_History" — "Price developments 2005 onwards", ~4.25 MB, page-dated 27 August 2026. This
//     script scrapes the page for that link rather than hardcoding its UUID (the UUID has been stable
//     across all three reads, but the page is the durable address); if scraping finds no such link, it
//     falls back to the known UUID URL (FALLBACK_XLSX_URL below) and SAYS SO on stderr — never silently.
//   * The .xlsx's xl/workbook.xml lists "Prices with taxes" (sheetId=2, r:id=rId1) and "Prices wo taxes"
//     (sheetId=3, r:id=rId2) among its sheets; xl/_rels/workbook.xml.rels maps rId1->worksheets/sheet1.xml,
//     rId2->worksheets/sheet2.xml. This script always resolves "Prices wo taxes" by name through that
//     mapping (oil-bulletin-workbook.mjs's parseSheetNames) — never by assumed sheet order or a
//     hardcoded "sheet2.xml" path, since nothing in the verified evidence guarantees that stays sheet 2.
//   * Full structural detail (3 header rows, the row-1 machine-id EU/EUR/country columns, the row-2
//     display-text cross-check, footer/legend-row shape, the newest-first data-row order, and the
//     serial-date conversion) is documented in oil-bulletin-workbook.mjs's own header — this script is a
//     thin I/O shell around that pure module; see it for the actual parsing contract and citations.
//
// CI-RUNNER-SIDE BY DESIGN. This mirrors exactly why the producer split fetch out of the parser in the
// first place (see eu-weekly-oil-bulletin.mjs and its parser module's headers): verifying a live external
// format needs a network read the authoring sandbox cannot perform, so the fetch step is built to run
// only where that read is possible. It shells out to the system `unzip` binary (spawnSync) rather than
// pulling in a zip-parsing npm dependency — `unzip -p <file> <entry>` streams one archive member's bytes
// to stdout, which is exactly the shape a .xlsx's XML parts need; the GitHub Actions ubuntu-latest image
// carries `unzip` (Debian's info-zip build) preinstalled, so no extra install step is needed in
// producers.yml.
//
// ── HISTORY BACKFILL (--since), ADDED 2026-09-02 (Lane PROD, system-completion train) ──────────────────
// WHY THIS IS A FLAG HERE, NOT A NEW MODULE OR A GUESS. The workbook this script already downloads is NOT
// "this week's bulletin" — the page-scrape target and the FALLBACK_XLSX_URL above both name it explicitly:
// filename "Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx", scraped by matching "Prices_History" in
// its link, and the bulletin page's own link text (read live, 2026-08-30, cited above) is "Price
// developments 2005 onwards". src/lib/market/oil-bulletin-workbook.mjs's own header, from the SAME live
// inspection passes, documents (not guesses) that the "Prices wo taxes" sheet holds MANY data rows, one per
// published week, "newest-first" in raw document order — extractEuSeries there already walks EVERY row,
// classifies each as data-or-footer by whether its date cell parses, sorts explicitly by week_ending
// (never trusting document order), and returns `dataRows.slice(0, weeks)`. So the full multi-year history
// is already parsed on every run; only the SLICE at the end throws it away down to `weeks` rows. --since
// asks for the SAME parse, filtered by date instead of sliced by count — no change to
// oil-bulletin-workbook.mjs (out of this lane's write set) is needed or made: this script passes a weeks
// value large enough to retrieve every parsed row (SINCE_ALL_WEEKS below; extractEuSeries's own tests pin
// that `weeks` larger than the available row count returns all of them, never throws), then filters that
// full list to `week_ending >= since` itself, in filterSince() below.
//
// WHAT THIS DOES NOT CHANGE. eu-weekly-oil-bulletin.mjs (the downstream --input consumer) needs NO code
// change: its parser (parseEuWeeklyOilBulletinCsv) already accepts any number of week_ending rows in one
// CSV (one row per product per week, the same shape this script has always emitted, just more of them),
// and planMarketSeriesUpsert already upserts each (series_key, reference_period) pair idempotently — a
// re-run of the SAME --since range plans 0 new creates, exactly like a re-run of the single-week path
// (market-producer-composition.test.mjs's own idempotency proof). The kill switch
// (MARKET_PRODUCER_EU_OIL_BULLETIN_ENABLED) and --apply gate are unchanged and unaffected: a --since fetch
// piped into eu-weekly-oil-bulletin.mjs --dry still writes nothing, exactly as today.
//
// Usage:
//   node scripts/producers/market/fetch-oil-bulletin.mjs                       # CSV on stdout, report on stderr
//   node scripts/producers/market/fetch-oil-bulletin.mjs --out path.csv        # CSV written to path.csv instead
//   node scripts/producers/market/fetch-oil-bulletin.mjs --weeks 4             # latest 4 weeks instead of 1
//   node scripts/producers/market/fetch-oil-bulletin.mjs --since 2025-01-01    # every published week on/after
//                                                                              # this date through the latest
//                                                                              # (--weeks is ignored when
//                                                                              # --since is given)
// Exit 0 ok (including "0 rows written" if every week's prices came back empty, or --since matched no
// weeks — both are reported, not hidden) · 2 structural failure (workbook shape did not match what was
// verified, OR --since was not a well-formed YYYY-MM-DD date — the report names the specific problem) ·
// 3 network failure (page or workbook download failed).

import { writeFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  parseSheetNames,
  parseSharedStrings,
  iterateRows,
  resolveHeaderBlocks,
  extractEuSeries,
  OilBulletinStructureError,
} from "../../../src/lib/market/oil-bulletin-workbook.mjs";

const BULLETIN_PAGE_URL = "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en";
const PAGE_ORIGIN = "https://energy.ec.europa.eu";
// Known-stable as of both 2026-08-30 verification reads — used ONLY if the page scrape below finds no
// "Prices_History" link, and only with an explicit stderr warning that the fallback fired.
const FALLBACK_XLSX_URL =
  "https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en" +
  "?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx";

const PRICE_SHEET_NAME = "Prices wo taxes"; // this producer's parser reports pre-tax EU-average prices
const UNZIP_MAX_BUFFER = 200 * 1024 * 1024; // xl/sharedStrings.xml + the price sheet can run several MB

const SINCE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Large enough to retrieve every data row the "Prices wo taxes" sheet holds (weekly since 2005 is on the
// order of ~1,100 rows at 2026 — see the header note above) without hand-maintaining a count that has to
// grow every year. extractEuSeries's own slice(0, weeks) is safe against a `weeks` larger than the
// available row count: it simply returns everything (pinned by
// src/__tests__/oil-bulletin-workbook.test.mjs's own "weeks: 10" tests against a 3-row fixture).
export const SINCE_ALL_WEEKS = 100000;

/** @param {string[]} argv (process.argv shape: [node, script, ...args]) */
export function parseArgs(argv) {
  const args = argv.slice(2);
  const weeksIdx = args.indexOf("--weeks");
  const outIdx = args.indexOf("--out");
  const sinceIdx = args.indexOf("--since");
  const weeks = weeksIdx >= 0 ? Number(args[weeksIdx + 1]) : 1;
  const since = sinceIdx >= 0 ? args[sinceIdx + 1] : null;
  return {
    weeks: Number.isInteger(weeks) && weeks > 0 ? weeks : 1,
    outPath: outIdx >= 0 ? args[outIdx + 1] : null,
    since: since ?? null,
  };
}

/**
 * Every EuWeekRow whose week_ending is on or after `since` (inclusive), from a list already sorted
 * most-recent-first (extractEuSeries's own contract). Pure — no fs, no fetch, no clock read: "now" is
 * whatever the workbook's own latest row says, never `new Date()`.
 * @param {Array<{week_ending: string}>} series @param {string|null} since ISO YYYY-MM-DD, or null (no filter)
 */
export function filterSince(series, since) {
  if (!since) return series;
  return series.filter((w) => w.week_ending >= since);
}

/** Scrapes BULLETIN_PAGE_URL's HTML for an <a href="..."> whose filename query param contains
 *  "Prices_History". Returns an absolute URL, or null if none is found. */
function findPricesHistoryLink(html) {
  const hrefRe = /href="([^"]+)"/g;
  let m;
  while ((m = hrefRe.exec(html))) {
    const href = m[1];
    if (/Prices_History/i.test(href)) {
      if (/^https?:\/\//i.test(href)) return href;
      if (href.startsWith("/")) return PAGE_ORIGIN + href;
      return `${PAGE_ORIGIN}/${href}`;
    }
  }
  return null;
}

async function resolveXlsxUrl() {
  let html;
  try {
    const res = await fetch(BULLETIN_PAGE_URL, { headers: { accept: "text/html" } });
    if (!res.ok) {
      console.error(`fetch-oil-bulletin: page fetch failed ${res.status} ${res.statusText} — falling back to the known xlsx URL.`);
      return FALLBACK_XLSX_URL;
    }
    html = await res.text();
  } catch (err) {
    console.error(`fetch-oil-bulletin: page fetch threw (${err.message}) — falling back to the known xlsx URL.`);
    return FALLBACK_XLSX_URL;
  }
  const found = findPricesHistoryLink(html);
  if (found) return found;
  console.error(
    'fetch-oil-bulletin: WARNING — no link containing "Prices_History" found on the bulletin page; ' +
      "falling back to the known (2026-08-30-verified) UUID URL. If this fires on a real run, the page's " +
      "structure has likely changed and this script's scrape needs a look.",
  );
  return FALLBACK_XLSX_URL;
}

async function downloadXlsx(url, destPath) {
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new NetworkError(`xlsx download threw: ${err.message}`);
  }
  if (!res.ok) throw new NetworkError(`xlsx download failed ${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  return buf.length;
}

class NetworkError extends Error {}

/** `unzip -p <archive> <entry>` -> the entry's text content, decoded as UTF-8. Throws a named error
 *  (never returns a partial/garbled read) if the entry is missing or unzip fails. */
function unzipEntry(archivePath, entryPath) {
  const res = spawnSync("unzip", ["-p", archivePath, entryPath], { maxBuffer: UNZIP_MAX_BUFFER });
  if (res.error) {
    throw new OilBulletinStructureError(`unzip could not run (${res.error.message}) — is the 'unzip' binary installed on this runner?`);
  }
  // unzip -p exit codes: 0 = ok, 11 = no matching files found, other nonzero = warning/error.
  if (res.status === 11 || (res.status !== 0 && (res.stdout?.length ?? 0) === 0)) {
    throw new OilBulletinStructureError(
      `xlsx archive has no entry "${entryPath}" (unzip exit ${res.status}: ${String(res.stderr || "").trim()})`,
    );
  }
  return res.stdout.toString("utf8");
}

function report(headerResolution, series) {
  console.error(`fetch-oil-bulletin: resolved sheet "${PRICE_SHEET_NAME}"`);
  console.error(`fetch-oil-bulletin: date column = ${headerResolution.dateCol}, EU block = "${headerResolution.euBlock.name}"`);
  for (const c of headerResolution.euBlock.columns) {
    console.error(`fetch-oil-bulletin:   EU column ${c.col} "${c.headerText}" -> ${c.slug ?? "UNMAPPED (warning)"}`);
  }
  for (const w of headerResolution.warnings) console.error(`fetch-oil-bulletin: [header warning] ${w}`);
  for (const week of series) {
    console.error(`fetch-oil-bulletin: week ${week.week_ending}:`);
    for (const [slug, price] of Object.entries(week.prices)) console.error(`fetch-oil-bulletin:   ${slug} = ${price}`);
    for (const w of week.warnings) console.error(`fetch-oil-bulletin: [row warning] ${w}`);
  }
}

function toCsv(series) {
  const lines = ["week_ending;product;price_eur"];
  for (const week of series) {
    for (const [slug, price] of Object.entries(week.prices)) lines.push(`${week.week_ending};${slug};${price}`);
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const { weeks, outPath, since } = parseArgs(process.argv);

  if (since !== null && !SINCE_DATE_RE.test(since)) {
    console.error(`fetch-oil-bulletin: BAD ARGUMENT — --since "${since}" is not a well-formed YYYY-MM-DD date (exit 2).`);
    process.exit(2);
  }

  const xlsxUrl = await resolveXlsxUrl();
  console.error(`fetch-oil-bulletin: xlsx URL = ${xlsxUrl}`);

  const tmpDir = mkdtempSync(join(tmpdir(), "oil-bulletin-"));
  const xlsxPath = join(tmpDir, "weekly-oil-bulletin.xlsx");
  try {
    let bytes;
    try {
      bytes = await downloadXlsx(xlsxUrl, xlsxPath);
    } catch (err) {
      if (err instanceof NetworkError) {
        console.error(`fetch-oil-bulletin: NETWORK FAILURE — ${err.message}`);
        process.exit(3);
      }
      throw err;
    }
    console.error(`fetch-oil-bulletin: downloaded ${bytes} bytes to ${xlsxPath}`);

    const workbookXml = unzipEntry(xlsxPath, "xl/workbook.xml");
    const relsXml = unzipEntry(xlsxPath, "xl/_rels/workbook.xml.rels");
    const sharedStringsXml = unzipEntry(xlsxPath, "xl/sharedStrings.xml");

    const sheetNames = parseSheetNames(workbookXml, relsXml);
    const sheetPath = sheetNames[PRICE_SHEET_NAME];
    if (!sheetPath) {
      throw new OilBulletinStructureError(
        `workbook has no sheet named "${PRICE_SHEET_NAME}" — sheets present: ${Object.keys(sheetNames).join(", ")}`,
      );
    }
    console.error(`fetch-oil-bulletin: "${PRICE_SHEET_NAME}" -> ${sheetPath}`);

    const sheetXml = unzipEntry(xlsxPath, sheetPath);
    const sharedStrings = parseSharedStrings(sharedStringsXml);

    const rows = [...iterateRows(sheetXml)];
    const cellsFor = (n) => rows.find((r) => r.rowIndex === n)?.cells ?? [];
    const headerResolution = resolveHeaderBlocks(cellsFor(1), cellsFor(2), cellsFor(3), sharedStrings);

    const rawSeries = extractEuSeries(sheetXml, sharedStrings, headerResolution, { weeks: since ? SINCE_ALL_WEEKS : weeks });
    const series = filterSince(rawSeries, since);
    if (since) {
      console.error(`fetch-oil-bulletin: --since ${since} — ${rawSeries.length} week(s) parsed from the workbook, ${series.length} on/after ${since}`);
    }
    report(headerResolution, series);

    const csv = toCsv(series);
    const totalRows = series.reduce((n, w) => n + Object.keys(w.prices).length, 0);
    console.error(`fetch-oil-bulletin: wrote ${totalRows} CSV row(s) across ${series.length} week(s)${outPath ? ` to ${outPath}` : " to stdout"}`);

    if (outPath) writeFileSync(outPath, csv);
    else process.stdout.write(csv);

    process.exit(0);
  } catch (err) {
    if (err instanceof OilBulletinStructureError) {
      console.error(`fetch-oil-bulletin: STRUCTURAL FAILURE — ${err.message}`);
      process.exit(2);
    }
    throw err;
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
  }
}

// Only run main() when this file is the actual CLI entrypoint. FIXED 2026-09-02 (Lane PROD,
// system-completion train): this file previously called main() unconditionally at module scope — unlike
// ecb-fx-producer.mjs and eia-v2-petroleum-spot-producer.mjs, which already guard this exact way — so
// merely IMPORTING it (e.g. to test parseArgs/filterSince/SINCE_ALL_WEEKS as pure functions, added this
// same commit) triggered a real live network fetch as a side effect, which fails in any sandboxed
// environment (confirmed: fetch-oil-bulletin.test.mjs's own first run here exited 3, NETWORK FAILURE,
// before a single test() body ran). No behavioural change for the CLI path: `node
// scripts/producers/market/fetch-oil-bulletin.mjs ...` still sets process.argv[1] to this file, so main()
// still runs exactly as before for every real invocation (producers.yml's own step included).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
