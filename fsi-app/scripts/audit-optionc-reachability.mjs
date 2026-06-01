// PART 1 B audit — reachability + page-content check.
//
// CLASS FIX 2026-06-01 (non-answer-as-negative, bug-class site #5). THE BUG: this detector
// mapped UNREACHABLE (a plain 15s bot-blockable fetch's 4xx/5xx/TIMEOUT/dns) -> FABRICATED_URL,
// and its output DROVE AN ARCHIVING DECISION (16 regulations archived 2026-05-29, incl. core
// assets IMO/EPA/MARPOL). A fetch that FAILED TO ANSWER is INCONCLUSIVE, never fabricated.
// FIX: (1) fetch via the canonical Browserless render (not a plain bot-blockable fetch);
// (2) a render failure / 429 / 5xx / timeout -> INCONCLUSIVE, only a rendered error/404 page
// -> FABRICATED_URL, a rendered page whose title diverges -> FABRICATED_METADATA.
// DE-ALLOWLIST: this file was left on plain fetch in D1 as a "reachability diagnostic." That
// was WRONG — its result archives regulations, so it is a DECISION-DRIVING fetch and must use
// the canonical path. It is no longer on the legitimate-plain-fetch allowlist.
//
// Read-only (classification only). No DB writes from this file.

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { browserlessFetch, BrowserlessError } from "../src/lib/sources/canonical-fetch.mjs";

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

// Run the audit ONLY when invoked directly — importing checkUrl/classifyResult (e.g. from
// the re-check + selftest) must be SIDE-EFFECT-FREE (no /tmp reads, no 287 Browserless calls).
const IS_MAIN = /audit-optionc-reachability\.mjs$/.test((process.argv[1] || "").replace(/\\/g, "/"));

const items = IS_MAIN ? loadSupabaseRows(ITEMS_PATH) : [];
const s15Rows = IS_MAIN ? loadSupabaseRows(S15_PATH) : [];

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

export async function checkUrl(url, render = browserlessFetch) {
  const result = { url, status: null, errored: false, host: hostOf(url), title: null };
  try {
    // CLASS FIX: canonical Browserless render, NOT a plain bot-blockable fetch. A throw
    // (render failure / 429 / 5xx / timeout) is a NON-ANSWER -> errored=true -> INCONCLUSIVE.
    const r = await render(url, { maxTextLength: 4000, gotoTimeoutMs: 30000 });
    result.status = r.status;
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(r.html || r.text || "");
    if (m) result.title = m[1].replace(/\s+/g, " ").trim().slice(0, 300);
  } catch (e) {
    result.errored = true; // the fetchOk distinction: a non-answer, NOT a fabrication
    result.status = e instanceof BrowserlessError ? (e.status ?? null) : null;
    result.title = `(${e?.name}: ${(e?.message || "").slice(0, 100)})`;
  }
  return result;
}

export function classifyResult(check, cited) {
  // CLASS FIX (non-answer != negative): a render failure / 429 / 5xx / timeout is
  // INCONCLUSIVE — the detector could not get an answer; it is NOT evidence of fabrication.
  if (check.errored) return "INCONCLUSIVE";
  // Rendered an error / not-found page => the cited page genuinely does not exist.
  const t = (check.title || "").toLowerCase();
  if (/\b(404|not found|page not found|forbidden|unexpected error|error 5\d\d)\b/.test(t) &&
      !(cited || "").toLowerCase().includes("error")) {
    return "FABRICATED_URL";
  }
  if (!check.title) return "UNVERIFIABLE_NO_TITLE";
  // Rendered a real page: title-divergence is genuine FABRICATED_METADATA (the page exists,
  // the cited title does not match it) — no longer confounded by bot-block error-page titles.
  const citedNorm = (cited || "").toLowerCase().replace(/[^\w\s]/g, " ");
  const extractedNorm = t.replace(/[^\w\s]/g, " ");
  const citedTokens = citedNorm.split(/\s+/).filter((w) => w.length >= 4);
  if (citedTokens.length === 0) return "UNVERIFIABLE_TITLE_TOO_SHORT";
  const matched = citedTokens.filter((tok) => extractedNorm.includes(tok)).length;
  return matched / citedTokens.length >= 0.3 ? "CLEAN" : "FABRICATED_METADATA";
}

// PRE-FIX classifier, retained ONLY as the mutation-check baseline (proves the new
// assertion discriminates). Faithful to the bug: a non-answer -> FABRICATED_URL.
export function classifyResult_LEGACY_BUGGY(check) {
  if (check.errored) return "FABRICATED_URL";     // BUG: timeout/429/5xx -> fabricated
  if (check.status >= 400) return "FABRICATED_URL"; // BUG: any 4xx/5xx -> fabricated
  return check.title ? "CLEAN" : "UNVERIFIABLE_NO_TITLE";
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
