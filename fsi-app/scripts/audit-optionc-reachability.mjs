// PART 1 B audit — reachability + page-content check on the 19 Option C items
// whose source_url is NOT cited in their s15 block.
//
// Per item, per s15 URL:
//   1. HEAD request: alive (2xx/3xx that ends 2xx) or unreachable (4xx/5xx/timeout/dns).
//   2. If HEAD ok and content-type is HTML, GET + extract <title>.
//   3. Compare extracted title against the cited "Title" cell in the s15 markdown row.
//
// Failure classes:
//   FABRICATED_URL — HEAD non-2xx or follows redirect to a generic landing (host root).
//   FABRICATED_METADATA — URL alive but page title doesn't loosely match s15 row title.
//   CLEAN — URL alive AND title roughly matches.
//   SKIPPED — non-HTML content type (PDF, etc.) where we can only confirm reachability.
//
// Read-only. Writes report to /tmp/optionc-b-audit.txt. No model calls. No DB writes.

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

import { tmpdir } from "node:os";
import { join } from "node:path";
const ITEMS_PATH = join(tmpdir(), "optionc-items.json");
const S15_PATH = join(tmpdir(), "optionc-s15.json");
const REPORT_PATH = join(tmpdir(), "optionc-b-audit.txt");

function loadSupabaseRows(path) {
  const raw = readFileSync(path, "utf8");
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  return JSON.parse(raw.slice(firstBrace, lastBrace + 1)).rows || [];
}

const items = loadSupabaseRows(ITEMS_PATH);
const s15Rows = loadSupabaseRows(S15_PATH);

const URL_RE = /https?:\/\/[^\s|)`<>"\]]+/g;

function hostOf(u) {
  try { return new URL(u).hostname.toLowerCase(); } catch { return null; }
}

// Filter to the 19 source-not-in-s15 items.
const nonCiting = [];
for (const item of items) {
  const sourceUrl = item.source_url === "(none)" ? null : item.source_url;
  const sourceHost = sourceUrl ? hostOf(sourceUrl) : null;
  const s15 = s15Rows.find((r) => r.uuid === item.uuid)?.content_md || "";
  const urls = [...new Set([...s15.matchAll(URL_RE)].map((x) => x[0]))];
  const hostMatch = urls.some((u) => {
    const h = hostOf(u);
    return h && sourceHost && h === sourceHost;
  });
  if (!hostMatch) {
    nonCiting.push({ ...item, s15, urls });
  }
}

console.log(`[B-audit] non-source-citing items: ${nonCiting.length}`);

// Parse s15 markdown rows: "| N | Title | Type ... | URL |"
// Capture each row's title and the URL it contains.
function extractS15Rows(s15) {
  const lines = s15.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const rows = [];
  let sawSeparator = false;
  let headerSkipped = false;
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(line)) {
      sawSeparator = true;
      continue;
    }
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }
    if (!sawSeparator) continue;
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c, i, arr) => !(c === "" && (i === 0 || i === arr.length - 1)));
    if (cells.length === 0) continue;
    const titleIdx = /^\d+$/.test(cells[0]) && cells.length > 1 ? 1 : 0;
    const title = cells[titleIdx] || "";
    let url = null;
    for (let i = cells.length - 1; i > titleIdx; i--) {
      URL_RE.lastIndex = 0;
      const m = URL_RE.exec(cells[i]);
      URL_RE.lastIndex = 0;
      if (m) { url = m[0]; break; }
    }
    if (url) rows.push({ title, url });
  }
  return rows;
}

const UA = "Mozilla/5.0 (Caro's Ledge audit script; contact admin@carosledge.com)";

async function checkUrl(url) {
  const result = { url, status: null, finalUrl: null, host: hostOf(url), title: null, classification: null };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": UA, "Accept": "text/html,*/*" },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    result.status = resp.status;
    result.finalUrl = resp.url;
    const ct = resp.headers.get("content-type") || "";
    if (resp.ok && ct.includes("text/html")) {
      const body = await resp.text();
      const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body);
      if (m) result.title = m[1].replace(/\s+/g, " ").trim().slice(0, 300);
    } else if (resp.ok) {
      result.title = `(non-HTML: ${ct.split(";")[0]})`;
    }
  } catch (e) {
    result.classification = "UNREACHABLE";
    result.title = `(${e.name}: ${e.message?.slice(0, 100)})`;
  }
  return result;
}

function classifyResult(check, cited) {
  if (check.classification === "UNREACHABLE") return "FABRICATED_URL";
  if (check.status >= 400) return "FABRICATED_URL";
  // Final URL == host root after redirect from specific path = generic landing
  if (check.finalUrl && check.host) {
    try {
      const original = new URL(check.url);
      const final = new URL(check.finalUrl);
      if (original.pathname.length > 3 && final.pathname.length <= 2 && original.hostname === final.hostname) {
        return "FABRICATED_URL"; // redirected to home
      }
    } catch {}
  }
  if (check.title && check.title.startsWith("(non-HTML:")) return "CLEAN_NON_HTML";

  if (!check.title) return "UNVERIFIABLE_NO_TITLE";

  // Loose title match: any of the first 4+ char words in cited title appear in extracted title.
  const citedNorm = (cited || "").toLowerCase().replace(/[^\w\s]/g, " ");
  const extractedNorm = check.title.toLowerCase().replace(/[^\w\s]/g, " ");
  const citedTokens = citedNorm.split(/\s+/).filter((w) => w.length >= 4);
  if (citedTokens.length === 0) return "UNVERIFIABLE_TITLE_TOO_SHORT";
  const matched = citedTokens.filter((t) => extractedNorm.includes(t)).length;
  const ratio = matched / citedTokens.length;
  if (ratio >= 0.3) return "CLEAN";
  return "FABRICATED_METADATA";
}

writeFileSync(REPORT_PATH, `Option C Part 1 B audit — reachability + page-content check\n=================\n\n`, "utf8");

const tally = {
  items_audited: 0,
  urls_audited: 0,
  CLEAN: 0,
  CLEAN_NON_HTML: 0,
  FABRICATED_URL: 0,
  FABRICATED_METADATA: 0,
  UNVERIFIABLE_NO_TITLE: 0,
  UNVERIFIABLE_TITLE_TOO_SHORT: 0,
};

const itemsWithProblems = [];

for (const item of nonCiting) {
  tally.items_audited++;
  const s15Rows = extractS15Rows(item.s15);
  const itemReport = [`\n--- ITEM ${item.legacy_id !== "-" ? item.legacy_id : item.uuid.slice(0, 8)} [${item.pri}] ---`];
  itemReport.push(`source_url: ${item.source_url}`);
  itemReport.push(`s15 rows: ${s15Rows.length}`);
  const problems = [];

  for (const row of s15Rows) {
    tally.urls_audited++;
    const check = await checkUrl(row.url);
    const cls = classifyResult(check, row.title);
    tally[cls] = (tally[cls] || 0) + 1;
    const flag = cls === "FABRICATED_URL" || cls === "FABRICATED_METADATA" ? " *** " : "    ";
    itemReport.push(`${flag}${cls.padEnd(20)} | ${check.status ?? "ERR"} | ${(row.title || "").slice(0, 60).padEnd(60)} | actual: ${(check.title || "").slice(0, 80)}`);
    if (cls === "FABRICATED_URL" || cls === "FABRICATED_METADATA") {
      problems.push({ cls, cited: row.title, url: row.url, actual: check.title, status: check.status });
    }
    await sleep(150); // courtesy throttle
  }

  if (problems.length > 0) {
    itemsWithProblems.push({ id: item.legacy_id !== "-" ? item.legacy_id : item.uuid.slice(0, 8), pri: item.pri, problems });
  }

  appendFileSync(REPORT_PATH, itemReport.join("\n") + "\n", "utf8");
  process.stdout.write(`[B-audit] ${tally.items_audited}/${nonCiting.length} done\n`);
}

appendFileSync(REPORT_PATH, "\n\n=== TALLY ===\n", "utf8");
appendFileSync(REPORT_PATH, JSON.stringify(tally, null, 2) + "\n", "utf8");

console.log("\n=== TALLY ===");
console.log(JSON.stringify(tally, null, 2));
console.log(`\nItems with ≥1 fabrication-class flag: ${itemsWithProblems.length}`);
for (const r of itemsWithProblems) {
  console.log(`  [${r.pri}] ${r.id}: ${r.problems.length} flag(s)`);
  for (const p of r.problems) {
    console.log(`    ${p.cls}: cited "${(p.cited || "").slice(0, 60)}" / actual "${(p.actual || "").slice(0, 60)}"`);
  }
}
console.log(`\nFull report: ${REPORT_PATH}`);
