#!/usr/bin/env node

import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
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
 *  "Prices_History". Returns an absolute URL, or null if none is found.
 *  QUOTE-AGNOSTIC (accepts href="..." OR href='...'), same fix and same root cause class as
 *  ecb-fx-producer.mjs's parseEcbFxXml (see that file's own header REGRESSION note): this scrapes a live
 *  third-party HTML page (energy.ec.europa.eu), and HTML — unlike this codebase's own OOXML-parsing code
 *  in oil-bulletin-workbook.mjs, which reads exclusively Excel-generated XML that every known OOXML writer
 *  emits double-quoted — has no such generator guarantee: a double-quote-only href regex is exactly the
 *  same unverified-quoting assumption that broke on ECB's feed, just not yet observed breaking here. */
export function findPricesHistoryLink(html) {
  const hrefRe = /href\s*=\s*(?:"([^"]+)"|'([^']+)')/g;
  let m;
  while ((m = hrefRe.exec(html))) {
    const href = m[1] !== undefined ? m[1] : m[2];
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
