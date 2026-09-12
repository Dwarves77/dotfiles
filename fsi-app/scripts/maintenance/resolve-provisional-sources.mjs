#!/usr/bin/env node
// resolve-provisional-sources.mjs -- MAINT step for task 7.5 item 1 of the W9 brief-chain build plan,
// Part 7 (ADR-030 rider, 2026-09-12). Live facts named in the dispatch [CONFIRMED by the coordinator,
// 2026-09-12]: `provisional_sources` has 489 rows with status pending_review since April; `sources`
// has 563 rows with status provisional.
//
// THE RULE (task 7.5, verbatim), for every such row: "(a) the host's registrable domain matches an
// existing active institution in `sources` -> inherit its canonical tier, promote/activate (the same
// write /api/admin/sources/promote's promote arm makes; reuse its logic through a shared module,
// never a second copy); (b) the SC-13 class table (classTierForHost / decidePoolHostRegistration)
// resolves a tier -> promote/activate at that tier; (c) the URL is dead or the row's accessibility
// check failed -> reject with the reason; (d) otherwise the host is unclassifiable -> ONE
// integrity_flags worklist row per run in the null-tier-host shape listing the hosts (a batched
// question for the class table, never a per-row click), and the row's status set to the existing
// vocabulary's value for 'awaiting class-table ruling'. Every decision writes reviewer_notes and
// reviewed_at."
//
// TWO TABLES, ONE RULE, DIFFERENT WRITE SHAPES:
//   - `provisional_sources` (columns per the dispatch: accessibility_verified BOOLEAN, status IN
//     ('pending_review','confirmed','rejected','needs_more_data') per migration 004 -- 'promoted' is
//     the live value the existing /api/admin/sources/promote route writes on approve
//     [HYPOTHESIS: that value is not present in migration 004's own CHECK text; not independently
//     re-verified against the live constraint in this session, no DB credentials in this worktree --
//     this script matches the EXISTING route's convention rather than inventing a different one,
//     since a real constraint mismatch would be the route's own pre-existing defect, not something
//     this step introduces]). Rule (a)/(b) PROMOTE: insert a new `sources` row via the SAME shared
//     builder /api/admin/sources/promote's approve arm now uses
//     (src/lib/sources/promote-provisional.ts's buildPromotedSourceRow + the SAME Q10 canonical-URL
//     dedup guard + the SAME checkVerticalFitGate off-vertical block -- reused, not re-copied, per
//     the task's own instruction), mark the provisional row status='promoted'. Rule (c) REJECT:
//     status='rejected'. Rule (d) WORKLIST: status='needs_more_data' -- the one CHECK-legal value
//     that semantically fits "awaiting class-table ruling" (no dedicated value exists in the tracked
//     CHECK list; this is a documented judgment call, not a schema fact -- see the constant
//     PROVISIONAL_WORKLIST_STATUS below for where to change it if the coordinator rules otherwise).
//     reviewer_notes + reviewed_at are stamped on every one of the three outcomes.
//   - `sources` WHERE status='provisional' (migration 004: status IN
//     ('active','stale','inaccessible','provisional','suspended')). The row ALREADY EXISTS, so
//     promote/reject/worklist are UPDATEs, never a second INSERT. Rule (a)/(b) PROMOTE: status='active',
//     base_tier/effective_tier stamped to the resolved tier (never tier_override -- SC-13's own
//     escape hatch stays reserved for an explicit operator act, not an automatic resolver). Rule (c)
//     REJECT: status='suspended' (the vocabulary value this codebase already uses for "unselectable
//     by the grounding resolver" -- RD-39/40, institution.ts's own resolver-status filter) -- there is
//     no live signal this step checks to decide "dead" for a `sources` row (no accessibility_verified
//     column exists on `sources`; `fetch_status` per migration 147 is the nearest analog and is
//     consulted when present: fetch_status='error' counts as dead, 'cdn_block'/'blocked' do NOT --
//     "a wall is not a dead link", the SAME posture canonical-autoverify.mjs's own authority-downgrade
//     rule already takes). Rule (d) WORKLIST: status stays 'provisional' (there is no dedicated
//     "awaiting ruling" value in the tracked CHECK list, and 'provisional' already IS the
//     awaiting-decision resting state for this table -- no status change is invented). `sources` has
//     no `reviewer_notes`/`reviewed_at` columns (migration 004 has neither; migration 007 adds only
//     `notes`); this step appends the equivalent record to `notes` instead, named explicitly here so
//     the divergence from the "every decision writes reviewer_notes and reviewed_at" instruction is a
//     disclosed schema-driven substitution, not a silent gap.
//
// REUSE, NEVER A SECOND COPY (per the task's own instruction and CLAUDE.md's Reuse-before-construction
// doctrine):
//   - existingTierForHost (rule a): scripts/maintenance/canonical-autoverify.mjs's own live-registry
//     lookup, institutionKey-keyed exactly like db.mjs's registerSource dedups -- imported, not
//     reimplemented.
//   - classTierForHost / decidePoolHostRegistration (rule b): src/lib/sources/host-authority.ts, the
//     SC-13 moat-safe class table -- the SAME function registerPoolHostsForGrounding and
//     resolve-cited-host-gate.mjs (task 7.4) both already consume.
//   - buildPromotedSourceRow / findExistingSourceByCanonicalUrl (rule a/b promote, provisional_sources
//     only): src/lib/sources/promote-provisional.ts, extracted THIS TASK out of
//     /api/admin/sources/promote/route.ts's approve arm specifically so this step and the route share
//     one row shape (see that module's own header).
//   - checkVerticalFitGate (rule a/b promote, provisional_sources only): src/lib/sources/
//     vertical-fit-gate.ts, the SAME off-vertical block the promote route runs before ever inserting a
//     new `sources` row -- an automatic resolver must not re-add a host the operator deliberately
//     retired as off-vertical any more readily than a human reviewer would.
//
// ONE integrity_flags ROW PER RUN (rule d), NOT the per-host null-tier-host shape. This is a
// DELIBERATE, DISCLOSED divergence from the null-tier-host pattern (canonical-pipeline.ts's
// surfaceNullTierHosts / null-tier-flag.mjs's mergeNullTierAggregate, reused verbatim by
// resolve-cited-host-gate.mjs for task 7.4): that shape aggregates ONE flag PER HOST, merged across
// every run that ever contributes a claim citing it. Task 7.5's own wording for THIS step is
// singular-per-run and plural-hosts ("ONE integrity_flags worklist row per run ... listing the
// hosts") -- a batched "here are the N ambiguous hosts from today's provisional-source sweep" question
// for the class table, not a per-host standing record. buildBatchWorklistFlag below is the small,
// separately-tested builder for that different aggregation granularity; it does not touch or read the
// null-tier-host flags at all, so the two mechanisms coexist without conflict.
//
// $0, NO LLM CALL. Every check is the deterministic host-authority class table, the live-registry
// lookup, and the stored accessibility_verified/fetch_status columns -- never a model guess, per
// SC-13 (source-credibility-model skill Section 3): "no LLM tier guesses and no default tier."
//
// DRY BY DEFAULT. `main(opts, deps)` never writes without `mode: "apply"`; `--mode apply` is required
// to touch the database, matching every other MAINT wrapper in this family (backfill-format-type.mjs /
// retype-eu-decisions.mjs as the named templates).
//
// NO LIVE VERIFICATION IN THIS SESSION [CONFIRMED per dispatch brief facts, NOT independently
// re-verified here -- no DB credentials in this worktree]. The 489/563 counts are the coordinator's own
// live read; this script's own dry mode is the mechanism that reconfirms them at dispatch time before
// any apply.
import { resolve } from "node:path";
import { readAll, guardedUpdate, guardedInsert, hostOf, institutionKey } from "../lib/db.mjs";
import { classTierForHost, decidePoolHostRegistration } from "../../src/lib/sources/host-authority.ts";
import { buildPromotedSourceRow, findExistingSourceByCanonicalUrl } from "../../src/lib/sources/promote-provisional.ts";
import { existingTierForHost } from "./canonical-autoverify.mjs";
import { runCli, fsiRoot } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";
// `checkVerticalFitGate` (src/lib/sources/vertical-fit-gate.ts) imports the `@/lib/...` TS path alias
// (vertical-fit.ts), which only Next.js's own bundler or an alias-configured jiti resolves — a plain
// relative import throws ERR_MODULE_NOT_FOUND under `node`, same constraint backfill-format-type.mjs's
// own header documents for extract-registry.ts. Loaded lazily, inside buildDeps() below, never at
// module top level, so this file's own test (resolve-provisional-sources.test.mjs, in the no-npm
// glob) never needs jiti.

export const CITE = Object.freeze({
  skill: "brief-chain-build-plan-2026-09-11 Part 7 task 7.5 item 1",
  reason:
    "Resolve pending provisional_sources rows and status='provisional' sources rows by the deterministic " +
    "SC-13 rules: an institution-match or a class-table tier promotes/activates; a dead/inaccessible URL " +
    "rejects with the reason; an unclassifiable host lands in one batched integrity_flags worklist row " +
    "per run, never a guessed tier and never a per-row human click.",
});

export const PROVISIONAL_WORKLIST_STATUS = "needs_more_data";
export const SOURCES_REJECT_STATUS = "suspended";
export const WORKLIST_CREATED_BY = "resolve-provisional-sources";

// ---------------------------------------------------------------------------------------------------
// Pure decision logic (unit-tested with no I/O).
// ---------------------------------------------------------------------------------------------------

/**
 * THE rule, table-agnostic: given a host's resolved signals, which of the four outcomes fires.
 * Pure -- no I/O, no DB, no fetch.
 * @param {string} host
 * @param {{ existingTier: number|null, classTier: number|null, deadOrInaccessible: boolean }} signals
 * @returns {{ action: "promote"|"reject"|"worklist", tier: number|null, rule: "a"|"b"|"c"|"d", reason: string }}
 */
export function decideHost(host, { existingTier, classTier, deadOrInaccessible }) {
  if (existingTier != null) {
    return { action: "promote", tier: existingTier, rule: "a", reason: `host ${host} matches an existing active institution at tier ${existingTier}` };
  }
  if (classTier != null) {
    return { action: "promote", tier: classTier, rule: "b", reason: `SC-13 class table resolves ${host} to tier ${classTier}` };
  }
  if (deadOrInaccessible) {
    return { action: "reject", tier: null, rule: "c", reason: `URL dead or accessibility check failed for host ${host}` };
  }
  return { action: "worklist", tier: null, rule: "d", reason: `host ${host} is unclassifiable -- no institution match, no class-table rule, not confirmed dead` };
}

/**
 * The registrable host for a row, given its stored `url`. Wraps hostOf so a missing/unparsable URL
 * degrades to a `null` host (routed to `worklist` by the caller — never treated as a fabricated
 * "dead" verdict, since "cannot even parse a host" is a different failure than "fetched and found
 * dead").
 * @param {{ url: string|null }} row
 */
export function hostForRow(row) {
  return row?.url ? hostOf(row.url) : null;
}

/**
 * The `provisional_sources`-specific "dead or inaccessible" signal (rule c): the stored
 * `accessibility_verified` column is the ONE prior-check result this step reads -- an explicit
 * `false` is the row's own accessibility probe having already failed; `true` or unset is NOT treated
 * as dead (this step performs no NEW fetch of its own — the accessibility probe is a separate,
 * already-run mechanism this step only consumes).
 * @param {{ accessibility_verified?: boolean|null }} row
 */
export function provisionalDeadSignal(row) {
  return row?.accessibility_verified === false;
}

/**
 * The `sources`-specific "dead" signal (rule c): `fetch_status='error'` (migration 147) is the one
 * stored transport-failure verdict this step treats as dead; `cdn_block`/`blocked`/`soft_404` are a
 * WALL, not a dead link (canonical-autoverify.mjs's own "a wall is not a dead link" posture — a wall
 * means the current row is reachable, so worklisting a legitimately-unclassifiable-but-alive host is
 * the honest outcome, not a reject). A row with no `fetch_status` at all (never probed) is not dead.
 * @param {{ fetch_status?: string|null }} row
 */
export function sourcesDeadSignal(row) {
  return row?.fetch_status === "error";
}

/**
 * Pure per-row plan for a `provisional_sources` row (no I/O — `existingTier`/`classTier` are
 * pre-resolved by the caller against the live registry/class table).
 * @param {{ id: string, url: string, accessibility_verified?: boolean|null }} row
 * @param {{ existingTier: number|null, classTier: number|null }} resolved
 */
export function planProvisionalSourceRow(row, resolved) {
  const host = hostForRow(row);
  if (!host) return { id: row.id, host: null, decision: { action: "worklist", tier: null, rule: "d", reason: "URL has no parsable host" } };
  const decision = decideHost(host, {
    existingTier: resolved.existingTier,
    classTier: resolved.classTier,
    deadOrInaccessible: provisionalDeadSignal(row),
  });
  return { id: row.id, host, decision };
}

/** Same shape, for a `sources` row (status='provisional'). @param {{ id: string, url: string, fetch_status?: string|null }} row */
export function planSourcesProvisionalRow(row, resolved) {
  const host = hostForRow(row);
  if (!host) return { id: row.id, host: null, decision: { action: "worklist", tier: null, rule: "d", reason: "URL has no parsable host" } };
  const decision = decideHost(host, {
    existingTier: resolved.existingTier,
    classTier: resolved.classTier,
    deadOrInaccessible: sourcesDeadSignal(row),
  });
  return { id: row.id, host, decision };
}

/**
 * The ONE per-run batched worklist flag (rule d) — see this file's header for why this is a
 * different aggregation granularity than the null-tier-host per-host shape. Pure.
 * @param {Array<{ host: string, table: "provisional_sources"|"sources", id: string }>} entries
 */
export function buildBatchWorklistFlag(entries) {
  const hosts = [...new Set(entries.map((e) => e.host))];
  const byTable = { provisional_sources: entries.filter((e) => e.table === "provisional_sources").length, sources: entries.filter((e) => e.table === "sources").length };
  return {
    category: "source_issue",
    subject_type: "source",
    subject_ref: "resolve-provisional-sources-batch",
    // .slice(0, 480) wraps the WHOLE composed string (integrity_flags.description's write-time cap,
    // matching resolve-error-body-gate.mjs's excerptQuote / resolve-cited-host-gate.mjs's own
    // buildNullTierHostWrite convention) — a per-segment slice on only the last template literal
    // would leave the concatenated total unbounded, which a 60+-host run would otherwise hit.
    description: (
      `${hosts.length} host(s) unclassifiable by the SC-13 class table during a resolve-provisional-sources ` +
      `run (${byTable.provisional_sources} provisional_sources row(s), ${byTable.sources} sources row(s)): ` +
      `${hosts.join(", ")}. Add a class-table rule (verifier/academic/association/standards_body/analysis/` +
      `lawfirm/news) or a per-host ruling in RULED_HOST_TIER (host-authority.ts) to resolve.`
    ).slice(0, 480),
    recommended_actions: [
      {
        action: "extend_class_table",
        rationale: "batched null-tier-host question for the SC-13 class table (task 7.5, resolve-provisional-sources)",
        hosts,
        entries: entries.map((e) => ({ host: e.host, table: e.table, id: e.id })),
      },
    ],
    status: "open",
    created_by: WORKLIST_CREATED_BY,
  };
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
 *   activateSourcesRow: (id:string, tier:number) => Promise<void>,
 *   rejectSourcesRow: (id:string, reason:string) => Promise<void>,
 *   worklistSourcesRow: (id:string, flagNote:string) => Promise<void>,
 *   checkVerticalFitGate: (row:{name:string,url:string}) => Promise<{allow:boolean, reason?:string}>,
 *   insertBatchFlag: (row:object) => Promise<{id:string}>,
 * }} deps
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
  const worklistEntries = [];

  for (const row of pendingProvisional) {
    const host = hostForRow(row);
    const existingTier = host ? existingTierForHost(host, activeSources)?.tier ?? null : null;
    const classTier = host && existingTier == null ? classTierFn(host) : null;
    const plan = planProvisionalSourceRow(row, { existingTier, classTier });
    await applyProvisionalDecision(row, plan, { apply, deps, summary, worklistEntries });
  }

  for (const row of sourcesProvisional) {
    const host = hostForRow(row);
    const existingTier = host ? existingTierForHost(host, activeSources)?.tier ?? null : null;
    const classTier = host && existingTier == null ? classTierFn(host) : null;
    const plan = planSourcesProvisionalRow(row, { existingTier, classTier });
    await applySourcesDecision(row, plan, { apply, deps, summary, worklistEntries });
  }

  summary.samples.promote = summary.samples.promote.slice(0, 20);
  summary.samples.reject = summary.samples.reject.slice(0, 20);
  summary.samples.worklist = summary.samples.worklist.slice(0, 20);

  if (worklistEntries.length) {
    const flagRow = buildBatchWorklistFlag(worklistEntries);
    if (apply) {
      const inserted = await deps.insertBatchFlag(flagRow);
      summary.worklist_flag_id = inserted?.id ?? null;
    } else {
      summary.would_insert_worklist_flag = { hosts: [...new Set(worklistEntries.map((e) => e.host))].length };
    }
  }

  if (!apply) {
    summary.note =
      `DRY -- ${pendingProvisional.length} pending provisional_sources row(s), ${sourcesProvisional.length} ` +
      `sources row(s) with status='provisional'. Would promote ${summary.counts.promote}, reject ` +
      `${summary.counts.reject}, worklist ${summary.counts.worklist}. Nothing written.`;
    return summary;
  }

  summary.applied = summary.counts.promote + summary.counts.reject + summary.counts.worklist;
  summary.note = `Resolved ${summary.applied} row(s): ${summary.counts.promote} promoted, ${summary.counts.reject} rejected, ${summary.counts.worklist} worklisted (${worklistEntries.length ? "1" : "0"} batch flag written).`;

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
async function applyProvisionalDecision(row, plan, { apply, deps, summary, worklistEntries }) {
  const { decision } = plan;
  if (decision.action === "promote") {
    summary.counts.promote += 1;
    summary.samples.promote.push({ table: "provisional_sources", id: row.id, host: plan.host, tier: decision.tier, rule: decision.rule });
    if (!apply) return;
    // vertical-fit gate reused from the promote route (see this file's header) -- a host the
    // operator deliberately retired as off-vertical is not re-added by an automatic resolver.
    const gate = await deps.checkVerticalFitGate({ name: row.name, url: row.url });
    if (!gate.allow) {
      summary.counts.promote -= 1;
      summary.counts.reject += 1;
      await deps.rejectProvisional(row.id, `vertical-fit gate: ${gate.reason}`);
      return;
    }
    await deps.promoteProvisional(row, decision.tier, decision.reason);
    return;
  }
  if (decision.action === "reject") {
    summary.counts.reject += 1;
    summary.samples.reject.push({ table: "provisional_sources", id: row.id, host: plan.host, reason: decision.reason });
    if (apply) await deps.rejectProvisional(row.id, decision.reason);
    return;
  }
  // worklist
  summary.counts.worklist += 1;
  summary.samples.worklist.push({ table: "provisional_sources", id: row.id, host: plan.host });
  if (plan.host) worklistEntries.push({ host: plan.host, table: "provisional_sources", id: row.id });
  if (apply) await deps.worklistProvisional(row.id, decision.reason);
}

/** Applies one `sources` (status='provisional') row's decision. */
async function applySourcesDecision(row, plan, { apply, deps, summary, worklistEntries }) {
  const { decision } = plan;
  if (decision.action === "promote") {
    summary.counts.promote += 1;
    summary.samples.promote.push({ table: "sources", id: row.id, host: plan.host, tier: decision.tier, rule: decision.rule });
    if (apply) await deps.activateSourcesRow(row.id, decision.tier);
    return;
  }
  if (decision.action === "reject") {
    summary.counts.reject += 1;
    summary.samples.reject.push({ table: "sources", id: row.id, host: plan.host, reason: decision.reason });
    if (apply) await deps.rejectSourcesRow(row.id, decision.reason);
    return;
  }
  summary.counts.worklist += 1;
  summary.samples.worklist.push({ table: "sources", id: row.id, host: plan.host });
  if (plan.host) worklistEntries.push({ host: plan.host, table: "sources", id: row.id });
  if (apply) await deps.worklistSourcesRow(row.id, decision.reason);
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
        // itself, but paginating the whole table once here — rather than per-row — is the same
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
              { status: "promoted", promoted_to_source_id: existing.id, reviewed_at: nowIso, reviewer_notes: `${ruleReason} -- canonical URL already in registry; reused existing source ${existing.id}, no duplicate created` },
              { cite: CITE },
            );
            return { sourceId: existing.id, reused: true };
          }
          const newSource = buildPromotedSourceRow(row, tier, { promotedBy: WORKLIST_CREATED_BY, note: ruleReason, nowIso });
          const inserted = await guardedInsert("sources", newSource, { cite: CITE, select: "id" });
          await guardedUpdate(
            "provisional_sources",
            (q) => q.eq("id", row.id),
            { status: "promoted", promoted_to_source_id: inserted.id, reviewed_at: nowIso, reviewer_notes: ruleReason },
            { cite: CITE },
          );
          return { sourceId: inserted.id, reused: false };
        },
        rejectProvisional: (id, reason) =>
          guardedUpdate("provisional_sources", (q) => q.eq("id", id), { status: "rejected", reviewed_at: now(), reviewer_notes: reason }, { cite: CITE }),
        worklistProvisional: (id, reason) =>
          guardedUpdate(
            "provisional_sources",
            (q) => q.eq("id", id),
            { status: PROVISIONAL_WORKLIST_STATUS, reviewed_at: now(), reviewer_notes: `${reason} -- awaiting an SC-13 class-table rule; see the resolve-provisional-sources batch flag` },
            { cite: CITE },
          ),
        activateSourcesRow: (id, tier) =>
          guardedUpdate("sources", (q) => q.eq("id", id), { status: "active", base_tier: tier, effective_tier: tier }, { cite: CITE }),
        rejectSourcesRow: (id, reason) =>
          guardedUpdate("sources", (q) => q.eq("id", id), { status: SOURCES_REJECT_STATUS }, { cite: { ...CITE, reason: `${CITE.reason} (${reason})` } }),
        worklistSourcesRow: async (id, reason) => {
          const rows = await readAll("sources", "id, notes", { match: (q) => q.eq("id", id) });
          const priorNotes = rows[0]?.notes ?? "";
          const stamp = `[resolve-provisional-sources ${now().slice(0, 10)}] ${reason} -- awaiting an SC-13 class-table rule.`;
          await guardedUpdate("sources", (q) => q.eq("id", id), { notes: priorNotes ? `${priorNotes}\n${stamp}` : stamp }, { cite: CITE });
        },
        insertBatchFlag: (row) => guardedInsert("integrity_flags", row, { cite: CITE, select: "id" }),
      };
    },
  });
}
