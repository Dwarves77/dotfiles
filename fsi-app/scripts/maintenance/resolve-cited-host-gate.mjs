#!/usr/bin/env node
// resolve-cited-host-gate.mjs -- MAINT step for task 7.4 of the W9 brief-chain build plan, Part 7
// (ADR-030 rider, 2026-09-12): the cited-host-gate flag (`src/lib/agent/canonical-pipeline.ts` ~L1641,
// `created_by: "cited-host-gate"`) is written whenever a brief cites a URL whose host is unknown to BOTH
// the item's fetched pool and the source registry -- 25 open rows, no resolver anywhere in the codebase
// before this file [CONFIRMED, grepped the full repo for a reader/resolver of this created_by value].
//
// THE RULE (task 7.4, verbatim): "register the cited host through the SC-13 class table (never a guessed
// tier; an unclassifiable host goes to the null-tier-host worklist, which is itself a question with a
// defined answer path)." This step:
//   1. Extracts every cited URL named in the flag (recommended_actions[].rationale first -- the fuller,
//      structured source; description as a fallback for a row whose recommended_actions is empty).
//   2. For each URL, derives the host (`hostOf`, the SAME identity rule `registerSource`'s own dedup uses)
//      and resolves its DETERMINISTIC class-table tier via `classTierForHost` (src/lib/sources/
//      host-authority.ts, SC-13 -- the SAME function `registerPoolHostsForGrounding` uses at grounding
//      time; no second table, no LLM guess, no default).
//   3. A host with a codified tier registers through `registerSource` (db.mjs) -- idempotent by
//      institution key, so a host that is ALREADY a registered institution under a path-qualified or
//      bare-host variant is simply reactivated/returned, never double-registered or re-tiered.
//   4. A host with NO codified tier (unrecognized / encyclopedia / aggregator / resolver / legal-
//      aggregator) is NEVER registered -- it is routed to the EXISTING `null-tier-host` worklist
//      (`created_by: "null-tier-host"`, `subject_ref: <host>`), the SAME read-modify-write shape
//      `surfaceNullTierHosts` in canonical-pipeline.ts already writes at grounding time (SAME
//      `mergeNullTierAggregate`/`summarizeNullTierAggregate` pure helpers, SAME row shape --
//      `recommended_actions[0].aggregate`), so a host this step cannot classify lands in the ONE place
//      the platform already reviews unregistered hosts, never a second worklist.
//   5. The cited-host-gate flag itself is then resolved (status='resolved') with the outcome recorded in
//      resolution_note -- per ADR-030's rider, resolving is the machine's decision either way (registered
//      at tier N, or routed to the null-tier-host worklist for the operator's one batched look), never a
//      human click on THIS queue.
//
// NEVER A GUESSED TIER. `classTierForHost` is deterministic and pattern-based (legal->1, gov/intergov->2,
// the SC-13 ruled class table for verifier/academic/association/standards_body->4, analysis->6,
// lawfirm/news->7); an ambiguous host returns null and is NEVER registered by this step under any
// tier -- the worklist route is the only honest outcome for it. This mirrors `decidePoolHostRegistration`
// (host-authority.ts) exactly, minus its "already resolves under a different tier" branch, which
// `registerSource`'s own institution-key dedup already subsumes (a host that matches an existing
// institution is returned/reactivated by `registerSource` regardless of the tier this step would have
// passed it, so there is no second "inherit" branch to reproduce here).
//
// PURE DECISION, TESTED. `extractCitedUrls`, `planHostDecision`, `buildNullTierHostWrite` and
// `buildResolutionNote` are pure -- no I/O, no DB, no fetch -- so the dry report lists every URL's planned
// outcome (register at tier N / route to worklist) without writing anything, per the spec's own
// "every step's dry output lists ... counts and a sample per outcome" requirement.
//
// NO LIVE VERIFICATION IN THIS SESSION [CONFIRMED per dispatch brief facts, NOT independently re-verified
// here -- no DB credentials in this worktree]. The 25-row count and the flag shape are read from the
// dispatch's own resolver map and from the live canonical-pipeline.ts write site (re-read in full for
// this file, line numbers may have moved); this script's own dry mode is the mechanism that reconfirms
// the count live at dispatch time before any apply.
import { readAll, guardedUpdate, guardedInsert, registerSource, hostOf } from "../lib/db.mjs";
import { classTierForHost, permanentlyUnregisteredClass } from "../../src/lib/sources/host-authority.ts";
import { mergeNullTierAggregate, summarizeNullTierAggregate } from "../../src/lib/agent/null-tier-flag.mjs";
import { extractFlagUrls, trimUrlPunctuation } from "./lib/flag-url-extract.mjs";
import { runCli } from "./lib/cli.mjs";
import { isMainModule } from "../lib/is-main.mjs";

export const CITE = Object.freeze({
  skill: "brief-chain-build-plan-2026-09-11 Part 7 task 7.4 / ADR-030 rider",
  reason:
    "Resolve the cited-host-gate integrity_flags family: register a cited URL's host through the SC-13 " +
    "class table (classTierForHost, never a guessed tier) or route an unclassifiable host to the " +
    "existing null-tier-host worklist (the SAME surfaceNullTierHosts shape canonical-pipeline.ts already " +
    "writes at grounding time). Resolves the cited-host-gate flag with the outcome recorded either way, " +
    "per ADR-030's rider: no human click required on this queue.",
});

export const RESOLVED_BY = "resolve-cited-host-gate";
export const NULL_TIER_CREATED_BY = "null-tier-host";

const FLAG_COLUMNS = "id, subject_ref, description, recommended_actions, status";

// ---------------------------------------------------------------------------------------------------
// Pure decision logic (unit-tested with no I/O). URL extraction (trimUrlPunctuation, the URL matcher)
// lives in scripts/maintenance/lib/flag-url-extract.mjs, shared with resolve-error-body-gate.mjs -- the
// second confirmed instance of the same integrity_flags description/recommended_actions URL shape.
// ---------------------------------------------------------------------------------------------------

/** Every cited URL named in one cited-host-gate flag -- thin re-export of the shared extractor under
 *  this file's own established name, so this file's own test and any existing caller are unaffected by
 *  the extraction. Identical behavior to `extractFlagUrls`. */
export const extractCitedUrls = extractFlagUrls;

/**
 * The SC-13 decision for one cited URL: register at a deterministic tier, or route to the null-tier-host
 * worklist. Pure -- `classTierForHostFn` is injected (defaults to the real `classTierForHost`) so this is
 * unit-testable without importing the live class table's exact ruled-host set.
 * @param {string} url
 * @param {(host:string|null|undefined) => number|null} classTierForHostFn
 * @returns {{ url: string, host: string, tier: number|null, action: "register"|"worklist" }}
 */
export function planHostDecision(url, classTierForHostFn) {
  const host = hostOf(url);
  const tier = host ? classTierForHostFn(host) : null;
  return { url, host, tier, action: tier != null ? "register" : "worklist" };
}

/**
 * The null-tier-host flag write plan for one (host, item, url) contribution -- pure merge over the
 * EXISTING open flag (or null, for a fresh host), mirroring canonical-pipeline.ts's `surfaceNullTierHosts`
 * exactly (same `mergeNullTierAggregate`/`summarizeNullTierAggregate`, same row shape). Returns either an
 * `{op:"insert", row}` or `{op:"update", id, patch}` -- the caller performs the actual write.
 * @param {{ id: string, recommended_actions?: Array<{aggregate?: object}> }|null} existingFlag
 * @param {string} host @param {string} itemId @param {string} url
 * @param {"aggregator"|"platform"|null} permanentClass
 */
export function buildNullTierHostWrite(existingFlag, host, itemId, url, permanentClass) {
  const prior = existingFlag?.recommended_actions?.[0]?.aggregate ?? null;
  const agg = mergeNullTierAggregate(prior, itemId, { factCount: 1, samples: [url] });
  const { description, action, rationale } = summarizeNullTierAggregate(host, agg, permanentClass);
  const row = {
    category: "source_issue",
    subject_type: "source",
    subject_ref: host,
    description: description.slice(0, 480),
    recommended_actions: [{ action, rationale, aggregate: agg, sample_spans: agg.sampleSpans }],
    status: "open",
    created_by: NULL_TIER_CREATED_BY,
  };
  return existingFlag?.id ? { op: "update", id: existingFlag.id, patch: row } : { op: "insert", row };
}

/** Compose the cited-host-gate flag's own resolution_note from its per-URL outcomes. Pure. */
export function buildResolutionNote(outcomes) {
  if (!outcomes.length) return "cited-host-gate: no URL could be extracted from this flag's description/recommended_actions.";
  const parts = outcomes.map((o) => {
    if (o.action === "register" || o.action === "would_register") return `${o.host} -> registered at tier ${o.tier}`;
    return `${o.host} -> routed to null-tier-host worklist${o.permanentClass ? ` (ruled ${o.permanentClass})` : ""}`;
  });
  return `cited-host-gate resolved: ${parts.join("; ")}.`;
}

/** Per-flag plan (pure, no I/O): every cited URL's host decision, for the dry report. */
export function planFlag(flag, classTierForHostFn) {
  const urls = extractCitedUrls(flag);
  const decisions = urls.map((u) => {
    const d = planHostDecision(u, classTierForHostFn);
    return { ...d, permanentClass: d.action === "worklist" ? permanentlyUnregisteredClass(d.host) : null };
  });
  return { flagId: flag.id, itemId: flag.subject_ref, urls, decisions };
}

// ---------------------------------------------------------------------------------------------------
// main(opts, deps) -- runCli's contract (scripts/maintenance/lib/cli.mjs).
// ---------------------------------------------------------------------------------------------------

/**
 * @param {{ mode?: "dry"|"apply" }} opts
 * @param {{
 *   readOpenFlags: () => Promise<Array>,
 *   classTierForHost: (host:string|null|undefined) => number|null,
 *   registerHost: (url:string, tier:number) => Promise<{source_id:string, created:boolean, host:string}>,
 *   readNullTierFlag: (host:string) => Promise<object|null>,
 *   insertNullTierFlag: (row:object) => Promise<void>,
 *   updateNullTierFlag: (id:string, patch:object) => Promise<void>,
 *   resolveFlag: (id:string, note:string) => Promise<{updated:number, snapshot:string|null}>,
 * }} deps
 */
export async function main({ mode = "dry" } = {}, deps) {
  const apply = mode === "apply";
  const summary = { step: "resolve-cited-host-gate", mode, counts: {}, applied: 0, per_flag: [], read_back: {}, exitCode: 0 };

  const flags = await deps.readOpenFlags();
  let registerCount = 0;
  let worklistCount = 0;
  let noUrlCount = 0;
  let resolvedCount = 0;

  for (const flag of flags) {
    const plan = planFlag(flag, deps.classTierForHost ?? classTierForHost);
    if (!plan.urls.length) noUrlCount += 1;

    const outcomes = [];
    for (const d of plan.decisions) {
      if (d.action === "register") {
        registerCount += 1;
        if (apply) {
          const reg = await deps.registerHost(d.url, d.tier);
          outcomes.push({ url: d.url, host: d.host, action: "register", tier: d.tier, source_id: reg.source_id, created: reg.created });
        } else {
          outcomes.push({ url: d.url, host: d.host, action: "would_register", tier: d.tier });
        }
      } else {
        worklistCount += 1;
        if (apply) {
          const existing = await deps.readNullTierFlag(d.host);
          const write = buildNullTierHostWrite(existing, d.host, plan.itemId, d.url, d.permanentClass);
          if (write.op === "insert") await deps.insertNullTierFlag(write.row);
          else await deps.updateNullTierFlag(write.id, write.patch);
          outcomes.push({ url: d.url, host: d.host, action: "worklist", permanentClass: d.permanentClass });
        } else {
          outcomes.push({ url: d.url, host: d.host, action: "would_worklist", permanentClass: d.permanentClass });
        }
      }
    }

    const note = buildResolutionNote(outcomes);
    summary.per_flag.push({ flag_id: plan.flagId, item_id: plan.itemId, url_count: plan.urls.length, outcomes, note });

    if (apply && plan.urls.length) {
      await deps.resolveFlag(plan.flagId, note);
      resolvedCount += 1;
    }
  }

  summary.counts = {
    open_flags: flags.length,
    urls_total: sumUrlCount(summary.per_flag),
    would_register_or_registered: registerCount,
    would_worklist_or_worklisted: worklistCount,
    flags_with_no_extractable_url: noUrlCount,
  };

  if (!apply) {
    summary.note =
      `DRY -- ${flags.length} open cited-host-gate flag(s), ${summary.counts.urls_total} cited URL(s): ` +
      `${registerCount} would register at a deterministic tier, ${worklistCount} would route to the ` +
      `null-tier-host worklist. Nothing written.`;
    return summary;
  }

  summary.applied = resolvedCount;
  summary.note = `Resolved ${resolvedCount}/${flags.length} cited-host-gate flag(s): ${registerCount} host(s) registered, ${worklistCount} routed to the null-tier-host worklist.`;

  const remaining = await deps.readOpenFlags();
  summary.read_back = { remaining_open: remaining.length };

  return summary;
}

/** Small pure helper kept out of main's body only for readability -- sums url_count across per_flag. */
function sumUrlCount(perFlag) {
  return perFlag.reduce((n, f) => n + f.url_count, 0);
}

const IS_MAIN = isMainModule(import.meta.url);
if (IS_MAIN) {
  await runCli({
    step: "resolve-cited-host-gate",
    main,
    needsDb: true,
    buildDeps: async () => ({
      classTierForHost,
      readOpenFlags: () =>
        readAll("integrity_flags", FLAG_COLUMNS, {
          match: (q) => q.eq("status", "open").eq("created_by", "cited-host-gate"),
        }),
      registerHost: async (url, tier) => {
        const host = hostOf(url);
        return registerSource({ url, name: host, base_tier: tier }, { cite: CITE });
      },
      readNullTierFlag: async (host) => {
        const rows = await readAll("integrity_flags", "id, recommended_actions", {
          match: (q) => q.eq("created_by", NULL_TIER_CREATED_BY).eq("subject_ref", host).eq("status", "open"),
        });
        return rows[0] ?? null;
      },
      insertNullTierFlag: (row) => guardedInsert("integrity_flags", row, { cite: CITE, select: "id" }),
      updateNullTierFlag: (id, patch) => guardedUpdate("integrity_flags", (q) => q.eq("id", id), patch, { cite: CITE }),
      resolveFlag: (id, note) =>
        guardedUpdate(
          "integrity_flags",
          (q) => q.eq("id", id),
          { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: RESOLVED_BY, resolution_note: note },
          { cite: CITE },
        ),
    }),
  });
}
