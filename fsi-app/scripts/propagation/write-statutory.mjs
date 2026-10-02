#!/usr/bin/env node
// write-statutory.mjs, the FIRST `statutory_computations` writer (docs/specs/08-flywheel-design.md section 4's
// FuelEU Maritime worked example, instantiated). Lane DAG-AUTHOR, propagation build-out, 2026-09-04.
//
// FORMULA: reused, not reimplemented. `src/lib/statutory/types.ts`'s `computeStatutory("fueleu_annex_iv_penalty",
// ...)` (Layer 2 of spec section 4's four-layer isolation, built by lane DP-SURF 2026-09-02) IS the calculation ,
// this file only resolves entities, gates every input through `admissibleFor()`, and writes the row. See
// that module and `src/lib/statutory/fueleu-annex-iv.mjs` for the confirmed formula text/citation.
//
// WHY ROWS-FILE-DRIVEN, NOT A LIVE TABLE READ (a finding, not a shortcut): the dispatch that created this
// lane expected this writer to compute "from obligations + market_series inputs." Both were checked live
// (read-only SELECT, Supabase project kwrsbpiseruzbfwjpvsp, 2026-09-04) before writing a line of this file:
//   - `market_series` carries FX/petroleum-spot/oil-bulletin price series, no ship-level GHG intensity or
//     energy-used figure exists in it, or anywhere else in this corpus (grepped migrations/src/scripts).
//   - `obligations` (migration 290, spec-01's register) has 1,149 live rows, but its GRAIN is "one row per
//     dated legal clause" (jurisdiction/mode/binding_position/due_date), it has no ship-level GHG figure
//     either, and the only live row even NAMING Regulation (EU) 2023/1805 is Commission Implementing
//     Regulation 2024/2027 (verification ACTIVITIES, a satellite duty, not the Annex IV penalty
//     calculation itself). Citing it as "the" FuelEU penalty obligation would misrepresent what that row
//     is, refused, named here, not silently done.
// So there is no live source to join today. This writer instead reads a `--rows-file` (JSON) of
// CALLER-ASSERTED, fully-provenanced ship-year figures, the honest shape for "the first writer of a table
// with no live feed yet": every number still carries a real citation/asOf/derivation and is still gated by
// admissibleFor() before it can reach a filing-grade row; nothing is invented to make the table non-empty.
// EXPECTED FIRST-APPLY ROW COUNT AGAINST THE LIVE DB TODAY: 0 (no rows-file has been prepared/reviewed
// yet), see this lane's own report for the honest statement of that number, not a fabricated one.
//
// 2025-TARGET-ONLY, OTHER YEARS REFUSED BY NAME. Article 4(2) of Regulation (EU) 2023/1805, verified LIVE
// against EUR-Lex CELEX:32023R1805 this session (2026-09-04, WebFetch): "The limit referred to in
// paragraph 1 shall be calculated by reducing the reference value of 91,16 grams of CO2 equivalent per MJ
// by the following percentage:, 2% from 1 January 2025." Recital 23: the 91.16 gCO2eq/MJ reference is
// "the fleet average GHG intensity of the energy used on board by ships in 2020," per Regulation (EU)
// 2015/757 (MRV) data. TARGET_2025_GCO2E_PER_MJ below is computed from those two confirmed constants
// (91.16 * (1 - 0.02) = 89.3368, commonly rounded to 89.34). The EUR-Lex fetch mentioned a 6% reduction
// from 2030 without giving verbatim Article text for it, and did not cover 2035/2040/2045/2050 at all, so
// ONLY 2025 is implemented; every other `targetYear` is refused by name (SUPPORTED_TARGET_YEARS), never
// guessed. A future lane extends SUPPORTED_TARGET_YEARS only after confirming the verbatim percentage the
// same way this one was confirmed.
//
// admissibleFor() ENFORCED on every one of the three caller-asserted StatutoryInputs (ghgIntensityActual,
// energyUsedMJ, consecutiveDeficitYears) AND on the baked-in statutory target, each built into a
// types.ts `Value` shape and checked against use='filing' (spec section 3.3's pollution barrier, the strongest
// gate, matching that this row IS a filing-grade figure) before the row is ever assembled. A row with ANY
// input refused by admissibleFor() is skipped whole, never partially filed, and the refusal reason is
// named per-input in the printed summary.
//
// GUARDED WRITE PATH: `statutory_computations` is an ordinary table (unlike `derived_values`, it has no
// `register_*` RPC, migration 286 gives it its own real UNIQUE constraint (entity_id, formula_id,
// formula_version, scenario_key) and its own purity trigger to do the transactional heavy lifting), so
// this file uses `scripts/lib/db.mjs`'s `guardedInsert` (rule-015: cite + prior-state snapshot), the
// SAME distinction author-edges.mjs's own header draws between the two "guarded path" meanings in this
// codebase. Idempotent on the table's own natural key: an existing (entity_id, formula_id, formula_version,
// scenario_key) row is read BEFORE any insert and skipped (never re-inserted, never updated, this table
// has no supersession column; a genuine recompute needs a caller-chosen new scenario_key, same convention
// migration 286 documents for itself).
//
// ENTITY RESOLUTION: `entity_id` (kind='asset', seed=the ship's reader-supplied `shipKey`) and
// `obligation_id` (kind='obligation', seed defaults to a fixed, documented seed identifying THIS statutory
// obligation, 'fueleu-maritime-annex-iv-penalty', since no live `obligations` register row correctly
// names it, per the finding above) are both minted on demand through the entity spine, mirroring
// `resolveRegionEntityId`'s (seed-derived-values.mjs) mint-on-demand posture but generalized to any kind
// (that function is jurisdiction/iso_codes-specific and does not fit here), see `resolveOrMintEntity`
// below. --dry never mints (a pure preview of the id that WOULD be minted).
//
// SAFETY POSTURE: --dry is the DEFAULT. --apply required to write. --rows-file <path> is REQUIRED in
// either mode (there is no live table to fall back to reading, per the finding above, an omitted
// rows-file is a usage error, not a silent 0-row success).
// Exit 0 done · 1 unexpected fatal · 2 no DB creds (self-skip, never crash) · 3 bad/missing --rows-file.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { readAll, guardedInsert, readClient } from "../lib/db.mjs";
import { loadLocalEnvFile } from "../lib/env-file.mjs";
import { isMainModule } from "../lib/is-main.mjs";
import {
  FORMULA_ID, DEFAULT_OBLIGATION_SEED, FUELEU_REFERENCE_GCO2E_PER_MJ, SUPPORTED_TARGET_YEARS,
  ARTICLE_4_2_CITATION, parseRow as parseRowPure, writeOneRow as writeOneRowPure,
  resolveOrMintEntity as resolveOrMintEntityPure,
} from "../../src/lib/propagation/statutory-rows.ts";
import { writeRunArtifact, buildRunArtifactEnvelope, claimRunId, hashHarnessVersion } from "../lib/run-artifact.mjs";
import { GOVERNING_FILES } from "../harness-runs/governing-files.mjs";
// nextRunNumberFromHarnessRuns / buildHarnessRunsClient: shared with plan-quarantine-disposition.mjs's
// identical need, both extracted to scripts/lib/harness-run-number.mjs (F45 duplicate-code flagged the
// two near-identical copies as a regression the moment this file added the second one; one home now).
import { nextRunNumberFromHarnessRuns, buildHarnessRunsClient } from "../lib/harness-run-number.mjs";
export { nextRunNumberFromHarnessRuns };

// ── Harness record (rule 17's other half -- CLAUDE.md: "the harness has recorded the outcome in the
// run's own artifact"). No harness family existed for this writer before this lane (lane
// STATUTORY-WRITER, 2026-09-28; see scripts/harness-runs/statutory/family.json for the full rationale).
// Every run of this CLI, dry or apply, now writes a run artifact under scripts/harness-runs/statutory/
// and best-effort records it to the `harness_runs` table via scripts/lib/record-harness-run.mjs -- that
// insert is operational metadata (run metadata, never customer data), so it is NOT held by R14, the same
// classification plan-quarantine-disposition.mjs (lane QUARANTINE-DISPOSITION, 2026-09-28) gives its own
// harness-run write. The actual `statutory_computations` INSERT in --apply mode IS a live data write and
// stays gated on a reviewed, non-fixture --rows-file exactly as before -- this lane does not relax that.
//
// DOWNSTREAM, ALREADY WIRED AT THE DB LAYER (rule 17's first half -- not re-built here, cited instead of
// re-implemented per the lane-common-contract prior-art rule): `statutory_computations` is deliberately
// TERMINAL in the derivation DAG (migration 285's `derivation_edges_from_table_allowed` CHECK lists it as
// an allowed `from_table` but migration 286's own header and self-check are explicit that a
// `statutory_computations` row is NEVER a `to_value_id` -- "a published statutory figure is the strongest
// class... never an input to anything else"). So this writer does NOT call `author-edges.mjs` the way the
// M5 regional producers do (that would break the purity isolation `F32-statutory-purity.mjs` and the
// `assert_statutory_purity()` trigger enforce). What downstream connection statutory_computations DOES
// have is already DB-native: migration 286 attaches `propagation_outbox_trg` (`AFTER INSERT OR UPDATE OR
// DELETE ON public.statutory_computations`, migration 284's outbox) to this table, so every real INSERT
// this writer makes in --apply mode already emits its own `propagation_events` row with no JS-side call
// needed -- the same trigger `derived_values` uses. Verified by reading migration 286 (lines creating
// `propagation_outbox_trg` on `statutory_computations`) and migration 284's outbox-trigger definition;
// not re-verified live against the DB this session (no credentials in this worktree, R14 holds the write
// regardless -- see write-statutory.test.mjs for the fixture-driven proof of the CLI's own logic).
const FAMILY = "statutory";

// ONE PATH, NOT A SECOND DEFINITION. Row parsing, the write itself, and resolveOrMintEntity's core all
// live in src/lib/propagation/statutory-rows.ts (lane M7a FIX, 2026-09-21, the pure home the route and
// this CLI both import from, so nothing here re-implements them). This file's own residual job is CLI
// concerns only: threading this script's guarded/fs-backed writers (guardedInsert/readAll, which snapshot
// every write to scripts/_snapshots/ for reversibility, exactly the discipline a real --apply run wants,
// and exactly the fs surface that made the pure module unsuitable to default to it) into the pure
// functions' injectable deps, plus arg parsing / env loading / client creation / the process exit codes.
export { FORMULA_ID, DEFAULT_OBLIGATION_SEED, FUELEU_REFERENCE_GCO2E_PER_MJ, SUPPORTED_TARGET_YEARS, ARTICLE_4_2_CITATION };
export const parseRow = parseRowPure;

const CITE = { skill: "DAG-AUTHOR-write-statutory", reason: "FuelEU Annex IV penalty, first statutory_computations writer (docs/specs/08-flywheel-design.md section 4 worked example)" };
const ENTITY_CITE = { skill: "DAG-AUTHOR-write-statutory", reason: "mint the entity a first-time statutory_computations row needs as its subject/obligation" };

/** The CLI's own guarded (snapshot + cite) insertFn, bound to db.mjs's guardedInsert, the "real apply run"
 *  deps this script injects into the pure functions instead of their fs-free plain defaults. */
function guardedInsertFn(cite) {
  return (table, row, opts = {}) => guardedInsert(table, row, { ...opts, cite });
}

/** resolveOrMintEntity, CLI-flavored: same pure core, guarded/cited insert. */
export function resolveOrMintEntity(sb, target, mode, deps = {}) {
  return resolveOrMintEntityPure(sb, target, mode, { insertFn: deps.insertFn ?? guardedInsertFn(ENTITY_CITE) });
}

/**
 * Write ONE statutory_computations row for one parsed rows-file entry, CLI-flavored wrapper over the pure
 * writeOneRow: injects db.mjs's guarded (snapshot + cite) insert/read so a real --apply run keeps its
 * reversibility discipline. See src/lib/propagation/statutory-rows.ts for the pure core and its own doc.
 * @param {object} sb
 * @param {ReturnType<typeof parseRow>} parsed
 * @param {"dry"|"apply"} mode
 * @param {{ now?: () => Date, insertFn?: typeof guardedInsert, resolveEntityFn?: typeof resolveOrMintEntity, readAllFn?: typeof readAll }} [deps]
 */
export async function writeOneRow(sb, parsed, mode, deps = {}) {
  return writeOneRowPure(sb, parsed, mode, {
    now: deps.now,
    insertFn: deps.insertFn ?? guardedInsertFn(CITE),
    resolveEntityFn: deps.resolveEntityFn ?? ((s, target, m) => resolveOrMintEntityPure(s, target, m, { insertFn: guardedInsertFn(ENTITY_CITE) })),
    readAllFn: deps.readAllFn ?? ((table, columns, opts = {}) => readAll(table, columns, opts)),
  });
}

/**
 * Run the writer over a parsed rows-file's raw rows, THEN write this family's own run artifact and
 * best-effort record it to harness_runs (rule 17's harness-record half, every run, dry or apply).
 * Testable end to end with injected fakes: `sb`/`readAllFn`/`recordHarnessRunFn`/`familyDir` are all
 * overridable so a fixture-driven test proves the full row-write-then-harness-record flow with no DB and
 * no real filesystem writes outside a temp dir.
 * @param {{ mode: "dry"|"apply", rawRows: any[] }} opts
 * @param {{ sb: object, log?: Function, now?: Date, trigger?: string, familyDir?: string,
 *   recordHarnessRunFn?: Function, readAllFn?: Function, writeOneRowFn?: typeof writeOneRow }} deps
 */
export async function runWriter({ mode, rawRows }, deps) {
  const {
    sb, log = () => {}, now = new Date(), trigger = "manual",
    familyDir: familyDirOverride = null, recordHarnessRunFn = null,
    readAllFn = readAll, writeOneRowFn = writeOneRow,
  } = deps;
  const startedAt = now.toISOString();

  log(`[write-statutory] mode = ${mode === "apply" ? "APPLY" : "DRY-RUN (default)"}  rows-file rows = ${rawRows.length}`);

  const counts = { written: 0, wouldWrite: 0, skippedAlready: 0, refused: 0, errored: 0 };
  const perItem = [];
  for (const [i, raw2] of rawRows.entries()) {
    let parsed;
    try {
      parsed = parseRow(raw2, i);
    } catch (e) {
      log(`[write-statutory] row[${i}] REFUSED (structural): ${e.message}`);
      counts.refused += 1;
      perItem.push({ id: `row[${i}]`, outcome: "refused-structural", verdict: e.message, evidence_refs: [], error: null });
      continue;
    }
    const out = await writeOneRowFn(sb, parsed, mode);
    if (out.action === "written") { counts.written += 1; log(`[write-statutory] ship=${out.shipKey} WRITTEN computation_id=${out.computationId} result=${out.resultEur.toFixed(2)} EUR`); }
    else if (out.action === "would-write") { counts.wouldWrite += 1; log(`[write-statutory] ship=${out.shipKey} WOULD WRITE (dry) result=${out.resultEur.toFixed(2)} EUR entity=${out.entity_id} obligation=${out.obligation_id}`); }
    else if (out.action === "skipped-already-computed") { counts.skippedAlready += 1; log(`[write-statutory] ship=${out.shipKey} already computed (computation_id=${out.computationId}), skipped, idempotent`); }
    else if (out.action === "refused-inadmissible") { counts.refused += 1; log(`[write-statutory] ship=${out.shipKey} REFUSED, ${out.field} not admissible for filing: ${out.reason}`); }
    else { counts.errored += 1; log(`[write-statutory] ship=${out.shipKey} ERRORED: ${out.reason}`); }
    perItem.push({
      id: out.shipKey ?? `row[${i}]`, outcome: out.action,
      verdict: out.resultEur != null ? `result=${out.resultEur} EUR` : (out.reason ?? out.field ?? null),
      evidence_refs: [], error: out.action === "errored" ? out.reason : null,
    });
  }
  log(`[write-statutory] summary: written=${counts.written} would-write(dry)=${counts.wouldWrite} skipped-already=${counts.skippedAlready} refused=${counts.refused} errored=${counts.errored}`);

  // ── harness-run artifact (every run, dry or apply -- rule 17's harness-record half) ──────────────────
  const fsiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const familyDir = familyDirOverride || resolve(fsiRoot, "scripts/harness-runs", FAMILY);
  const harnessVersion = hashHarnessVersion(GOVERNING_FILES[FAMILY], fsiRoot);
  const nextNumber = await nextRunNumberFromHarnessRuns(readAllFn, FAMILY);
  const runId = claimRunId(familyDir, FAMILY, { startAt: nextNumber });

  const defectsFound = [];
  if (counts.errored) {
    defectsFound.push({
      description: `${counts.errored} row(s) errored during this run (see per_item for the reason).`,
      root_cause: "Per-row DB/unexpected error, not a business-level refusal (those are counted separately as refused-inadmissible/refused-structural).",
      fix_ref: null,
    });
  }

  const config = { mode, trigger, rows_file_row_count: rawRows.length, r14_live_write_held: mode === "apply" };
  const metrics = { rows: rawRows.length, ...counts };

  const artifact = buildRunArtifactEnvelope({
    family: FAMILY, harnessVersion, runId, startedAt, config,
    inputsRef: ["src/lib/propagation/statutory-rows.ts"],
    perItem, metrics, defectsFound,
    fullTraceRefs: ["docs/specs/08-flywheel-design.md", "docs/plans/data-machine-tool-gaps-2026-09-25.md"],
    proposerNotes:
      "statutory_computations is terminal in the derivation DAG by design (migration 286): this run authors no " +
      "derivation_edges. Downstream propagation is DB-native (propagation_outbox_trg on statutory_computations, " +
      "migration 286) and fires automatically on a real INSERT; a real --apply write against the live DB stays a " +
      "live data write held under R14 until the operator lifts the build hold.",
  });

  const artifactPath = writeRunArtifact(familyDir, artifact);
  log(`wrote ${artifactPath}`);

  let harnessRunRow = null;
  try {
    const recordFn = recordHarnessRunFn || (await import("../lib/record-harness-run.mjs")).recordHarnessRun;
    // NEVER `sb` here: `sb` is (or wraps) scripts/lib/db.mjs's readClient() guard proxy, whose
    // .from(table).insert THROWS by design (rule 015). harness_runs is exempt from that rule (an INSERT
    // is additive, never a mutation -- record-harness-run.mjs's own header), so this gets its OWN
    // genuine write-capable client. `recordHarnessRunFn` (test override) bypasses this entirely and is
    // called with `sb` unchanged, so fixture tests never need real credentials.
    const harnessRunsClient = recordHarnessRunFn ? sb : await buildHarnessRunsClient();
    harnessRunRow = await recordFn(harnessRunsClient, artifact, { log });
    if (!harnessRunRow?.ok) log(`record-harness-run: insert did not land (${harnessRunRow?.error ?? "unknown reason"}) -- see harnessRunRow in this run's own return value.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`record-harness-run: not recorded this run (best-effort): ${msg}`);
    harnessRunRow = { ok: false, error: msg };
  }

  return { runId, artifactPath, counts, perItem, harnessRunRow };
}

// ── CLI entrypoint, never reached on import ────────────────────────────────────────────────────────────

async function main() {
  loadLocalEnvFile();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("write-statutory: no DB creds, cannot run here (exit 2).");
    process.exit(2);
  }
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const mode = apply ? "apply" : "dry";
  const rowsFileIdx = args.indexOf("--rows-file");
  if (rowsFileIdx === -1 || !args[rowsFileIdx + 1]) {
    console.error("write-statutory: --rows-file <path> is required (no live table to read from, see file header). exit 3.");
    process.exit(3);
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(resolve(process.cwd(), args[rowsFileIdx + 1]), "utf8"));
  } catch (e) {
    console.error(`write-statutory: could not read/parse --rows-file: ${e.message} (exit 3).`);
    process.exit(3);
  }
  const rawRows = Array.isArray(raw) ? raw : raw.rows;
  if (!Array.isArray(rawRows) || !rawRows.length) {
    console.error("write-statutory: --rows-file has no rows[] (or is not an array). exit 3.");
    process.exit(3);
  }

  const sb = readClient();
  const r = await runWriter({ mode, rawRows }, { sb, log: console.log, trigger: "manual" });
  console.log(`[write-statutory] run_id=${r.runId} artifact=${r.artifactPath}`);
  process.exit(r.counts.errored ? 1 : 0);
}

// F67 (lane R20, 2026-10-01): standardized on isMainModule from scripts/lib/is-main.mjs, replacing the
// inlined fileURLToPath/resolve comparison this file used before (same correct semantics).
if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error(`[write-statutory] FATAL: ${e.message}`);
    process.exit(1);
  });
}
