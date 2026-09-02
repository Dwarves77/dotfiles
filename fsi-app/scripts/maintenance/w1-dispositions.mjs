// w1-dispositions.mjs — MAINT dispatch step for the W1 unwired-module register
// (docs/plans/unwired-disposition-2026-08-31.md), gated on ruling R-C.
//
// WHAT THIS STEP IS. NOT a code-editing runtime: deleting/wiring a module is a code change reviewed
// through a PR, not a database write a service-role key can make. This step's job is to turn the
// register document into a precise, machine-derived worklist a follow-up CODE lane executes — parsing
// the doc's own "Summary — ratify in one pass" table (26 rows: module, recommendation, one-line basis)
// rather than hand-transcribing it, so the worklist can never silently drift from the document it
// reports on. `apply` mode changes nothing in the repo either; it only unlocks the full worklist report
// once R-C is accepted (arg == "R-C-accepted"), for a coordinator to hand to that code lane. `applied`
// is always 0 for this step, by design.
//
// A FINDING THIS STEP SURFACES, NOT SILENTLY RECONCILES (CLAUDE.md rule 14 — a finding is a hypothesis
// until verified, and a mismatch is reported honestly, never picked-a-winner silently). The document's
// own "Recommendation split" line (bottom of its summary table) states WIRE 8 / DELETE 8 / HOLD 6 /
// KEEP-NO-ACTION 3 (25 dispositioned + 1 linked no-action row = 26). Reading each row's own body-section
// "**Recommendation: ...**" sentence (the authoritative per-row verdict — see classifyDisposition's doc
// comment for why the summary table's OWN recommendation cell can't be trusted for row #1) over all 26
// rows [CONFIRMED, this session, 2026-09-02] instead counts WIRE 8 / DELETE 10 / HOLD 6 /
// KEEP-NO-ACTION 2 = 26. WIRE and HOLD agree with the stated split; DELETE and KEEP-NO-ACTION do not
// (DELETE undercounted by 2, KEEP-NO-ACTION overcounted by 1 in the stated line — module #4
// `metered-gate.mjs`, the row the doc calls out as "linked" to #3 and implicitly outside the 25, is
// itself a real KEEP-NO-ACTION row by its own body section, which is the one piece this session traced
// precisely; the doc's own arithmetic was not re-derived further than that). `buildRegisterReport`
// computes BOTH numbers and sets `split_mismatch: true` rather than resolving it — the discrepancy needs
// the ratifying operator's eyes, not a script's guess at which count is authoritative.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./lib/cli.mjs";

export const REGISTER_DOC_PATH = "docs/plans/unwired-disposition-2026-08-31.md";
export const REQUIRED_ARG = "R-C-accepted";

/** Pure: every `| N | module | recommendation | basis |` row of the doc's summary table. Skips the
 *  header/separator rows (col 1 isn't a bare integer for those). */
export function parseRegisterTable(markdown) {
  const rows = [];
  for (const line of String(markdown ?? "").split("\n")) {
    const m = /^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (!m) continue;
    rows.push({ num: Number(m[1]), module: m[2].trim(), recommendation: m[3].trim(), basis: m[4].trim() });
  }
  return rows;
}

/** Pure: the leading bold disposition word of a recommendation cell ("**WIRE the fix**" -> "WIRE").
 *  FALLBACK ONLY (see parseSectionRecommendations) — row #1's own summary-table cell is the wordplay
 *  "**DELETE the urgency, WIRE the fix**" (the module's real disposition is WIRE; "delete the urgency
 *  [of fixing it]" is prose, not the verdict), so the first-bold-word heuristic misreads it. Kept for
 *  the rare row whose body section has no parseable Recommendation sentence. */
export function classifyDisposition(recommendation) {
  const m = /\*\*\s*(WIRE|DELETE|HOLD|KEEP)/i.exec(String(recommendation ?? ""));
  return m ? m[1].toUpperCase() : "UNKNOWN";
}

/**
 * Pure: row-number -> disposition, read from each `### N.` (or `### N–M.` for a combined section, e.g.
 * "### 13–16.") heading's own body text, matching its "**Recommendation: WORD" sentence — the
 * authoritative per-row verdict, unlike the summary table's recommendation cell (row #1's wordplay
 * defeats a naive first-bold-word read there; see classifyDisposition's doc comment). A combined
 * heading's one Recommendation sentence applies to every row number in its range.
 * @param {string} markdown
 * @returns {Map<number, "WIRE"|"DELETE"|"HOLD"|"KEEP"|"UNKNOWN">}
 */
export function parseSectionRecommendations(markdown) {
  const text = String(markdown ?? "");
  const headingRe = /^###\s+(\d+)(?:[–-](\d+))?\./gm;
  const matches = [...text.matchAll(headingRe)];
  const map = new Map();
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const section = text.slice(start, end);
    const recMatch = /\*\*Recommendation:\s*(WIRE|DELETE|HOLD|KEEP)/i.exec(section);
    const disposition = recMatch ? recMatch[1].toUpperCase() : "UNKNOWN";
    const lo = Number(m[1]);
    const hi = m[2] ? Number(m[2]) : lo;
    for (let n = lo; n <= hi; n++) map.set(n, disposition);
  }
  return map;
}

/** Pure: the doc's own "Recommendation split: WIRE 8 · DELETE 8 · HOLD 6 · KEEP-NO-ACTION 3" line, or
 *  null if the doc's phrasing ever changes and this can no longer find it (never guessed). */
export function parseStatedSplit(markdown) {
  const m = /Recommendation split:\s*WIRE\s*(\d+)\s*[·.]\s*DELETE\s*(\d+)\s*[·.]\s*HOLD\s*(\d+)\s*[·.]\s*KEEP-NO-ACTION\s*(\d+)/i.exec(String(markdown ?? ""));
  if (!m) return null;
  return { wire: Number(m[1]), delete: Number(m[2]), hold: Number(m[3]), keep_no_action: Number(m[4]) };
}

/** Pure: the whole per-row + grouped + mismatch report, from raw markdown. Disposition per row comes
 *  from its own body section's Recommendation sentence (parseSectionRecommendations), falling back to
 *  the summary-table cell only if a row's section can't be found (never happens on the real document;
 *  guards a future edit that drops a heading). */
export function buildRegisterReport(markdown) {
  const rows = parseRegisterTable(markdown);
  const recByNum = parseSectionRecommendations(markdown);
  const grouped = { WIRE: [], DELETE: [], HOLD: [], KEEP: [], UNKNOWN: [] };
  for (const r of rows) {
    const disposition = recByNum.get(r.num) ?? classifyDisposition(r.recommendation);
    (grouped[disposition] ?? grouped.UNKNOWN).push({ ...r, disposition });
  }
  const computed = {
    wire: grouped.WIRE.length,
    delete: grouped.DELETE.length,
    hold: grouped.HOLD.length,
    keep_no_action: grouped.KEEP.length,
    unknown: grouped.UNKNOWN.length,
    total: rows.length,
  };
  const stated = parseStatedSplit(markdown);
  const mismatch = !!stated && (
    stated.wire !== computed.wire ||
    stated.delete !== computed.delete ||
    stated.hold !== computed.hold ||
    stated.keep_no_action !== computed.keep_no_action
  );
  return { rows, grouped, computed, stated, mismatch };
}

const rowView = (r) => ({ num: r.num, module: r.module, basis: r.basis });

/**
 * @param {{ mode?: "dry"|"apply", arg?: string }} opts
 * @param {{ readDoc: () => Promise<string>|string }} deps
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const apply = mode === "apply";
  const markdown = await deps.readDoc();
  const report = buildRegisterReport(markdown);

  const summary = {
    step: "w1-dispositions",
    mode,
    counts: report.computed,
    stated_split: report.stated,
    split_mismatch: report.mismatch,
    wire: report.grouped.WIRE.map(rowView),
    delete: report.grouped.DELETE.map(rowView),
    hold: report.grouped.HOLD.map(rowView),
    keep_no_action: report.grouped.KEEP.map(rowView),
    applied: 0,
    read_back: {},
    exitCode: 0,
  };
  if (report.mismatch) {
    summary.note =
      "FINDING: the document's own stated split and its per-row table disagree (see this file's header) " +
      `— stated ${JSON.stringify(report.stated)} vs. computed ${JSON.stringify(report.computed)}. ` +
      "Reported, not silently reconciled.";
  }

  if (!apply) return summary;

  if (arg !== REQUIRED_ARG) {
    summary.note = `REFUSED — apply requires arg == '${REQUIRED_ARG}' (ruling R-C). Got: '${arg || "(none)"}'. No code was touched.`;
    summary.exitCode = 1;
    return summary;
  }

  summary.note =
    (summary.note ? summary.note + " " : "") +
    "R-C accepted. This step makes NO in-runner edit — deleting/wiring modules is a code change, not a " +
    "DB write. The wire/delete lists above are the exact scope (module + one-line basis, which for a " +
    "WIRE row names the wire site and for a DELETE row names why it's dead) for a follow-up CODE lane to " +
    "execute. applied=0 by design; read_back is empty because this step touches no table.";
  return summary;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const IS_MAIN = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "w1-dispositions",
    main,
    needsDb: false,
    buildDeps: () => ({ readDoc: () => readFileSync(resolve(ROOT, REGISTER_DOC_PATH), "utf8") }),
  });
}
