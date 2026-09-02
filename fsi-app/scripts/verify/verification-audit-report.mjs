#!/usr/bin/env node
// verification-audit-report.mjs — W2.F. Is the corpus's own provenance discipline actually being
// carried out, and is the meta-harness layer's own run-history convention (CONVENTION.md) being kept?
//
// WHY THIS EXISTS. The provenance invariant (migration 112/114/119/121: every FACT claim needs a
// source_span grounded in a real search result; CRITICAL/HIGH items need a tier-1/2 source at
// grounding time) is enforced AT WRITE TIME by validate_item_provenance — a row that violates it never
// lands. That answers "is a bad row possible going forward?"; it says nothing about the STANDING STATE
// of everything already written: how many items sit in each provenance_status, split by item_grade
// (migration 278 — record vs brief) and item_type; how many claims carry a real citation versus not,
// by claim_kind; how many sections carry a claim that is missing its source_span. Nobody had a single
// place to read that state — this report is that place, matching population-report.mjs's posture (is
// each store built, or built AND FILLED?) one layer down, for provenance rather than row counts.
//
// It ALSO reports the meta-harness layer's own bookkeeping (F28's registered families, whether each
// has run history or is honestly marked PENDING) — a defect class of its OWN kind: a harness whose
// governing files changed with no run to show for it is exactly the "code without evidence" gap this
// whole finish plan exists to close, one register at a time (F33 for surfaces, this for provenance +
// harness state).
//
// NOT A PASS/FAIL GATE. Like population-report.mjs, this is legibility, not a red/green check — a
// corpus mid-verification legitimately has unverified/pending rows. Nothing here throws on a "bad"
// number; it makes every number visible in one place instead of requiring six separate queries.
//
// $0: read-only against three tables (intelligence_items, section_claim_provenance) plus a filesystem
// read of scripts/harness-runs/. No writes, no model calls, no metered anything.
//
// Usage: node scripts/verify/verification-audit-report.mjs --out <path.md>
//   Writes the Markdown report to <path.md> and a machine-readable JSON twin to the same path with
//   its extension replaced by .json (or <path.md>.json if <path.md> has no .md extension).
//   Omit --out to print the Markdown to stdout only (no files written).

import { writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { readClient } from "../lib/db.mjs";
import { readRunHistory, DEFAULT_HARNESS_RUNS_ROOT } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../../.discipline/fitness/functions/F28-harness-run-integrity.mjs";

// ── §1: intelligence_items provenance matrix — grade × status × item_type ─────────────────────────

export async function fetchProvenanceRows(sb) {
  const { data, error } = await sb
    .from("intelligence_items")
    .select("item_grade, provenance_status, item_type");
  if (error) throw new Error(`intelligence_items: ${error.message}`);
  return data ?? [];
}

/** Pure aggregator: rows -> sorted {grade, status, item_type, count}[]. Injectable-tested via
 *  constructed row arrays, no database required (population-report.mjs's `classify` posture). */
export function buildProvenanceMatrix(rows) {
  const counts = new Map();
  for (const r of rows) {
    const key = JSON.stringify([r.item_grade ?? "(null)", r.provenance_status ?? "(null)", r.item_type ?? "(null)"]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [grade, status, item_type] = JSON.parse(key);
      return { grade, status, item_type, count };
    })
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.grade.localeCompare(b.grade) ||
        a.status.localeCompare(b.status) ||
        a.item_type.localeCompare(b.item_type),
    );
}

// ── §2 + §3: claims (section_claim_provenance), one query feeding two views ────────────────────────
// A "verified citation" here means the SAME thing migration 114's fact_missing_source_span check
// tests pre-write for FACT claims: a non-null source_id AND a non-empty source_span. Only FACT claims
// are REQUIRED to carry one (ANALYSIS/LEGAL/GAP claims are not citation-bearing by design — see
// migration 112's header), so §2 reports every claim_kind's citation split honestly (a 0-with-citation
// ANALYSIS bucket is not a defect), while §3 (missing source_span) counts ONLY FACT claims, since that
// is the one case the write-time gate actually polices.

export async function fetchClaimRows(sb) {
  const { data, error } = await sb
    .from("section_claim_provenance")
    .select("section_row_id, claim_kind, source_id, source_span");
  if (error) throw new Error(`section_claim_provenance: ${error.message}`);
  return data ?? [];
}

function hasCitation(c) {
  return Boolean(c.source_id) && Boolean(c.source_span && String(c.source_span).trim());
}

/** Pure: claim rows -> per-claim_kind citation split + totals. */
export function buildClaimsCitationStats(claimRows) {
  const byKind = new Map();
  for (const c of claimRows) {
    const kind = c.claim_kind ?? "(null)";
    if (!byKind.has(kind)) byKind.set(kind, { claim_kind: kind, withCitation: 0, withoutCitation: 0 });
    const bucket = byKind.get(kind);
    if (hasCitation(c)) bucket.withCitation++;
    else bucket.withoutCitation++;
  }
  const rows = [...byKind.values()]
    .map((r) => ({ ...r, total: r.withCitation + r.withoutCitation }))
    .sort((a, b) => b.total - a.total || a.claim_kind.localeCompare(b.claim_kind));
  const totals = rows.reduce(
    (acc, r) => ({ withCitation: acc.withCitation + r.withCitation, withoutCitation: acc.withoutCitation + r.withoutCitation }),
    { withCitation: 0, withoutCitation: 0 },
  );
  return { byKind: rows, totals };
}

/** Pure: claim rows -> {sectionCount, claimCount} for FACT claims missing source_span. `sectionCount`
 *  is the count of DISTINCT section_row_id carrying at least one such claim (a section can carry more
 *  than one gap-bearing claim; this counts the section once, matching "sections with missing
 *  source_span" rather than "claims missing source_span"). */
export function findSectionsMissingSpan(claimRows) {
  const missingSectionIds = new Set();
  let claimCount = 0;
  for (const c of claimRows) {
    if (c.claim_kind !== "FACT") continue;
    if (Boolean(c.source_span && String(c.source_span).trim())) continue;
    claimCount++;
    if (c.section_row_id) missingSectionIds.add(c.section_row_id);
  }
  return { sectionCount: missingSectionIds.size, claimCount };
}

// ── §4: F28 harness-run markers ─────────────────────────────────────────────────────────────────
// Reuses F28's own GOVERNING_FILES (the registered-family list — never re-derived by hand here) and
// run-artifact.mjs's own readRunHistory/DEFAULT_HARNESS_RUNS_ROOT (the SAME reader F28 and the
// `--list` CLI use), per CONVENTION.md's schema: a family with zero valid runs and no PENDING-RUN.md
// is the honest-gap case F28's rule (b) itself polices; this report surfaces it for a human/proposer
// without re-running F28's own audit logic.

/** Pure-ish (the three collaborators are injectable): one row per F28-registered harness family. */
export function collectHarnessMarkers({
  families = Object.keys(GOVERNING_FILES),
  root = DEFAULT_HARNESS_RUNS_ROOT,
  historyReader = readRunHistory,
  fileExists = existsSync,
} = {}) {
  return families
    .map((family) => {
      const dir = join(root, family);
      const { runs, invalid } = historyReader(dir);
      const latest = runs.at(-1) ?? null;
      return {
        family,
        runCount: runs.length,
        invalidCount: invalid.length,
        latestRunId: latest?.run_id ?? null,
        latestStartedAt: latest?.started_at ?? null,
        latestDefectCount: latest ? latest.defects_found.length : null,
        pendingMarker: fileExists(join(dir, "PENDING-RUN.md")),
      };
    })
    .sort((a, b) => a.family.localeCompare(b.family));
}

// ── assembly + rendering ─────────────────────────────────────────────────────────────────────────

export async function collect(sb, { harnessRoot = DEFAULT_HARNESS_RUNS_ROOT } = {}) {
  const [provenanceRows, claimRows] = await Promise.all([fetchProvenanceRows(sb), fetchClaimRows(sb)]);
  return {
    generatedAt: new Date().toISOString(),
    provenanceMatrix: buildProvenanceMatrix(provenanceRows),
    provenanceRowCount: provenanceRows.length,
    claims: buildClaimsCitationStats(claimRows),
    missingSpan: findSectionsMissingSpan(claimRows),
    claimRowCount: claimRows.length,
    harnessMarkers: collectHarnessMarkers({ root: harnessRoot }),
  };
}

function pad(s, n) {
  return String(s).padEnd(n);
}

/** Pure renderer: the assembled report object -> Markdown lines. Injectable/testable without a
 *  database (population-report.mjs's `renderReport` posture). */
export function renderMarkdown(report) {
  const out = [];
  out.push("# Verification audit report (W2.F)");
  out.push("");
  out.push(`Generated: ${report.generatedAt}`);
  out.push("");
  out.push(
    "Legibility, not a pass/fail gate — a corpus mid-verification legitimately has unverified/pending " +
      "rows. See scripts/verify/verification-audit-report.mjs's header for what each section counts.",
  );
  out.push("");

  out.push("## 1. intelligence_items provenance — grade × status × item_type");
  out.push("");
  out.push(`${report.provenanceRowCount} item(s) total.`);
  out.push("");
  out.push("| grade | provenance_status | item_type | count |");
  out.push("|---|---|---|---:|");
  for (const r of report.provenanceMatrix) {
    out.push(`| ${r.grade} | ${r.status} | ${r.item_type} | ${r.count} |`);
  }
  out.push("");

  out.push("## 2. Claims — citation status by claim_kind");
  out.push("");
  out.push(`${report.claimRowCount} claim(s) total.`);
  out.push("");
  out.push("| claim_kind | with citation | without citation | total |");
  out.push("|---|---:|---:|---:|");
  for (const r of report.claims.byKind) {
    out.push(`| ${r.claim_kind} | ${r.withCitation} | ${r.withoutCitation} | ${r.total} |`);
  }
  out.push(
    `| **total** | **${report.claims.totals.withCitation}** | **${report.claims.totals.withoutCitation}** | ` +
      `**${report.claims.totals.withCitation + report.claims.totals.withoutCitation}** |`,
  );
  out.push("");
  out.push(
    '"With citation" = a non-null source_id AND a non-empty source_span — the same test migration ' +
      "114's fact_missing_source_span check applies pre-write to FACT claims. ANALYSIS/LEGAL/GAP claims " +
      "are not citation-bearing by design (migration 112) — a 0-with-citation row there is not a gap.",
  );
  out.push("");

  out.push("## 3. Sections with a FACT claim missing source_span");
  out.push("");
  out.push(
    `${report.missingSpan.sectionCount} distinct section(s), carrying ${report.missingSpan.claimCount} ` +
      "FACT claim(s) with no source_span.",
  );
  out.push("");

  out.push("## 4. F28 harness-run markers (scripts/harness-runs/, per CONVENTION.md)");
  out.push("");
  out.push("| family | runs | invalid | latest run | latest started_at | latest defects | PENDING-RUN.md |");
  out.push("|---|---:|---:|---|---|---:|---|");
  for (const h of report.harnessMarkers) {
    out.push(
      `| ${h.family} | ${h.runCount} | ${h.invalidCount} | ${h.latestRunId ?? "—"} | ${h.latestStartedAt ?? "—"} | ` +
        `${h.latestDefectCount ?? "—"} | ${h.pendingMarker ? "yes" : "no"} |`,
    );
  }
  const zeroRunNoMarker = report.harnessMarkers.filter((h) => h.runCount === 0 && !h.pendingMarker);
  out.push("");
  if (zeroRunNoMarker.length > 0) {
    out.push(
      `**${zeroRunNoMarker.length} famil${zeroRunNoMarker.length === 1 ? "y" : "ies"} with zero runs and no ` +
        `PENDING-RUN.md marker**: ${zeroRunNoMarker.map((h) => h.family).join(", ")} — F28's own rule (b) ` +
        "first-run acknowledgment gap; see F28-harness-run-integrity.mjs.",
    );
  } else {
    out.push("Every registered family has either run history or an honest PENDING-RUN.md marker.");
  }
  out.push("");

  return out;
}

function jsonTwinPath(outPath) {
  return outPath.endsWith(".md") ? outPath.replace(/\.md$/, ".json") : `${outPath}.json`;
}

/** Write both files, creating no directories (the caller's --out path must already exist). Exported
 *  so the CLI's write step is testable against an injectable `writeFile`. */
export function writeReportFiles(report, outPath, writeFile = writeFileSync) {
  const markdown = renderMarkdown(report).join("\n") + "\n";
  writeFile(outPath, markdown);
  const jsonPath = jsonTwinPath(outPath);
  writeFile(jsonPath, JSON.stringify(report, null, 2) + "\n");
  return { markdownPath: outPath, jsonPath };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
// Guarded so importing this module for its pure parts never opens a database connection.
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

  const report = await collect(readClient());

  if (outPath) {
    if (!existsSync(dirname(outPath))) {
      console.error(`::error::--out directory does not exist: ${dirname(outPath)}`);
      process.exit(1);
    }
    const { markdownPath, jsonPath } = writeReportFiles(report, outPath);
    console.log(`Wrote ${markdownPath} and ${jsonPath}.`);
  } else {
    console.log(renderMarkdown(report).join("\n"));
  }
}
