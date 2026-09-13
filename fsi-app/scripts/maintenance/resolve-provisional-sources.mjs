#!/usr/bin/env node
// resolve-provisional-sources.mjs: MAINT step for task 7.5 item 1 of the W9 brief-chain build plan,
// Part 7 (ADR-030 rider, 2026-09-12), fixed per docs/plans/defect-fix-plan-2026-09-12.md (D2, D3, D4,
// D13). Live facts named in the dispatch [CONFIRMED by the coordinator, 2026-09-12]: `provisional_sources`
// has 489 rows with status pending_review since April; `sources` has 563 rows with status provisional.
//
// D13 FIX (2026-09-12), SUPERSEDING THE ORIGINAL RULE (c) BELOW: the dry run 34724257806 rejected 248
// rows on rule (c) alone -- real institutions (irishstatutebook.ie, transport.gov.scot, theccc.org.uk,
// dma.dk, cre.fr, belastingdienst.nl, bmluk.gv.at, mindop.sk) -- because EVERY `provisional_sources` row,
// all 497 of them, has `accessibility_verified=false` (the column's own INSERT DEFAULT; no accessibility
// check has ever actually run against any of them). Rule (c) was reading an absent check as a negative
// result and rejecting a real institution on that absence -- under standing rules 16/18 and ADR-030, an
// unreachable URL on a real institution is a STATUS, never a rejection, and an unknown host is a
// QUESTION (the worklist), never a rejection. Rule (c) is REMOVED. THE RULE is now two-way, not
// three-way: (a) or (b) promotes/activates; otherwise (d) worklists. Accessibility never decides
// promote vs. worklist. What accessibility DOES do: the PROMOTED `sources` row's own `status` carries
// the accessibility fact it already has on record -- `active` when `fetch_status` is ok or null,
// `inaccessible` when `fetch_status='error'` (both live values in `sources_status_check`, migration
// 004/147) -- so a promoted real institution that happens to be down right now is visible as
// inaccessible, never silently rejected. `accessibility_verified` (the `provisional_sources`-only
// column) is never read as evidence of anything until a check has actually run and stamped it; today
// that is never, so this step reads it nowhere. A decline is still possible for a `provisional_sources`
// row, but only from the vertical-fit gate the promote arm already runs (an off-vertical retired host),
// never from rule (c).
//
// THE RULE (task 7.5, verbatim, HISTORICAL -- rule (c) below is REMOVED per D13 above, kept verbatim so
// the fix is legible against what it replaced), for every such row: "(a) the host's registrable domain
// matches an existing active institution in `sources` -> inherit its canonical tier, promote/activate
// (the same write /api/admin/sources/promote's promote arm makes; reuse its logic through a shared
// module, never a second copy); (b) the SC-13 class table (classTierForHost / decidePoolHostRegistration)
// resolves a tier -> promote/activate at that tier; (c) [REMOVED, D13] the URL is dead or the row's
// accessibility check failed -> reject with the reason; (d) otherwise the host is unclassifiable -> ONE
// integrity_flags worklist row per run in the null-tier-host shape listing the hosts (a batched
// question for the class table, never a per-row click), and the row's status set to the existing
// vocabulary's value for 'awaiting class-table ruling'. Every decision writes reviewer_notes and
// reviewed_at."
//
// TWO TABLES, ONE RULE, DIFFERENT WRITE SHAPES:
//   - `provisional_sources` (columns per the dispatch: accessibility_verified BOOLEAN,
//     `provisional_sources_status_check` allows pending_review, confirmed, rejected, needs_more_data,
//     promoted -- migration 004 plus migration 317, defect D2, applied live by the coordinator before
//     this code merges per standing rule 3: D2 evidence was that the promote route's `status:
//     "promoted"` write had never succeeded against the pre-317 constraint, 0 promoted rows, 0 rows
//     with promoted_to_source_id). Rule (a)/(b) PROMOTE: insert a new `sources` row via the SAME
//     shared builder /api/admin/sources/promote's approve arm now uses
//     (src/lib/sources/promote-provisional.ts's buildPromotedSourceRow + the SAME Q10 canonical-URL
//     dedup guard + the SAME checkVerticalFitGate off-vertical block, reused, not re-copied, per the
//     task's own instruction), mark the provisional row status=PROVISIONAL_SOURCES_PROMOTED_STATUS
//     (that module's own exported constant, "promoted", never a bare literal here). Rule (c) [REMOVED,
//     D13] no longer exists for this table; a decline is possible only from the vertical-fit gate the
//     promote arm already runs, via rejectProvisional/PROVISIONAL_SOURCES_REJECTED_STATUS ("rejected").
//     Rule (d) WORKLIST: status='needs_more_data', the one CHECK-legal value that semantically fits
//     "awaiting class-table ruling" (no dedicated value exists in the tracked CHECK list; this is a
//     documented judgment call, not a schema fact; see the constant PROVISIONAL_WORKLIST_STATUS below
//     for where to change it if the coordinator rules otherwise). reviewer_notes + reviewed_at are
//     stamped on every outcome.
//   - `sources` WHERE status='provisional' (migration 004: status IN
//     ('active','stale','inaccessible','provisional','suspended')). The row ALREADY EXISTS, so
//     promote/worklist are UPDATEs, never a second INSERT. Rule (a)/(b) PROMOTE (D13 fix): status is
//     `sourcesStatusForPromote(row)` -- 'active' when `fetch_status` (migration 147) is ok or null,
//     'inaccessible' when `fetch_status='error'` -- never a reject; base_tier/effective_tier stamped to
//     the resolved tier (never tier_override, SC-13's own escape hatch stays reserved for an explicit
//     operator act, not an automatic resolver). 'cdn_block'/'blocked' are a WALL, not dead, "a wall is
//     not a dead link", the SAME posture canonical-autoverify.mjs's own authority-downgrade rule
//     already takes -- a wall-fetch_status row still promotes to 'active', its reachability is a
//     separate, already-run signal this step only consumes, never re-probes. Rule (c) [REMOVED, D13]:
//     there is no decline path for this table any more (no vertical-fit gate runs on `sources`-table
//     rows; `rejectSourcesRow`/`SOURCES_REJECT_STATUS` remain as the D4 on-row-reason mechanism for a
//     future decline path, currently unreachable from this step's own decision space, which is now
//     promote-or-worklist only for this table). Rule (d) WORKLIST: status stays 'provisional' (there is
//     no dedicated "awaiting ruling" value in the tracked CHECK list, and 'provisional' already IS the
//     awaiting-decision resting state for this table, no status change is invented). `sources` has no
//     `reviewer_notes`/`reviewed_at` columns (migration 004 has neither; migration 007 adds only
//     `notes`); promote/worklist record their outcome in `notes` for this table, a disclosed
//     schema-driven substitution for the "every decision writes reviewer_notes and reviewed_at"
//     instruction, not a silent gap.
//
// REUSE, NEVER A SECOND COPY (per the task's own instruction and CLAUDE.md's Reuse-before-construction
// doctrine):
//   - existingTierForHost (rule a): scripts/maintenance/canonical-autoverify.mjs's own live-registry
//     lookup, institutionKey-keyed exactly like db.mjs's registerSource dedups, imported, not
//     reimplemented.
//   - classTierForHost / decidePoolHostRegistration (rule b): src/lib/sources/host-authority.ts, the
//     SC-13 moat-safe class table, the SAME function registerPoolHostsForGrounding and
//     resolve-cited-host-gate.mjs (task 7.4) both already consume.
//   - buildPromotedSourceRow / findExistingSourceByCanonicalUrl (rule a/b promote, provisional_sources
//     only), PROVISIONAL_SOURCES_PROMOTED_STATUS / PROVISIONAL_SOURCES_REJECTED_STATUS (defect D2):
//     src/lib/sources/promote-provisional.ts, extracted THIS TASK out of
//     /api/admin/sources/promote/route.ts's approve arm specifically so this step and the route share
//     one row shape and one status vocabulary (see that module's own header).
//   - checkVerticalFitGate (rule a/b promote, provisional_sources only): src/lib/sources/
//     vertical-fit-gate.ts, the SAME off-vertical block the promote route runs before ever inserting a
//     new `sources` row; an automatic resolver must not re-add a host the operator deliberately
//     retired as off-vertical any more readily than a human reviewer would.
//   - planHostDecision / buildNullTierHostWrite (rule d, defect D3 fix): src/lib/sources/
//     null-tier-host-worklist.mjs, the SAME idempotent per-host worklist mechanism
//     resolve-cited-host-gate.mjs (task 7.4) reuses. Review finding 2 (review-7.5.md, CONFIRMED): the
//     prior version of this file built a SECOND, bespoke, non-idempotent mechanism
//     (buildBatchWorklistFlag, one row per RUN, re-read every run because
//     readPendingProvisional()'s own query includes the worklisted status, so every re-run with any
//     still-unclassifiable host inserted a brand new open integrity_flags row alongside the previous
//     one). That mechanism is DELETED. Every unclassifiable host now merges into the SAME per-host
//     open flag the platform already reviews (readNullTierFlag/insertNullTierFlag/updateNullTierFlag
//     below, mirroring resolve-cited-host-gate.mjs's own main() read-before-write shape exactly). The
//     synthetic per-row "item id" `buildNullTierHostWrite`'s aggregate keys on is
//     `${table}:${row.id}` (there is no intelligence_items row backing a provisional_sources/sources
//     record), so a repeat resolve of the SAME row contributes to the aggregate exactly once
//     (idempotent), proven by this file's own idempotency test (a second run over the same
//     still-unclassifiable input inserts 0 new flag rows and updates the existing per-host row's
//     contribution list instead).
//
// $0, NO LLM CALL. Every check is the deterministic host-authority class table and the live-registry
// lookup, never a model guess, per SC-13 (source-credibility-model skill Section 3): "no LLM tier
// guesses and no default tier." `fetch_status` (never `accessibility_verified`, defect D13 fix) is
// consulted only to stamp the promoted `sources` row's own status, never to gate promote vs. worklist.
//
// DRY BY DEFAULT. `main(opts, deps)` never writes without `mode: "apply"`; `--mode apply` is required
// to touch the database, matching every other MAINT wrapper in this family (backfill-format-type.mjs /
// retype-eu-decisions.mjs as the named templates).
//
// NO LIVE VERIFICATION IN THIS SESSION [CONFIRMED per dispatch brief facts, NOT independently
// re-verified here, no DB credentials in this worktree]. The 489/563 counts are the coordinator's own
// live read; this script's own dry mode is the mechanism that reconfirms them at dispatch time before
// any apply.
import { resolve } from "node:path";
import { readAll, guardedUpdate, guardedInsert, hostOf } from "../lib/db.mjs";
import { classTierForHost } from "../../src/lib/sources/host-authority.ts";
import {
  buildPromotedSourceRow,
  findExistingSourceByCanonicalUrl,
  PROVISIONAL_SOURCES_PROMOTED_STATUS,
  PROVISIONAL_SOURCES_REJECTED_STATUS,
} from "../../src/lib/sources/promote-provisional.ts";
import { planHostDecision, buildNullTierHostWrite } from "../../src/lib/sources/null-tier-host-worklist.mjs";
import { existingTierForHost } from "./canonical-autoverify.mjs";
import { runCli, fsiRoot } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";
// `checkVerticalFitGate` (src/lib/sources/vertical-fit-gate.ts) imports the `@/lib/...` TS path alias
// (vertical-fit.ts), which only Next.js's own bundler or an alias-configured jiti resolves; a plain
// relative import throws ERR_MODULE_NOT_FOUND under `node`, same constraint backfill-format-type.mjs's
// own header documents for extract-registry.ts. Loaded lazily, inside buildDeps() below, never at
// module top level, so this file's own test (resolve-provisional-sources.test.mjs, in the no-npm
// glob) never needs jiti.

export const CITE = Object.freeze({
  skill: "brief-chain-build-plan-2026-09-11 Part 7 task 7.5 item 1 / defect-fix-plan-2026-09-12 D2/D3/D4/D13",
  reason:
    "Resolve pending provisional_sources rows and status='provisional' sources rows by the deterministic " +
    "SC-13 rules: an institution-match or a class-table tier promotes/activates, with the promoted " +
    "sources row's own status carrying the accessibility fact it already has on record (active when " +
    "fetch_status is ok or null, inaccessible when fetch_status='error'); accessibility never decides " +
    "promote vs. worklist (defect D13 fix, rule c removed). An unclassifiable host merges into the SAME " +
    "per-host null-tier-host integrity_flags worklist the platform already reviews, never a guessed tier " +
    "and never a second worklist mechanism.",
});

export const PROVISIONAL_WORKLIST_STATUS = "needs_more_data";
export const SOURCES_REJECT_STATUS = "suspended";

// ---------------------------------------------------------------------------------------------------
// Pure decision logic (unit-tested with no I/O).
// ---------------------------------------------------------------------------------------------------

/**
 * THE rule, table-agnostic: given a host's resolved signals, which of the two outcomes fires.
 * Rule (c) (dead/inaccessible -> reject) is REMOVED (defect D13 fix, docs/plans/defect-fix-plan-2026-09-12.md):
 * accessibility never decides promote vs. worklist. An absent check (provisional_sources.accessibility_verified's
 * own INSERT default, `false` on every one of the 497 live rows -- no check has ever actually run) read as a
 * "dead" verdict rejected 248 real institutions (irishstatutebook.ie, transport.gov.scot, theccc.org.uk, and
 * others) on that absence alone; under standing rules 16/18 and ADR-030 an unreachable URL on a real
 * institution is a STATUS, never a rejection, and an unknown host is a QUESTION (the worklist), never a
 * rejection. Pure, no I/O, no DB, no fetch.
 * @param {string} host
 * @param {{ existingTier: number|null, classTier: number|null }} signals
 * @returns {{ action: "promote"|"worklist", tier: number|null, rule: "a"|"b"|"d", reason: string }}
 */
export function decideHost(host, { existingTier, classTier }) {
  if (existingTier != null) {
    return { action: "promote", tier: existingTier, rule: "a", reason: `host ${host} matches an existing active institution at tier ${existingTier}` };
  }
  if (classTier != null) {
    return { action: "promote", tier: classTier, rule: "b", reason: `SC-13 class table resolves ${host} to tier ${classTier}` };
  }
  return { action: "worklist", tier: null, rule: "d", reason: `host ${host} is unclassifiable, no institution match, no class-table rule` };
}

/**
 * The registrable host for a row, given its stored `url`. Wraps hostOf so a missing/unparsable URL
 * degrades to a `null` host (routed to `worklist` by the caller, never treated as a fabricated
 * "dead" verdict, since "cannot even parse a host" is a different failure than "fetched and found
 * dead").
 * @param {{ url: string|null }} row
 */
export function hostForRow(row) {
  return row?.url ? hostOf(row.url) : null;
}

/**
 * The `sources`-specific "dead" signal: `fetch_status='error'` (migration 147) is the one stored
 * transport-failure verdict this step treats as dead; `cdn_block`/`blocked`/`soft_404` are a WALL, not
 * a dead link (canonical-autoverify.mjs's own "a wall is not a dead link" posture; a wall means the
 * current row is reachable). A row with no `fetch_status` at all (never probed) is not dead. Defect
 * D13 fix: this signal no longer decides promote vs. reject (rule c is removed) -- it only decides
 * which `sources` STATUS a promote writes (see sourcesStatusForPromote below): a dead host is still
 * promoted/activated when rule (a) or (b) resolves a tier, its status simply records the fact.
 * @param {{ fetch_status?: string|null }} row
 */
export function sourcesDeadSignal(row) {
  return row?.fetch_status === "error";
}

/**
 * The `sources` row STATUS a promote/activate writes (defect D13 fix): carries the accessibility fact
 * already on record rather than letting it decide promote vs. reject. `inaccessible` when
 * `sourcesDeadSignal` is true (`fetch_status='error'`), `active` otherwise (fetch_status ok/null, or a
 * wall such as cdn_block/blocked -- a wall means the host is reachable). Both are live values in
 * `sources_status_check` (migration 004/147). A `provisional_sources` row being promoted via a NEW
 * `sources` INSERT (buildPromotedSourceRow) has no `fetch_status` of its own (the column does not
 * exist on that table), so it always resolves to `active` here -- consistent with "fetch_status is ok
 * or null -> active", never a silently different rule for the two tables.
 * @param {{ fetch_status?: string|null }} row
 * @returns {"active"|"inaccessible"}
 */
export function sourcesStatusForPromote(row) {
  return sourcesDeadSignal(row) ? "inaccessible" : "active";
}

/**
 * Pure per-row plan for a `provisional_sources` row (no I/O; `existingTier`/`classTier` are
 * pre-resolved by the caller against the live registry/class table). Defect D13 fix: this row's
 * `accessibility_verified` is never consulted here -- rule (c) is removed, accessibility never decides
 * promote vs. worklist for this table.
 * @param {{ id: string, url: string }} row
 * @param {{ existingTier: number|null, classTier: number|null }} resolved
 */
export function planProvisionalSourceRow(row, resolved) {
  const host = hostForRow(row);
  if (!host) return { id: row.id, host: null, decision: { action: "worklist", tier: null, rule: "d", reason: "URL has no parsable host" } };
  const decision = decideHost(host, { existingTier: resolved.existingTier, classTier: resolved.classTier });
  return { id: row.id, host, decision };
}

/**
 * Same shape, for a `sources` row (status='provisional'). Defect D13 fix: `fetch_status` is no longer
 * passed into decideHost (rule c removed); it is read separately, at apply time, only to decide the
 * promoted row's STATUS (see sourcesStatusForPromote), never to decide promote vs. worklist.
 * @param {{ id: string, url: string }} row
 */
export function planSourcesProvisionalRow(row, resolved) {
  const host = hostForRow(row);
  if (!host) return { id: row.id, host: null, decision: { action: "worklist", tier: null, rule: "d", reason: "URL has no parsable host" } };
  const decision = decideHost(host, { existingTier: resolved.existingTier, classTier: resolved.classTier });
  return { id: row.id, host, decision };
}

/**
 * The synthetic per-item id `buildNullTierHostWrite`'s aggregate keys a worklisted row's
 * contribution by (defect D3 fix): neither `provisional_sources` nor `sources` is an
 * intelligence_items row, so there is no real item id to pass. `${table}:${id}` is unique per row and
 * stable across runs, so a repeated resolve of the SAME row merges into the SAME aggregate key
 * (idempotent) rather than creating a new contribution each time. Pure.
 * @param {"provisional_sources"|"sources"} table @param {string} id
 */
export function syntheticItemIdFor(table, id) {
  return `${table}:${id}`;
}

// ---------------------------------------------------------------------------------------------------
// main(opts, deps) -- runCli's contract (scripts/maintenance/lib/cli.mjs).
// ---------------------------------------------------------------------------------------------------

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{
 *   readPendingProvisional: () => Promise<Array>,
 *   readProvisionalSourcesRows: () => Promise<Array>,
 *   readActiveSources: () => Promise<Array>,
 *   classTierForHost: (host:string) => number|null,
 *   promoteProvisional: (row:object, tier:number, rule:string) => Promise<{sourceId:string, reused:boolean}>,
 *   rejectProvisional: (id:string, reason:string) => Promise<void>,
 *   worklistProvisional: (id:string, flagNote:string) => Promise<void>,
 *   activateSourcesRow: (id:string, tier:number, status:"active"|"inaccessible") => Promise<void>,
 *   rejectSourcesRow: (id:string, reason:string) => Promise<void>,
 *   worklistSourcesRow: (id:string, flagNote:string) => Promise<void>,
 *   checkVerticalFitGate: (row:{name:string,url:string}) => Promise<{allow:boolean, reason?:string}>,
 *   readNullTierFlag: (host:string) => Promise<object|null>,
 *   insertNullTierFlag: (row:object) => Promise<void>,
 *   updateNullTierFlag: (id:string, patch:object) => Promise<void>,
 * }} deps
 *
 * `classTierForHost`'s second, optional `name` parameter (D14 residue ruling, defect-fix-plan-2026-09-12.md
 * D14, 2026-09-13) is threaded from each row's OWN stored `name` column below -- rule (b) now also
 * classifies via the residue ruling's 8 deterministic name-keyword rules (government/legal/academic/
 * association/news/analysis/company), not the host alone. A row with no name still resolves exactly as
 * before (the parameter is additive, never a behaviour change for a nameless row).
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = {
    step: "resolve-provisional-sources",
    mode,
    counts: { promote: 0, reject: 0, worklist: 0 },
    samples: { promote: [], reject: [], worklist: [] },
    applied: 0,
    read_back: {},
    exitCode: 0,
  };

  const [pendingProvisional, sourcesProvisional, activeSources] = await Promise.all([
    deps.readPendingProvisional(),
    deps.readProvisionalSourcesRows(),
    deps.readActiveSources(),
  ]);

  const classTierFn = deps.classTierForHost ?? classTierForHost;
  const worklistFlagOps = { inserted: 0, updated: 0 };

  for (const row of pendingProvisional) {
    const host = hostForRow(row);
    const existingTier = host ? existingTierForHost(host, activeSources)?.tier ?? null : null;
    // D14 residue ruling: thread this row's OWN stored `name` so rule (b) also runs the 8 name-keyword
    // rules, not the host alone.
    const classTier = host && existingTier == null ? classTierFn(host, row.name) : null;
    const plan = planProvisionalSourceRow(row, { existingTier, classTier });
    await applyProvisionalDecision(row, plan, { apply, deps, summary, worklistFlagOps });
  }

  for (const row of sourcesProvisional) {
    const host = hostForRow(row);
    const existingTier = host ? existingTierForHost(host, activeSources)?.tier ?? null : null;
    const classTier = host && existingTier == null ? classTierFn(host, row.name) : null;
    const plan = planSourcesProvisionalRow(row, { existingTier, classTier });
    await applySourcesDecision(row, plan, { apply, deps, summary, worklistFlagOps });
  }

  summary.samples.promote = summary.samples.promote.slice(0, 20);
  summary.samples.reject = summary.samples.reject.slice(0, 20);
  summary.samples.worklist = summary.samples.worklist.slice(0, 20);
  summary.worklist_flag_writes = worklistFlagOps;

  if (!apply) {
    // Defect D13 fix, dry-output vocabulary: `reject` in dry mode reflects only what decideHost itself
    // can determine (rule c is removed, so this is always 0 for both tables); the vertical-fit gate,
    // the only remaining source of a decline, runs only on `apply` (its own outcome is not knowable
    // without touching the live registry it checks against), so a dry run never predicts a reject.
    summary.note =
      `DRY: ${pendingProvisional.length} pending provisional_sources row(s), ${sourcesProvisional.length} ` +
      `sources row(s) with status='provisional'. Would promote ${summary.counts.promote}, reject ` +
      `${summary.counts.reject}, worklist ${summary.counts.worklist}. Reject is decided only at apply ` +
      `time, by the vertical-fit gate on a would-be provisional_sources promote (rule c is removed, ` +
      `defect D13); accessibility never rejects. Nothing written.`;
    return summary;
  }

  summary.applied = summary.counts.promote + summary.counts.reject + summary.counts.worklist;
  summary.note = `Resolved ${summary.applied} row(s): ${summary.counts.promote} promoted, ${summary.counts.reject} rejected, ${summary.counts.worklist} worklisted (${worklistFlagOps.inserted} null-tier-host flag(s) inserted, ${worklistFlagOps.updated} updated).`;

  const [remainingPending, remainingProvisionalSources] = await Promise.all([
    deps.readPendingProvisional(),
    deps.readProvisionalSourcesRows(),
  ]);
  summary.read_back = {
    provisional_sources_pending_review_remaining: remainingPending.length,
    sources_provisional_remaining: remainingProvisionalSources.length,
  };

  return summary;
}

/** Applies one `provisional_sources` row's decision (dry: records the sample only; apply: writes). */
async function applyProvisionalDecision(row, plan, { apply, deps, summary, worklistFlagOps }) {
  const { decision } = plan;
  if (decision.action === "promote") {
    summary.counts.promote += 1;
    summary.samples.promote.push({ table: "provisional_sources", id: row.id, host: plan.host, tier: decision.tier, rule: decision.rule });
    if (!apply) return;
    // vertical-fit gate reused from the promote route (see this file's header); a host the operator
    // deliberately retired as off-vertical is not re-added by an automatic resolver. Defect D13 fix:
    // this gate is now the ONLY source of a decline for this table -- decideHost's rule (c) is removed,
    // so `decision.action` can never itself be "reject" any more.
    const gate = await deps.checkVerticalFitGate({ name: row.name, url: row.url });
    if (!gate.allow) {
      summary.counts.promote -= 1;
      summary.counts.reject += 1;
      summary.samples.reject.push({ table: "provisional_sources", id: row.id, host: plan.host, reason: `vertical-fit gate: ${gate.reason}` });
      await deps.rejectProvisional(row.id, `vertical-fit gate: ${gate.reason}`);
      return;
    }
    await deps.promoteProvisional(row, decision.tier, decision.reason);
    return;
  }
  // worklist (rule d): decideHost's action space is promote|worklist only (defect D13 fix: rule c
  // removed). The row's own terminal write ALWAYS happens (defect fix D3, fix round 2, review-7.5.md
  // re-review, CONFIRMED regression) -- a row whose URL has no parsable host still reaches a terminal
  // state, with `decision.reason` ("URL has no parsable host") recorded on it. Only the per-host
  // null-tier-host flag merge is conditional on having a real host to merge under; a null host has no
  // flag to merge into.
  summary.counts.worklist += 1;
  summary.samples.worklist.push({ table: "provisional_sources", id: row.id, host: plan.host });
  if (apply) {
    if (plan.host) await applyNullTierWorklist(plan.host, "provisional_sources", row.id, deps, worklistFlagOps);
    await deps.worklistProvisional(row.id, decision.reason);
  }
}

/** Applies one `sources` (status='provisional') row's decision. */
async function applySourcesDecision(row, plan, { apply, deps, summary, worklistFlagOps }) {
  const { decision } = plan;
  if (decision.action === "promote") {
    summary.counts.promote += 1;
    // Defect D13 fix: the status this promote writes carries the accessibility fact already on record
    // (active/inaccessible from fetch_status) rather than letting it decide promote vs. reject -- rule
    // (c) is removed, so this branch is the ONLY outcome for a resolved tier, dead host or not.
    const status = sourcesStatusForPromote(row);
    summary.samples.promote.push({ table: "sources", id: row.id, host: plan.host, tier: decision.tier, rule: decision.rule, status });
    if (apply) await deps.activateSourcesRow(row.id, decision.tier, status);
    return;
  }
  // worklist (rule d): decideHost's action space is promote|worklist only (defect D13 fix: rule c
  // removed; there is no vertical-fit gate on this table's promote path, so a `sources` row can no
  // longer decline at all through this step -- `rejectSourcesRow`/`SOURCES_REJECT_STATUS` (D4's on-row
  // reason mechanism) stay defined for a future decline path but are unreached from here today). Same
  // fix round 2 correction as applyProvisionalDecision above -- the row's own terminal write always
  // happens; only the per-host flag merge is conditional on a real host.
  summary.counts.worklist += 1;
  summary.samples.worklist.push({ table: "sources", id: row.id, host: plan.host });
  if (apply) {
    if (plan.host) await applyNullTierWorklist(plan.host, "sources", row.id, deps, worklistFlagOps);
    await deps.worklistSourcesRow(row.id, decision.reason);
  }
}

/**
 * The read-modify-write for one unclassifiable host, shared by both tables' worklist branches
 * (defect D3 fix): read the existing open null-tier-host flag for this host (if any), build the
 * merged write via the shared `buildNullTierHostWrite`, then insert or update. Mirrors
 * resolve-cited-host-gate.mjs's own main() shape exactly, so the two callers of the same underlying
 * module behave identically.
 */
async function applyNullTierWorklist(host, table, rowId, deps, worklistFlagOps) {
  const existing = await deps.readNullTierFlag(host);
  const write = buildNullTierHostWrite(existing, host, syntheticItemIdFor(table, rowId), `resolve-provisional-sources:${table}:${rowId}`, null);
  if (write.op === "insert") {
    await deps.insertNullTierFlag(write.row);
    worklistFlagOps.inserted += 1;
  } else {
    await deps.updateNullTierFlag(write.id, write.patch);
    worklistFlagOps.updated += 1;
  }
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "resolve-provisional-sources",
    main,
    needsDb: true,
    buildDeps: async () => {
      const now = () => new Date().toISOString();
      const { createJiti } = await import("jiti");
      const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { "@": resolve(fsiRoot(), "src") } });
      const { checkVerticalFitGate } = await jiti.import("../../src/lib/sources/vertical-fit-gate.ts");
      return {
        checkVerticalFitGate,
        readPendingProvisional: () =>
          readAll(
            "provisional_sources",
            "id, name, url, description, discovered_via, accessibility_verified, status",
            { match: (q) => q.in("status", ["pending_review", PROVISIONAL_WORKLIST_STATUS]) },
          ),
        readProvisionalSourcesRows: () =>
          readAll("sources", "id, name, url, notes, fetch_status, status", { match: (q) => q.eq("status", "provisional") }),
        // Rule (a)'s registry: EVERY active source (existingTierForHost filters to status='active'
        // itself, but paginating the whole table once here, rather than per-row, is the same
        // "read all pages once, resolve many rows against it" shape registerPoolHostsForGrounding
        // and canonical-autoverify.mjs's own callers already use).
        readActiveSources: () => readAll("sources", "id, url, status, base_tier, tier_override", {}),
        promoteProvisional: async (row, tier, ruleReason) => {
          const canonUrl = row.url;
          let canonHost = "";
          try { canonHost = new URL(canonUrl).host; } catch { /* non-URL provisional URL, already worklisted upstream */ }
          const hostMatches = canonHost
            ? await readAll("sources", "id, url", { match: (q) => q.ilike("url", `%${canonHost}%`) })
            : [];
          const existing = findExistingSourceByCanonicalUrl(hostMatches, canonUrl);
          const nowIso = now();
          if (existing) {
            await guardedUpdate(
              "provisional_sources",
              (q) => q.eq("id", row.id),
              {
                status: PROVISIONAL_SOURCES_PROMOTED_STATUS,
                promoted_to_source_id: existing.id,
                reviewed_at: nowIso,
                reviewer_notes: `${ruleReason}: canonical URL already in registry, reused existing source ${existing.id}, no duplicate created`,
              },
              { cite: CITE },
            );
            return { sourceId: existing.id, reused: true };
          }
          const newSource = buildPromotedSourceRow(row, tier, { promotedBy: "resolve-provisional-sources", note: ruleReason, nowIso });
          const inserted = await guardedInsert("sources", newSource, { cite: CITE, select: "id" });
          await guardedUpdate(
            "provisional_sources",
            (q) => q.eq("id", row.id),
            { status: PROVISIONAL_SOURCES_PROMOTED_STATUS, promoted_to_source_id: inserted.id, reviewed_at: nowIso, reviewer_notes: ruleReason },
            { cite: CITE },
          );
          return { sourceId: inserted.id, reused: false };
        },
        rejectProvisional: (id, reason) =>
          guardedUpdate("provisional_sources", (q) => q.eq("id", id), { status: PROVISIONAL_SOURCES_REJECTED_STATUS, reviewed_at: now(), reviewer_notes: reason }, { cite: CITE }),
        worklistProvisional: (id, reason) =>
          guardedUpdate(
            "provisional_sources",
            (q) => q.eq("id", id),
            { status: PROVISIONAL_WORKLIST_STATUS, reviewed_at: now(), reviewer_notes: `${reason}: awaiting an SC-13 class-table rule; see the null-tier-host integrity_flags queue` },
            { cite: CITE },
          ),
        // Defect D13 fix: `status` is caller-supplied (sourcesStatusForPromote(row), computed from the
        // row's own fetch_status), never hardcoded "active" -- a promoted row that is currently
        // inaccessible says so on the row rather than masquerading as active.
        activateSourcesRow: (id, tier, status) =>
          guardedUpdate("sources", (q) => q.eq("id", id), { status, base_tier: tier, effective_tier: tier }, { cite: CITE }),
        // defect D4 fix (review-7.5.md finding 3): the decline reason is now written INTO `notes`, the
        // same on-row form worklistSourcesRow already uses, not only into guardedUpdate's `cite`
        // (which db.mjs writes to an off-row audit snapshot file, never a column). Defect D13 fix: rule
        // c itself is removed, so this dep is currently unreached from main() for the `sources` table
        // (kept as the on-row-reason mechanism for a future decline path on this table).
        rejectSourcesRow: async (id, reason) => {
          const rows = await readAll("sources", "id, notes", { match: (q) => q.eq("id", id) });
          const priorNotes = rows[0]?.notes ?? "";
          const stamp = `[resolve-provisional-sources ${now().slice(0, 10)}] reject: ${reason}.`;
          await guardedUpdate(
            "sources",
            (q) => q.eq("id", id),
            { status: SOURCES_REJECT_STATUS, notes: priorNotes ? `${priorNotes}\n${stamp}` : stamp },
            { cite: CITE },
          );
        },
        worklistSourcesRow: async (id, reason) => {
          const rows = await readAll("sources", "id, notes", { match: (q) => q.eq("id", id) });
          const priorNotes = rows[0]?.notes ?? "";
          const stamp = `[resolve-provisional-sources ${now().slice(0, 10)}] ${reason}: awaiting an SC-13 class-table rule.`;
          await guardedUpdate("sources", (q) => q.eq("id", id), { notes: priorNotes ? `${priorNotes}\n${stamp}` : stamp }, { cite: CITE });
        },
        // defect D3 fix: the SAME null-tier-host read-modify-write resolve-cited-host-gate.mjs's own
        // buildDeps uses, imported through the shared module (never a second worklist).
        readNullTierFlag: async (host) => {
          const rows = await readAll("integrity_flags", "id, recommended_actions", {
            match: (q) => q.eq("created_by", "null-tier-host").eq("subject_ref", host).eq("status", "open"),
          });
          return rows[0] ?? null;
        },
        insertNullTierFlag: (row) => guardedInsert("integrity_flags", row, { cite: CITE, select: "id" }),
        updateNullTierFlag: (id, patch) => guardedUpdate("integrity_flags", (q) => q.eq("id", id), patch, { cite: CITE }),
      };
    },
  });
}
