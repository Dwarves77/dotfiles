#!/usr/bin/env node
// SHARED-WRITER: integrity_flags, census_worklist
// apply-need-urls.mjs: the apply half of the needs-search batch pattern (lane G5-SEARCH, 2026-10-07, buildout plan
// Stage 5 last clause). It replaces the human step that used to stand between a found URL and the pipeline (the
// ratify-flag-to-census note an operator wrote by hand) with a committed session batch applied by rule.
//
// Takes one named, committed batch (scripts/turns/needs-search/batches/needs-search-NNN.json, contract in
// scripts/turns/needs-search/README.md), validates EVERY entry against the live open needs with the pure validator
// (scripts/turns/needs-search/schema.mjs: the need is open, the url is http(s) without credentials, the host is
// rated by the class table or placed by a host verdict, no tier in the batch). An entry that fails is refused whole,
// never partially applied, its reasons recorded as residue; a refused entry never blocks the valid ones.
//
// WHAT A VALID ENTRY DOES (with --execute), in this order so a crash between steps is repaired by the next run:
//   1. registers the source for the url's host through registerSource (scripts/lib/db.mjs, idempotent by
//      institution key). The tier is the class table's tier for the host, or the table tier of the accompanying
//      host verdict's class; it is never taken from the batch. An existing source is reused as it stands.
//   2. creates what the need kind calls for (schema.mjs OUTPUT_FOR_KIND):
//        term-need, holdings-need, flywheel-gap -> a census_worklist row (lane C), made by ratify-flag-to-census.mjs
//          ensureCensusRow (the same row shape, identity and skip-if-exists check the operator ratification path
//          uses; this file holds no second copy);
//        lineage-gap -> a portal_link_candidates row (the ledger the EUR-Lex register walk already feeds),
//          written by run-source-sweep.mjs upsertPortalLinkCandidates through the guarded upsert.
//   3. resolves the need flag by rule: status resolved, resolved_by apply-need-urls, resolution_note carrying the
//      need key, the url, the source id, the tier and the row created. The export reads that note back so a need
//      the generator raises again under a new flag id, while the document is still working through the pipeline,
//      is not searched twice.
// Each write is read back. IDEMPOTENT: a second apply of the same entry writes nothing.
//
// RULE 17: the run artifact states sources registered or reused, census rows and portal candidates created or
// reused, and flags resolved, so nothing is left for a coordinator to connect by hand. The census row then flows to
// the population turn and the portal candidate to the ledger consume through their existing readers.
//
// DRY BY DEFAULT: without --execute it validates, prints the plan and writes nothing (it still writes its
// harness-run artifact). --fixture <corpus.json> runs the whole step over an in-memory corpus with no database;
// --execute then writes into memory only and no artifact is written.
//
// FREE: no model call, no network. Usage:
//   node scripts/turns/apply-need-urls.mjs --batch <batch.json> [--execute] [--fixture <corpus.json>]
// Exit 0 done (refused entries are residue, not a failure), 1 bad args / invalid file / a write that did not read
// back, 2 no database credentials.

import { parseArgs as nodeParseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isMainModule } from "../lib/is-main.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { institutionKey } from "../lib/institution-key.mjs";
import { OPEN_STATUSES } from "./question-answers/data.mjs";
import { ensureCensusRow } from "../connections/ratify-flag-to-census.mjs";
import { loadHostVerdicts } from "../maintenance/host-verdicts/load-host-verdicts.mjs";
import { validateNeedsFile, needKindOf, NEEDS_SEARCH_SCHEMA_VERSION } from "./needs-search/schema.mjs";
import { RESOLVED_BY, loadFlagsByIds, loadCorpus, lineageTargetsByFlag, needFromFlag, buildAppliedNote, parseAppliedNote } from "./needs-search/data.mjs";
import { emitNeedsSearchArtifact } from "./needs-search/artifact.mjs";
import { fixtureDeps } from "./needs-search/fixture-deps.mjs";

export { RESOLVED_BY };
export const CITE = {
  skill: "buildout-plan-2026-10-04",
  reason: "needs-search apply (plan Stage 5): register the source of a session-found url at its class-table tier, create the census_worklist row or portal candidate the need kind calls for, and resolve the need flag by rule (guarded path, rule 015).",
};
const LIVE_STATUSES = [...OPEN_STATUSES];

/** Pure CLI parse. @param {string[]} argv */
export function parseArgs(argv) {
  let values;
  try {
    ({ values } = nodeParseArgs({ args: argv, options: { batch: { type: "string" }, execute: { type: "boolean" }, fixture: { type: "string" } }, strict: true }));
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!values.batch) return { ok: false, error: "--batch <batch.json> is required (one named batch file per run)" };
  return { ok: true, batch: values.batch, execute: values.execute === true, fixture: values.fixture ?? null };
}

/** census_worklist existence check in the {data, error} shape ensureCensusRow takes. */
async function findCensus(deps, sourceId, url) {
  try {
    const rows = await deps.readAll("census_worklist", "id", { match: (q) => q.eq("source_id", sourceId).eq("document_url", url) });
    return { data: rows[0] ?? null, error: null };
  } catch (err) {
    return { data: null, error: { message: String(err?.message ?? err) } };
  }
}

/**
 * Validate a parsed batch against the live open needs and (with execute) write the valid entries.
 * @param {{json:object, execute:boolean, deps:{readAll:Function, readAllByIds:Function, guardedUpdateByIds?:Function, guardedInsert?:Function, registerSource?:Function, upsertPortalCandidate?:Function, committedVerdicts?:Map}, now?:()=>string}} o
 */
export async function applyNeedUrls({ json, execute, deps, now = () => new Date().toISOString() }) {
  const result = {
    schema_version: NEEDS_SEARCH_SCHEMA_VERSION, batch: json?.batch ?? null, ok: true, fileErrors: [],
    valid: [], refused: [], alreadyApplied: [], written: [], readBackFailures: [], writeFailures: [],
    report: {
      sources_registered: 0, sources_existing: 0, census_rows_created: 0, census_rows_existing: 0, portal_candidates_upserted: 0, flags_resolved: 0,
      by_kind: {},
      would: { sources_registered: 0, sources_existing: 0, census_rows: 0, portal_candidates: 0, flags_resolved: 0 },
    },
  };
  const entries = Array.isArray(json?.entries) ? json.entries : [];
  const ids = [...new Set(entries.map((e) => (e && typeof e.need_id === "string" ? e.need_id : null)).filter(Boolean))];

  const flags = await loadFlagsByIds(deps, ids);
  const flagById = new Map(flags.map((f) => [f.id, f]));
  const openNeedFlags = flags.filter((f) => LIVE_STATUSES.includes(f.status) && needKindOf(f.created_by));
  const lineageFlags = openNeedFlags.filter((f) => needKindOf(f.created_by) === "lineage-gap");
  const lineageTargets = lineageFlags.length ? lineageTargetsByFlag(lineageFlags, await loadCorpus(deps)) : new Map();
  const needs = new Map();
  for (const f of openNeedFlags) {
    const r = needFromFlag(f, { lineageTargets });
    if (r.need) needs.set(f.id, r.need);
  }

  const verdict = validateNeedsFile(json, { needs, committedVerdicts: deps.committedVerdicts ?? new Map() });
  result.ok = verdict.ok;
  result.fileErrors = verdict.fileErrors;
  if (!verdict.ok) return result;

  // An entry whose work is already done is "already applied", not a refusal (a second apply is a no-op).
  const doneAlready = (entry) => {
    const f = entry && typeof entry.need_id === "string" ? flagById.get(entry.need_id) : null;
    if (!f || f.status !== "resolved" || f.resolved_by !== RESOLVED_BY) return false;
    return parseAppliedNote(f.resolution_note)?.url === entry.url;
  };
  for (const r of verdict.refused) {
    if (doneAlready(json.entries[r.index])) result.alreadyApplied.push({ index: r.index, need_id: r.need_id, why: "already applied" });
    else result.refused.push(r);
  }
  for (const v of verdict.valid) result.valid.push(v);
  if (!result.valid.length) return result;

  // Sources already registered, by institution key, to preview a dry run and to count reuse.
  const sourceRows = await deps.readAll("sources", "id, url, status", { orderBy: "id" });
  const sourceByKey = new Map(sourceRows.map((s) => [institutionKey(s.url), s]));
  const plannedKeys = new Set();

  for (const v of result.valid) {
    const { entry, plan } = v;
    const need = needs.get(entry.need_id);
    const flag = flagById.get(entry.need_id);
    const kind = need.kind;
    result.report.by_kind[kind] = (result.report.by_kind[kind] ?? 0) + 1;

    if (!execute) {
      const key = institutionKey(entry.url);
      const known = sourceByKey.get(key);
      const reuse = !!known || plannedKeys.has(key);
      plannedKeys.add(key);
      if (reuse) result.report.would.sources_existing += 1; else result.report.would.sources_registered += 1;
      if (need.output === "census_worklist") {
        const exists = known ? (await findCensus(deps, known.id, entry.url)).data : null;
        if (!exists) result.report.would.census_rows += 1;
      } else result.report.would.portal_candidates += 1;
      result.report.would.flags_resolved += 1;
      result.written.push({ need_id: entry.need_id, kind, mode: "dry", output: need.output, tier: plan.tier, source_id: known?.id ?? null });
      continue;
    }

    try {
      const reg = await deps.registerSource({ url: entry.url, name: entry.institution, base_tier: plan.tier }, { cite: CITE });
      if (reg.created) result.report.sources_registered += 1; else result.report.sources_existing += 1;

      let outputRef;
      if (need.output === "census_worklist") {
        const made = await ensureCensusRow(
          {
            findExisting: (sid, url) => findCensus(deps, sid, url),
            insertRow: (row) => deps.guardedInsert("census_worklist", row, { cite: CITE, select: "id" }),
          },
          flag.id,
          { source_id: reg.source_id, url: entry.url, lane: "C", shape_class: null, surface_tags: [], notes: `needs-search ${json.batch}: ${entry.institution}` },
          { execute: true },
        );
        if (made.status === "ratified") { result.report.census_rows_created += 1; outputRef = `census_worklist:${made.insertedId}`; }
        else if (made.status === "skipped_exists") { result.report.census_rows_existing += 1; outputRef = `census_worklist:${made.existingId}`; }
        else throw new Error(`census row: ${made.error ?? made.status}`);
      } else {
        const up = await deps.upsertPortalCandidate(reg.source_id, { url: entry.url, anchorText: entry.institution });
        if (up && up.failed) throw new Error("portal_link_candidates upsert failed");
        result.report.portal_candidates_upserted += 1;
        outputRef = `portal_link_candidates:${entry.url}`;
      }

      const note = buildAppliedNote({ key: need.key, url: entry.url, sourceId: reg.source_id, tier: plan.tier, kind, output: outputRef, batch: json.batch });
      const closed = await deps.guardedUpdateByIds(
        "integrity_flags", [flag.id],
        { status: "resolved", resolved_at: now(), resolved_by: RESOLVED_BY, resolution_note: note },
        { cite: CITE, applyMatch: (q) => q.in("status", LIVE_STATUSES) },
      );
      result.report.flags_resolved += closed.updated;
      result.written.push({ need_id: entry.need_id, kind, mode: "applied", output: need.output, tier: plan.tier, source_id: reg.source_id, source_created: !!reg.created, output_ref: outputRef, key: need.key, url: entry.url });
    } catch (err) {
      result.writeFailures.push({ need_id: entry.need_id, error: String(err?.message ?? err) });
    }
  }

  if (execute && result.written.length) {
    const back = new Map((await deps.readAllByIds("integrity_flags", "id, status, resolution_note", result.written.map((w) => w.need_id))).map((r) => [r.id, r]));
    const srcBack = new Map((await deps.readAllByIds("sources", "id, status", [...new Set(result.written.map((w) => w.source_id))])).map((r) => [r.id, r]));
    for (const w of result.written) {
      const f = back.get(w.need_id);
      let outOk;
      if (w.output === "census_worklist") outOk = (await deps.readAll("census_worklist", "id", { match: (q) => q.eq("source_id", w.source_id).eq("document_url", w.url) })).length === 1;
      else outOk = (await deps.readAll("portal_link_candidates", "id", { match: (q) => q.eq("url", w.url) })).length === 1;
      const ok = !!f && f.status === "resolved" && parseAppliedNote(f.resolution_note)?.key === w.key && srcBack.get(w.source_id)?.status === "active" && outOk;
      if (!ok) result.readBackFailures.push(w.need_id);
    }
  }
  return result;
}

/** The harness-run artifact input for one apply run. Pure. */
export function applyArtifactInput({ parsed, r, batchPath, startedAt }) {
  const readBackBad = new Set(r.readBackFailures);
  const failed = new Map(r.writeFailures.map((f) => [f.need_id, f.error]));
  const writtenBy = new Map(r.written.map((w) => [w.need_id, w]));
  const perItem = [
    ...r.valid.map((v) => {
      const e = v.entry;
      const w = writtenBy.get(e.need_id);
      let outcome = parsed.execute ? "applied" : "valid_dry";
      let error = null;
      if (failed.has(e.need_id)) { outcome = "write_failed"; error = failed.get(e.need_id); }
      else if (readBackBad.has(e.need_id)) { outcome = "written_readback_failed"; error = "the stored flag, source or output row did not match what was written"; }
      return { id: e.need_id, outcome, verdict: `${w?.kind ?? "need"}: ${v.plan.host} tier ${v.plan.tier} (${v.plan.tier_source})`, evidence_refs: [batchPath], error };
    }),
    ...r.alreadyApplied.map((a) => ({ id: a.need_id, outcome: "already_applied", verdict: a.why, evidence_refs: [batchPath], error: null })),
    ...r.refused.map((f) => ({ id: f.need_id ?? `entry-${f.index}`, outcome: "refused", verdict: f.errors[0] ?? "refused", evidence_refs: [batchPath], error: f.errors.join(" | ") })),
  ];
  const live = (n) => (parsed.execute ? n : 0);
  const w = r.report.would;
  return {
    action: "apply",
    startedAt,
    config: { mode: parsed.execute ? "apply" : "dry", batch: r.batch, batch_file: parsed.batch },
    inputsRef: [parsed.batch],
    perItem: perItem.length ? perItem : [{ id: r.batch ?? "batch", outcome: "no_entries", verdict: r.fileErrors.join(" | ") || "no valid entries", evidence_refs: [batchPath], error: r.fileErrors[0] ?? null }],
    metrics: {
      entries_total: r.valid.length + r.refused.length + r.alreadyApplied.length,
      valid: r.valid.length, refused: r.refused.length, already_applied: r.alreadyApplied.length,
      sources_registered: live(r.report.sources_registered), sources_existing: live(r.report.sources_existing),
      census_rows_created: live(r.report.census_rows_created), census_rows_existing: live(r.report.census_rows_existing),
      portal_candidates_upserted: live(r.report.portal_candidates_upserted), flags_resolved: live(r.report.flags_resolved),
      would_sources_registered: parsed.execute ? 0 : w.sources_registered, would_sources_existing: parsed.execute ? 0 : w.sources_existing,
      would_census_rows: parsed.execute ? 0 : w.census_rows, would_portal_candidates: parsed.execute ? 0 : w.portal_candidates,
      would_flags_resolved: parsed.execute ? 0 : w.flags_resolved,
      by_kind: JSON.stringify(r.report.by_kind),
      write_failures: r.writeFailures.length, read_back_failures: r.readBackFailures.length,
    },
    defectsFound: [
      ...r.fileErrors.map((e) => ({ description: `batch file refused: ${e}`, root_cause: "structural problem in the committed batch file", fix_ref: null })),
      ...r.refused.map((f) => ({ description: `entry ${f.index} (need ${f.need_id ?? "?"}) refused: ${f.errors.length} reason(s)`, root_cause: f.errors[0] ?? "", fix_ref: null })),
      ...r.writeFailures.map((f) => ({ description: `write for need ${f.need_id} failed`, root_cause: f.error, fix_ref: null })),
    ],
    fullTraceRefs: [batchPath],
    proposerNotes: "Auto-emitted by apply-need-urls.mjs. Refused entries are residue with their reasons in per_item. Each applied entry registered a source at its class-table tier, created a census_worklist row or portal candidate, and resolved its need flag.",
  };
}

/**
 * The real wiring: reads and guarded writes through scripts/lib/db.mjs, the source registry through its
 * registerSource, the portal ledger through the sweep's guarded upsert, and the committed host verdicts. EXPORTED so
 * a test can assert every dep exists (a missing import must not pass dry and fail live).
 */
export async function buildRealDeps() {
  const db = await import("../lib/db.mjs");
  const { upsertPortalLinkCandidates } = await import("./run-source-sweep.mjs");
  return {
    readAll: db.readAll, readAllByIds: db.readAllByIds, guardedUpdateByIds: db.guardedUpdateByIds, guardedInsert: db.guardedInsert,
    registerSource: (source, opts) => db.registerSource(source, opts),
    upsertPortalCandidate: (sourceId, link) => upsertPortalLinkCandidates(null, sourceId, [link]),
    committedVerdicts: loadHostVerdicts().verdicts,
  };
}

if (isMainModule(import.meta.url)) await main();

async function main() {
  loadLocalEnvFile();
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`apply-need-urls: ${parsed.error}\nusage: node scripts/turns/apply-need-urls.mjs --batch <batch.json> [--execute]`);
    process.exit(1);
  }
  if (!parsed.fixture && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error("apply-need-urls: no database credentials, cannot run here (exit 2).");
    process.exit(2);
  }
  const batchPath = resolve(parsed.batch);
  let json;
  try {
    json = JSON.parse(readFileSync(batchPath, "utf8"));
  } catch (err) {
    console.error(`apply-need-urls: cannot read or parse ${batchPath}: ${err.message}`);
    process.exit(1);
  }
  const startedAt = new Date().toISOString();
  const deps = parsed.fixture ? fixtureDeps(JSON.parse(readFileSync(resolve(parsed.fixture), "utf8"))) : await buildRealDeps();
  const r = await applyNeedUrls({ json, execute: parsed.execute, deps });

  if (!r.ok) for (const e of r.fileErrors) console.error(`apply-need-urls: ${e}`);
  console.log(`apply-need-urls: batch ${r.batch ?? "(unnamed)"}: ${r.valid.length} valid, ${r.refused.length} refused, ${r.alreadyApplied.length} already applied${parsed.execute ? "" : " (DRY RUN, nothing written)"}.`);
  for (const f of r.refused) for (const e of f.errors) console.log(`  REFUSED ${e}`);
  for (const w of r.written) console.log(`  ${w.mode === "dry" ? "WOULD APPLY" : "APPLIED"} ${w.kind} ${w.need_id} -> ${w.output} (tier ${w.tier})`);
  for (const f of r.writeFailures) console.error(`apply-need-urls: write FAILED for ${f.need_id}: ${f.error}`);
  if (r.readBackFailures.length) console.error(`apply-need-urls: read-back FAILED for ${r.readBackFailures.join(", ")}`);
  const rep = r.report;
  if (parsed.execute) {
    console.log(`apply-need-urls: sources registered ${rep.sources_registered} (reused ${rep.sources_existing}), census rows created ${rep.census_rows_created} (reused ${rep.census_rows_existing}), portal candidates upserted ${rep.portal_candidates_upserted}, flags resolved ${rep.flags_resolved}`);
  } else {
    console.log(`apply-need-urls: would register ${rep.would.sources_registered} source(s) (reuse ${rep.would.sources_existing}), create ${rep.would.census_rows} census row(s) and ${rep.would.portal_candidates} portal candidate(s), resolve ${rep.would.flags_resolved} flag(s)`);
  }

  const failed = !r.ok || r.readBackFailures.length > 0 || r.writeFailures.length > 0;
  if (parsed.fixture) {
    console.log("apply-need-urls: --fixture run, no harness-run artifact written.");
    process.exit(failed ? 1 : 0);
  }
  const artifactPath = emitNeedsSearchArtifact(applyArtifactInput({ parsed, r, batchPath, startedAt }));
  console.log(`apply-need-urls: wrote ${artifactPath}`);
  process.exit(failed ? 1 : 0);
}
