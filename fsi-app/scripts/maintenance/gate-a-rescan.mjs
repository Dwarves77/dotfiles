// SHARED-WRITER: intelligence_items
// (item_gate_a_state is NOT declared here: its one writer is scripts/lib/gate-a-state-writer.mjs, which
// carries its own SHARED-WRITER marker and the guarded-write call shape the shared-writer-registry test
// detects. This file only calls the writer module's exported upsert/read functions -- declaring the
// table here without a write site of its own in THIS file would be a stale marker.)
// gate-a-rescan.mjs -- the Gate A re-scan hop (lane M6b, 2026-09-21, build plan section 6.1 row M6,
// docs/dispatches/lane-briefs/2026-09-20/brief-m6-amendment-1.md sections C and D).
//
// WHY THIS EXISTS. No bulk re-scan script existed before this lane: the scanner
// (src/lib/agent/gate-a-scan.mjs, GATE_A_VERSION, scanBrief) and the pure row builder
// (buildGateARow, src/lib/intake/write-item.ts) only ever ran at mint time or inside
// scripts/mint/heal-provenance.mjs's own per-item pass -- nothing swept the corpus for an
// item_gate_a_state row whose gate_a_version has fallen behind the live scanner. This script is that
// sweep: one caller, dry or apply, bounded, $0 (no LLM, no fetch -- every input is already-stored rows).
//
// TWO COVERAGE ARMS (brief item 2, premise). buildGateARow takes `derivedCovered`; the live value is
// derivedCoveredTokens(sb, itemId) (src/lib/agent/gate-a-derived.mjs). A caller that omits it strips
// Gate B coverage silently (the exact defect scripts/mint/heal-provenance.mjs's header records, 16
// orphan tokens on 5 items). This script computes it FRESH per item, immediately before the row is
// built, exactly as canonical-pipeline.ts does -- never the buildGateARow default (an empty Set).
//
// ONE WRITER. The update-or-insert of item_gate_a_state is scripts/lib/gate-a-state-writer.mjs's
// readGateAStateRow/upsertGateAState -- the SAME two functions scripts/maintenance/provenance-heal.mjs
// now delegates to (lane M6b item 1). This file never re-implements that semantics.
//
// STATUS IS A CACHE (remediation-discipline 5.6). set_provenance_status does NOT watch
// item_gate_a_state (scripts/mint/rederive-record-provenance.mjs's own header) -- a re-scan that
// changes a row's result and stops there leaves provenance_status stale. So whenever scanned_hash or
// orphan_count changes (or the row was previously missing), this script touches the item through
// guardedUpdateByIds exactly as rederive-record-provenance.mjs's own touch does, then reads back
// provenance_status -- never inventing the new value, only re-firing the real trigger.
//
// BOUNDS (brief item 2, enforced HERE, in the script, not only by the workflow's own inputs).
// resolveLimit({trigger, requested}): a workflow_run (chained) firing is ALWAYS capped at 50,
// regardless of what is requested -- the chained trigger never accepts an operator-picked limit. A
// workflow_dispatch (or any other trigger) defaults to 500 when nothing is requested, and REFUSES
// (non-zero exit, named reason) any requested value above 2,000 -- never silently clamped.
//
// SELECTION, PURE AND TESTED. Candidates: non-archived intelligence_items rows with a non-empty
// full_brief whose item_gate_a_state row's gate_a_version differs from GATE_A_VERSION, or that have no
// state row at all. Order: item ids the upstream run's own harness-run artifact recorded touching
// first (from scripts/harness-runs/<upstream-family>/<upstream-family>-run-NNN.json, matched by
// config.github_run_id against the upstreamRunId this run was given -- see scripts/lib/run-artifact.mjs
// / loop-run-id.mjs, the SAME artifact convention every other hop in this repo already reads), then
// the rest ordered by their OWN prior scanned_at ascending (oldest-scanned-first; a row with no prior
// state sorts first of all -- never scanned is staler than any scanned_at). When the upstream artifact
// is not on the tree this run checked out, config.scope_source records that honestly rather than
// silently falling back with no explanation.
//
// PER-ITEM VERIFICATION. Apply mode writes through upsertGateAState, then reads the row BACK
// (readGateAStateRow) and requires gate_a_version === GATE_A_VERSION -- a mismatch halts the run
// non-zero (never continues on an unverified write, per this lane's own no-workaround rule).
//
// NO KILL-SWITCH HELPER NEEDED (brief item 2, [CONFIRMED by grep]). Neither the chained workflows
// (brief-apply.yml, downstream-chain.yml) nor this hop carry a shared kill-switch helper, and this hop
// has no `schedule:` trigger (rule 11's kill-switch duty is for a SCHEDULED recurring worker). The
// gates here are the workflow job's own `if:`, this script's own resolveLimit bound, and `dry` as the
// dispatch default -- inventing a kill-switch mechanism for a hop that has neither a schedule nor a
// documented shared kill-switch pattern is out of scope for this lane.
import { resolve } from "node:path";
import { isMainModule } from "../lib/is-main.mjs";
import { runCli, fsiRoot } from "./lib/cli.mjs";
import { buildGateARow } from "../../src/lib/intake/write-item.ts";
import { GATE_A_VERSION } from "../../src/lib/agent/gate-a-scan.mjs";
import { derivedCoveredTokens } from "../../src/lib/agent/gate-a-derived.mjs";
import { readGateAStateRow, upsertGateAState } from "../lib/gate-a-state-writer.mjs";
import { readRunHistory } from "../lib/run-artifact.mjs";
import { FAMILY_BY_WORKFLOW_NAME } from "../lib/loop-run-id.mjs";

export const CITE = Object.freeze({
  skill: "gate-a-rescan-2026-09-21",
  reason:
    "Lane M6b (build plan section 6.1 row M6): the Gate A re-scan hop -- refreshes item_gate_a_state " +
    "rows whose gate_a_version has fallen behind the live scanner (GATE_A_VERSION), computing Gate B " +
    "derived coverage fresh per item (derivedCoveredTokens) and re-firing set_provenance_status via the " +
    "SAME guarded touch rederive-record-provenance.mjs already uses, since provenance_status is a " +
    "cache the scan alone does not refresh.",
});

const DISPATCH_DEFAULT_LIMIT = 500;
const DISPATCH_LIMIT_CAP = 2000;
const CHAINED_LIMIT = 50;

/**
 * Bound this run's own item limit. Pure. A `workflow_run` (chained) trigger is ALWAYS capped at
 * `CHAINED_LIMIT` (50) regardless of `requested` -- a chained firing never accepts an operator-picked
 * limit. Any other trigger (workflow_dispatch, a local by-hand run) defaults to `DISPATCH_DEFAULT_LIMIT`
 * (500) when `requested` is blank/absent, and REFUSES (never clamps) a requested value above
 * `DISPATCH_LIMIT_CAP` (2,000) or a non-positive/non-numeric one.
 * @param {{ trigger: string, requested?: string|number|null }} opts
 * @returns {{ limit: number|null, refused: boolean, reason: string|null }}
 */
export function resolveLimit({ trigger, requested }) {
  if (trigger === "workflow_run") {
    return { limit: CHAINED_LIMIT, refused: false, reason: null };
  }
  const blank = requested === undefined || requested === null || String(requested).trim() === "";
  const raw = blank ? DISPATCH_DEFAULT_LIMIT : Number(requested);
  if (!Number.isFinite(raw) || raw <= 0) {
    return {
      limit: null, refused: true,
      reason: `--limit must be a positive number for a dispatch run (got ${JSON.stringify(requested)})`,
    };
  }
  if (raw > DISPATCH_LIMIT_CAP) {
    return {
      limit: null, refused: true,
      reason: `requested limit ${raw} exceeds the ${DISPATCH_LIMIT_CAP} cap for a dispatch run -- not clamped, refused`,
    };
  }
  return { limit: raw, refused: false, reason: null };
}

/**
 * Selects and orders the ids this run should scan. Pure -- no I/O.
 * @param {{ items: {id:string, full_brief: string|null}[], stateByItemId: Map<string, {gate_a_version:string, scanned_at?:string}>, gateAVersion: string, touchedFirstIds?: string[] }} opts
 * @returns {string[]} ordered candidate ids (touched-first, then scanned_at ascending / never-scanned first)
 */
export function selectStaleItems({ items, stateByItemId, gateAVersion, touchedFirstIds = [] }) {
  const candidates = items.filter(
    (it) => !it.is_archived && typeof it.full_brief === "string" && it.full_brief.trim().length > 0,
  );
  const stale = candidates.filter((it) => {
    const state = stateByItemId.get(it.id);
    return !state || state.gate_a_version !== gateAVersion;
  });
  const staleIds = new Set(stale.map((it) => it.id));

  const touchedOrdered = touchedFirstIds.filter((id) => staleIds.has(id));
  const touchedSet = new Set(touchedOrdered);

  const rest = stale
    .filter((it) => !touchedSet.has(it.id))
    .sort((a, b) => {
      const as = stateByItemId.get(a.id)?.scanned_at ?? "";
      const bs = stateByItemId.get(b.id)?.scanned_at ?? "";
      return as < bs ? -1 : as > bs ? 1 : 0;
    })
    .map((it) => it.id);

  return [...touchedOrdered, ...rest];
}

/**
 * @param {{ mode?: "dry"|"apply", arg?: string, out?: string|null }} opts
 * @param {object} deps -- see buildDeps below for the real-DB wiring; tests inject a fake.
 */
export async function main({ mode = "dry", arg = "" } = {}, deps) {
  const trigger = deps.trigger === "workflow_run" ? "workflow_run" : "workflow_dispatch";
  const limitResult = resolveLimit({ trigger, requested: deps.requestedLimit });
  if (limitResult.refused) {
    return {
      step: "gate-a-rescan", mode, counts: {}, applied: 0, read_back: {}, exitCode: 1,
      note: `REFUSED -- ${limitResult.reason}`,
    };
  }
  const limit = limitResult.limit;

  const items = await deps.readCandidateItems();
  const ids = items.map((it) => it.id);
  const stateRows = ids.length ? await deps.readGateAStates(ids) : [];
  const stateByItemId = new Map(stateRows.map((r) => [r.intelligence_item_id, r]));

  let touchedFirstIds = [];
  let scopeSource = "scanned_at ascending only -- no upstream artifact on the tree this run checked out";
  if (deps.upstreamRunId) {
    const found = await deps.readUpstreamTouchedIds(deps.upstreamRunId);
    if (found) {
      touchedFirstIds = found;
      scopeSource = `upstream ${deps.upstreamFamily ?? "(unknown family)"} artifact for run ${deps.upstreamRunId}`;
    }
  }

  const orderedStaleIds = selectStaleItems({ items, stateByItemId, gateAVersion: GATE_A_VERSION, touchedFirstIds });
  const selected = orderedStaleIds.slice(0, limit);
  const itemsById = new Map(items.map((it) => [it.id, it]));

  const perItem = [];
  let touchedCount = 0;
  for (const itemId of selected) {
    const itemMeta = itemsById.get(itemId);
    const priorState = stateByItemId.get(itemId) ?? null;
    const claims = await deps.readFactClaims(itemId);
    const derivedCovered = await deps.derivedCoveredTokens(itemId);
    const row = buildGateARow({ itemId, fullBrief: itemMeta.full_brief, factClaims: claims, derivedCovered });

    const versionBefore = priorState?.gate_a_version ?? null;
    const orphanBefore = priorState?.orphan_count ?? null;
    const hashChanged = (priorState?.scanned_hash ?? null) !== row.scanned_hash;

    let touched = false;
    let provenanceBefore = null;
    let provenanceAfter = null;

    if (mode === "apply") {
      await deps.upsertGateAState(row, !!priorState);
      const readBack = await deps.readGateAStateRow(itemId);
      if (!readBack || readBack.gate_a_version !== GATE_A_VERSION) {
        return {
          step: "gate-a-rescan", mode, counts: { candidates: items.length, stale: orderedStaleIds.length, selected: selected.length, limit, touched: touchedCount },
          applied: touchedCount, read_back: {}, per_item: perItem, exitCode: 1,
          note: `HALT -- item ${itemId} failed per-step verification (readback gate_a_version !== ${GATE_A_VERSION})`,
        };
      }
      const orphanChanged = (priorState?.orphan_count ?? null) !== row.orphan_count;
      if (hashChanged || orphanChanged || !priorState) {
        provenanceBefore = await deps.readProvenanceStatus(itemId);
        await deps.touchItem(itemId);
        provenanceAfter = await deps.readProvenanceStatus(itemId);
        touched = true;
        touchedCount += 1;
      }
    }

    perItem.push({
      id: itemId,
      gate_a_version_before: versionBefore, gate_a_version_after: row.gate_a_version,
      orphan_count_before: orphanBefore, orphan_count_after: row.orphan_count,
      hash_changed: hashChanged, touched,
      provenance_status_before: provenanceBefore, provenance_status_after: provenanceAfter,
    });
  }

  const distinctVersionsRemaining = mode === "apply" ? await deps.countDistinctGateAVersions() : null;

  return {
    step: "gate-a-rescan", mode,
    counts: { candidates: items.length, stale: orderedStaleIds.length, selected: selected.length, limit, touched: touchedCount },
    applied: touchedCount,
    read_back: { distinct_versions_remaining: distinctVersionsRemaining },
    per_item: perItem,
    config: { scope_source: scopeSource, trigger, limit },
    exitCode: 0,
  };
}

/** Real-DB deps for the CLI entrypoint. `trigger`/`requestedLimit`/`upstreamName`/`upstreamRunId` come
 *  from this run's own environment (set by gate-a-rescan.yml -- see that file's "Resolve run parameters"
 *  step), never from --arg/--mode/--out (the fixed cli.mjs contract this script shares with every other
 *  scripts/maintenance/*.mjs step). */
export async function buildDeps() {
  const { readAll, readAllByIds, readClient, guardedUpdateByIds } = await import("../lib/db.mjs");
  const rc = readClient();

  const trigger = process.env.GAR_TRIGGER === "workflow_run" ? "workflow_run" : "workflow_dispatch";
  const requestedLimit = process.env.GAR_LIMIT ?? null;
  const upstreamName = process.env.GAR_UPSTREAM_NAME || null;
  const upstreamRunId = process.env.GAR_UPSTREAM_RUN_ID || null;
  const upstreamFamily = upstreamName != null ? (FAMILY_BY_WORKFLOW_NAME[upstreamName] ?? null) : null;

  return {
    trigger, requestedLimit, upstreamRunId, upstreamFamily,
    readCandidateItems: () => readAll("intelligence_items", "id, full_brief, is_archived", {
      match: (q) => q.eq("is_archived", false),
    }),
    readGateAStates: (ids) => readAllByIds(
      "item_gate_a_state", "intelligence_item_id, gate_a_version, orphan_count, scanned_hash, scanned_at",
      ids, { idColumn: "intelligence_item_id" },
    ),
    readFactClaims: (itemId) => readAll("section_claim_provenance", "claim_text, source_span", {
      match: (q) => q.eq("intelligence_item_id", itemId).eq("claim_kind", "FACT"),
    }),
    derivedCoveredTokens: (itemId) => derivedCoveredTokens(rc, itemId),
    readGateAStateRow: (itemId) => readGateAStateRow(rc, itemId),
    upsertGateAState: (row, exists) => upsertGateAState(row, exists, { cite: CITE }),
    readProvenanceStatus: async (itemId) => {
      const { data, error } = await rc.from("intelligence_items").select("provenance_status").eq("id", itemId).maybeSingle();
      if (error) throw new Error(`gate-a-rescan: readProvenanceStatus failed: ${error.message}`);
      return data?.provenance_status ?? null;
    },
    touchItem: (itemId) => guardedUpdateByIds(
      "intelligence_items", [itemId], { updated_at: new Date().toISOString() },
      { cite: CITE, select: "id" },
    ),
    readUpstreamTouchedIds: async (runId) => {
      if (!upstreamFamily) return null;
      const dir = resolve(fsiRoot(), "scripts", "harness-runs", upstreamFamily);
      const { runs } = readRunHistory(dir);
      const run = runs.find((r) => String(r?.config?.github_run_id ?? "") === String(runId));
      if (!run) return null;
      return (run.per_item ?? []).map((p) => p?.id).filter((id) => typeof id === "string" && id.length > 0);
    },
    countDistinctGateAVersions: async () => {
      const all = await readAll("item_gate_a_state", "gate_a_version");
      return new Set(all.map((r) => r.gate_a_version)).size;
    },
  };
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) {
  await runCli({ step: "gate-a-rescan", main, needsDb: true, buildDeps });
}
