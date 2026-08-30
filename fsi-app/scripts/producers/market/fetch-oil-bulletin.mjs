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
// environment that actually performed the two verification reads below.
//
// WRITES NOTHING. This script has no kill switch of its own and needs no DB credentials — it fetches,
// parses, prints a report to stderr, and prints CSV to stdout (or --out). The write gates (--apply +
// MARKET_PRODUCER_EU_OIL_BULLETIN_ENABLED) stay entirely inside eu-weekly-oil-bulletin.mjs, unchanged.
// Compose the two:
//   node scripts/producers/market/fetch-oil-bulletin.mjs \
//     | node scripts/producers/market/eu-weekly-oil-bulletin.mjs --apply
//
// VERIFIED PRIMARY-SOURCE EVIDENCE (two independent GitHub-runner inspection runs, 2026-08-30, that
// downloaded the live file):
//   * The bulletin page (BULLETIN_PAGE_URL below) carries a link whose filename contains
//     "Prices_History" — "Price developments 2005 onwards", ~4.25 MB, page-dated 27 August 2026. This
//     script scrapes the page for that link rather than hardcoding its UUID (the UUID has been stable
//     across both reads, but the page is the durable address); if scraping finds no such link, it falls
//     back to the known UUID URL (FALLBACK_XLSX_URL below) and SAYS SO on stderr — never silently.
//   * The .xlsx's xl/workbook.xml lists "Prices with taxes" (sheetId=2, r:id=rId1) and "Prices wo taxes"
//     (sheetId=3, r:id=rId2) among its sheets; xl/_rels/workbook.xml.rels maps rId1->worksheets/sheet1.xml,
//     rId2->worksheets/sheet2.xml. This script always resolves "Prices wo taxes" by name through that
//     mapping (oil-bulletin-workbook.mjs's parseSheetNames) — never by assumed sheet order or a
//     hardcoded "sheet2.xml" path, since nothing in the verified evidence guarantees that stays sheet 2.
//   * Full structural detail (3 header rows, repeating country-block column layout, the EU-average
//     block, footer-row shape, date-cell ambiguity) is documented in oil-bulletin-workbook.mjs's own
//     header — this script is a thin I/O shell around that pure module; see it for the actual parsing
//     contract and citations.
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
// Usage:
//   node scripts/producers/market/fetch-oil-bulletin.mjs                # CSV on stdout, report on stderr
//   node scripts/producers/market/fetch-oil-bulletin.mjs --out path.csv # CSV written to path.csv instead
//   node scripts/producers/market/fetch-oil-bulletin.mjs --weeks 4      # latest 4 weeks instead of 1
// Exit 0 ok (including "0 rows written" if every week's prices came back empty — that is reported, not
// hidden) · 2 structural failure (workbook shape did not match what was verified — the report names the
// specific missing/unexpected piece) · 3 network failure (page or workbook download failed).

import { writeFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
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

function parseArgs(argv) {
  const args = argv.slice(2);
  const weeksIdx = args.indexOf("--weeks");
  const outIdx = args.indexOf("--out");
  const weeks = weeksIdx >= 0 ? Number(args[weeksIdx + 1]) : 1;
  return {
    weeks: Number.isInteger(weeks) && weeks > 0 ? weeks : 1,
    outPath: outIdx >= 0 ? args[outIdx + 1] : null,
  };
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
  const { weeks, outPath } = parseArgs(process.argv);

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

    const series = extractEuSeries(sheetXml, sharedStrings, headerResolution, { weeks });
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
