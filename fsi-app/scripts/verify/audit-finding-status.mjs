#!/usr/bin/env node
// audit-finding-status.mjs — enforce standing rule 14: every finding in docs/audits/
// carries an explicit verification-status token.
//
// WHY THIS EXISTS (2026-08-09). In one session, eight audit findings were stated to the
// operator as fact and then retracted under verification: a "truncation defect" that was
// real treaty text; a table reported as having no RLS that had RLS enabled; a privilege
// escalation the app already gated; "EUR-Lex is capture-dead" against 645 successful
// captures; a per-item cost estimate off by roughly 10x. None were careless reads — they
// were produced by a read-then-report pass that deferred verification, so hypotheses
// reached the operator wearing the clothes of conclusions. Operator ruling: that is not how
// an audit is run. A rule alone would not hold (this repo's own root-cause finding is "soft
// gates for hard rules"), so the rule gets a gate: this one.
//
// CHECK: in every docs/audits/*.md, each numbered or bulleted FINDING line must carry one of
// [CONFIRMED] / [HYPOTHESIS] / [REFUTED]. Prose, headings, tables, and code blocks are
// ignored — only finding-shaped lines are held to it.
//
// Report-only by default (so the historical backlog does not block work); pass --strict to
// fail the build. Wire strict once the backlog is labeled.
//
// SECOND CHECK, rule 13 (lane FLAG-1, 2026-10-09): a flag is a commitment, so a finding is not only
// labeled, it is DISPOSITIONED. Rule 13 had no enforcement: the AT-3/4/5 registers recorded owed legs
// and facts in passing that nobody turned into work, and the same defects surfaced days later by
// collision. Every finding line must carry exactly one disposition token:
//   [WORK: <lane id or PR N>]   it is being fixed or staged, by that lane or PR
//   [CLOSED: PR N]              it was fixed and merged by that PR
//   [REFUTED: <evidence>]       investigated and false (the evidence is mandatory)
//   [NOT-WORK: <reason>]        a fact that implies no action (the reason is mandatory)
// A bare or empty token is malformed and counts as no disposition; two tokens fail. A bare
// [REFUTED] is still the rule-14 STATUS token and is not a disposition. The finding lines held to it are
// the ones the status check already recognises, plus every top-level list line under a section headed
// Owed, Facts, Observed, Open, Not done or Residual (a fact recorded in passing is the thing rule 13
// retires). The scan is ONE site (collectOpenFindings) shared by this CLI and by the PreToolUse skill
// gate, which refuses a dispatch while any finding is undispositioned.
// SCOPE: audits and session logs dated 2026-10-01 or later (the last date in the path), plus any
// *register*.md under fsi-app/scripts/tmp/. An audit dated before the attack registers is out of scope on
// purpose: that backlog is the catalogue's owed list, not this gate's. An undated path is out of scope
// (rule 10 puts the date in the name). --strict fails on an undispositioned AUDIT finding or a
// contract/gate contradiction; session logs and registers are reported here and enforced by the dispatch
// gate. --all prints every offender instead of the first 25.
//
// ALSO: contractContradiction() fails when docs/dispatches/lane-common-contract.md tells a lane to stop
// on any hook block while the skill gate's own message tells it to load the named skills and retry.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from '../lib/is-main.mjs'; // task 0.3b: the Windows-safe CLI main guard

const STRICT = process.argv.includes("--strict");
const HERE = dirname(fileURLToPath(import.meta.url));
const AUDITS = join(HERE, "..", "..", "..", "docs", "audits");

// docs/audits/ is not flat — most dated audits live one level down in their own dated subdirectory
// (docs/audits/wiring-audit-2026-09-04/B1-modules.md, docs/audits/full-read-2026-08-31/L16-disc-B.md,
// etc: see docs/INDEX.md's own audits/ rows). A non-recursive listing (the original implementation)
// silently checked only the top-level .md files — 74 of 101 tracked audit files, leaving every
// subdirectory audit permanently unchecked no matter how many unlabeled findings it carried. Walked
// recursively here (bounded depth is unnecessary: docs/audits/ has no nesting deeper than one level
// today, and a deeper future audit should be checked too, not silently skipped again).
export function listAuditFiles(root) {
  const out = [];
  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".md")) out.push(relative(root, p));
    }
  };
  walk(root);
  return out;
}
// The token may carry explanatory text inside the brackets — "[CONFIRMED — pg introspection]"
// — because a bare token invites a rubber-stamp. The METHOD is the point: a CONFIRMED that
// cannot name how it was verified is a HYPOTHESIS wearing a badge.
const STATUS = /\[(CONFIRMED|HYPOTHESIS|REFUTED)\b[^\]]*\]/;

// A "finding line" = a numbered item or a bullet that makes a claim of defect. Heuristic and
// deliberately narrow: it must start as a list item AND contain a defect-ish marker. Prose
// bullets (context, method notes) are not findings and are not held to the rule.
const LIST = /^\s{0,3}(?:\d+\.|[-*])\s+/;
const DEFECTY = /\b(bug|defect|broken|fails?|failing|missing|never|unsafe|vulnerab|exposure|escalat|leak|wrong|incorrect|regress|deadlock|bypass|unwired|orphan|drops? (?:the )?error)\b/i;

// ---------------------------------------------------------------------------------------------
// Rule 13: disposition scan (FLAG-1). Pure functions over text, then one filesystem collector.
// ---------------------------------------------------------------------------------------------
export const DISPOSITION_FROM = "2026-10-01";
const SECTION_AUDIT = /\b(owed|facts|observed|open|not done|residual)\b/i;
const SECTION_LOG = /\b(not done|open items|open questions|residual)/i;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST_TOP = /^ {0,1}(?:\d+\.|[-*])\s+/;
const LIST_ANY = /^\s*(?:\d+\.|[-*])\s+/;
const DISP_TOKEN = /\[(WORK|CLOSED|NOT-WORK|REFUTED)(?::([^\]]*))?\]/g;
const PR_REF = /^PR\s*#?\d+$/i;
const LANE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** The last YYYY-MM-DD in a path, or null when the path carries no date. */
export function dateOfPath(rel) {
  const m = String(rel).match(/\d{4}-\d{2}-\d{2}/g);
  return m ? m[m.length - 1] : null;
}

/**
 * The disposition verdict for one finding's text: null when it carries exactly one well-formed
 * disposition token, else the reason it does not. A bare [REFUTED] is the rule-14 status token and is
 * skipped; every other bare or empty token is malformed.
 */
export function dispositionProblem(text) {
  const toks = [];
  for (const m of String(text).matchAll(DISP_TOKEN)) {
    if (m[1] === "REFUTED" && m[2] === undefined) continue;
    toks.push({ kind: m[1], arg: m[2] === undefined ? null : m[2].trim(), raw: m[0] });
  }
  if (toks.length === 0) return "no disposition";
  if (toks.length > 1) return "multiple dispositions";
  const { kind, arg, raw } = toks[0];
  if (arg === null || arg === "") return `malformed ${raw}: a reason or reference is mandatory`;
  if (kind === "CLOSED" && !PR_REF.test(arg)) return `malformed ${raw}: CLOSED names a PR (PR N)`;
  if (kind === "WORK" && !PR_REF.test(arg) && !LANE_ID.test(arg)) return `malformed ${raw}: WORK names a lane id or PR N`;
  return null;
}

/**
 * Every list item in a markdown text with its section context. Fenced code and tables are skipped. An
 * item is a list line plus the non-list lines that continue it, so a token wrapped onto the next line
 * still belongs to it.
 */
function parseItems(text, sectionRe) {
  const lines = text.split(/\r?\n/);
  const items = [];
  let inFence = false;
  let sectionLevel = 0; // 0 = not inside a matching section
  let cur = null;
  const flush = () => { if (cur) { items.push(cur); cur = null; } };
  lines.forEach((line, idx) => {
    if (/^\s*```/.test(line)) { flush(); inFence = !inFence; return; }
    if (inFence) return;
    const h = line.match(HEADING);
    if (h) {
      flush();
      const level = h[1].length;
      if (sectionLevel && level <= sectionLevel) sectionLevel = 0;
      if (!sectionLevel && sectionRe.test(h[2])) sectionLevel = level;
      return;
    }
    if (line.trim().startsWith("|")) { flush(); return; }   // tables carry their own status column
    if (LIST.test(line)) {
      flush();
      cur = { line: idx + 1, first: line, full: line, top: LIST_TOP.test(line), inSection: sectionLevel > 0 };
      return;
    }
    if (LIST_ANY.test(line) || line.trim() === "") { flush(); return; }
    if (cur) cur.full += "\n" + line;
  });
  flush();
  return items;
}

/** The rule-13 findings of one audit or register text: defect-shaped list lines plus section lines. */
export function auditFindings(text) {
  return parseItems(text, SECTION_AUDIT)
    .filter((it) => DEFECTY.test(it.first) || (it.inSection && it.top))
    .map((it) => ({ line: it.line, text: it.first.trim(), problem: dispositionProblem(it.full) }));
}

/** The rule-13 findings of one session log: every top-level list line under Not done, Open items/questions, Residual. */
export function sessionLogFindings(text) {
  return parseItems(text, SECTION_LOG)
    .filter((it) => it.inSection && it.top)
    .map((it) => ({ line: it.line, text: it.first.trim(), problem: dispositionProblem(it.full) }));
}

const SCAN_CACHE = new Map(); // path+kind -> { mtimeMs, size, findings }: the dispatch gate must stay fast
function cachedFindings(abs, kind) {
  const st = statSync(abs);
  const key = abs + "\0" + kind;
  const hit = SCAN_CACHE.get(key);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.findings;
  const text = readFileSync(abs, "utf8");
  const findings = kind === "log" ? sessionLogFindings(text) : auditFindings(text);
  SCAN_CACHE.set(key, { mtimeMs: st.mtimeMs, size: st.size, findings });
  return findings;
}

function walkMd(dir, match, depth = 0) {
  const out = [];
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (depth < 4 && e.name !== "node_modules" && e.name !== ".git") out.push(...walkMd(p, match, depth + 1)); }
    else if (e.isFile() && match(e.name)) out.push(p);
  }
  return out;
}

/**
 * Every undispositioned finding in the three sources. root = the repo root. Missing directories are empty.
 * @returns {{source: string, file: string, line: number, text: string, problem: string}[]}
 */
export function collectOpenFindings(root) {
  const open = [];
  const add = (source, abs, kind) => {
    let findings = [];
    try { findings = cachedFindings(abs, kind); } catch { return; }
    const file = relative(root, abs).split("\\").join("/");
    for (const f of findings) if (f.problem) open.push({ source, file, line: f.line, text: f.text, problem: f.problem });
  };
  const auditsDir = join(root, "docs", "audits");
  let audits = [];
  try { audits = listAuditFiles(auditsDir); } catch { /* no audits dir */ }
  for (const rel of audits.sort()) {
    const d = dateOfPath(rel);
    if (d && d >= DISPOSITION_FROM) add("audit", join(auditsDir, rel), "audit");
  }
  const logDir = join(root, "docs", "ops", "session-log.d");
  let logs = [];
  try { logs = readdirSync(logDir).sort(); } catch { /* no session-log.d */ }
  for (const name of logs) {
    const m = name.match(/^(\d{4}-\d{2}-\d{2})-.*\.md$/);
    if (m && m[1] >= DISPOSITION_FROM) add("session-log", join(logDir, name), "log");
  }
  for (const abs of walkMd(join(root, "fsi-app", "scripts", "tmp"), (n) => /register/i.test(n) && n.endsWith(".md")).sort()) {
    add("register", abs, "audit");
  }
  return open;
}

/**
 * Contradiction between the lane contract and the PreToolUse skill gate. The gate's message tells the
 * agent to load the named skills and retry; a contract line that tells a lane to stop on any hook block,
 * with no carve-out for the skill-load block, says the opposite. Both texts are inputs so a fixture can
 * carry the contradiction. Returns [{ line, text }], empty when they agree or the gate says no such thing.
 */
export function contractContradiction(contractText, gateSource) {
  const gateSaysLoad = /LOADED this session via the Skill tool/.test(gateSource) && /THEN retry/.test(gateSource);
  if (!gateSaysLoad) return [];
  const out = [];
  String(contractText).split(/\r?\n/).forEach((line, idx) => {
    const stops = /\b(stop|halt|abort)\b/i.test(line);
    const hook = /\b(hook|pretooluse|pre-tool-use)\b/i.test(line);
    const blocked = /\b(block|blocked|blocks|fail|fails|failure|error|refus\w*|den(?:y|ied))\b/i.test(line);
    const carveOut = /\bload\w*\b[^.]*\bskills?\b|\bskills?\b[^.]*\bload/i.test(line);
    if (stops && hook && blocked && !carveOut) out.push({ line: idx + 1, text: line.trim().slice(0, 120) });
  });
  return out;
}

// CLI body guarded (lane W71-A, 2026-09-05): this file is now also `import`ed as a library, by its own
// test (listAuditFiles) and by run-test-suite.sh's real wiring line — without this guard, either import
// ran the full scan and called process.exit() at MODULE LOAD, killing the importing process before its
// own code (a test runner's other test files, a wrapping script's own exit-code handling) ever got to
// run. Same idiom this repo's other scripts/verify/*.mjs CLIs already use (e.g. defect-signature-scan.mjs,
// no-generic-source-audit.mjs).
if (isMainModule(import.meta.url)) {
  let files = [];
  try { files = listAuditFiles(AUDITS); }
  catch { console.log("audit-finding-status: no docs/audits directory; nothing to check."); process.exit(0); }

  let unlabeled = 0, checked = 0;
  const offenders = [];
  for (const f of files) {
    const text = readFileSync(join(AUDITS, f), "utf8");
    let inFence = false;
    text.split(/\r?\n/).forEach((line, idx) => {
      if (/^\s*```/.test(line)) { inFence = !inFence; return; }
      if (inFence) return;
      if (line.trim().startsWith("|")) return;          // tables carry their own status column
      if (!LIST.test(line) || !DEFECTY.test(line)) return;
      checked++;
      if (!STATUS.test(line)) {
        unlabeled++;
        if (offenders.length < 25) offenders.push(`${f}:${idx + 1}: ${line.trim().slice(0, 96)}`);
      }
    });
  }

  console.log(`audit-finding-status: ${checked} finding-shaped lines across ${files.length} audit file(s); ${unlabeled} unlabeled.`);
  if (unlabeled) {
    console.log("\nEach line below states a defect without a verification status (rule 14).");
    console.log("Add [CONFIRMED] (re-verified live / by repro), [HYPOTHESIS] (read but unverified), or [REFUTED]:\n");
    for (const o of offenders) console.log("  " + o);
    if (offenders.length < unlabeled) console.log(`  … and ${unlabeled - offenders.length} more`);
  }

  // Rule 13: dispositions (one site, shared with the PreToolUse dispatch gate).
  const ROOT = join(HERE, "..", "..", "..");
  const open = collectOpenFindings(ROOT);
  const bySource = (s) => open.filter((o) => o.source === s);
  const openAudits = bySource("audit");
  console.log(`\naudit-finding-status: rule 13 dispositions: ${open.length} undispositioned finding(s) ` +
    `(${openAudits.length} in audits, ${bySource("session-log").length} in session logs, ${bySource("register").length} in registers), ` +
    `scope ${DISPOSITION_FROM} onward.`);
  if (open.length) {
    console.log("Each line below needs exactly one of [WORK: <lane id or PR N>] [CLOSED: PR N] [REFUTED: <evidence>] [NOT-WORK: <reason>]:\n");
    const shown = process.argv.includes("--all") ? open : open.slice(0, 25);
    for (const o of shown) console.log(`  ${o.file}:${o.line}: [${o.problem}] ${o.text.slice(0, 120)}`);
    if (shown.length < open.length) console.log(`  … and ${open.length - shown.length} more (--all lists every one)`);
  }

  // The lane contract must not contradict the skill gate's own block message.
  let contradictions = [];
  try {
    contradictions = contractContradiction(
      readFileSync(join(ROOT, "docs", "dispatches", "lane-common-contract.md"), "utf8"),
      readFileSync(join(ROOT, "fsi-app", ".discipline", "governance", "pretooluse-skill-gate.mjs"), "utf8"));
  } catch { /* a missing file is some other gate's finding */ }
  if (contradictions.length) {
    console.log(`\naudit-finding-status: the lane contract tells a lane to stop on a hook block while the skill gate tells it to load the named skills and retry:`);
    for (const c of contradictions) console.log(`  docs/dispatches/lane-common-contract.md:${c.line}: ${c.text}`);
  }
  process.exit(STRICT && (unlabeled || openAudits.length || contradictions.length) ? 1 : 0);
}
