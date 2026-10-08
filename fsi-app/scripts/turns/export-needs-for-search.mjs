#!/usr/bin/env node
// export-needs-for-search.mjs: the READ-ONLY export half of the needs-search batch pattern (lane G5-SEARCH,
// 2026-10-07, buildout plan Stage 5 last clause and "How model judgement runs").
//
// Lists every open source need of the four kinds and writes ONE bundle file per run to --out-dir (never into the
// repo) for a session lane to find URLs from:
//   term-need:*               an adopted vocabulary term with no authoritative holding (G5-NEED)
//   holdings-need:*           a question the held source text cannot answer (L4-B)
//   flywheel-gap:*            a coverage gap in a theme (the corpus analysis)
//   lineage-gap:absent-parent an instrument an item names as a parent that is not held
// Per need: need_id (the flag id), kind, subject_ref, the need in words, its context, the age (created_at), the
// output the found URL feeds, and what satisfies it (an authoritative URL at or above the type floor; how it is
// rated). The reading shares question-answers/data.mjs (the need reader) and the lineage planner; this file adds
// only the listing and the skip rules.
//
// A need is skipped when: its flag carries nothing a search can use (counted as residue); a lineage flag whose every
// named parent is now held; or an earlier apply already served the same need (same need key) and the generator
// raised it again under a new flag id while the found document is still working through the pipeline.
//
// FREE and READ-ONLY: no model call, no network, no write to the database. It writes the bundle file and its
// harness-run artifact (scripts/turns/needs-search/artifact.mjs). Exits 2 without database credentials (rule 15).
// --fixture <corpus.json> runs the whole step over an in-memory corpus with no database and writes no artifact.
//
// Usage:
//   node scripts/turns/export-needs-for-search.mjs --out-dir <dir> [--limit N] [--fixture <corpus.json>]
// Exit 0 done, 1 bad args, 2 no database credentials.

import { parseArgs as nodeParseArgs } from "node:util";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { isMainModule } from "../lib/is-main.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { emitNeedsSearchArtifact } from "./needs-search/artifact.mjs";
import { fixtureDeps } from "./needs-search/fixture-deps.mjs";
import { collectOpenNeeds, loadAppliedKeys } from "./needs-search/data.mjs";

export const DEFAULT_LIMIT = 100;

/** Pure CLI parse. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({ args: argv, options: { "out-dir": { type: "string" }, limit: { type: "string" }, fixture: { type: "string" } }, strict: true }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!values["out-dir"]) return { ok: false, error: "--out-dir is required (the bundle is written there, never into the repo)" };
  const limit = Number(values.limit ?? DEFAULT_LIMIT);
  if (!Number.isInteger(limit) || limit < 1) return { ok: false, error: `--limit must be a whole number of needs, one or more, got ${JSON.stringify(values.limit)}` };
  return { ok: true, outDir: values["out-dir"], limit, fixture: values.fixture ?? null };
}

/**
 * The export, over injected reads. Returns the bundle file object and a summary; writes nothing.
 * @param {{readAll:Function, readAllByIds:Function}} deps
 * @param {{limit?:number, now?:()=>string}} opts
 */
export async function buildExport(deps, { limit = DEFAULT_LIMIT, now = () => new Date().toISOString() } = {}) {
  const { needs, residue, counts } = await collectOpenNeeds(deps);
  const applied = await loadAppliedKeys(deps);
  const listed = [];
  let inFlight = 0;
  let overLimit = 0;
  for (const n of needs) {
    if (applied.has(n.key)) { inFlight += 1; continue; }
    if (listed.length >= limit) { overLimit += 1; continue; }
    listed.push(n);
  }
  const summary = {
    open_needs_by_kind: counts.open_by_kind,
    open_needs: Object.values(counts.open_by_kind).reduce((a, b) => a + b, 0),
    needs_exported: listed.length,
    needs_exported_by_kind: listed.reduce((acc, n) => ({ ...acc, [n.kind]: (acc[n.kind] ?? 0) + 1 }), {}),
    skipped_url_in_flight: inFlight,
    skipped_no_absent_parent: counts.skipped_no_absent_parent,
    unparseable: counts.unparseable,
    not_examined_over_limit: overLimit,
  };
  return { file: { schema_version: "ns1-export-2026-10-07.1", generated_at: now(), summary, residue, needs: listed }, summary };
}

/** The harness-run artifact input for one export run. Pure. */
export function exportArtifactInput({ parsed, file, outPath, startedAt }) {
  const { summary, needs, residue } = file;
  return {
    action: "export",
    startedAt,
    config: { limit: parsed.limit, bundle_path: outPath },
    inputsRef: ["integrity_flags", "intelligence_items"],
    perItem: [
      ...needs.map((n) => ({ id: n.need_id, outcome: `listed_${n.kind}`, verdict: n.key, evidence_refs: [outPath], error: null })),
      ...residue.map((r) => ({ id: r.flag_id, outcome: "unparseable", verdict: r.reason, evidence_refs: [], error: r.reason })),
    ],
    metrics: {
      open_needs: summary.open_needs, needs_exported: summary.needs_exported, skipped_url_in_flight: summary.skipped_url_in_flight,
      skipped_no_absent_parent: summary.skipped_no_absent_parent, unparseable: summary.unparseable, not_examined_over_limit: summary.not_examined_over_limit,
      open_needs_by_kind: JSON.stringify(summary.open_needs_by_kind), needs_exported_by_kind: JSON.stringify(summary.needs_exported_by_kind),
    },
    defectsFound: [],
    fullTraceRefs: [outPath],
    proposerNotes: "Auto-emitted by export-needs-for-search.mjs after the bundle was written; read-only, no database write.",
  };
}

/** The reads the export needs: the live database, or an in-memory corpus under --fixture. */
async function openReads(fixturePath) {
  if (!fixturePath) {
    const { readAll, readAllByIds } = await import("../lib/db.mjs");
    return { readAll, readAllByIds };
  }
  return fixtureDeps(JSON.parse(readFileSync(resolve(fixturePath), "utf8")));
}

if (isMainModule(import.meta.url)) await main();

async function main() {
  loadLocalEnvFile();
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`export-needs-for-search: ${parsed.error}\nusage: node scripts/turns/export-needs-for-search.mjs --out-dir <dir> [--limit N]`);
    process.exit(1);
  }
  if (!parsed.fixture && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error("export-needs-for-search: no database credentials, cannot run here (exit 2).");
    process.exit(2);
  }
  const startedAt = new Date().toISOString();
  const { file, summary } = await buildExport(await openReads(parsed.fixture), parsed);

  mkdirSync(resolve(parsed.outDir), { recursive: true });
  const outPath = join(resolve(parsed.outDir), `needs-search-export-${startedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(outPath, JSON.stringify(file, null, 2));
  console.log(`export-needs-for-search: ${summary.needs_exported} need(s) exported of ${summary.open_needs} open (skipped: url in flight ${summary.skipped_url_in_flight}, no absent parent ${summary.skipped_no_absent_parent}; unparseable ${summary.unparseable}; over limit ${summary.not_examined_over_limit}) to ${outPath}`);
  console.log(`export-needs-for-search: open by kind ${JSON.stringify(summary.open_needs_by_kind)}; exported by kind ${JSON.stringify(summary.needs_exported_by_kind)}`);

  if (parsed.fixture) {
    console.log("export-needs-for-search: --fixture run, no harness-run artifact written.");
    process.exit(0);
  }
  const artifactPath = emitNeedsSearchArtifact(exportArtifactInput({ parsed, file, outPath, startedAt }));
  console.log(`export-needs-for-search: wrote ${artifactPath}`);
  process.exit(0);
}
