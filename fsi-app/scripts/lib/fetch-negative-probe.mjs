// D3 living-set probe — the "non-answer-as-negative" bug class.
//
// THE BUG CLASS (found THREE times, three operations -> characteristic, not exhausted):
//   a fetch that FAILED TO ANSWER (4xx/5xx/timeout/dns/abort/empty body) is scored as a
//   SUBSTANTIVE NEGATIVE conclusion (unreachable / dead / fabricated / excluded /
//   inaccessible / rejected) instead of INCONCLUSIVE. "method-failed-to-answer
//   != answer-is-negative" (the fetchOk principle).
//   Confirmed instances: (1) the ~420 reachability rejection; (2) the recovery 429/500
//   classification; (3) the fabrication detector audit-optionc-reachability
//   (UNREACHABLE -> FABRICATED_URL).
//
// SCOPE (operator ruling): fetch-DRIVEN classifications are guilty-until-proven; role-/
// metadata-derived ones (base_tier from source_role) are already proven sound and are NOT
// swept. This probe only looks where a FETCH RESULT drives the conclusion.
//
// THREE REQUIREMENTS this satisfies (or it is not a real sweep):
//   1. SEMANTIC not signature — it locates each fetch-FAILURE HANDLER (catch / !ok /
//      status-error / .catch(->neg) / BrowserlessError) and asks what that handler
//      CONCLUDES, rather than grepping the three known string mappings.
//   2. COMPLETE COVERAGE — it rides the D3 surface registry (routes, workers, crons,
//      build/seed runners, lib, edge) and emits the walked/not_walked coverage block, so
//      a class it did NOT search is visible, not silently absent. (Two of three confirmed
//      instances lived in .mjs runners — a src/-only sweep is blind exactly there.)
//   3. KNOWN-ANSWER + honest residual — it must re-catch all three confirmed; it states
//      what a sufficiently-obfuscated instance can still evade.
//
// HONEST DEPTH: the failure-handler -> conclusion link is matched by a token lexicon over
// a brace-bounded window. A mapping that reaches its negative conclusion through an
// indirection the lexicon does not name (a helper that returns a negative, a numeric
// sentinel, a downstream caller that interprets a thrown error as negative) is NOT caught
// here — that residual is stated, never papered over. Flags are CANDIDATES for semantic
// review, not verdicts.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SURFACE_CLASSES, discoverSurfaces, emptyCoverage, validateCoverage } from "./surface-registry.mjs";

// A file is IN SCOPE only if it actually performs an outbound fetch whose result is read.
const FETCH_EGRESS = /\b(?:fetch|browserlessFetch|browserlessRender|fetchViaApi|fetchContent|checkReachability|fetchRss)\s*\(/;

// Failure-handler anchors: where a fetch outcome's failure path begins.
const FAILURE_ANCHORS = [
  { id: "catch",            re: /\bcatch\s*\(/ },
  { id: "not-ok",           re: /!\s*\w+\.ok\b|\.ok\s*===\s*false|\bif\s*\(\s*!\s*res\b/ },
  { id: "status-error",     re: /status\s*(?:>=|>)\s*(?:400|300|500)|status\s*===\s*0\b|status\s*!==\s*200|statusCode\s*>=\s*400/ },
  { id: "browserless-err",  re: /instanceof\s+BrowserlessError|\bBrowserlessError\b/ },
  { id: "abort-timeout",    re: /AbortError|\.abort\s*\(|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|hard-timeout|timeout/i },
  { id: "inline-catch-neg", re: /\.catch\s*\(\s*(?:\(\s*\)|\w+|\([^)]*\))\s*=>\s*(?:false|null|0|\(\s*\{[^}]*ok\s*:\s*false)/ },
];

// SUBSTANTIVE-NEGATIVE conclusion lexicon — a fetch failure resolving to one of these is
// the bug (a corpus/classification decision, not a non-answer).
const NEGATIVE = [
  /unreachable/i, /\bdead\b/i, /dead_link/i, /\bbroken\b/i, /fabricat/i, /inaccessible/i,
  /not[_-]?accessible/i, /reachable\s*[:=]\s*false/i, /accessible\s*[:=]\s*false/i,
  /accessibility_verified\s*[:=]\s*false/i, /is_?reachable\s*[:=]\s*false/i,
  /\bexclud/i, /\breject/i, /quarantin/i, /not[_-]?found\b/i, /\binvalid\b/i,
  /classification\s*=\s*["']UNREACHABLE/i, /return\s+["']FABRICATED/i,
  /status\s*[:=]\s*["'](?:dead|error|unreachable|failed)/i,
];
// INCONCLUSIVE resolution lexicon — a fetch failure resolving to one of these is SOUND.
const INCONCLUSIVE = [
  /\bthrow\b/, /INCONCLUSIVE/i, /\binconclusive/i, /\bunknown\b/i, /\bretry\b/i, /retries/i,
  /backoff/i, /\bskip/i, /\bcontinue\b/, /VerifyError/, /UNCONFIRMABLE/i, /re-?render/i,
  /spaced/i, /longer timeout/i,
];

// KNOWN-ANSWER set — the probe MUST surface each of these files (it is blind if it does
// not). Per-file: is the CURRENT state still corrupt, or fixed-to-sound (we still must SEE
// it). expectFlag=true => probe must flag at least one site here.
export const KNOWN_ANSWERS = [
  { file: "scripts/audit-optionc-reachability.mjs", note: "fabrication detector: UNREACHABLE -> FABRICATED_URL (confirmed CORRUPT, live)" },
  { file: "src/lib/sources/verification.ts",        note: "reachability/check-source path (the ~420 origin); D1 swapped the fetch method — verify the FAILURE->negative mapping too" },
  { file: "scripts/recovery-measure.mjs",           note: "recovery classification (corrected this session to inconclusive-5xx — must still be SEEN to confirm it stayed sound)" },
];

const NEG_WINDOW = 14; // lines after an anchor to scan for its conclusion

export function findFetchNegativeMappings(text, file) {
  if (!FETCH_EGRESS.test(text)) return []; // not a fetch site at all
  const lines = text.split(/\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const anchor = FAILURE_ANCHORS.find((a) => a.re.test(lines[i]));
    if (!anchor) continue;
    const window = lines.slice(i, Math.min(lines.length, i + NEG_WINDOW)).join("\n");
    const neg = NEGATIVE.filter((re) => re.test(window)).map((re) => re.source.slice(0, 22));
    const inc = INCONCLUSIVE.filter((re) => re.test(window)).map((re) => re.source.slice(0, 18));
    if (neg.length === 0 && anchor.id !== "inline-catch-neg") continue; // no negative conclusion nearby -> not this bug
    let verdict;
    if (anchor.id === "inline-catch-neg") verdict = "CANDIDATE_CORRUPT";
    else if (neg.length > 0 && inc.length === 0) verdict = "CANDIDATE_CORRUPT";
    else if (neg.length > 0 && inc.length > 0) verdict = "REVIEW"; // mixed — read it
    else verdict = "CANDIDATE_SOUND";
    hits.push({ file, line: i + 1, anchor: anchor.id, neg, inc, verdict, snippet: lines[i].trim().slice(0, 100) });
  }
  return hits;
}

export function auditFetchNegative(root) {
  const surfaces = discoverSurfaces(root);
  const cov = emptyCoverage("fetch-failure -> substantive-negative probe (surface-enumerated; failure-handler window + lexicon)");
  const allHits = [];
  for (const cls of SURFACE_CLASSES) {
    const files = surfaces[cls.id];
    if (cls.id === "crons") { cov.walked.push({ class: "crons", note: "scheduler config; scheduled surface audited under its own class", count: files.length }); continue; }
    if (!cls.hostsFetch) { cov.not_walked.push({ class: cls.id, count: files.length, reason: cls.reason }); continue; }
    let fetchFiles = 0, flaggedHere = 0;
    for (const rel of files) {
      let text;
      try { text = readFileSync(resolve(root, rel), "utf8"); }
      catch { cov.cannot_see.push({ class: cls.id, file: rel, reason: "unreadable" }); continue; }
      const hits = findFetchNegativeMappings(text, rel);
      if (FETCH_EGRESS.test(text)) fetchFiles++;
      if (hits.length) { allHits.push(...hits); flaggedHere += hits.filter((h) => h.verdict !== "CANDIDATE_SOUND").length; }
    }
    cov.walked.push({ class: cls.id, files: files.length, fetch_sites: fetchFiles, flagged: flaggedHere });
  }
  // known-answer check
  const known = KNOWN_ANSWERS.map((k) => ({ ...k, surfaced: allHits.some((h) => h.file === k.file) }));
  cov.assumptions_unverified.push(
    "RESIDUAL: the failure-handler -> conclusion link is a token lexicon over a 14-line brace-window. A fetch-failure that reaches a negative conclusion via an UNNAMED indirection evades this probe: (a) a helper fn that returns the negative, called in the catch; (b) a numeric/enum sentinel not in NEGATIVE; (c) a thrown error a DOWNSTREAM caller interprets as negative (the throw reads INCONCLUSIVE here but the caller corrupts it); (d) a negative default further than 14 lines from the anchor. These need the living set + human trace, not this probe.",
    "SCOPE: only fetch-driven classifications are swept. Role-/metadata-derived classifications (base_tier <- source_role) are excluded as already-proven-sound (not fetch-dependent).",
    "flags are CANDIDATES for semantic review; CANDIDATE_SOUND means the failure path shows an inconclusive resolution NEAR the anchor, not a proof the whole dataflow is sound."
  );
  return { coverage: cov, hits: allHits, known, completeness: validateCoverage(cov) };
}

// ── runnable ──────────────────────────────────────────────────────────────────
if (/fetch-negative-probe\.mjs$/.test(process.argv[1]?.replace(/\\/g, "/") || "")) {
  const root = resolve(process.argv[2] || ".");
  const { coverage, hits, known, completeness } = auditFetchNegative(root);
  const corrupt = hits.filter((h) => h.verdict === "CANDIDATE_CORRUPT");
  const review = hits.filter((h) => h.verdict === "REVIEW");
  const sound = hits.filter((h) => h.verdict === "CANDIDATE_SOUND");

  console.log("=== fetch-failure -> substantive-negative probe ===\n");
  console.log(`coverage complete: ${completeness.complete}${completeness.missing.length ? " MISSING: " + completeness.missing.join(",") : ""}`);
  console.log("\n-- coverage block --"); console.dir(coverage, { depth: 5 });

  console.log("\n-- KNOWN-ANSWER re-catch (probe is blind if any surfaced=false) --");
  for (const k of known) console.log(`  ${k.surfaced ? "SEEN " : "BLIND"}  ${k.file}  — ${k.note}`);

  const show = (label, arr) => {
    console.log(`\n-- ${label}: ${arr.length} --`);
    for (const h of arr) console.log(`  ${h.file}:${h.line} [${h.anchor}] neg=[${h.neg.join("|")}] inc=[${h.inc.join("|")}]\n      ${h.snippet}`);
  };
  show("CANDIDATE_CORRUPT (fetch-fail -> negative, no inconclusive nearby)", corrupt);
  show("REVIEW (both negative + inconclusive tokens — read it)", review);
  show("CANDIDATE_SOUND (fetch-fail near an inconclusive resolution)", sound);

  console.log(`\n=== ${corrupt.length} candidate-corrupt, ${review.length} review, ${sound.length} sound across ${new Set(hits.map(h=>h.file)).size} files ===`);
}
